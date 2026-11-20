const baiduUsage = { calls: 0 };
const homeworkVerdicts = { 0: ['未批改', '?'], 1: ['正确', '✓'], 2: ['错误', '×'], 3: ['未作答', '—'], 5: ['批改失败', '?'] };
let homeworkSource = '', homeworkTask = null, homeworkResult = null;

function baiduGradingSettings() {
  return `<p class="notice">在底部「批改」上传整张含学生作答的图片，再点击「开始批改」。作业批改使用「图片文字识别」中配置的百度代理和访问口令。百度应用需开通智能作业批改权限。</p>
    <p class="result-note">本机已提交 ${Number(cfg.baiduHomeworkCalls) || 0} 次批改。账户免费余量请在百度控制台查看。</p>
    <a href="https://console.bce.baidu.com/ai/#/ai/ocr/overview/index" target="_blank" rel="noopener">打开百度文字识别控制台</a>`;
}

function homeworkGradingPage() {
  const questions = homeworkResult?.questions || [];
  const preview = homeworkTask?.photo.src || homeworkSource;
  return `<section class="card homework-grading">
    <header class="homework-heading"><h1>作业批改</h1><span>百度智能批改</span></header>
    <div class="actions homework-actions">
      <input type="file" id="homework-upload" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
      <button type="button" class="secondary" id="choose-homework" ${homeworkTask ? 'disabled' : ''}>${homeworkSource || homeworkResult ? '重新选图' : '上传作业图'}</button>
      ${homeworkResult ? '' : `<button type="button" class="primary" id="grade-homework" ${!homeworkSource && !homeworkTask ? 'disabled' : ''}>${homeworkTask ? '继续查询批改' : '开始批改'}</button>`}
    </div>
    <p class="hint homework-status" id="homework-status" role="status">${homeworkTask ? '已提交，等待百度返回结果。' : homeworkResult ? '点图上的标记，可以定位题目并校对。' : '上传一张包含题目和学生作答的整页照片。'}</p>
    ${!homeworkResult && preview ? `<div class="homework-photo"><img alt="待批改的作业图" src="${esc(preview)}"></div>` : ''}
    ${homeworkResult ? `<section aria-label="百度作业批改结果">
      <div class="homework-result-head"><h2>批改结果 · ${questions.length} 题</h2><span>用时 ${Math.round(homeworkResult.elapsed / 1000)} 秒</span></div>
      <div class="homework-totals">
        ${[[1, '正确'], [2, '错题'], [3, '未作答']].map(([verdict, label]) => `<div data-verdict="${verdict}"><span>${label}</span><strong>${questions.filter(q => q.verdict === verdict).length}</strong></div>`).join('')}
      </div>
      ${questions.length ? '<button type="button" class="secondary homework-review-link" id="homework-open-review">校对并收录错题 ↓</button>' : ''}
      ${renderHomeworkMarks(homeworkResult.photo, questions)}
      ${questions.length ? renderHomeworkReview(homeworkResult) : '<p class="muted">百度未返回可批改的题目。</p>'}
    </section>` : ''}
  </section>`;
}

function renderHomeworkMarks(photo, questions) {
  if (!photo) return '';
  const marks = questions.map((question, index) => {
    const box = question.region;
    if (!box) return '';
    const [label, icon] = homeworkVerdicts[question.verdict] || ['待核对', '?'];
    return `<span class="homework-region" data-homework-region="${index}" data-verdict="${question.verdict}" hidden
      style="left:${box.x * 100}%;top:${box.y * 100}%;width:${box.w * 100}%;height:${box.h * 100}%"></span>
      <button type="button" class="homework-mark" data-homework-mark="${index}" data-verdict="${question.verdict}"
        style="--mark-x:${box.x * 100}%;--mark-y:${box.y * 100}%" aria-controls="homework-question-${index}"
        aria-label="识别第 ${esc(question.number)} 题，${label}"><b aria-hidden="true">${icon}</b><span aria-hidden="true">${esc(question.number)}</span></button>`;
  }).join('');
  return `<div class="homework-photo"><img alt="本次提交批改的作业图" src="${esc(photo.src)}" width="${photo.width}" height="${photo.height}">${marks}</div>
    ${!marks && questions.length ? '<p class="hint">百度未返回可定位的题目坐标，请查看下方逐题结果。</p>' : ''}`;
}

function homeworkQuestionRegion(boxes, photo) {
  const { width, height } = photo;
  const regions = (boxes || []).filter(box => box && [box.left, box.top, box.right, box.bottom].every(Number.isFinite) &&
    box.right > Math.max(0, box.left) && box.bottom > Math.max(0, box.top) && box.left < width && box.top < height);
  if (!regions.length) return null;
  const pad = Math.max(6, Math.round(Math.min(width, height) * .005));
  const left = Math.max(0, Math.min(...regions.map(box => box.left)) - pad) / width;
  const top = Math.max(0, Math.min(...regions.map(box => box.top)) - pad) / height;
  const right = Math.min(width, Math.max(...regions.map(box => box.right)) + pad) / width;
  const bottom = Math.min(height, Math.max(...regions.map(box => box.bottom)) + pad) / height;
  const region = { x: left, y: top, w: right - left, h: bottom - top };
  return validFigureRegion(region) ? region : null;
}

function renderHomeworkReview(result) {
  const eligible = result.questions.filter(q => q.include && !q.saved);
  const ready = eligible.filter(q => q.region).length;
  const saved = result.questions.filter(q => q.saved).length;
  return `<section class="homework-review" aria-labelledby="homework-review-title">
    <h2 id="homework-review-title" tabindex="-1">校对并收录错题</h2>
    <p class="hint">已自动勾选判错题。展开题目可改判、重画选框或补充题干；未作答也可手动勾选。</p>
    <label class="field homework-subject"><span>收录科目</span><select id="homework-subject">
      <option value="" ${result.subject ? '' : 'selected'} disabled>请选择科目</option>${opts(result.subject)}
    </select></label>
    <div class="homework-questions">${result.questions.map((question, index) => {
      const label = homeworkVerdicts[question.verdict]?.[0] || '待核对';
      return `<div class="homework-review-row">
        <input type="checkbox" data-homework-include="${index}" aria-label="收录识别第 ${esc(question.number)} 题" ${question.include || question.saved ? 'checked' : ''} ${question.saved ? 'disabled' : ''}>
        <details id="homework-question-${index}">
          <summary><span>识别第 ${esc(question.number)} 题</span><span class="homework-badge" data-verdict="${question.verdict}">${label}</span>
            ${question.saved ? '<small>已收录</small>' : question.region ? '' : '<small>待框选</small>'}</summary>
          <div class="homework-review-body">
            ${question.reasons.length ? `<p class="hint">百度判定 · ${homeworkVerdicts[question.originalVerdict]?.[0] || '待核对'}</p><p class="prose">${esc(question.reasons.join('\n'))}</p>` : ''}
            ${question.saved ? '' : `<label class="field"><span>校对判定</span><select data-homework-verdict="${index}">
              ${Object.entries(homeworkVerdicts).map(([value, [name]]) => `<option value="${value}" ${Number(value) === question.verdict ? 'selected' : ''}>${name}</option>`).join('')}
            </select></label>
            <button type="button" class="secondary" data-homework-crop="${index}">${question.region ? '查看或调整切题范围' : '手动框选题目'}</button>
            <label class="field"><span>补充题干（可选）</span><textarea rows="2" data-homework-text="${index}" placeholder="也可只收录题图">${esc(question.text)}</textarea></label>`}
          </div>
        </details>
      </div>`;
    }).join('')}</div>
    <div class="homework-save">
      <p class="hint" id="homework-save-status" role="status">${eligible.length - ready ? `另有 ${eligible.length - ready} 道已勾选题目待框选。 ` : ''}${saved ? `已收录 ${saved} 道。` : ''}</p>
      <button type="button" class="primary" id="save-homework" ${ready && result.subject ? '' : 'disabled'}>收录 ${ready} 道到错题本</button>
    </div>
  </section>`;
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
  const scale = Math.min(1, 8192 / longest, Math.max(2560 / longest, 512 / shortest));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(photo.naturalWidth * scale);
  canvas.height = Math.round(photo.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .84));
  if (!blob) throw Error('作业图片处理失败，请重新选图');
  const src = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error('作业图片读取失败'));
    reader.readAsDataURL(blob);
  });
  return { src, width: canvas.width, height: canvas.height };
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
    if (result.failed && homeworkTask) {
      homeworkSource = homeworkTask.photo.src;
      homeworkTask = null;
    }
    if (Number(result.error_code) === 6) throw Error('百度应用未开通智能作业批改权限');
    throw Error([17, 18, 19, 110, 111].includes(Number(result.error_code)) ? baiduError(result.error_code) : `百度作业批改失败（${result.error_code}）`);
  }
  return result;
}

function homeworkReviewedQuestions(questions, photo) {
  return questions.map(question => {
    const verdict = Object.hasOwn(homeworkVerdicts, question.verdict) ? Number(question.verdict) : 0;
    return {
      number: question.number,
      originalVerdict: verdict,
      verdict,
      reasons: Array.isArray(question.reasons) ? question.reasons.filter(reason => typeof reason === 'string' && reason.trim()) : [],
      region: homeworkQuestionRegion(question.boxes, photo),
      text: '',
      include: verdict === 2
    };
  });
}

async function saveHomeworkQuestions(result) {
  if (!subjects.includes(result.subject)) throw Error('请选择收录科目');
  const questions = result.questions.filter(question => question.include && question.region && !question.saved);
  if (!questions.length) return;
  const cropped = [];
  for (const question of questions) {
    cropped.push(await studyImageCopy(result.photo.src, 'original', question.region));
  }
  const time = stamp(), profile = getStudentProfile();
  const records = questions.map((question, index) => {
    const id = question.recordId ||= uid();
    const original = data.questions.find(record => record.id === id);
    return {
      id,
      number: original?.number || questionNumber(result.subject, new Date(time), data.questions, index, profile),
      created: original?.created || time,
      updated: time,
      subject: result.subject,
      notebookId: captureNotebookId(),
      grade: profile.grade,
      term: profile.term,
      text: question.text.trim() || `识别第 ${question.number} 题 · 见题图`,
      image: cropped[index],
      source: '百度作业批改',
      originalNumber: String(question.number),
      analysis: question.verdict === 2 && question.originalVerdict === 2 ? question.reasons.join('\n') : '',
      answerStatus: question.verdict === 3 && question.originalVerdict !== 3 ? 'unanswered' : 'unknown',
      evidenceVerified: false,
      diagnosisStatus: 'pending',
      tags: [],
      mastered: false
    };
  });
  const ids = new Set(records.map(record => record.id));
  await persist({ ...data, questions: [...data.questions.filter(record => !ids.has(record.id)), ...records] });
  questions.forEach(question => { question.saved = true; });
  toast(`已收录 ${records.length} 道题到错题本`);
}

function bindHomeworkReview(result) {
  const subject = $('#homework-subject');
  if (!subject) return;
  const save = $('#save-homework');
  $('#homework-open-review').onclick = () => {
    const heading = $('#homework-review-title');
    heading.scrollIntoView({ block: 'start' });
    heading.focus({ preventScroll: true });
  };
  const updateSelection = () => {
    const requested = result.questions.filter(q => q.include && !q.saved);
    const ready = requested.filter(q => q.region).length;
    const saved = result.questions.filter(q => q.saved).length;
    save.disabled = busy || !ready || !result.subject;
    save.textContent = `收录 ${ready} 道到错题本`;
    $('#homework-save-status').textContent = [
      requested.length > ready ? `另有 ${requested.length - ready} 道已勾选题目待框选。` : '',
      saved ? `已收录 ${saved} 道。` : ''
    ].filter(Boolean).join(' ');
  };
  const highlight = index => {
    document.querySelectorAll('[data-homework-region]').forEach(region => {
      region.hidden = region.dataset.homeworkRegion !== index;
    });
  };
  const redraw = (index, focusSelector) => {
    if (current() !== 'grading' || homeworkResult !== result) return;
    const open = [...document.querySelectorAll('.homework-questions details[open]')].map(detail => detail.id);
    render();
    open.forEach(id => { document.getElementById(id).open = true; });
    highlight(index);
    $(focusSelector)?.focus({ preventScroll: true });
  };
  subject.onchange = () => { result.subject = subject.value; updateSelection(); };
  document.querySelectorAll('[data-homework-mark]').forEach(mark => {
    mark.onclick = () => {
      const index = mark.dataset.homeworkMark;
      const detail = $(`#homework-question-${index}`);
      highlight(index);
      detail.open = true;
      detail.scrollIntoView({ block: 'nearest' });
      detail.querySelector('summary')?.focus({ preventScroll: true });
    };
  });
  document.querySelectorAll('[data-homework-include]').forEach(input => {
    input.onchange = () => { result.questions[input.dataset.homeworkInclude].include = input.checked; updateSelection(); };
  });
  document.querySelectorAll('[data-homework-text]').forEach(input => {
    input.oninput = () => { result.questions[input.dataset.homeworkText].text = input.value; };
  });
  document.querySelectorAll('[data-homework-verdict]').forEach(select => {
    select.onchange = () => {
      const index = select.dataset.homeworkVerdict;
      const question = result.questions[index];
      question.verdict = Number(select.value);
      question.include = question.verdict === 2;
      redraw(index, `[data-homework-verdict="${index}"]`);
    };
  });
  document.querySelectorAll('[data-homework-crop]').forEach(button => {
    button.onclick = async () => {
      const index = button.dataset.homeworkCrop;
      const question = result.questions[index];
      let region;
      await run(button, async () => {
        region = await openFigurePicker(result.photo.src, question.region, { forHomework: true });
      });
      if (!region) return;
      question.region = region;
      redraw(index, `[data-homework-crop="${index}"]`);
    };
  });
  save.onclick = async () => {
    const countBefore = result.questions.filter(q => q.saved).length;
    subject.disabled = true;
    const controls = [...document.querySelectorAll('.homework-review [data-homework-verdict], .homework-review [data-homework-crop], .homework-review [data-homework-text], .homework-review [data-homework-include]:enabled')];
    controls.forEach(control => { control.disabled = true; });
    await run(save, () => saveHomeworkQuestions(result));
    subject.disabled = false;
    controls.forEach(control => { control.disabled = false; });
    if (result.questions.filter(q => q.saved).length > countBefore) redraw('', '#homework-subject');
  };
}

async function pollHomeworkResult(task, resuming) {
  const delays = [resuming ? 0 : 5000, 2000, 2000, 2000, 2000, 2000, 4000, 4000, 4000, 4000, 4000, 4000];
  for (const delay of delays) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    const result = await requestHomeworkGrading(task, { action: 'homework-result', task_id: task.id });
    if (result.status === 'pending') continue;
    if (result.status !== 'complete' || !Array.isArray(result.questions)) throw Error('批改结果格式不正确，请继续查询');
    return result.questions;
  }
  return null;
}

function bindHomeworkGrading() {
  const upload = $('#homework-upload');
  $('#choose-homework').onclick = () => {
    if (!busy && !homeworkTask) upload.click();
  };
  upload.onchange = event => {
    if (busy || homeworkTask) return;
    loadImage(event.target.files[0], source => {
      if (busy || homeworkTask) return;
      homeworkSource = source;
      homeworkResult = null;
      if (current() === 'grading') render();
    });
  };
  if (homeworkResult) bindHomeworkReview(homeworkResult);
  const button = $('#grade-homework');
  if (!button) return;
  button.onclick = async () => {
    if (busy) return;
    const status = $('#homework-status');
    const choose = $('#choose-homework');
    choose.disabled = true;
    status.classList.add('is-grading');
    await run(button, async () => {
      const resuming = Boolean(homeworkTask);
      if (!homeworkTask) {
        const warning = ocrLocalFileWarning();
        if (warning) throw Error(warning);
        const connection = { endpoint: (cfg.ocrProxy || defaultOCRProxy()).trim(), token: getOcrToken() };
        if (connection.token.length < 24) throw Error('请先在设置的「图片文字识别」中填写代理访问口令');
        if (!homeworkSource) throw Error('请先上传作业图片');
        const started = performance.now();
        status.textContent = '正在处理照片…';
        const photo = await prepareHomeworkImage(homeworkSource);
        status.textContent = '正在上传作业图…';
        const result = await requestHomeworkGrading(connection, { action: 'homework-create', image: photo.src });
        if (typeof result.task_id !== 'string' || !result.task_id) throw Error('代理未返回批改任务编号，请确认代理已更新');
        homeworkTask = { ...connection, id: result.task_id, photo, started };
        homeworkSource = '';
        cfg.baiduHomeworkCalls = (Number(cfg.baiduHomeworkCalls) || 0) + 1;
        saveLocalConfig();
      }
      status.textContent = '百度正在逐题批改…';
      const questions = await pollHomeworkResult(homeworkTask, resuming);
      if (!questions) return toast('百度仍在批改，可以稍后继续查询');
      const { photo, started } = homeworkTask;
      homeworkResult = { photo, questions: homeworkReviewedQuestions(questions, photo), elapsed: performance.now() - started };
      homeworkTask = null;
    });
    if (current() === 'grading') render();
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

