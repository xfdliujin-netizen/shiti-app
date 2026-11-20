const encoder = new TextEncoder();
const mediaPrefix = '/api/edututor-photo/';
const photoTTL = 180000;
const actions = {
  'edututor-cut': ['CutQuestions', '/service/cutApi'],
  'edututor-answer': ['AnswerSSE', '/service/answerSSE']
};

const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
const hash = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));

async function callEduTutor(env, fetcher, action, payload) {
  const [operation, path] = actions[action];
  const host = 'edututor.cn-hangzhou.aliyuncs.com';
  const query = 'workspaceId=' + encodeURIComponent(env.EDUTUTOR_WORKSPACE_ID);
  const body = JSON.stringify(payload);
  const digest = await hash(body);
  const headers = {
    'content-type': 'application/json',
    host,
    'x-acs-action': operation,
    'x-acs-content-sha256': digest,
    'x-acs-date': new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    'x-acs-signature-nonce': crypto.randomUUID(),
    'x-acs-version': '2025-07-07'
  };
  const names = Object.keys(headers).sort();
  const signed = names.join(';');
  const canonical = ['POST', path, query, names.map(name => `${name}:${headers[name]}\n`).join(''), signed, digest].join('\n');
  const algorithm = 'ACS3-HMAC-SHA256';
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.EDUTUTOR_ACCESS_KEY_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${algorithm}\n${await hash(canonical)}`)));
  delete headers.host;
  headers.Authorization = `${algorithm} Credential=${env.EDUTUTOR_ACCESS_KEY_ID},SignedHeaders=${signed},Signature=${signature}`;
  headers.Accept = action === 'edututor-answer' ? 'text/event-stream' : 'application/json';
  return fetcher(`https://${host}${path}?${query}`, { method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(65000) });
}

function nestedJSON(value) {
  if (typeof value !== 'string') return value;
  const raw = value.trim();
  return JSON.parse(raw.startsWith("'") && raw.endsWith("'") ? raw.slice(1, -1) : raw);
}

function eduText(items) {
  return (Array.isArray(items) ? items : [items]).map(item => item?.text).filter(value => typeof value === 'string').join('\n');
}

function eduBoxes(items) {
  if (!Array.isArray(items)) return [];
  return items.flatMap(points => {
    if (!Array.isArray(points) || points.length !== 8 || !points.every(Number.isFinite)) return [];
    const [a,b,c,d,e,f,g,h] = points;
    return [{ left: Math.min(a,c,e,g), top: Math.min(b,d,f,h), right: Math.max(a,c,e,g), bottom: Math.max(b,d,f,h) }];
  });
}

async function readEduAnswer(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = '', bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 512 * 1024) throw Error('EDUTUTOR_RESPONSE_LIMIT');
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const events = raw.trimStart().startsWith('{') ? [raw] : raw.replace(/\r\n/g, '\n').split('\n\n')
    .map(event => event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n'))
    .filter(event => event && event !== '[DONE]');
  let text = '', finished = false;
  for (const event of events) {
    const data = JSON.parse(event);
    if (data.success === false) return '';
    const result = nestedJSON(data.data);
    const chunk = eduText(result?.message?.content);
    if (chunk) text = chunk.startsWith(text) ? chunk : text + chunk;
    finished ||= data.finish_reason === 'stop';
  }
  return finished ? text.trim() : '';
}

export async function serveEduTutorPhoto(request, env, pathname) {
  if (!pathname.startsWith(mediaPrefix)) return null;
  const missing = () => new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const id = pathname.slice(mediaPrefix.length);
  if (!['GET', 'HEAD'].includes(request.method) || !/^[a-f0-9]{32}$/.test(id) || !env.EDUTUTOR_PHOTOS) return missing();
  const object = await (request.method === 'HEAD' ? env.EDUTUTOR_PHOTOS.head(id) : env.EDUTUTOR_PHOTOS.get(id));
  if (!object || !(Number(object.customMetadata?.expires) > Date.now())) return missing();
  return new Response(request.method === 'HEAD' ? null : object.body, {
    headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(object.size), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}

export async function handleEduTutor(body, env, fetcher, reply) {
  if (!env.EDUTUTOR_ACCESS_KEY_ID || !env.EDUTUTOR_ACCESS_KEY_SECRET ||
      !/^llm-[a-zA-Z0-9-]{1,80}$/.test(env.EDUTUTOR_WORKSPACE_ID || '') || !env.EDUTUTOR_PHOTOS) {
    return reply(503, { error: '通义拍照解题尚未开通或代理未配置业务空间、RAM 密钥及临时图片存储' });
  }
  if (body.action === 'edututor-status') return reply(200, { ready: true });
  const image = typeof body.image === 'string' && /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.image);
  if (!image || image[1].length > 6 * 1024 * 1024 || image[1].length % 4) return reply(400, { error: '需要有效的 JPEG 照片' });
  const id = crypto.randomUUID().replace(/-/g, '');
  const url = 'https://ocr.86518925.xyz' + mediaPrefix + id;
  try {
    const bytes = Uint8Array.from(atob(image[1]), byte => byte.charCodeAt(0));
    if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) return reply(400, { error: '照片格式无效' });
    await env.EDUTUTOR_PHOTOS.put(id, bytes, { customMetadata: { expires: String(Date.now() + photoTTL) } });
    const cut = body.action === 'edututor-cut';
    const payload = cut ? { image: url, parameters: { struct: true, extract_images: false } }
      : { messages: [{ role: 'user', content: [{ image: url }, { text: '请给出这道题的参考答案和解题步骤。' }] }] };
    const response = await callEduTutor(env, fetcher, body.action, payload);
    if (!response.ok) return reply(502, { error: `阿里云通义请求失败（HTTP ${response.status}），请检查开通状态、业务空间和 RAM 权限` });
    if (cut) {
      const envelope = await response.json();
      const result = nestedJSON(envelope.data);
      if (envelope.success === false || !Array.isArray(result?.questions)) return reply(502, { error: '通义未返回有效的切题结果，请检查服务权限和调用额度' });
      return reply(200, { questions: result.questions.slice(0, 150).map((question, index) => ({
        number: index + 1,
        boxes: eduBoxes(question?.pos_list),
        text: [eduText(question?.info?.stem), eduText(question?.info?.option)].filter(Boolean).join('\n').slice(0, 6000)
      })) });
    }
    const explanation = await readEduAnswer(response);
    return explanation ? reply(200, { explanation: explanation.slice(0, 10000) }) : reply(502, { error: '通义未返回完整的解题解析' });
  } catch {
    return reply(502, { error: '通义拍照解题服务暂不可用，请稍后重试' });
  } finally {
    await env.EDUTUTOR_PHOTOS.delete(id).catch(() => {});
  }
}
