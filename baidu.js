const baiduUsage = { calls: 0 };
let homeworkTask = null, homeworkResult = null;

function baiduGradingSettings() {
  return `<p class="notice">在「录题」点击「百度智能作业批改」，上传整张含学生作答的图片，再点击同一按钮提交。作业批改使用「图片文字识别」中配置的百度代理和访问口令。百度应用需开通智能作业批改权限。</p>
    <p class="result-note">本机已提交 ${Number(cfg.baiduHomeworkCalls) || 0} 次批改。账户免费余量请在百度控制台查看。</p>
    <a href="https://console.bce.baidu.com/ai/#/ai/ocr/overview/index" target="_blank" rel="noopener">打开百度文字识别控制台</a>`;
}

function homeworkGradingButton() {
  return `<div class="capture-homework-entry"><button type="button" class="secondary small-button" id="grade-homework">${homeworkTask ? '继续查询百度批改' : '百度智能作业批改'}</button></div>`;
}

function homeworkGradingView() {
  if (!image && !homeworkTask && !homeworkResult) return '';
  const verdicts = { 0: '未批改', 1: '正确', 2: '错误', 3: '未作答', 5: '批改失败' };
  return `<div class="homework-grading">
    <p class="hint" id="homework-status" role="status">${homeworkTask ? '已提交，等待百度返回结果。' : '提交后由百度返回逐题批改，结果请人工核对。'}</p>
    ${homeworkResult ? `<section aria-label="百度作业批改结果">
      <h3>上次百度批改结果 · ${homeworkResult.length} 题</h3>
      ${homeworkResult.length ? homeworkResult.map(question => `<details><summary>第 ${esc(question.number)} 题 · ${verdicts[question.verdict] || '待核对'}</summary>
        ${question.reasons.length ? question.reasons.map(reason => `<p class="prose">${esc(reason)}</p>`).join('') : '<p class="muted">百度未提供批改说明。</p>'}</details>`).join('') : '<p class="muted">百度未返回可批改的题目。</p>'}
    </section>` : ''}
  </div>`;
}

async function prepareHomeworkImage(source) {
  const photo = new Image();
  photo.src = source;
  await photo.decode();
  const shortest = Math.min(photo.naturalWidth, photo.naturalHeight);
  const longest = Math.max(photo.naturalWidth, photo.naturalHeight);
  if (shortest < 512 || Math.round(8192 * shortest / longest) < 512) {
    throw Error('百度作业批改要求处理后的图片短边至少 512 像素，请换一张清晰的作业图');
  }
  const scale = Math.min(1, 8192 / longest, Math.max(4096 / longest, 512 / shortest));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(photo.naturalWidth * scale);
  canvas.height = Math.round(photo.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.84);
}

async function requestHomeworkGrading(connection, body) {
  const response = await fetch(connection.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-OCR-Token': connection.token },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000)
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || `百度批改代理请求失败（${response.status}）`);
  if (result.error_code) {
    if (result.failed) homeworkTask = null;
    if (Number(result.error_code) === 6) throw Error('百度应用未开通智能作业批改权限');
    throw Error([17, 18, 19, 110, 111].includes(Number(result.error_code)) ? baiduError(result.error_code) : `百度作业批改失败（${result.error_code}）`);
  }
  return result;
}

function bindHomeworkGrading() {
  const button = $('#grade-homework');
  if (!button) return;
  button.onclick = () => {
    if (!image && !homeworkTask) {
      const photo = $('#photo');
      if (photo) photo.click();
      else toast('请先上传整张作业图片');
      return;
    }
    return run(button, async () => {
      try {
        if (!homeworkTask) {
          const warning = ocrLocalFileWarning();
          if (warning) throw Error(warning);
          const connection = { endpoint: (cfg.ocrProxy || defaultOCRProxy()).trim(), token: getOcrToken() };
          if (connection.token.length < 24) throw Error('请先在设置的「图片文字识别」中填写代理访问口令');
          if (!image) throw Error('请先上传作业图片');
          const encoded = await prepareHomeworkImage(image);
          $('#homework-status')?.replaceChildren('正在向百度提交整张作业图…');
          const result = await requestHomeworkGrading(connection, { action: 'homework-create', image: encoded });
          if (typeof result.task_id !== 'string' || !result.task_id) throw Error('代理未返回批改任务编号，请确认代理已更新');
          homeworkTask = { ...connection, id: result.task_id };
          homeworkResult = null;
          cfg.baiduHomeworkCalls = (Number(cfg.baiduHomeworkCalls) || 0) + 1;
          saveLocalConfig();
        }
        $('#homework-status')?.replaceChildren('已提交，等待百度返回批改结果…');
        for (let attempt = 0; attempt < 8; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          const result = await requestHomeworkGrading(homeworkTask, { action: 'homework-result', task_id: homeworkTask.id });
          if (result.status === 'pending') continue;
          if (result.status !== 'complete' || !Array.isArray(result.questions)) throw Error('批改结果格式不正确，请继续查询');
          homeworkResult = result.questions;
          homeworkTask = null;
          return;
        }
        toast('百度仍在批改，可以稍后继续查询');
      } finally {
        if (current() === 'capture') render();
      }
    });
  };
}

function ocrLocalFileWarning() {
  return typeof location !== 'undefined' && (location.protocol === 'file:' || location.origin === 'null')
    ? '当前从本地文件／压缩包临时目录打开，浏览器来源为 null，线上 OCR 不接受此来源。请先在数据备份中导出 JSON，再打开 https://shiti.86518925.xyz 并导入；两个地址的本地题库不会自动互通。'
    : '';
}

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
    ${ocrLocalFileWarning()?`<p class="notice">${esc(ocrLocalFileWarning())} <a href="https://shiti.86518925.xyz" target="_blank" rel="noopener">打开线上拾题</a></p>`:''}
    <label class="field"><span>识别服务</span>
      <select id="ocr-provider">
        <option value="baidu" ${(cfg.ocrProvider || 'baidu') === 'baidu' ? 'selected' : ''}>百度高精度 OCR → 校对 → 文字模型分析</option>
        <option value="deepseek" ${cfg.ocrProvider === 'deepseek' ? 'selected' : ''}>DeepSeek 视觉转录</option>
        <option value="qwen" ${cfg.ocrProvider === 'qwen' ? 'selected' : ''}>千问视觉转录</option>
      </select>
    </label>
    <label class="field"><span>百度接口</span><select id="ocr-mode"><option value="accurate" ${(cfg.ocrMode||'accurate')==='accurate'?'selected':''}>高精度含位置版（用于恢复行顺序）</option><option value="basic" ${cfg.ocrMode==='basic'?'selected':''}>高精度纯文字版（兼容旧权限）</option></select></label><p class="notice">含位置版需要百度单独开通相应接口权限，额度与费用以百度控制台为准。失败不会自动重复调用。位置只能恢复排版，不能区分印刷、手写和批注。</p>
    ${field('DeepSeek 图片转录模型（兼容接口可自定义）','ocr-vision-model',cfg.ocrVisionModel||'','text','官方接口默认 deepseek-flash；其他接口默认使用文字模型配置')}
    ${field('千问图片转录模型','qwen-vision-model',cfg.qwenVisionModel||'','text','默认 qwen3-vl-plus，使用已配置的百炼密钥或代理')}
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
  const localWarning = ocrLocalFileWarning();
  if (localWarning) { out.textContent = '⚠️ ' + localWarning; return; }
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
  const localWarning = ocrLocalFileWarning();
  if (localWarning) throw Error(localWarning);
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
  const meta = { notebookId:typeof captureNotebookId==='function'?captureNotebookId():'default', subject: $('#subject').value, source: '', mistake: '' };
  meta.questionType=selectedCaptureQuestionType(meta.subject);
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
    if (!layout.located) warnings.push('缺少坐标，按原顺序显示');
    if (raw.words_result.some(p => p.probability && Number(p.probability.average) < 0.8)) {
      warnings.push('识别置信度偏低，请复核');
    }
    warnings.push('已保留原文，请核对');
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
  items.forEach(p=>{p.verified=false;p.answerStatus='confirmed';p.annotation='';p.visualFeatures=''});
  if(/加点|划线|画线|下划线|图中/.test(transcript))paper.warnings.push('请补充加点、划线或图示');
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

