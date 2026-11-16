// Cloudflare Worker / Node 共用，凭据只取服务端环境变量，不接受客户端指定上游。
const MAX_IMAGE = 10 * 1024 * 1024, MAX_BODY = MAX_IMAGE + 2048;

function normalizeOrigin(u) {
  if (!u) return '';
  const s = String(u).trim();
  if (s === '*') return '*';
  try { return new URL(s).origin; } catch { return s.replace(/\/+$/, ''); }
}

export function createOCRService(fetcher = globalThis.fetch) {
  let cached = null, pending = null;

  async function accessToken(env) {
    const identity = env.BAIDU_API_KEY + '|' + env.BAIDU_SECRET_KEY;
    if (cached?.identity === identity && cached.until > Date.now()) return cached.value;
    if (pending?.identity === identity) return pending.promise;
    const promise = (async () => {
      const r = await fetcher('https://aip.baidubce.com/oauth/2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: env.BAIDU_API_KEY,
          client_secret: env.BAIDU_SECRET_KEY
        }),
        signal: AbortSignal.timeout(15000)
      });
      const j = await r.json();
      if (!r.ok || typeof j.access_token !== 'string' || !j.access_token) throw Error('BAIDU_AUTH');
      cached = { identity, value: j.access_token, until: Date.now() + Math.max(0, (Number(j.expires_in) || 0) - 120) * 1000 };
      return cached.value;
    })();
    pending = { identity, promise };
    try { return await promise; } finally { if (pending?.promise === promise) pending = null; }
  }

  return async function handle(request, env) {
    const origin = request.headers.get('Origin');
    const rawAllowed = String(env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
    const normalizedAllowed = rawAllowed.map(normalizeOrigin);

    const isOriginAllowed = origin && (
      rawAllowed.includes('*') ||
      rawAllowed.includes(origin) ||
      normalizedAllowed.includes(normalizeOrigin(origin))
    );

    const cors = {
      'Cache-Control': 'no-store',
      'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-OCR-Token',
      'Access-Control-Max-Age': '86400'
    };
    if (isOriginAllowed) {
      cors['Access-Control-Allow-Origin'] = rawAllowed.includes('*') && !rawAllowed.includes(origin) ? '*' : origin;
    }

    const reply = (status, body) => new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' }
    });

    const pathname = new URL(request.url).pathname.replace(/\/+$/, '');
    if (pathname !== '/api/ocr') {
      return reply(404, { error: '接口路径不存在，请确认地址以 /api/ocr 结尾' });
    }

    // 方便在华为手机浏览器直接输入网址测试连通性
    if (request.method === 'GET' && !origin) {
      return reply(200, { ok: true, message: '拾题 OCR 代理运行正常！如果在手机上看到此消息，说明手机网络可以正常连通此代理地址。' });
    }

    if (!isOriginAllowed) {
      return reply(403, { error: `网页来源（${origin || '空'}）未获允许，请在 Worker 变量 ALLOWED_ORIGIN 中填入 ${origin || '*'} 并重新部署` });
    }

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return reply(405, { error: '仅支持 POST' });

    if (!env.OCR_PROXY_TOKEN || env.OCR_PROXY_TOKEN.length < 24 || !env.BAIDU_API_KEY || !env.BAIDU_SECRET_KEY) {
      return reply(503, { error: '代理尚未配置完整：请检查 Worker 的 BAIDU_API_KEY、BAIDU_SECRET_KEY、OCR_PROXY_TOKEN（至少24位）' });
    }
    if (request.headers.get('X-OCR-Token') !== env.OCR_PROXY_TOKEN) {
      return reply(401, { error: 'OCR 代理访问口令不正确，请核对设置中的口令' });
    }
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
      return reply(415, { error: '需要 JSON 请求' });
    }
    if (Number(request.headers.get('Content-Length')) > MAX_BODY) {
      return reply(413, { error: '图片请求过大，请缩小选框' });
    }

    let body;
    try {
      const reader = request.body?.getReader();
      if (!reader) return reply(400, { error: '缺少请求内容' });
      let size = 0, parts = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY) { await reader.cancel(); return reply(413, { error: '图片请求过大，请缩小选框' }); }
        parts.push(value);
      }
      const all = new Uint8Array(size);
      let offset = 0;
      for (const p of parts) { all.set(p, offset); offset += p.length; }
      body = JSON.parse(new TextDecoder().decode(all));
    } catch {
      return reply(400, { error: 'JSON 格式错误' });
    }

    if (typeof body.image !== 'string' || !body.image) return reply(400, { error: '缺少选框图片' });
    const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.image);
    if (!m || m[2].length % 4 !== 0) return reply(400, { error: '需要 PNG 或 JPEG 的 base64 图片' });
    if (m[2].length > MAX_IMAGE) return reply(413, { error: '图片编码超过 10 MB，请缩小选框' });
    const mode = body.mode || 'basic';
    if (!['basic','accurate'].includes(mode)) return reply(400,{error:'不支持的 OCR 模式'});

    try {
      const token = await accessToken(env);
      const r = await fetcher('https://aip.baidubce.com/rest/2.0/ocr/v1/' + (mode === 'accurate' ? 'accurate' : 'accurate_basic') + '?access_token=' + encodeURIComponent(token), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          image: m[2],
          detect_direction: 'true', // 自动检测朝向，即使手机拍照稍微倒置也能准确识别
          probability: 'true',
          paragraph: 'false',
          ...(mode === 'accurate' ? {recognize_granularity:'small',char_probability:'true'} : {})
        }),
        signal: AbortSignal.timeout(60000)
      });
      if (!r.ok) return reply(502, { error: '百度 OCR 服务暂不可用，请稍后重试' });
      const j = await r.json();
      if (j.error_code) {
        if ([110, 111].includes(Number(j.error_code))) cached = null;
        return reply(200, { error_code: j.error_code });
      }
      if (!Array.isArray(j.words_result) || j.words_result.some(p => typeof p.words !== 'string')) {
        return reply(502, { error: '百度 OCR 返回了异常格式' });
      }
      return reply(200, { words_result: j.words_result, words_result_num: j.words_result.length, log_id: j.log_id, direction:j.direction, mode });
    } catch (e) {
      return reply(502, { error: e.message === 'BAIDU_AUTH' ? '百度鉴权失败，请检查代理端 API Key / Secret Key 及 OCR 服务权限' : '百度 OCR 请求失败或超时，未自动重试' });
    }
  };
}

const handle = createOCRService();
export default { fetch: (request, env) => handle(request, env) };
