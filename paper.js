let paper = null, paperLayout = '2', paperProgress = '';
const isTestEnv = () => Boolean(globalThis.assert);

const OCR_SCHEMA = '错字、错误拼音、错误标点和错误选项必须按原图照录，不能自动修正。返回 JSON {"items":[{"section":"大题标题，严格使用目录中的名称","number":"原卷小题号，无号用位置或拼音","text":"完整原题，包含材料、全部选项和空格，不含学生填入内容","studentAnswer":"仅转录实际可见的学生作答，不可推测","uncertainty":"模糊、缺失、跨区截断或无法区分的内容，清晰则空字符串"}],"warnings":["其他问题"]}';

function getVerdictTagOptions(selected) {
  const list = typeof aiVerdictTags !== 'undefined' && Array.isArray(aiVerdictTags)
    ? aiVerdictTags
    : ['概念混淆', '审题偏差', '计算粗心', '知识盲区', '书写规范', '思路受阻', '薄弱待练', '巩固良好'];
  const cur = selected && list.includes(selected) ? selected : '薄弱待练';
  return list.map(v => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
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
      ${typeof paperSubjectField==='function'?paperSubjectField():''}
    ${typeof paperSourceFields==='function'?paperSourceFields():''}
      ${paper.image ? `<div id="paper-crop-image-box" style="margin-bottom:10px;background:#f8fafc;padding:8px;border-radius:10px;text-align:center"><img id="paper-crop-img" class="paper-original" src="${paper.image}" alt="框选原图，点击全屏查看" title="点击全屏查看" style="max-height:180px;width:auto;margin:0 auto;display:block;cursor:zoom-in"></div><dialog id="paper-lightbox" class="image-lightbox"><button type="button" class="lightbox-close" id="paper-lightbox-close" aria-label="关闭">×</button><img id="paper-lightbox-img" alt="框选图全屏预览"></dialog>` : ''}
      ${paper.warnings.map(w=>`<p class="result-note">${esc(w)}</p>`).join('')}
      <label class="field"><span>原题（仅题干、印刷选项和空位；请移出手写答案与订正，不修正原卷错字）</span><textarea class="paper-textarea" data-paper="text" data-index="0">${esc(p.text)}</textarea></label>
      <div class="actions" style="margin-top:6px"><button type="button" class="secondary" id="paper-move-answer">将选中文字移到孩子作答</button></div>
      ${typeof rawOCRView === 'function' ? rawOCRView() : ''}
      ${answerReviewFields(p,0)}
      ${p.analyzed ? `
        <div style="margin-top:12px;padding-top:12px;border-top:1px dashed #cbd5e1">
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
      <div class="actions" style="margin-top:14px">
        ${!p.analyzed ? `<button class="primary" id="paper-analyze-and-save">⚡ AI 分析并直接收录</button>` : ''}
        <button class="${p.analyzed ? 'primary' : 'secondary'}" id="paper-analyze">${p.analyzed ? '重新 AI 分析' : '仅 AI 分析（先看解析）'}</button>
        <button class="${p.analyzed ? 'primary' : 'secondary'}" id="paper-save">${p.analyzed ? '✓ 确认收录到错题本' : '不分析，直接收录原题'}</button>
      </div>
    </section>`;
  }

  const keys = new Set([...paper.items.map(p => paperKey(p)), ...(paper.savedKeys || [])]);
  const missing = paper.inventory.filter(p => !keys.has(paperKey(p)));
  const rawViewHtml = typeof rawOCRView === 'function' ? rawOCRView() : '';
  return `<section class="card">
    <div class="card-head">
      <h2>${paper.scope === 'crop' ? '框内原文核对' : '整卷逐题核对'} · ${paper.items.length} 题</h2>
      <span class="pill">${paper.complete ? '转录已返回' : '转录尚未完成'}</span>
    </div>
    ${typeof paperSourceFields==='function'?paperSourceFields():''}
    ${typeof paperSubjectField==='function'?paperSubjectField():''}
    <p class="result-note">${paper.ocrProvider === 'baidu' ? '请对照裁剪图核对原文。' : `目录发现 ${paper.inventory.length} 个题号；当前转录 ${paper.items.length} 个条目。`}${missing.length ? ' 待核对：' + esc(missing.map(p => p.section + ' / ' + p.number).join('、')) : ''}</p>
    ${paper.warnings.map(w => `<p class="result-note">${esc(w)}</p>`).join('')}
    ${paper.image ? `<details style="margin-bottom:8px"><summary style="cursor:pointer;font-size:13px;color:var(--muted)">展开原图对照（默认收起）</summary><a href="${paper.image}" target="_blank" rel="noopener"><img class="paper-original" src="${paper.image}" alt="原始试卷，点击放大"></a></details>` : ''}
    ${rawViewHtml ? (rawViewHtml.trim().startsWith('<details') ? rawViewHtml : `<details style="margin-bottom:10px"><summary style="cursor:pointer;font-size:13px;color:var(--muted)">查看 OCR 原始转录（默认收起）</summary>${rawViewHtml}</details>`) : ''}
    <div class="actions">
      <button class="secondary" id="paper-select-all">全选 / 取消全选</button>
      <button class="secondary" id="paper-add">补录漏题</button>
    </div>
    ${paper.items.map((p, i) => `<article class="paper-item" data-paper-item="${i}">
      <div class="card-head">
        <label><input type="checkbox" data-paper="selected" data-index="${i}" ${p.selected ? 'checked' : ''}> 选择第 ${i + 1} 个条目</label>
        <span class="pill">${p.analyzed ? '已分析 · ' + esc(p.aiVerdict || '薄弱待练') : '待核对'}</span>
      </div>
      ${paperField('原题全文（保留材料、选项和空格）', 'text', p.text, i, true)}
      ${answerReviewFields(p,i)}
      ${p.uncertainty ? `<p class="result-note">需核对：${esc(p.uncertainty)}</p>` : ''}
      ${p.analyzed ? `
        <div class="form-row">
          <label class="field"><span>🤖 AI 判定错因标签</span><select data-paper="aiVerdict" data-index="${i}">${getVerdictTagOptions(p.aiVerdict)}</select></label>
          ${paperField('标签（逗号分隔）', 'tagsText', (p.tags || []).join('，'), i)}
        </div>
        ${paperField('答案', 'answer', p.answer, i, true)}
        ${paperField('步骤', 'analysis', p.analysis, i, true)}
        ${paperField('提醒', 'reminder', p.reminder, i, true)}
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

function paperField(label, key, value, i, area = false) {
  return `<label class="field"><span>${label}</span>${area ? `<textarea data-paper="${key}" data-index="${i}">${esc(value)}</textarea>` : `<input type="text" data-paper="${key}" data-index="${i}" value="${esc(value)}">`}</label>`;
}

function paperKey(p) {
  return (p.section + '|' + p.number).replace(/[\s、.．：:（）()]/g, '');
}

function normalizeOCR(r) {
  if (!Array.isArray(r.items)) throw Error('模型没有返回逐题列表，未采用此结果，请重试');
  return r.items.map(p => {
    if (typeof p.text !== 'string' || !p.text.trim() || typeof p.section !== 'string' || typeof p.number !== 'string' || !p.section.trim() || !p.number.trim()) {
      throw Error('转录条目缺少题干、分组或题号，未采用此批结果');
    }
    const autoCheck = !isTestEnv() && r.items.length === 1;
    return {
      section: p.section.trim(),
      number: p.number.trim(),
      text: p.text,
      studentAnswer: typeof p.studentAnswer === 'string' ? p.studentAnswer : '',
      uncertainty: typeof p.uncertainty === 'string' ? p.uncertainty : '',
      selected: autoCheck,
      verified: false,
      answerStatus: 'unknown',
      annotation: '',
      visualFeatures: '',
      analyzed: false,
      aiVerdict: '薄弱待练',
      answer: '',
      analysis: '',
      reminder: '',
      tags: []
    };
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
  meta.questionType=selectedCaptureQuestionType(meta.subject);
  const columns = Number($('#paper-layout')?.value || 2);
  paperLayout = String(columns);
  draft = null;
  editingId = null;
  paper = { ...meta, image: sourceImage, inventory: [], items: [], warnings: [], complete: false };
  try {
    progress('1 / 3 · 扫描整卷大题与小题目录…');
    const inv = await ai(`只做试卷目录扫描，不解题，不挑选错题。按先左栏后右栏、各栏从上到下列出全部大题以及每个独立小题号。无编号题用位置或拼音标识。填空小题不要拆成每个空；选项不要作为题目。包括书写、看拼音、选择、填空、实践等所有实际可见部分。不要凭常见试卷补齐不可见的题号。返回 JSON {"inventory":[{"section":"大题标题","number":"小题号或无号标识"}],"warnings":["遮挡、切边、不完整等"]}。${text ? JSON.stringify({ text }) : ''}`, sourceImage || null, { ocr: true });
    if (!Array.isArray(inv.inventory) || !inv.inventory.length || inv.inventory.some(p => typeof p.section !== 'string' || typeof p.number !== 'string')) throw Error('目录扫描未返回有效题号，请重试');
    paper.inventory = inv.inventory;
    paper.warnings = Array.isArray(inv.warnings) ? inv.warnings.map(String) : [];
    const groups = sourceImage ? Array.from({ length: columns }, () => []) : [[]];
    if (sourceImage) {
      const tiles = await paperTiles(sourceImage, columns);
      for (const tile of tiles) groups[tile.column].push(tile.url);
    }
    for (let col = 0; col < groups.length; col++) {
      progress(`2 / 3 · 转录第 ${col + 1} / ${groups.length} 栏…`);
      const r = await ai(`你现在只做逐字转录，不解题、不筛错题、不改正印刷错字或学生答案。${sourceImage ? '接下来的三张图片是同一栏从上至下的重叠切片，按顺序合并跨片内容；重复题目只返回一次。' : '逐题处理下列文字。'}保留全部大题和小题，包括书写、拼音、选择、填空、阅读材料、实践。选择题必须包含全部选项，不能编造同类型题。手写答案与印刷题干分开，不能把教师勾叉直接当作正确性结论；无法识别写【无法辨认】，注明截断，不能猜测。不转录学生姓名等身份信息。目录供题号命名参考，不代表本栏一定出现全部题目：${JSON.stringify(paper.inventory)}。${text ? JSON.stringify({ text }) : ''}${OCR_SCHEMA}`, groups[col].length ? groups[col] : null, { ocr: true, maxTokens: 12000 });
      const items = normalizeOCR(r);
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

async function analyzeSelectedItems() {
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
      if(evidence.status==='confirmed'&&!evidence.answer)throw Error('已选择确认作答，请填写孩子实际作答；未作答或不确定请切换证据状态');
      if(evidence.status==='confirmed'&&p.questionType==='fill'&&Array.from({length:p.blankCount},(_,i)=>p.blankAnswers?.[i]).some(v=>!String(v||'').trim()))throw Error('请记录每个空的实际作答；孩子确实没写的空请填【未作答】，不确定则切换为无法确认');
      if(/加点|划线|画线|下划线|图中/.test(p.text) && !evidence.visualFeatures.trim()){p.showAnswerExtra=true;throw Error('此题依赖视觉信息，请展开补充加点字、划线范围或图示内容；无法确认时请暂不分析')}
      const canDiagnose=evidence.status==='confirmed'&&Boolean(evidence.answer);
      const r = await ai(`你只得到人工核对后的文字，没有看到原始试卷图片。学科：${paper.subject}。原题：${JSON.stringify(p.text)}。视觉信息：${JSON.stringify(evidence.visualFeatures)}。作答证据：${JSON.stringify(evidence)}。用户补充（不是孩子作答的替代证据）：${JSON.stringify(paper.mistake)}。原题错字、错误拼音、错误选项照录，不得按正确知识改写题干。括号和横线只是空位，不能推测其中的答案。圈画、订正和老师批改与孩子原始作答不同，不可混用；红勾不能证明标准答案。${canDiagnose?'仅根据已确认作答与标准解法比较，判断 correct/incorrect/unknown；即使答错，也不能断言思考过程，只能给有依据的可能原因。':'孩子作答未确认或已确认未作答：仅讲解题目，不能说孩子答错、选了某项或存在某个错因；status 必须是 unknown，aiVerdict 必须是未判定。'}条件不足或视觉信息无法辨认时明确说明无法确定，不猜测。返回 JSON {"answer":"标准答案或无法确定原因","analysis":"解题步骤；仅有已确认作答时才可比较","status":"correct/incorrect/unknown","comparisonEvidence":"对比依据，无证据则空字符串","reminder":"复习建议，不把可能错因说成事实","aiVerdict":"${canDiagnose?'选择最贴切错因标签，无法判断则未判定':'未判定'}","tags":["知识点"]}。可用错因标签：${JSON.stringify(verdictList)}。`, undefined, {learning:{subject:paper.subject,text:p.text,tags:p.tags||[]}});
      if (typeof r.answer !== 'string' || typeof r.analysis !== 'string') throw Error('分析结果不完整');
      const status=canDiagnose&&['correct','incorrect'].includes(r.status)?r.status:'unknown';
      const matchedVerdict = status==='incorrect'&&verdictList.includes(r.aiVerdict) ? r.aiVerdict : '未判定';
      Object.assign(p, {
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
  return failures;
}

async function saveSelectedItems() {
  const items = selectedPaper(), created = stamp();
  const records = items.map((p,index) => {
    const id = uid();
    const record = {
      id,
      number: questionNumber(paper.subject,new Date(created),data.questions,index),
      created,
      updated: created,
      subject: paper.subject,
      notebookId:$('#paper-notebook')?.value||paper.notebookId||(typeof captureNotebookId==='function'?captureNotebookId():'default'),
      grade:getStudentProfile().grade,term:getStudentProfile().term,
      questionType:p.questionType||paper.questionType||'other',
      questionTypeName:p.questionTypeName||QUESTION_TYPE_NAMES[p.questionType]||'其他题型',
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

function bindPaper() {
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
  bindStructuredAnswerFields();
  if(typeof bindCaptureOptions==='function')bindCaptureOptions();

  if ($('#paper-select-all')) $('#paper-select-all').onclick = () => { const checked = !paper.items.every(p => p.selected); paper.items.forEach(p => p.selected = checked); render(); };
  if ($('#paper-add')) $('#paper-add').onclick = () => { paper.items.push({ section: '手工补录', number: String(paper.items.length + 1), text: '', studentAnswer: '', answerStatus:'unknown', uncertainty: '手工补录，请填写原文', selected: true, verified: false, analyzed: false, aiVerdict: '薄弱待练', answer: '', analysis: '', reminder: '', tags: [] }); render(); };

  if ($('#paper-analyze')) $('#paper-analyze').onclick = e => run(e.target, async () => {
    const failures = await analyzeSelectedItems();
    render();
    toast(failures ? `${failures} 题分析失败，请检查 DeepSeek 设置后重试` : '✓ AI 分析与错因判定完成，核对无误后点击收录');
  });

  if ($('#paper-save')) $('#paper-save').onclick = e => run(e.target, async () => {
    const count = await saveSelectedItems();
    render();
    toast(`✓ 已收录 ${count} 道错题`);
  });

  const paperTa = document.querySelector('textarea.paper-textarea');
  if($('#paper-move-answer'))$('#paper-move-answer').onclick=()=>{
    const ta=document.querySelector('textarea.paper-textarea');if(!ta)return;
    const start=ta.selectionStart,end=ta.selectionEnd;if(start===end){toast('请先在原题文字中选中孩子实际写的答案；不要选印刷选项编号');return}
    const p=paper.items[0],answer=ta.value.slice(start,end);
    if(isChoiceType(p.questionType)){
      const choices=[...new Set(answer.toUpperCase().match(/[A-H]/g)||[])];
      if(!choices.length){toast('选中的作答不是有效选项；请直接点选，或调整题型');return}
      p.choices=choices;p.optionCount=Math.max(p.optionCount||5,...choices.map(x=>x.charCodeAt(0)-64));
    }else if(p.questionType==='fill'){
      const slot=p.blankAnswers.findIndex(v=>!String(v||'').trim());const pos=slot<0?p.blankAnswers.length:slot;
      p.blankAnswers[pos]=answer;p.blankCount=Math.max(p.blankCount||3,pos+1);
    }
    p.studentAnswer=[p.studentAnswer,answer].filter(Boolean).join('\n');
    updateStructuredAnswer(p);
    p.text=ta.value.slice(0,start)+'____'+ta.value.slice(end);p.answerStatus='confirmed';invalidatePaperEvidence(p);render();
  };
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
  if ($('#paper-lightbox')) $('#paper-lightbox').onclick = e => { if (e.target === $('#paper-lightbox')) $('#paper-lightbox').close(); };
  if(typeof bindZoomImage==='function')bindZoomImage($('#paper-lightbox'),$('#paper-lightbox-img'));
if ($('#paper-analyze-and-save')) $('#paper-analyze-and-save').onclick = e => run(e.target, async () => {
    const failures = await analyzeSelectedItems();
    if (failures) {
      render();
      toast('AI 分析未完成，请查看错误提示或直接收录原题');
      return;
    }
    const count = await saveSelectedItems();
    render();
    toast(`✓ AI 分析完成并已收录 ${count} 道错题！`);
  });
}
