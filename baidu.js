const baiduUsage = { calls: 0 };
const homeworkVerdicts = { 0: ['未批改', '?'], 1: ['正确', '✓'], 2: ['错误', '×'], 3: ['未作答', '—'], 5: ['批改失败', '?'] };
const homeworkProviders = { baidu: '百度', qwen: '千问', deepseek: 'DeepSeek' };
let homeworkPrimary = 'baidu';
const homeworkChecks = new Set();
let homeworkSource = '', homeworkTask = null, homeworkResult = null;
let homeworkView = { scale: 1, x: 0, y: 0 };

function baiduGradingSettings() {
  return `<p class="notice">在底部「批改」上传整张含学生作答的图片，再点击「开始批改」。作业批改使用「图片文字识别」中配置的百度代理和访问口令。百度应用需开通智能作业批改权限。</p>
    <p class="result-note">本机已提交 ${Number(cfg.baiduHomeworkCalls) || 0} 次批改。账户免费余量请在百度控制台查看。</p>
    <a href="https://console.bce.baidu.com/ai/#/ai/ocr/overview/index" target="_blank" rel="noopener">打开百度文字识别控制台</a>`;
}

function homeworkGradingPage() {
  const questions = homeworkResult?.questions || [];
  const preview = homeworkTask?.original || homeworkSource;
  const locked = busy || Boolean(homeworkTask);
  const additional = homeworkResult && Object.keys(homeworkProviders).filter(key => key !== homeworkResult.primary && !homeworkResult.checks.includes(key));
  const checks = additional || Object.keys(homeworkProviders).filter(key => key !== homeworkPrimary);
  return `<section class="card homework-grading">
    <header class="homework-heading"><h1>作业批改</h1></header>
    ${homeworkResult && !checks.length ? '' : `<fieldset class="homework-models" ${locked ? 'disabled' : ''}>
      <legend>${homeworkResult ? '追加交叉验证' : '批改模型'}</legend>
      ${homeworkResult ? '' : `<div class="ocr-switch" role="group" aria-label="主批改模型">${Object.entries(homeworkProviders).map(([key, label]) => `<button type="button" data-homework-model="${key}" aria-pressed="${key === homeworkPrimary}" class="${key === homeworkPrimary ? 'active' : ''}">${label}</button>`).join('')}</div>`}
      <div class="homework-checks">${homeworkResult ? '' : '<span>交叉验证</span>'}${checks.map(key => `<label><input type="checkbox" data-homework-check="${key}" ${(homeworkTask?.providers || [...(homeworkResult?.selectedChecks || homeworkChecks)]).includes(key) ? 'checked' : ''}> ${homeworkProviders[key]}</label>`).join('')}</div>
      <p class="hint">勾选的服务会收到同一张照片，并独立计入用量。</p>
    </fieldset>`}
    <div class="actions homework-actions">
      <input type="file" id="homework-upload" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
      <button type="button" class="secondary" id="choose-homework" ${busy ? 'disabled' : ''}>${preview || homeworkResult ? '重新选图' : '上传作业图'}</button>
      ${homeworkResult ? '' : `<button type="button" class="primary" id="grade-homework" ${!homeworkSource && !homeworkTask ? 'disabled' : ''}>${homeworkTask ? '继续查询批改' : '开始批改'}</button>`}
      ${additional?.length ? `<button type="button" class="primary" id="check-homework" ${!homeworkTask && !homeworkResult.selectedChecks.size ? 'disabled' : ''}>${homeworkTask ? '继续查询复核' : '开始复核'}</button>` : ''}
    </div>
    <p class="hint homework-status" id="homework-status" role="status">${homeworkTask ? '已提交，等待结果。' : homeworkResult ? '双指缩放照片，点标记可定位题目。' : preview ? '双指缩放照片，放大后可拖动。' : '上传一张包含题目和学生作答的整页照片。'}</p>
    ${!homeworkResult && preview ? renderHomeworkPhoto(preview, '待批改的作业图') : ''}
    ${homeworkResult ? `<section aria-label="作业批改结果">
      <div class="homework-result-head"><h2>批改结果 · ${questions.length} 题</h2><span>用时 ${Math.round(homeworkResult.elapsed / 1000)} 秒</span></div>
      <p class="hint">主批改结果 · ${homeworkProviders[homeworkResult.primary]}${homeworkResult.checks.length ? ' ｜ 已复核 · ' + homeworkResult.checks.map(key => homeworkProviders[key]).join('、') : ''}</p>
      ${[...homeworkResult.failures].map(([provider, reason]) => `<p class="hint">${homeworkProviders[provider]}未完成 · ${esc(reason)}</p>`).join('')}
      <div class="homework-totals">
        ${[[1, '正确'], [2, '错题'], [3, '未作答']].map(([verdict, label]) => `<div data-verdict="${verdict}"><span>${label}</span><strong>${questions.filter(q => q.verdict === verdict).length}</strong></div>`).join('')}
      </div>
      ${questions.length ? '<button type="button" class="secondary homework-review-link" id="homework-open-review">校对并收录错题 ↓</button>' : ''}
      ${renderHomeworkMarks({ ...homeworkResult.photo, src: homeworkResult.original }, questions)}
      ${questions.length ? renderHomeworkReview(homeworkResult) : '<p class="muted">主批改模型未返回题目。</p>'}
    </section>` : ''}
  </section>`;
}

function renderHomeworkPhoto(src, label, marks = '', dimensions = '') {
  return `<div class="homework-photo">
    <div class="homework-photo-layer"><img alt="${label}" src="${esc(src)}" ${dimensions} draggable="false">${marks}</div>
    <button type="button" class="homework-reset-zoom" aria-label="恢复照片原大小" hidden>恢复大小</button>
  </div>`;
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
        aria-label="识别第 ${esc(question.number)} 题，${label}${question.conflict ? '，判定有分歧' : ''}"><b aria-hidden="true">${icon}</b><span aria-hidden="true">${esc(question.number)}${question.conflict ? '!' : ''}</span></button>`;
  }).join('');
  const dimensions = `width="${photo.width}" height="${photo.height}"`;
  return renderHomeworkPhoto(photo.src, '批改后的作业图', marks, dimensions) +
    (!marks && questions.length ? '<p class="hint">没有可定位的题目坐标，请查看下方逐题结果。</p>' : '');
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
      <p class="hint">默认勾选判错且无分歧的题。展开题目可改判、重画选框或补充题干，也可手动勾选。</p>
    <label class="field homework-subject"><span>收录科目</span><select id="homework-subject">
      <option value="" ${result.subject ? '' : 'selected'} disabled>请选择科目</option>${opts(result.subject)}
    </select></label>
    <div class="homework-questions">${result.questions.map((question, index) => {
      const label = homeworkVerdicts[question.verdict]?.[0] || '待核对';
      return `<div class="homework-review-row">
        <input type="checkbox" data-homework-include="${index}" aria-label="收录识别第 ${esc(question.number)} 题" ${question.include || question.saved ? 'checked' : ''} ${question.saved ? 'disabled' : ''}>
        <details id="homework-question-${index}">
          <summary><span>识别第 ${esc(question.number)} 题</span><span class="homework-badge" data-verdict="${question.verdict}">${label}</span>
            ${question.saved ? '<small>已收录</small>' : question.region ? '' : '<small>待框选</small>'}
            ${question.conflict ? '<small class="homework-conflict">判定有分歧</small>' : ''}</summary>
          <div class="homework-review-body">
            ${question.reasons.length ? `<p class="hint">${homeworkProviders[result.primary]}判定 · ${homeworkVerdicts[question.originalVerdict]?.[0] || '待核对'}</p><p class="prose">${esc(question.reasons.join('\n'))}</p>` : ''}
            ${question.checks?.map(check => `<p class="hint">${homeworkProviders[check.provider]}复核 · ${check.label}${check.reason ? ' · ' + esc(check.reason) : ''}</p>`).join('') || ''}
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
  let response;
  try {
    response = await fetch(connection.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-OCR-Token': connection.token },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000)
    });
  } catch {
    throw Object.assign(Error('百度批改网络连接中断，请继续查询'), { retryable: true });
  }
  const result = await response.json();
  if (!response.ok) throw Object.assign(Error(result.error || `百度批改代理请求失败（${response.status}）`), { retryable: response.status >= 500 });
  if (result.error_code) {
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
      source: homeworkProviders[result.primary] + '作业批改',
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

async function gradeHomeworkWithBaidu(task) {
  const resuming = Boolean(task.baidu);
  if (!task.baidu) {
    const warning = ocrLocalFileWarning();
    if (warning) throw Error(warning);
    const connection = { endpoint: (cfg.ocrProxy || defaultOCRProxy()).trim(), token: getOcrToken() };
    if (connection.token.length < 24) throw Error('请先在设置的「图片文字识别」中填写代理访问口令');
    const result = await requestHomeworkGrading(connection, { action: 'homework-create', image: task.photo.src });
    if (typeof result.task_id !== 'string' || !result.task_id) throw Error('代理未返回批改任务编号，请确认代理已更新');
    task.baidu = { ...connection, id: result.task_id };
    cfg.baiduHomeworkCalls = (Number(cfg.baiduHomeworkCalls) || 0) + 1;
    saveLocalConfig();
  }
  return pollHomeworkResult(task.baidu, resuming);
}

async function gradeHomeworkWithVision(provider, photo) {
  const response = await ai(`逐题批改同一张完整作业照片，按阅读顺序返回。仅判断纸面上的学生原作答，忽略教师勾叉和批注。无法辨认、没有把握或缺题干用 0；明确空白用 3；正确用 1；错误用 2。多小问合并为题目外框；有明确错误时标 2。number 是可见题号，不能辨认则填阅读顺序。bbox_2d 是整道题（含题干、配图和作答）的矩形 [左,上,右,下]，相对实际整张照片归一化到 0~999；坐标不可靠填 null。reason 简要给依据。只返回 {"questions":[{"number":"1","verdict":2,"bbox_2d":[10,30,980,250],"reason":"中文说明"}]}。`, photo.src,
    { ocr: true, grading: true, provider });
  if (!Array.isArray(response?.questions)) throw Error('模型未返回有效的逐题结果');
  return response.questions.slice(0, 150).flatMap((question, index) => {
    if (!question || ![0, 1, 2, 3].includes(question.verdict)) return [];
    const bbox = question.bbox_2d;
    const boxes = Array.isArray(bbox) && bbox.length === 4 && bbox.every(n => Number.isFinite(n) && n >= 0 && n <= 999)
      ? [{ left: bbox[0] * photo.width / 999, top: bbox[1] * photo.height / 999,
           right: bbox[2] * photo.width / 999, bottom: bbox[3] * photo.height / 999 }]
      : [];
    return [{ number: /^\d{1,4}$/.test(question.number) ? question.number : index + 1, verdict: question.verdict,
      boxes, reasons: typeof question.reason === 'string' ? [question.reason.slice(0, 1000)] : [] }];
  });
}

function homeworkBoxesOverlap(a, b) {
  if (!a || !b) return false;
  const width = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const intersection = width * height;
  return intersection / (a.w * a.h + b.w * b.h - intersection) >= .45;
}

function crossCheckHomework(questions, provider, others) {
  const candidates = questions.map(question => others.filter(other => homeworkBoxesOverlap(question.region, other.region)));
  questions.forEach((question, index) => {
    const matches = candidates[index];
    const other = matches.length === 1 && candidates.filter(list => list.includes(matches[0])).length === 1 ? matches[0] : null;
    const verdict = other?.verdict;
    question.checks ??= [];
    question.checks.push({ provider, label: other ? homeworkVerdicts[verdict][0] : '未能定位同一道题', reason: other?.reasons[0] });
    if ([1, 2, 3].includes(verdict) && [1, 2, 3].includes(question.originalVerdict) && verdict !== question.originalVerdict) {
      question.conflict = true;
      question.include = false;
    }
  });
}

async function completeHomeworkBatch(task) {
  await Promise.all(task.providers.map(async provider => {
    if (task.results.has(provider) || task.failures.has(provider)) return;
    try {
      const questions = await (provider === 'baidu' ? gradeHomeworkWithBaidu(task) : gradeHomeworkWithVision(provider, task.photo));
      if (!questions) return;
      if (!questions.length) throw Error('未识别到可批改的题目');
      task.results.set(provider, homeworkReviewedQuestions(questions, task.photo));
    } catch (error) {
      if (provider === 'baidu' && task.baidu && error.retryable) return;
      task.failures.set(provider, error.name === 'TimeoutError' ? '请求超时' : error.message || '批改失败');
    }
  }));
  if (task.providers.some(provider => !task.results.has(provider) && !task.failures.has(provider))) return null;
  const primary = task.providers.find(provider => task.results.has(provider));
  const failures = [...task.failures].map(([provider, reason]) => `${homeworkProviders[provider]}未完成 · ${reason}`);
  if (!primary) throw Error(failures.join(' ｜ '));
  const questions = task.results.get(primary);
  const checks = task.providers.filter(provider => provider !== primary && task.results.has(provider));
  checks.forEach(provider => crossCheckHomework(questions, provider, task.results.get(provider)));
  return { photo: task.photo, original: task.original, questions, primary, checks, failures, elapsed: performance.now() - task.started };
}

function bindHomeworkGrading() {
  const upload = $('#homework-upload');
  $('#choose-homework').onclick = () => {
    if (!busy) upload.click();
  };
  upload.onchange = event => {
    if (busy) return;
    loadImage(event.target.files[0], source => {
      if (busy) return;
      homeworkSource = source;
      homeworkTask = null;
      homeworkResult = null;
      if (current() === 'grading') render();
    });
  };
  const model = $('#homework-model');
  if (model) model.onchange = () => {
    homeworkPrimary = model.value;
    homeworkChecks.delete(homeworkPrimary);
    render();
    $('#homework-model')?.focus();
  };
  document.querySelectorAll('[data-homework-check]').forEach(input => {
    input.onchange = () => {
      if (input.checked) homeworkChecks.add(input.dataset.homeworkCheck);
      else homeworkChecks.delete(input.dataset.homeworkCheck);
    };
  });
  $('.homework-photo-open')?.addEventListener('click', () => openHomeworkPhoto(homeworkTask?.original || homeworkSource, homeworkResult));
  if (homeworkResult) bindHomeworkReview(homeworkResult);
  const button = $('#grade-homework');
  if (!button) return;
  button.onclick = async () => {
    if (busy) return;
    const status = $('#homework-status');
    const choose = $('#choose-homework');
    choose.disabled = true;
    $('#homework-model').closest('fieldset').disabled = true;
    status.classList.add('is-grading');
    await run(button, async () => {
      if (!homeworkTask) {
        if (!homeworkSource) throw Error('请先上传作业图片');
        const started = performance.now();
        status.textContent = '正在处理照片…';
        const photo = await prepareHomeworkImage(homeworkSource);
        homeworkTask = { photo, original: homeworkSource, started, providers: [homeworkPrimary, ...homeworkChecks], results: new Map(), failures: new Map() };
      }
      status.textContent = '正在逐题批改…';
      try {
        const result = await completeHomeworkBatch(homeworkTask);
        if (!result) return toast('批改还未结束，可以稍后继续查询');
        homeworkResult = result;
        homeworkSource = '';
        homeworkTask = null;
      } catch (error) {
        homeworkTask = null;
        throw error;
      }
    });
    if (current() === 'grading') render();
  };
}

function openHomeworkPhoto(source, result) {
  const src = result?.original || source;
  if (!src) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'homework-viewer homework-grading';
  dialog.setAttribute('aria-label', '作业照片预览');
  dialog.innerHTML = `<header>
      <button type="button" class="secondary" data-close autofocus>关闭</button>
      ${result ? '<button type="button" class="secondary" data-overlay aria-pressed="true">显示标记</button>' : ''}
      <button type="button" class="secondary" data-out aria-label="缩小">−</button>
      <button type="button" class="secondary" data-reset aria-label="重置缩放">100%</button>
      <button type="button" class="secondary" data-in aria-label="放大">+</button>
    </header>
    <div class="homework-view-scroll" tabindex="0" aria-label="可滚动的作业照片">
      ${result ? renderHomeworkMarks({ ...result.photo, src }, result.questions, true) : `<div class="homework-photo"><img alt="作业原图" src="${esc(src)}"></div>`}
    </div>`;
  const scroll = dialog.querySelector('.homework-view-scroll');
  const photo = dialog.querySelector('.homework-photo');
  const reset = dialog.querySelector('[data-reset]');
  const shrink = dialog.querySelector('[data-out]');
  const enlarge = dialog.querySelector('[data-in]');
  let scale = 1, pinch;
  function zoom(value, fromX = scroll.clientWidth / 2, fromY = scroll.clientHeight / 2, toX = fromX, toY = fromY) {
    const before = scale;
    scale = Math.max(1, Math.min(4, value));
    photo.style.width = `${scale * 100}%`;
    scroll.scrollLeft = (scroll.scrollLeft + fromX) * scale / before - toX;
    scroll.scrollTop = (scroll.scrollTop + fromY) * scale / before - toY;
    reset.textContent = `${Math.round(scale * 100)}%`;
    shrink.disabled = scale === 1;
    enlarge.disabled = scale === 4;
  }
  const touchPoint = event => {
    const [a, b] = event.touches;
    const bounds = scroll.getBoundingClientRect();
    return { x: (a.clientX + b.clientX) / 2 - bounds.left, y: (a.clientY + b.clientY) / 2 - bounds.top,
      distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
  };
  scroll.addEventListener('touchmove', event => {
    if (event.touches.length !== 2) { pinch = null; return; }
    event.preventDefault();
    const next = touchPoint(event);
    if (pinch?.distance > 0) zoom(scale * next.distance / pinch.distance, pinch.x, pinch.y, next.x, next.y);
    pinch = next;
  }, { passive: false });
  scroll.addEventListener('touchend', () => { pinch = null; });
  scroll.addEventListener('touchcancel', () => { pinch = null; });
  scroll.ondblclick = event => {
    const bounds = scroll.getBoundingClientRect();
    zoom(scale > 1 ? 1 : 2, event.clientX - bounds.left, event.clientY - bounds.top);
  };
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  const overlay = dialog.querySelector('[data-overlay]');
  if (overlay) overlay.onclick = () => {
    const marks = dialog.querySelector('.homework-view-marks');
    marks.hidden = !marks.hidden;
    overlay.setAttribute('aria-pressed', String(!marks.hidden));
  };
  shrink.onclick = () => zoom(scale / 1.5);
  enlarge.onclick = () => zoom(scale * 1.5);
  reset.onclick = () => zoom(1);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog);
  dialog.showModal();
  zoom(1);
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

