const baiduUsage = { calls: 0 };

function getOcrToken() {
  return localStorage.getItem('shiti-ocr-token') || sessionStorage.getItem('shiti-ocr-token') || '';
}

function defaultOCRProxy() {
  if (typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname)) {
    return location.origin + '/api/ocr';
  }
  return 'https://ocr.86518925.xyz/api/ocr';
}

function baiduSettings() {
  return `<span class="pill">百度 OCR · 默认</span>
    <label class="field"><span>识别服务</span>
      <select id="ocr-provider">
        <option value="baidu" ${(cfg.ocrProvider || 'baidu') === 'baidu' ? 'selected' : ''}>百度高精度 OCR → 校对 → DeepSeek 分析</option>
        <option value="deepseek" ${cfg.ocrProvider === 'deepseek' ? 'selected' : ''}>DeepSeek 图片转录（备用）</option>
      </select>
    </label>
    <label class="field"><span>百度接口</span><select id="ocr-mode"><option value="accurate" ${(cfg.ocrMode||'accurate')==='accurate'?'selected':''}>高精度含位置版（用于恢复行顺序）</option><option value="basic" ${cfg.ocrMode==='basic'?'selected':''}>高精度纯文字版（兼容旧权限）</option></select></label><p class="notice">含位置版需要百度单独开通相应接口权限，额度与费用以百度控制台为准。失败不会自动重复调用。位置只能恢复排版，不能区分印刷、手写和批注。</p>
    ${field('OCR 代理完整地址', 'ocr-proxy', cfg.ocrProxy || defaultOCRProxy(), 'url', 'https://ocr.86518925.xyz/api/ocr')}
    ${field('代理访问口令（已支持设备持久保存）', 'ocr-token', getOcrToken(), 'password', '与 Worker 中的 OCR_PROXY_TOKEN 一致')}
    <div id="ocr-test-result" class="result-note" style="margin:6px 0"></div>
    <div class="actions">
      <button class="primary" id="save-ocr">保存 OCR 设置</button>
      <button class="secondary" type="button" id="test-ocr">⚡ 测试手机/当前网络连接</button>
    </div>`;
}

function usesBaidu() {
  return (cfg.ocrProvider || 'baidu') === 'baidu';
}

function baiduError(code) {
  return ({
    '6': '百度应用无此接口权限，请开通通用文字识别（高精度版）',
    '17': '百度接口调用额度已用尽，请检查控制台',
    '18': '百度请求频率超限，请稍后再试',
    '19': '百度当日调用额度已用尽',
    '110': '百度凭据已失效，请检查代理端配置后重试',
    '111': '百度访问凭据已过期，请重试',
    '216202': '图片过大，请缩小选框',
    '216201': '图片格式不支持，请重新框选'
  })[String(code)] || `百度 OCR 调用失败（${code}），请查看百度控制台`;
}

async function testOCRConnection() {
  const out = $('#ocr-test-result');
  const endpoint = ($('#ocr-proxy')?.value || cfg.ocrProxy || defaultOCRProxy()).trim();
  const token = ($('#ocr-token')?.value || getOcrToken()).trim();
  if (!endpoint) { out.textContent = '❌ 请先填写 OCR 代理地址'; return; }
  out.textContent = '⏳ 正在测试连接代理服务器…';
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-OCR-Token': token },
      body: JSON.stringify({ image: '' }),
      signal: AbortSignal.timeout(15000)
    });
    if (r.status === 400) {
      out.textContent = `✅ 代理连接成功！网络与口令均已打通（无需挂 VPN）`;
    } else if (r.status === 401) {
      out.textContent = '❌ 已连上代理，但【代理访问口令】不正确（HTTP 401）';
    } else {
      out.textContent = `⚠️ 代理返回状态码 HTTP ${r.status}，请确认地址以 /api/ocr 结尾`;
    }
  } catch (e) {
    out.textContent = `❌ 网络无法连上代理（${e.message || '连接中断'}）。请确认 ocr.86518925.xyz 已在 Worker 自定义域中绑定并激活。`;
  }
}

async function callBaiduOCR(src) {
  const endpoint = (cfg.ocrProxy || defaultOCRProxy()).trim(),
        token = getOcrToken();
  if (!endpoint) throw Error('请先在「设置」填写百度 OCR 代理地址');
  if (token.length < 24) throw Error('请先在「设置」填写至少 24 字符的 OCR 代理访问口令');
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-OCR-Token': token },
      body: JSON.stringify({ image: src, mode: cfg.ocrMode || 'accurate' }),
      signal: AbortSignal.timeout(60000)
    });
  } catch (e) {
    throw Error(e.name === 'TimeoutError'
      ? '百度 OCR 请求超时，请缩小选框或检查网络'
      : '无法连接 OCR 代理，请检查网络或确认自定义域名已生效');
  }
  let result;
  try { result = await response.json(); } catch { throw Error('OCR 代理未返回 JSON，请确认地址以 /api/ocr 结尾'); }
  if (!response.ok) throw Error(result.error || `OCR 代理错误（${response.status}）`);
  if (result.error_code) throw Error(baiduError(result.error_code));
  if (!Array.isArray(result.words_result) || result.words_result.some(p => typeof p.words !== 'string')) {
    throw Error('百度返回的识别格式不完整，请重试');
  }
  if (!result.words_result.length) throw Error('框内未识别到文字，请调整选框或旋转图片');
  baiduUsage.calls++;
  return result;
}

async function recognizeWithBaidu() {
  const src = mode === 'image' ? exportCrop() : '', text = $('#question-text')?.value || '';
  if (!src && !text.trim()) throw Error('请上传并框选题目，或输入文字');
  const meta = { subject: $('#subject').value, source: $('#source').value, mistake: $('#mistake').value };
  let raw = null, transcript = text, mergedTranscript = text, mergedCount = 0, warnings = [];
  if (src) {
    if (src.split(',')[1].length > 10 * 1024 * 1024) throw Error('选框图片编码超过百度 10 MB 上限，请缩小选框');
    const dims = cropPixels(cropState.rect, cropCanvas.width, cropCanvas.height);
    if (dims.width > 8192 || dims.height > 8192) throw Error('选框长边超过百度 8192 像素上限，请缩小范围');
    progress('百度高精度 OCR 识别框内文字中…');
    raw = await callBaiduOCR(src);
    transcript = raw.words_result.map(p => p.words).join('\n');
    const layout = arrangeOCRLines(raw.words_result);
    mergedTranscript = layout.text;
    mergedCount = Math.max(0, transcript.split('\n').length - mergedTranscript.split('\n').length);
    if (!layout.located) warnings.push('代理没有返回完整行坐标，保留原始顺序；请更新代理或切换含位置版，不按语义猜测合并。');
    if (raw.words_result.some(p => p.probability && Number(p.probability.average) < 0.8)) {
      warnings.push('部分行的识别置信度偏低，请重点核对。');
    }
    warnings.push('已按原文保留百度识别结果（包含可能的手写或原卷错字），核对后即可分析或直接收录。');
  }
  const items = normalizeOCR({ items: [{ section: src ? '框选题目' : '文字录入', number: '1', text: mergedTranscript, studentAnswer: '', uncertainty: '' }] });
  if (typeof window !== 'undefined' && window.document && items[0] && !globalThis.assert) {
    items[0].selected = true;
    items[0].verified = false;
  }
  paper = {
    ...meta,
    image: src,
    scope: 'crop',
    ocrProvider: src ? 'baidu' : 'manual',
    ocrRaw: raw ? { words_result: raw.words_result, log_id: raw.log_id, direction: raw.direction, mode: raw.mode } : null,
    ocrOriginalText: transcript,
    inventory: items.map(p => ({ section: p.section, number: p.number })),
    items,
    warnings,
    complete: true
  };
  items.forEach(p=>{p.verified=false;p.answerStatus='unknown';p.annotation='';p.visualFeatures=''});
  if(/加点|划线|画线|下划线|图中/.test(transcript))paper.warnings.push('本题依赖加点、划线或图示，OCR 文字未保留这些视觉信息，请在视觉信息栏人工补充后再分析。');
  draft = null;
  editingId = null;
  progress(src ? '识别已返回，请核对原题，并单独确认孩子作答。坐标整理不代表内容已识别正确。' : '文字已录入，请核对题干与孩子作答。');
  openPaperOnRender = true;
  render();

}

function rawOCRView() {
  return paper?.ocrProvider === 'baidu'
    ? `<details class="raw-ocr"><summary>查看百度原始转录（只读对照）</summary><pre class="prose">${esc(paper.ocrOriginalText)}</pre></details>`
    : '';
}

// v19：一键合并换行（手动点，不自动改）。
// 只动换行符，不改任何一个字。判定用百度返回的每行位置 + 内容：
// ① 两行中心线差不到半行高（同一行被切开的两段几乎在同一水平线上）；
// ② 上一段结尾不是 。？！；… 这类句末标点；③ 下一段开头不是 A、B、（1）、①、
// 第×题这类新条目标记。三条都满足才拼；中文直接拼，西文/数字之间补一个空格。
// 没有行位置数据时不拼（usable=false），宁可不拼也不错拼。
function baiduLineCenter(loc) {
  if (!loc || !Number.isFinite(Number(loc.top)) || !Number.isFinite(Number(loc.height))) return null;
  return { center: Number(loc.top) + Number(loc.height) / 2, height: Number(loc.height) };
}

function shouldMergeBaiduLines(prev, next) {
  const prevText = String(prev?.words ?? '').trim(), nextText = String(next?.words ?? '').trim();
  if (!prevText || !nextText) return false;
  const a = baiduLineCenter(prev?.location), b = baiduLineCenter(next?.location);
  if (!a || !b) return false;
  if (Math.abs(a.center - b.center) >= 0.5 * Math.max(a.height, b.height)) return false;
  if (/[。？！；…!?;]$/.test(prevText)) return false;
  if (/^\s*(?:[（(]?[A-Da-d][、．.。)）]|[（(]?\d{1,2}[、．.。)）]|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫]|第[一二三四五六七八九十百\d]+[题条])/.test(nextText)) return false;
  return true;
}

function mergeBaiduLines(wordsResult) {
  const lines = Array.isArray(wordsResult) ? wordsResult : [];
  const usable = lines.some(p => baiduLineCenter(p?.location));
  if (!lines.length || !usable) return { text: lines.map(p => String(p?.words ?? '')).join('\n'), merged: 0, usable: false };
  let text = String(lines[0]?.words ?? ''), merged = 0;
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1], next = lines[i], nextText = String(next?.words ?? '');
    if (shouldMergeBaiduLines(prev, next)) {
      const needSpace = /[A-Za-z0-9]$/.test(text) && /^[A-Za-z0-9]/.test(nextText.trim());
      text += (needSpace ? ' ' : '') + nextText.trim();
      merged++;
    } else {
      text += '\n' + nextText;
    }
  }
  return { text, merged, usable: true };
}
