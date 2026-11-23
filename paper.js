let paper = null, paperLayout = '2', paperProgress = '';
const isTestEnv = () => Boolean(globalThis.assert);

const OCR_SCHEMA = '错字、错误拼音、错误标点和错误选项必须按原图照录，不能自动修正。返回 JSON {"items":[{"section":"大题标题，严格使用目录中的名称","number":"原卷小题号，无号用位置或拼音","text":"完整原题，包含材料、全部选项和空格，不含学生填入内容","studentAnswer":"仅转录实际可见的学生作答，不可推测","uncertainty":"模糊、缺失、跨区截断或无法区分的内容，清晰则空字符串"}],"warnings":["其他问题"]}';

function ocrSubjectOptions() {
  return subjects.filter(subject => subject !== '其他');
}

function ocrSubjectInstruction() {
  return '请根据题目内容判断科目，填入 JSON 顶层 suggestedSubject。只能填：'
    + ocrSubjectOptions().join('、') + '。混合科目、内容不足或无法确定时填空字符串。';
}

function recognizedSubject(result, fallback) {
  const suggestion = typeof result.suggestedSubject === 'string' ? result.suggestedSubject.trim() : '';
  return ocrSubjectOptions().includes(suggestion) ? suggestion : fallback;
}

function deepSeekOCRSchema(subject, detectSubject = false, ordered = false) {
  if (ordered) return (detectSubject ? OCR_SCHEMA.replace('{"items":', '{"suggestedSubject":"","items":') + ' ' + ocrSubjectInstruction() : OCR_SCHEMA)
    + ' 不分类题型。每题额外返回 answerParts 数组，按原卷顺序单独照录每个作答区（选项字母、文字、计算等均可），空白或无法辨认用 null。另用 visualFeatures 写明确实看见的印刷加点、划线或图示。不得推测答案。';
  const kinds = detectSubject
    ? [...new Set([...ocrSubjectOptions(), subject].flatMap(questionTypesFor))]
    : questionTypesFor(subject);
  const allowed = kinds.filter(kind => kind !== 'other')
    .map(kind => kind + '（' + QUESTION_TYPE_NAMES[kind] + '）').join('、');
  const schema = detectSubject ? OCR_SCHEMA.replace('{"items":', '{"suggestedSubject":"","items":') : OCR_SCHEMA;
  return schema.replace('"uncertainty":', '"suggestedQuestionType":"","uncertainty":')
    + (detectSubject ? ' ' + ocrSubjectInstruction() : '')
    + ' 对原题印刷的加点、下划线或图示，逐题附上 visualFeatures 字段，写明确实可见的文字和标记范围。把印刷的答题空线与学生写在上面的字分开；无法确定归属就注明，不当成作答。'
    + ' 每题按纸面要求建议一个题型，仅填代码：' + allowed
    + '。混合题、看不清或无法确定时填空字符串。填空题另返回 blankAnswers 数组，按空位顺序逐字记录孩子写的内容，位置明确但空白或看不清用 null，无法匹配空位则省略数组。选择题的 studentAnswer 只写实际选项字母，判断题照录实际标记。不要解题或推测作答。';
}

function getVerdictTagOptions(selected) {
  const list = typeof aiVerdictTags !== 'undefined' && Array.isArray(aiVerdictTags)
    ? aiVerdictTags
    : ['概念混淆', '审题偏差', '计算粗心', '知识盲区', '书写规范', '思路受阻', '薄弱待练', '巩固良好'];
  const cur = selected && list.includes(selected) ? selected : '薄弱待练';
  return list.map(v => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
}

function refreshPaperDialog(dialog) {
  const body = $('#paper-dialog-body');
  const scroll = dialog.scrollTop;
  const active = document.activeElement;
  const selector = active && body.contains(active) && (active.id ? '#' + CSS.escape(active.id) :
    active.getAttributeNames().filter(name => name.startsWith('data-'))
      .map(name => `[${name}="${CSS.escape(active.getAttribute(name))}"]`).join(''));
  const openDetails = [...body.querySelectorAll('details')].map(element => element.open);
  body.innerHTML = paperView();
  [...body.querySelectorAll('details')].forEach((element, index) => {
    if (openDetails[index] && !element.matches('[data-answer-extra]')) element.open = true;
  });
  bindPaper();
  if (selector) body.querySelector(selector)?.focus({ preventScroll: true });
  dialog.scrollTop = scroll;
  const open = $('#open-paper');
  if (open) open.textContent = `📄 查看识别结果 · ${paper.items.length} 题`;
}

function readingQuestionParts(text) {
  const bracketed = [...text.matchAll(/^[ \t]*([（(][0-9０-９]{1,2}[）)])/gm)];
  const markers = bracketed.length >= 2 ? bracketed : [...text.matchAll(/^[ \t]*([0-9０-９]{1,2}[.．、])(?![0-9０-９])/gm)];
  if (markers.length < 2) return [];
  const passage = text.slice(0, markers[0].index).trimEnd();
  return markers.map((marker, i) => ({
    label: marker[1], text: [passage, text.slice(marker.index, markers[i + 1]?.index).trim()].filter(Boolean).join('\n\n')
  }));
}

function readingScopeField(item, index) {
  if (!['reading', 'material'].includes(item.questionType)) return '';
  const parts = readingQuestionParts(item.readingScope && item.readingScope !== 'all' ? item.readingDrafts.all : item.text);
  if (!parts.length) return '';
  const selected = item.readingScope || 'all';
  return `<label class="field"><span>收录范围（保留阅读材料）</span><select data-reading-scope="${index}"><option value="all">整篇与全部小题</option>${parts.map(({label}, i) => `<option value="${i}" ${selected === String(i) ? 'selected' : ''}>只收录小题 ${esc(label)}</option>`).join('')}</select></label>`;
}

function bindReadingScope(select) {
  select.onchange = () => {
    const item = paper.items[Number(select.dataset.readingScope)];
    const drafts = item.readingDrafts ||= {};
    drafts[item.readingScope || 'all'] = item.text;
    const scope = select.value;
    const replacement = drafts[scope] ?? readingQuestionParts(drafts.all)[Number(scope)]?.text;
    if (typeof replacement !== 'string') return;
    item.readingScope = scope;
    item.text = replacement;
    invalidatePaperEvidence(item);
    render();
    if (scope !== 'all' && item.studentAnswer) toast('已保留材料和所选小题，请核对孩子作答是否只对应此题');
  };
}

function paperContinuationTools() {
  return `<div class="paper-answer-tools"><button type="button" class="secondary" id="paper-add-continuation">补录续页</button></div>
    <dialog id="paper-continuation" class="compact-dialog">
      <div class="card-head"><h2>补录续页</h2><button type="button" class="dialog-x" id="paper-continuation-close" aria-label="关闭">×</button></div>
      <p class="hint">可选续页照片并框出本题范围，也可以直接补写续页的题干或小问。</p>
      <label class="field"><span>续页照片（选填）</span><input type="file" id="paper-continuation-photo" accept="image/jpeg,image/png,image/webp,image/gif"></label>
      <img class="paper-original" id="paper-continuation-preview" alt="续页照片" hidden>
      <div class="actions"><button type="button" class="secondary" id="paper-continuation-crop" disabled>框选续页</button><button type="button" class="secondary" id="paper-continuation-ocr" disabled>识别续页文字</button></div>
      <label class="field"><span>续页题干或小问</span><textarea rows="4" id="paper-continuation-text"></textarea></label>
      <button type="button" class="primary" id="paper-continuation-add">合并到当前题</button>
    </dialog>`;
}

function bindPaperContinuation() {
  const dialog = $('#paper-continuation');
  if (!dialog) return;
  const preview = $('#paper-continuation-preview');
  const crop = $('#paper-continuation-crop'), recognize = $('#paper-continuation-ocr');
  const input = $('#paper-continuation-photo'), textField = $('#paper-continuation-text');
  let photo = '', region, generation = 0;
  $('#paper-add-continuation').onclick = () => {
    if (busy) return;
    generation++;
    photo = '';
    region = undefined;
    input.value = textField.value = '';
    preview.removeAttribute('src');
    preview.hidden = crop.disabled = recognize.disabled = true;
    dialog.showModal();
  };
  $('#paper-continuation-close').onclick = () => { if (!busy) dialog.close(); };
  dialog.oncancel = event => { if (busy) event.preventDefault(); };
  input.onchange = () => {
    const version = ++generation;
    loadImage(input.files[0], source => {
      if (version !== generation || !dialog.open) return;
      photo = source;
      region = undefined;
      preview.src = source;
      preview.hidden = crop.disabled = recognize.disabled = false;
    });
  };
  crop.onclick = () => run(crop, async () => {
    const chosen = await openFigurePicker(photo, region, { forHomework: true });
    if (chosen) region = chosen;
  });
  recognize.onclick = () => run(recognize, async () => {
    const source = await studyImageCopy(photo, 'original', region || { x:0, y:0, w:1, h:1 });
    const provider = paper.ocrProvider === 'manual' ? (cfg.ocrProvider || 'baidu') : paper.ocrProvider;
    if (provider === 'baidu') {
      const response = await callBaiduOCR(source);
      textField.value = arrangeOCRLines(response.words_result).text;
    } else {
      const response = await ai('转录这张续页图上属于原题的题干、小问、选项和图中文字。保留原字与编号，排除学生手写。只返回 JSON {"text":"续页原文"}。', source, { ocr:true, provider });
      if (typeof response.text !== 'string' || !response.text.trim()) throw Error('没识别到续页原文，请手动填写');
      textField.value = response.text;
    }
  });
  const add = $('#paper-continuation-add');
  add.onclick = () => run(add, async () => {
    const text = textField.value.trim();
    if (!text && !photo) throw Error('请添加续页照片或文字');
    const item = paper.items[0];
    if (item.readingScope && item.readingScope !== 'all') throw Error('请先将收录范围切回整篇，再合并续页');
    if (photo) {
      const next = await studyImageCopy(photo, 'original', region || { x:0, y:0, w:1, h:1 });
      if (isStudyImage(paper.image)) {
        const combined = await joinStudyPages(paper.image, next);
        paper.image = combined.src;
        if (validFigureRegion(item.figureRegion)) {
          item.figureRegion = { ...item.figureRegion, y:item.figureRegion.y * combined.firstFraction, h:item.figureRegion.h * combined.firstFraction };
        }
      } else paper.image = next;
      item.hasContinuation = true;
    }
    if (text) item.text = [item.text, text].filter(Boolean).join('\n\n');
    invalidatePaperEvidence(item);
    dialog.close();
    render();
    toast('续页已合并到当前题，请重新核对');
  });
}

function paperView() {
  if (!paper) return '';
  const isSingleCrop = paper.scope === 'crop' && paper.items.length === 1 && !isTestEnv();

  if (isSingleCrop) {
    const p = paper.items[0];
    p.selected = true;
    return `<section class="card" style="border:2px solid #2563eb33">
      <div class="card-head">
        <h2>校对识别结果</h2>
        <span class="pill">${p.analyzed ? '✓ 已生成 AI 解析与错因判定' : '待校对 / 分析'}</span>
      </div>
      ${typeof paperMetadataFields==='function'?paperMetadataFields(p):''}
      ${paper.image ? `<div id="paper-crop-image-box"><img id="paper-crop-img" class="paper-original" src="${paper.image}" alt="框选原图，点击全屏查看" title="点击全屏查看">${rawPaperTranscriptLink()}</div><dialog id="paper-lightbox" class="image-lightbox"><button type="button" class="lightbox-close" id="paper-lightbox-close" aria-label="关闭">×</button><img id="paper-lightbox-img" alt="框选图全屏预览"></dialog>` : rawPaperTranscriptLink()}
      ${rawPaperTranscriptDialog()}
      ${paperFigureTools(p, 0, true)}
      <label class="field"><span>原题（仅题干、印刷选项和空位；请移出手写答案与订正，不修正原卷错字）</span><textarea class="paper-textarea" data-paper="text" data-index="0">${esc(p.text)}</textarea></label>
      ${typeof answerTransferTools==='function'?answerTransferTools():''}
      ${paperContinuationTools()}
      ${answerReviewFields(p,0)}
      ${p.analyzed ? `
        <div data-paper-analysis-output style="margin-top:12px;padding-top:12px;border-top:1px dashed #cbd5e1">
          <div class="form-row">
            <label class="field">
              <span>🤖 AI 判定错因标签</span>
              <select data-paper="aiVerdict" data-index="0">${getVerdictTagOptions(p.aiVerdict)}</select>
            </label>
            ${paperField('知识点标签（逗号分隔）', 'tagsText', (p.tags || []).join('，'), 0)}
          </div>
          ${paperField('正确答案', 'answer', p.answer, 0, true)}
          ${paperField('解题步骤与错因分析', 'analysis', p.analysis, 0, true)}
          ${paperField('易错提醒', 'reminder', p.reminder, 0, true)}
        </div>
      ` : ''}
      ${p.error ? `<p class="result-note" style="color:#dc2626">${esc(p.error)}</p>` : ''}
      <div class="review-submit-actions">
        <button class="secondary" id="paper-analyze"><span>仅AI分析</span><span>先看解析</span></button>
        <button class="secondary" id="paper-save"><span>不分析</span><span>直接收录原题</span></button>
        <button class="primary" id="paper-analyze-and-save"><span>AI分析</span><span>并直接收录</span></button>
      </div>
    </section>`;
  }

  const keys = new Set([...paper.items.map(p => paperKey(p)), ...(paper.savedKeys || [])]);
  const missing = paper.inventory.filter(p => !keys.has(paperKey(p)));
  return `<section class="card">
    <div class="card-head">
      <h2>${paper.scope === 'crop' ? '框内原文核对' : '整卷逐题核对'} · ${paper.items.length} 题</h2>
      <span class="pill">${paper.complete ? '转录已返回' : '转录尚未完成'}</span>
    </div>
    ${typeof paperMetadataFields==='function'?paperMetadataFields():''}
    <p class="result-note">${paper.ocrProvider === 'baidu' ? '请对照裁剪图核对原文。' : `目录发现 ${paper.inventory.length} 个题号；当前转录 ${paper.items.length} 个条目。`}${missing.length ? ' 待核对：' + esc(missing.map(p => p.section + ' / ' + p.number).join('、')) : ''}</p>
    ${paper.image ? `<details style="margin-bottom:8px"><summary style="cursor:pointer;font-size:13px;color:var(--muted)">展开原图对照（默认收起）</summary><div class="paper-original-frame"><a href="${paper.image}" target="_blank" rel="noopener"><img class="paper-original" src="${paper.image}" alt="原始试卷，点击放大"></a>${rawPaperTranscriptLink()}</div></details>` : rawPaperTranscriptLink()}
    ${rawPaperTranscriptDialog()}
    <div class="actions">
      <button class="secondary" id="paper-select-all">全选 / 取消全选</button>
      <button class="secondary" id="paper-add">补录漏题</button>
    </div>
    ${paper.items.map((p, i) => `<article class="paper-item" data-paper-item="${i}">
      <div class="card-head">
        <label><input type="checkbox" data-paper="selected" data-index="${i}" ${p.selected ? 'checked' : ''}> 选择第 ${i + 1} 个条目</label>
        <span class="pill">${p.analyzed ? '已分析 · ' + esc(p.aiVerdict || '薄弱待练') : '待核对'}</span>
        ${p.orderedAnswers && typeof captureTypeField === 'function' ? captureTypeField(p, i) : ''}
      </div>
      ${paperField('原题全文（保留材料、选项和空格）', 'text', p.text, i, true)}
      ${p.orderedAnswers ? `<button type="button" class="secondary" data-move-paper-answer="${i}">选中文字，移入下一空</button>` : ''}
      ${paperFigureTools(p, i, i === 0)}
      ${answerReviewFields(p,i)}
      ${p.uncertainty ? `<p class="result-note">需核对：${esc(p.uncertainty)}</p>` : ''}
      ${p.analyzed ? `
        <div data-paper-analysis-output><div class="form-row">
          <label class="field"><span>🤖 AI 判定错因标签</span><select data-paper="aiVerdict" data-index="${i}">${getVerdictTagOptions(p.aiVerdict)}</select></label>
          ${paperField('标签（逗号分隔）', 'tagsText', (p.tags || []).join('，'), i)}
        </div>
        ${paperField('答案', 'answer', p.answer, i, true)}
        ${paperField('步骤', 'analysis', p.analysis, i, true)}
        ${paperField('提醒', 'reminder', p.reminder, i, true)}</div>
      ` : ''}
      ${p.error ? `<p class="result-note">${esc(p.error)}</p>` : ''}
      <div class="actions"><button class="text-button" data-paper-delete="${i}">移除此条目</button></div>
    </article>`).join('')}
    <div class="actions">
      <button class="primary" id="paper-analyze">分析已选题目</button>
      <button class="secondary" id="paper-save">收录已选题目</button>
    </div>
  </section>`;
}

function rawPaperTranscriptLink() {
  return paper.ocrProvider === 'baidu' && paper.ocrOriginalText ? '<button type="button" class="text-button paper-raw-link" id="paper-open-raw">查看百度原始转录</button>' : '';
}

function rawPaperTranscriptDialog() {
  return paper.ocrProvider === 'baidu' && paper.ocrOriginalText ? `<dialog id="paper-raw-dialog" class="compact-dialog" aria-labelledby="paper-raw-title"><div class="card-head"><h2 id="paper-raw-title">百度原始转录</h2><button type="button" id="paper-raw-close" class="dialog-x" aria-label="关闭原始转录">×</button></div><pre class="prose paper-raw-text">${esc(paper.ocrOriginalText)}</pre></dialog>` : '';
}

function paperFigureTools(item, index, showNotices = false) {
  const hasImage = paper.image && typeof isStudyImage === 'function' && isStudyImage(paper.image);
  const notices = showNotices && paper.warnings.length ? `<div class="ocr-notices">${paper.warnings.map(w => `<span class="${w.startsWith('已保留') ? 'ocr-info' : 'ocr-warning'}">${esc(w)}</span>`).join('')}</div>` : '';
  if (!hasImage && !notices) return '';
  return `<div class="paper-figure-tools">${hasImage ? `<div data-paper-figure="${index}"></div>` : ''}<div class="paper-figure-actions">
    ${hasImage ? `<button type="button" class="secondary" data-pick-paper-figure="${index}">${validFigureRegion(item.figureRegion) ? '调整题图' : '从原图框选题图'}</button>` : ''}${notices}</div></div>`;
}

function paperField(label, key, value, i, area = false) {
  return `<label class="field"><span>${label}</span>${area ? `<textarea data-paper="${key}" data-index="${i}">${esc(value)}</textarea>` : `<input type="text" data-paper="${key}" data-index="${i}" value="${esc(value)}">`}</label>`;
}

function paperKey(p) {
  return (p.section + '|' + p.number).replace(/[\s、.．：:（）()]/g, '');
}

function prefillOCRAnswer(item, response, subject) {
  const raw = item.ocrStudentAnswer || item.studentAnswer;
  if (item.questionType === 'fill') {
    const parts = response.blankAnswers;
    if (Array.isArray(parts) && parts.length > 0 && parts.length <= 20
        && parts.every(answer => answer === null || typeof answer === 'string')) {
      item.blankAnswers = parts.map(answer => answer ?? '');
      item.blankCount = parts.length;
    } else {
      // A semicolon or a separate line can delimit complete answers. Commas may be part of an answer.
      const numbered = [...raw.matchAll(/^第\s*(\d+)\s*空\s*[：:]\s*(.*)$/gm)];
      const lines = raw.trim().split(/[;；\n]/).map(answer => answer.trim());
      if (numbered.length && numbered.every((match, i) => Number(match[1]) === i + 1 && match[2].trim())
          && numbered.length === raw.trim().split('\n').length && numbered.length <= 20) {
        item.blankAnswers = numbered.map(match => match[2].trim());
        item.blankCount = numbered.length;
      } else if (lines.length > 1 && lines.length <= 20 && lines.every(answer => answer && !/^第\s*\d+\s*空/.test(answer))) {
        item.blankAnswers = lines;
        item.blankCount = lines.length;
      } else if (lines.length === 1 && lines[0] && (item.text.match(/_{2,}|[（(]\s*[）)]/g) || []).length === 1) {
        item.blankAnswers = lines;
        item.blankCount = 1;
      }
    }
  } else if (item.questionType === 'choice') {
    const letters = raw.trim().replace(/^[（(]\s*|\s*[）)]$/g, '').replace(/[Ａ-Ｈａ-ｈ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0)).toUpperCase();
    if (/^[A-H](?:[\s、,，/;；]*[A-H])*$/.test(letters)) {
      item.choices = [...new Set(letters.match(/[A-H]/g))];
    }
  }
  ensureAnswerStructure(item, subject);
  updateStructuredAnswer(item);
}

function normalizeOCR(r, suggestionSubject, ordered = false) {
  if (!Array.isArray(r.items)) throw Error('模型没有返回逐题列表，未采用此结果，请重试');
  return r.items.map(p => {
    if (typeof p.text !== 'string' || !p.text.trim() || typeof p.section !== 'string' || typeof p.number !== 'string' || !p.section.trim() || !p.number.trim()) {
      throw Error('转录条目缺少题干、分组或题号，未采用此批结果');
    }
    const autoCheck = !isTestEnv() && r.items.length === 1;
    const allowedTypes = suggestionSubject ? questionTypesFor(suggestionSubject) : [];
    const suggestedType = !ordered && allowedTypes.includes(p.suggestedQuestionType) && p.suggestedQuestionType !== 'other'
      ? p.suggestedQuestionType : null;
    const transcribedAnswer = typeof p.studentAnswer === 'string' ? p.studentAnswer : '';
    const needsStructuredAnswer = suggestedType === 'choice' || suggestedType === 'fill';
    const hasAnswer = transcribedAnswer.trim() || (Array.isArray(p.blankAnswers) && p.blankAnswers.some(answer => typeof answer === 'string' && answer.trim()));
    const item = {
      section: p.section.trim(),
      number: p.number.trim(),
      text: p.text,
      studentAnswer: needsStructuredAnswer ? '' : transcribedAnswer,
      ...(suggestedType ? { questionType: suggestedType, suggestedQuestionType: suggestedType } : {}),
      ...(needsStructuredAnswer && transcribedAnswer ? { ocrStudentAnswer: transcribedAnswer } : {}),
      uncertainty: typeof p.uncertainty === 'string' ? p.uncertainty : '',
      selected: autoCheck,
      verified: false,
      answerStatus: hasAnswer ? 'confirmed' : 'unknown',
      annotation: '',
      visualFeatures: typeof p.visualFeatures === 'string' ? p.visualFeatures.trim().slice(0, 1200) : '',
      analyzed: false,
      aiVerdict: '薄弱待练',
      answer: '',
      analysis: '',
      reminder: '',
      tags: []
    };
    if (needsStructuredAnswer) prefillOCRAnswer(item, p, suggestionSubject);
    if (ordered) {
      item.orderedAnswers = true;
      const parts = Array.isArray(p.answerParts) ? p.answerParts : [transcribedAnswer];
      item.blankAnswers = parts.slice(0,20).map(value => typeof value === 'string' ? value : '');
      item.blankCount = Math.min(20, Math.max(1, item.blankAnswers.length + Number(item.blankAnswers.every(value => value.trim()))));
      updateStructuredAnswer(item);
      item.answerStatus = item.studentAnswer ? 'confirmed' : 'unknown';
    }
    return item;
  });
}

function tileRects(w, h, columns) {
  const out = [];
  for (let c = 0; c < columns; c++) for (let row = 0; row < 3; row++) {
    const x = Math.max(0, Math.floor(w * c / columns - w * 0.012)),
          right = Math.min(w, Math.ceil(w * (c + 1) / columns + w * 0.012)),
          y = Math.max(0, Math.floor(h * (row / 3 - 0.09))),
          bottom = Math.min(h, Math.ceil(h * ((row + 1) / 3 + 0.09)));
    out.push({ column: c, x, y, width: right - x, height: bottom - y });
  }
  return out;
}

async function paperTiles(src, columns) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return tileRects(img.naturalWidth, img.naturalHeight, columns).map(r => {
    const canvas = document.createElement('canvas');
    canvas.width = r.width;
    canvas.height = r.height;
    canvas.getContext('2d').drawImage(img, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    return { column: r.column, url: canvas.toDataURL('image/jpeg', 0.92) };
  });
}

function progress(s) {
  paperProgress = s;
  // v18：完成/进行中提示改走顶部 toast，不再单独占一个位置。
  if (s && typeof toast === 'function') toast(s);
}

async function recognizePaper() {
  const key = typeof getStoredKey === 'function' ? getStoredKey('shiti-key') : sessionStorage.getItem('shiti-key');
  if (!key) throw Error('请先在设置填写 DeepSeek API Key');
  if (paper && !confirm('重新识别会替换当前待确认的整卷结果，继续吗？')) return;
  const sourceImage = mode === 'image' ? image : '', text = $('#question-text')?.value || '';
  if (!sourceImage && !text.trim()) throw Error('请先上传试卷或输入题目');
  const meta = { notebookId:typeof captureNotebookId==='function'?captureNotebookId():'default', subject: $('#subject')?.value || currentSubject || '语文', source: $('#source')?.value || '', mistake: $('#mistake')?.value || '' };
  const columns = Number($('#paper-layout')?.value || 2);
  paperLayout = String(columns);
  draft = null;
  editingId = null;
  paper = { ...meta, image: sourceImage, inventory: [], items: [], warnings: [], complete: false };
  try {
    progress('1 / 3 · 扫描整卷大题与小题目录…');
    const inv = await ai(`只做试卷目录扫描，不解题，不挑选错题。按先左栏后右栏、各栏从上到下列出全部大题以及每个独立小题号。无编号题用位置或拼音标识。填空小题不要拆成每个空；选项不要作为题目。包括书写、看拼音、选择、填空、实践等所有实际可见部分。不要凭常见试卷补齐不可见的题号。返回 JSON {"suggestedSubject":"","inventory":[{"section":"大题标题","number":"小题号或无号标识"}],"warnings":["遮挡、切边、不完整等"]}。${ocrSubjectInstruction()}${text ? JSON.stringify({ text }) : ''}`, sourceImage || null, { ocr: true });
    if (!Array.isArray(inv.inventory) || !inv.inventory.length || inv.inventory.some(p => typeof p.section !== 'string' || typeof p.number !== 'string')) throw Error('目录扫描未返回有效题号，请重试');
    paper.inventory = inv.inventory;
    meta.subject = recognizedSubject(inv, meta.subject);
    paper.subject = meta.subject;
    paper.warnings = Array.isArray(inv.warnings) ? inv.warnings.map(String) : [];
    const groups = sourceImage ? Array.from({ length: columns }, () => []) : [[]];
    if (sourceImage) {
      const tiles = await paperTiles(sourceImage, columns);
      for (const tile of tiles) groups[tile.column].push(tile.url);
    }
    for (let col = 0; col < groups.length; col++) {
      progress(`2 / 3 · 转录第 ${col + 1} / ${groups.length} 栏…`);
      const r = await ai(`你现在只做逐字转录，不解题、不筛错题、不改正印刷错字或学生答案。${sourceImage ? '接下来的三张图片是同一栏从上至下的重叠切片，按顺序合并跨片内容；重复题目只返回一次。' : '逐题处理下列文字。'}保留全部大题和小题，包括书写、拼音、选择、填空、阅读材料、实践。选择题必须包含全部选项，不能编造同类型题。手写答案与印刷题干分开，不能把教师勾叉直接当作正确性结论；无法识别写【无法辨认】，注明截断，不能猜测。不转录学生姓名等身份信息。目录供题号命名参考，不代表本栏一定出现全部题目：${JSON.stringify(paper.inventory)}。${text ? JSON.stringify({ text }) : ''}${deepSeekOCRSchema(meta.subject, false, true)}`, groups[col].length ? groups[col] : null, { ocr: true, maxTokens: 12000 });
      const items = normalizeOCR(r, meta.subject, true);
      paper.items.push(...items);
      if (Array.isArray(r.warnings)) paper.warnings.push(...r.warnings.map(String));
    }
    paper.complete = true;
    openPaperOnRender = true;
    progress('3 / 3 · 转录已返回，请对照原卷逐题核对。');
  } catch (e) {
    paper.warnings.push('识别未完成：' + e.message);
    throw e;
  } finally {
    render();

  }
}

function selectedPaper() {
  if (!isTestEnv() && paper.scope === 'crop' && paper.items.length === 1) {
    paper.items[0].selected = true;
  }
  const items = paper.items.filter(p => p.selected);
  if (!items.length) throw Error('请先选择要处理的题目');
  if (items.some(p => !p.verified || !p.text.trim())) throw Error('请先逐题核对原文，并勾选核对确认');
  return items;
}

function showPaperAnalysis(items) {
  const dialog = $('#paper-analysis-dialog');
  if (!items.length || typeof dialog?.showModal !== 'function') return null;
  const format = text => typeof renderStudyText === 'function' ? renderStudyText(text) : esc(text);
  const original = typeof isStudyImage === 'function' && isStudyImage(paper?.image) ? paper.image : '';
  dialog.innerHTML = `<div class="card-head"><h2 id="paper-analysis-title">AI 解析</h2><button type="button" class="dialog-x" aria-label="关闭解析" autofocus>×</button></div>
    <p class="hint" data-analysis-save-status role="status" hidden></p>
    ${original ? `<figure class="paper-analysis-image"><img src="${original}" alt="${paper.scope === 'crop' ? '录题原图' : '整卷原图'}"></figure>` : ''}
    ${items.map((item, index) => `<article class="paper-item">${items.length > 1 ? `<h3>原卷第 ${esc(item.number)} 题</h3>` : ''}
      ${item.detectedSubject ? `<p class="hint">科目：${esc(item.detectedSubject)}</p>` : ''}
      <h3>原题</h3><div class="prose">${format(item.text)}</div>
      ${original && validFigureRegion(item.figureRegion) ? `<div data-analysis-figure="${index}"></div>` : ''}
      <h3>参考答案</h3><div class="prose">${format(item.answer)}</div><h3>解题解析</h3><div class="prose">${format(item.analysis)}</div>
      ${item.reminder ? `<h3>易错提醒</h3><div class="prose">${format(item.reminder)}</div>` : ''}</article>`).join('')}`;
  dialog.querySelector('.dialog-x').onclick = () => dialog.close();
  dialog.onclose = () => {
    if (dialog.open) return;
    dialog.replaceChildren();
    if (current() === 'capture') render();
  };
  if (original) dialog.querySelectorAll('[data-analysis-figure]').forEach(container => {
    showSavedFigure(container, original, items[Number(container.dataset.analysisFigure)].figureRegion);
  });
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  return dialog;
}

async function analyzeSelectedItems() {
  const sourcePaper = paper;
  const items = selectedPaper();
  const verdictList = typeof aiVerdictTags !== 'undefined' && Array.isArray(aiVerdictTags)
    ? aiVerdictTags
    : ['概念混淆', '审题偏差', '计算粗心', '知识盲区', '书写规范', '思路受阻', '薄弱待练'];
  let failures = 0;
  for (let i = 0; i < items.length; i++) {
    const p = items[i];
    if (p.analyzed) continue;
    progress(`AI 正在拆解分析第 ${i + 1} / ${items.length} 题…`);
    try {
      const evidence=answerEvidence(p);
      const originalText = p.text;
      if(evidence.status==='confirmed'&&!evidence.answer)throw Error('已选择确认作答，请填写孩子实际作答；未作答或不确定请切换证据状态');
      if(evidence.status==='confirmed'&&!p.orderedAnswers&&p.questionType==='fill'&&Array.from({length:p.blankCount},(_,i)=>p.blankAnswers?.[i]).some(v=>!String(v||'').trim()))throw Error('请记录每个空的实际作答；孩子确实没写的空请填【未作答】，不确定则切换为无法确认');
      const needsVisual = /加点|划线|画线|下划线|图中/.test(p.text);
      const original = typeof isStudyImage === 'function' && isStudyImage(paper.image) ? paper.image : '';
      const useImage = original && ((needsVisual && !evidence.visualFeatures.trim()) || p.hasContinuation);
      if (needsVisual && !evidence.visualFeatures.trim() && !useImage) {
        p.showAnswerExtra = true;
        throw Error('原题需要加点、划线或图示等视觉信息。可以选中文字并标记，或在「补充原题视觉信息」中填写。');
      }
      const image = useImage && !p.hasContinuation && validFigureRegion(p.figureRegion)
        ? await studyImageCopy(original, 'original', p.figureRegion)
        : useImage ? original : undefined;
      const canDiagnose=evidence.status==='confirmed'&&Boolean(evidence.answer);
      const imageContext = image ? `看图核对原题第 ${p.number} 题的印刷加点、划线、图示和续页，按核对文字定位。区分印刷标记、学生手写与订正；看不清就说明。图像不能替代已确认的学生作答。` : '你只得到人工核对后的文字，没有看到原始试卷图片。';
      const r = await ai(`${imageContext}当前科目候选：${paper.subject}。请独立判断实际科目。${ocrSubjectInstruction()} 未记录的空位或作答区视为未知，不判断其对错。原题：${JSON.stringify(p.text)}。视觉信息：${JSON.stringify(evidence.visualFeatures)}。作答证据：${JSON.stringify(evidence)}。用户补充（不是孩子作答的替代证据）：${JSON.stringify(paper.mistake)}。原题错字、错误拼音、错误选项照录，不得按正确知识改写题干。括号和横线只是空位，不能推测其中的答案。圈画、订正和老师批改与孩子原始作答不同，不可混用；红勾不能证明标准答案。${canDiagnose?'仅根据已确认作答与标准解法比较，判断 correct/incorrect/unknown；即使答错，也不能断言思考过程，只能给有依据的可能原因。':'孩子作答未确认或已确认未作答：仅讲解题目，不能说孩子答错、选了某项或存在某个错因；status 必须是 unknown，aiVerdict 必须是未判定。'}条件不足或视觉信息无法辨认时明确说明无法确定，不猜测。返回 JSON {"suggestedSubject":"","answer":"标准答案或无法确定原因","analysis":"解题步骤；仅有已确认作答时才可比较","status":"correct/incorrect/unknown","comparisonEvidence":"对比依据，无证据则空字符串","reminder":"复习建议，不把可能错因说成事实","aiVerdict":"${canDiagnose?'选择最贴切错因标签，无法判断则未判定':'未判定'}","tags":["知识点"]}。可用错因标签：${JSON.stringify(verdictList)}。`, image, {vision: Boolean(image), learning:{subject:paper.subject,text:p.text,tags:p.tags||[]}});
      if (paper !== sourcePaper || !sourcePaper.items.includes(p) || originalText !== p.text || JSON.stringify(evidence) !== JSON.stringify(answerEvidence(p))) {
        throw Error('题目或作答已修改，请重新核对并分析');
      }
      if (typeof r.answer !== 'string' || typeof r.analysis !== 'string') throw Error('分析结果不完整');
      const status=canDiagnose&&['correct','incorrect'].includes(r.status)?r.status:'unknown';
      const matchedVerdict = status==='incorrect'&&verdictList.includes(r.aiVerdict) ? r.aiVerdict : '未判定';
      Object.assign(p, {
        detectedSubject: sourcePaper.subjectManual ? sourcePaper.subject : recognizedSubject(r, ''),
        answer: r.answer,
        analysis: r.analysis,
        reminder: String(r.reminder || ''),
        aiVerdict: matchedVerdict,
        diagnosisStatus: status,
        comparisonEvidence: status!=='unknown'?String(r.comparisonEvidence||''):'',
        tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
        analyzed: true,
        error: ''
      });
    } catch (err) {
      p.error = err.message;
      failures++;
    }
  }
  const detected = new Set(items.map(item => item.detectedSubject));
  if (paper === sourcePaper && !paper.subjectManual && detected.size === 1 && !detected.has('') && items.every(item => item.detectedSubject)) {
    paper.subject = items[0].detectedSubject;
  }
  return failures;
}

async function saveSelectedItems() {
  const items = selectedPaper(), created = stamp();
  const offsets = new Map();
  const records = items.map(p => {
    const id = uid();
    const subject = (!paper.subjectManual && p.detectedSubject) || paper.subject;
    const index = offsets.get(subject) || 0;
    offsets.set(subject, index + 1);
    const record = {
      id,
      number: questionNumber(subject,new Date(created),data.questions,index),
      created,
      updated: created,
      subject,
      notebookId:$('#paper-notebook')?.value||paper.notebookId||(typeof captureNotebookId==='function'?captureNotebookId():'default'),
      grade:getStudentProfile().grade,term:getStudentProfile().term,
      ...(p.orderedAnswers ? (p.captureType || {}) : { questionType:p.questionType||paper.questionType||'other', questionTypeName:p.questionTypeName||QUESTION_TYPE_NAMES[p.questionType]||'其他题型' }),
      answerDetails:{choices:p.choices||[],blankAnswers:p.blankAnswers||[],blankCount:p.blankCount||0,optionCount:p.optionCount||0},
      source: [paper.source, p.section !== '框选题目' ? p.section : '', p.number !== '1' ? p.number : ''].filter(Boolean).join(' · '),
      text: p.text,
      studentAnswer: p.answerStatus==='confirmed'?p.studentAnswer:'',
      answerStatus: p.answerStatus||'unknown',
      annotation: p.annotation||'',
      visualFeatures: p.visualFeatures||'',
      evidenceVerified: Boolean(p.verified),
      diagnosisStatus: p.diagnosisStatus||'pending',
      comparisonEvidence:p.comparisonEvidence||'',
      mistake: [paper.mistake, p.answerStatus==='confirmed'&&p.studentAnswer && '已确认的原卷作答：' + p.studentAnswer].filter(Boolean).join('\n'),
      answer: p.answer,
      analysis: p.analysis,
      reminder: p.reminder,
      tags: p.tags || [],
      image: paper.image,
      figureRegion: p.figureRegion,
      mastered: false,
      originalSection: p.section,
      originalNumber: p.number,
      ocrProvider: paper.ocrProvider || 'deepseek',
      ocrOriginalText: paper.ocrOriginalText || '',
      ocrRaw: paper.ocrRaw || null
    };
    record.aiVerdict = p.aiVerdict || (typeof inferAiVerdict === 'function' ? inferAiVerdict(record) : '薄弱待练');
    return record;
  });
  await persist({ ...data, questions: [...data.questions, ...records] });
  paper.savedKeys = [...(paper.savedKeys || []), ...items.map(paperKey)];
  paper.items = paper.items.filter(p => !items.includes(p));
  if (!paper.items.length && !isTestEnv()) {
    paper = null;
    image = '';
    progress('✓ 错题已归档入库！可以继续拍下一道题。');
  }
  return records.length;
}

async function runPaperAction(event,fn){const button=event.currentTarget||event.target,markup=button.innerHTML;await run(button,fn);if(button.isConnected&&markup!==undefined)button.innerHTML=markup}

function bindPaper() {
  if(typeof releaseAnswerTransfer==='function'){releaseAnswerTransfer();releaseAnswerTransfer=null}
  if(typeof answerMoveUndo!=='undefined'&&answerMoveUndo?.paper!==paper)answerMoveUndo=null;
  const layout = $('#paper-layout');
  if(layout)layout.onchange = () => { paperLayout = layout.value; };
  if ($('#analyze')) $('#analyze').onclick = e => run(e.target, recognizePaper);

  document.querySelectorAll('[data-paper]').forEach(el => {
    const handler = () => {
      const p = paper.items[Number(el.dataset.index)], k = el.dataset.paper;
      if (!p) return;
      if (k === 'selected' || k === 'verified') { p[k] = el.checked; return; }
      if (k === 'tagsText') { p.tags = el.value.split(/[,，]/).map(t => t.trim()).filter(Boolean); return; }
      if (k === 'aiVerdict') { p.aiVerdict = el.value; return; }
      if(k==='questionType'){if(p.questionType!==el.value){switchQuestionType(p,el.value,paper.subject);render()}return}
      p[k] = el.value;
      if (k === 'text' && ['reading', 'material'].includes(p.questionType)) {
        const host = document.querySelector(`[data-reading-scope-host="${el.dataset.index}"]`);
        if (host) {
          host.innerHTML = readingScopeField(p, Number(el.dataset.index));
          const scope = host.querySelector('select');
          if (scope) bindReadingScope(scope);
        }
      }
      if (['text', 'section', 'number', 'studentAnswer','answerStatus','annotation','visualFeatures'].includes(k)) {
        invalidatePaperEvidence(p);
        const cb=document.querySelector(`[data-paper="verified"][data-index="${el.dataset.index}"]`);if(cb)cb.checked=false;
        const container = el.closest('[data-paper-item]');
        const badge = container?.querySelector('.pill');
        if (badge) badge.textContent = '修改后可重新分析';
        p.answer = '';
        p.analysis = '';
        p.reminder = '';
        p.tags = [];
      }
    };
    el.oninput = handler;
    el.onchange = handler;
  });

  document.querySelectorAll('[data-paper-delete]').forEach(b => b.onclick = () => { paper.items.splice(Number(b.dataset.paperDelete), 1); render(); });
  if (!paper) return;
  document.querySelectorAll('[data-pick-paper-figure]').forEach(button => {
    const index = Number(button.dataset.pickPaperFigure);
    const item = paper.items[index];
    showSavedFigure(document.querySelector(`[data-paper-figure="${index}"]`), paper.image, item.figureRegion);
    button.onclick = event => run(event.target, async () => {
      const region = await openFigurePicker(paper.image, item.figureRegion);
      if (region === undefined) return;
      item.figureRegion = region;
      render();
    });
  });
  bindStructuredAnswerFields();
  document.querySelectorAll('[data-move-paper-answer]').forEach(button => {
    button.onclick = () => {
      if (busy) return;
      const index = Number(button.dataset.movePaperAnswer);
      const text = document.querySelector(`[data-paper="text"][data-index="${index}"]`);
      try {
        paper.items[index] = moveAnswerRange(paper.items[index], text.value, text.selectionStart, text.selectionEnd, paper.subject);
        render();
      } catch (error) { toast(error.message); }
    };
  });
  document.querySelectorAll('[data-reading-scope]').forEach(bindReadingScope);
  bindPaperContinuation();
  if(typeof bindCaptureOptions==='function')bindCaptureOptions();

  if ($('#paper-select-all')) $('#paper-select-all').onclick = () => { const checked = !paper.items.every(p => p.selected); paper.items.forEach(p => p.selected = checked); render(); };
  if ($('#paper-add')) $('#paper-add').onclick = () => { paper.items.push({ section: '手工补录', number: String(paper.items.length + 1), text: '', studentAnswer: '', orderedAnswers:true, blankCount:1, answerStatus:'unknown', uncertainty: '手工补录，请填写原文', selected: true, verified: false, analyzed: false, aiVerdict: '薄弱待练', answer: '', analysis: '', reminder: '', tags: [] }); render(); };

  if ($('#paper-analyze')) $('#paper-analyze').onclick = e => runPaperAction(e, async () => {
    const items = selectedPaper();
    const failures = await analyzeSelectedItems();
    const dialog = showPaperAnalysis(items.filter(item => item.analyzed));
    if (dialog) {
      if (failures) {
        const status = dialog.querySelector('[data-analysis-save-status]');
        status.hidden = false;
        status.textContent = `有 ${failures} 道题未完成，请关闭弹窗查看具体提示`;
      }
      return;
    }
    render();
    if (failures) toast(paper?.items.find(item => item.selected && item.error)?.error || '请查看题目下方的错误提示');
  });

  if ($('#paper-save')) $('#paper-save').onclick = e => runPaperAction(e, async () => {
    const count = await saveSelectedItems();
    render();
    toast(`✓ 已收录 ${count} 道错题`);
  });

  const paperTa = document.querySelector('textarea.paper-textarea');
  if(typeof bindAnswerTransfer==='function')bindAnswerTransfer(paperTa);
  const paperBox = $('#paper-crop-image-box');
  const paperImg = $('#paper-crop-img');
  if (paperTa && typeof paperTa.addEventListener === 'function') {
    const fitPaperText = () => {
      const boxH = paperBox && Number.isFinite(paperBox.offsetHeight) ? paperBox.offsetHeight : 0;
      const contentH = Number.isFinite(paperTa.scrollHeight) ? paperTa.scrollHeight : 0;
      paperTa.style.height = 'auto';
      paperTa.style.height = Math.max(180, boxH, contentH) + 'px';
    };
    paperTa.addEventListener('input', fitPaperText);
    if (paperImg) {
      if (paperImg.complete) fitPaperText();
      else if (typeof paperImg.addEventListener === 'function') paperImg.addEventListener('load', fitPaperText);
    }
    fitPaperText();
  }
  if (paperImg) paperImg.onclick = () => {
    const lb = $('#paper-lightbox'), im = $('#paper-lightbox-img');
    if (!lb || !im || lb.open) return;
    im.src = (typeof paper !== 'undefined' && paper.image) ? paper.image : paperImg.src;
    lb.showModal();
    lb.resetImageView?.();
  };
  if ($('#paper-lightbox-close')) $('#paper-lightbox-close').onclick = () => $('#paper-lightbox').close();
  if ($('#paper-open-raw')) $('#paper-open-raw').onclick = () => $('#paper-raw-dialog').showModal();
  if ($('#paper-raw-close')) $('#paper-raw-close').onclick = () => $('#paper-raw-dialog').close();
  if ($('#paper-lightbox')) $('#paper-lightbox').onclick = e => { if (e.target === $('#paper-lightbox')) $('#paper-lightbox').close(); };
  if(typeof bindZoomImage==='function')bindZoomImage($('#paper-lightbox'),$('#paper-lightbox-img'));
if ($('#paper-analyze-and-save')) $('#paper-analyze-and-save').onclick = e => runPaperAction(e, async () => {
    const items = selectedPaper();
    const failures = await analyzeSelectedItems();
    if (failures) {
      render();
      toast('AI 分析未完成，请查看错误提示或直接收录原题');
      return;
    }
    const dialog = showPaperAnalysis(items);
    const status = dialog?.querySelector('[data-analysis-save-status]');
    const close = dialog?.querySelector('.dialog-x');
    if (status) {
      status.hidden = false;
      status.textContent = '正在收录…';
      close.disabled = true;
      dialog.oncancel = event => event.preventDefault();
    }
    try {
      const count = await saveSelectedItems();
      if (status) status.textContent = `已收录 ${count} 道错题`;
      else render();
    } catch (error) {
      if (!status) throw error;
      status.textContent = error.message || '收录失败，可以关闭解析后重试';
    } finally {
      if (dialog) {
        close.disabled = false;
        dialog.oncancel = null;
        close.focus({ preventScroll:true });
      }
    }
  });
}
