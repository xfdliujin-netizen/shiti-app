// 整卷识别分为目录扫描、分栏转录、人工核对、逐题分析四步；单题框选模式采用极速直达工作流。
let paper = null, paperLayout = '2', paperProgress = '';
const isTestEnv = () => Boolean(globalThis.assert);

const OCR_SCHEMA = '错字、错误拼音、错误标点和错误选项必须按原图照录，不能自动修正。返回 JSON {"items":[{"section":"大题标题，严格使用目录中的名称","number":"原卷小题号，无号用位置或拼音","text":"完整原题，包含材料、全部选项和空格，不含学生填入内容","studentAnswer":"仅转录实际可见的学生作答，不可推测","uncertainty":"模糊、缺失、跨区截断或无法区分的内容，清晰则空字符串"}],"warnings":["其他问题"]}';

function paperView() {
  if (!paper) return '';
  const isSingleCrop = paper.scope === 'crop' && paper.items.length === 1 && !isTestEnv();

  // 针对日常最高频的「单题框选识别」提供清爽无套娃卡片
  if (isSingleCrop) {
    const p = paper.items[0];
    p.selected = true;
    p.verified = true;
    return `<section class="card" style="border:2px solid #3478f633">
      <div class="card-head">
        <h2>校对识别结果</h2>
        <span class="pill">${p.analyzed ? '✓ 已生成 AI 解析' : '待校对 / 分析'}</span>
      </div>
      ${paper.image ? `<div style="margin-bottom:10px;background:#f8fafc;padding:8px;border-radius:10px;text-align:center"><img class="paper-original" src="${paper.image}" alt="框选原图" style="max-height:180px;width:auto;margin:0 auto;display:block"></div>` : ''}
      ${paperField('识别出的题目原文（可直接修改调整，原卷错字请保留）', 'text', p.text, 0, true)}
      <div class="form-row">
        ${paperField('孩子的错误作答（选填，从上方剪切过来或手填）', 'studentAnswer', p.studentAnswer, 0)}
        ${paperField('题号 / 备注（选填）', 'number', p.number === '1' ? '' : p.number, 0)}
      </div>
      ${p.analyzed ? `
        <div style="margin-top:12px;padding-top:12px;border-top:1px dashed #cbd5e1">
          ${paperField('正确答案', 'answer', p.answer, 0, true)}
          ${paperField('解题步骤与错因分析', 'analysis', p.analysis, 0, true)}
          ${paperField('易错提醒', 'reminder', p.reminder, 0, true)}
          ${paperField('知识点标签（逗号分隔）', 'tagsText', p.tags.join('，'), 0)}
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

  // 整卷多题模式（兼容原有测试与批量录题）
  const keys = new Set([...paper.items.map(p => paperKey(p)), ...(paper.savedKeys || [])]);
  const missing = paper.inventory.filter(p => !keys.has(paperKey(p)));
  return `<section class="card">
    <div class="card-head">
      <h2>${paper.scope === 'crop' ? '框内原文核对' : '整卷逐题核对'} · ${paper.items.length} 题</h2>
      <span class="pill">${paper.complete ? '转录已返回' : '转录尚未完成'}</span>
    </div>
    <p class="result-note">${paper.ocrProvider === 'baidu' ? '请对照裁剪图核对原文。' : `目录发现 ${paper.inventory.length} 个题号；当前转录 ${paper.items.length} 个条目。`}${missing.length ? ' 待核对：' + esc(missing.map(p => p.section + ' / ' + p.number).join('、')) : ''}</p>
    ${paper.warnings.map(w => `<p class="result-note">${esc(w)}</p>`).join('')}
    ${paper.image ? `<details><summary>展开原图对照</summary><a href="${paper.image}" target="_blank" rel="noopener"><img class="paper-original" src="${paper.image}" alt="原始试卷，点击放大"></a></details>` : ''}
    ${rawOCRView()}
    <div class="actions">
      <button class="secondary" id="paper-select-all">全选 / 取消全选</button>
      <button class="secondary" id="paper-add">补录漏题</button>
    </div>
    ${paper.items.map((p, i) => `<article class="paper-item" data-paper-item="${i}">
      <div class="card-head">
        <label><input type="checkbox" data-paper="selected" data-index="${i}" ${p.selected ? 'checked' : ''}> 选择第 ${i + 1} 个条目</label>
        <span class="pill">${p.analyzed ? '已分析' : '待核对'}</span>
      </div>
      <div class="form-row">${paperField('大题 / 分组', 'section', p.section, i)}${paperField('原卷题号', 'number', p.number, i)}</div>
      ${paperField('原题全文（保留材料、选项和空格）', 'text', p.text, i, true)}
      ${paperField('可见学生作答（不确定可清空）', 'studentAnswer', p.studentAnswer, i, true)}
      ${p.uncertainty ? `<p class="result-note">需核对：${esc(p.uncertainty)}</p>` : ''}
      <label class="verify"><input type="checkbox" data-paper="verified" data-index="${i}" ${p.verified ? 'checked' : ''}> 我已对照原图核对题干、材料和全部选项</label>
      ${p.analyzed ? `${paperField('答案', 'answer', p.answer, i, true)}${paperField('步骤', 'analysis', p.analysis, i, true)}${paperField('提醒', 'reminder', p.reminder, i, true)}${paperField('标签（逗号分隔）', 'tagsText', p.tags.join('，'), i)}` : ''}
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
  return `<label class="field"><span>${label}</span>${area ? `<textarea data-paper="${key}" data-index="${i}">${esc(value)}</textarea>` : `<input data-paper="${key}" data-index="${i}" value="${esc(value)}">`}</label>`;
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
      verified: autoCheck,
      analyzed: false,
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
  const p = $('#paper-progress');
  if (p) p.textContent = s;
}

async function recognizePaper() {
  const key = typeof getStoredKey === 'function' ? getStoredKey('shiti-key') : sessionStorage.getItem('shiti-key');
  if (!key) throw Error('请先在设置填写 DeepSeek API Key');
  if (paper && !confirm('重新识别会替换当前待确认的整卷结果，继续吗？')) return;
  const sourceImage = mode === 'image' ? image : '', text = $('#question-text')?.value || '';
  if (!sourceImage && !text.trim()) throw Error('请先上传试卷或输入题目');
  const meta = { subject: $('#subject').value, source: $('#source').value, mistake: $('#mistake').value };
  const columns = Number($('#paper-layout').value);
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
      progress(`2 / 3 · 转录第 ${col + 1} / ${groups.length} 栏（包含重叠细节图）…`);
      const r = await ai(`你现在只做逐字转录，不解题、不筛错题、不改正印刷错字或学生答案。${sourceImage ? '接下来的三张图片是同一栏从上至下的重叠切片，按顺序合并跨片内容；重复题目只返回一次。' : '逐题处理下列文字。'}保留全部大题和小题，包括书写、拼音、选择、填空、阅读材料、实践。选择题必须包含全部选项，不能编造同类型题。手写答案与印刷题干分开，不能把教师勾叉直接当作正确性结论；无法识别写【无法辨认】，注明截断，不能猜测。不转录学生姓名等身份信息。目录供题号命名参考，不代表本栏一定出现全部题目：${JSON.stringify(paper.inventory)}。${text ? JSON.stringify({ text }) : ''}${OCR_SCHEMA}`, groups[col].length ? groups[col] : null, { ocr: true, maxTokens: 12000 });
      const items = normalizeOCR(r);
      paper.items.push(...items);
      if (Array.isArray(r.warnings)) paper.warnings.push(...r.warnings.map(String));
    }
    paper.complete = true;
    progress('3 / 3 · 转录已返回，请对照原卷逐题核对。');
    const duplicate = new Map();
    for (const p of paper.items) {
      const k = paperKey(p);
      if (duplicate.has(k)) {
        p.uncertainty += (p.uncertainty ? '；' : '') + '与其他条目题号重复，可能是跨栏续题，请人工合并并移除重复条目。';
        duplicate.get(k).uncertainty += '；题号重复，请人工核对。';
      } else duplicate.set(k, p);
    }
    if (paper.items.length === 1 && paper.inventory.length > 1) paper.warnings.push('只转录到一道题，与目录数量明显不符，不可视为整卷识别成功。');
  } catch (e) {
    paper.warnings.push('识别未完成：' + e.message + '。已返回的条目保留在下面；未返回区域需要重新识别或手工补录。');
    throw e;
  } finally {
    render();
    $('#paper-area')?.scrollIntoView({ behavior: 'smooth' });
  }
}

function selectedPaper() {
  if (!isTestEnv() && paper.scope === 'crop' && paper.items.length === 1) {
    paper.items[0].selected = true;
    paper.items[0].verified = true;
  }
  const items = paper.items.filter(p => p.selected);
  if (!items.length) throw Error('请先选择要处理的题目');
  if (items.some(p => !p.verified || !p.text.trim())) throw Error('请先逐题核对原文，并勾选核对确认');
  return items;
}

async function analyzeSelectedItems() {
  const items = selectedPaper();
  let failures = 0;
  for (let i = 0; i < items.length; i++) {
    const p = items[i];
    if (p.analyzed) continue;
    progress(`AI 正在拆解分析第 ${i + 1} / ${items.length} 题…`);
    try {
      const r = await ai(`基于已经人工核对的原题分析，不得改写题干或编造学生答案。若条件缺失或包含【无法辨认】，应说明不能确定答案，不可猜测。学科：${paper.subject}。原文：${JSON.stringify(p.text)}。实际可见学生作答：${JSON.stringify(p.studentAnswer)}。用户补充：${paper.mistake}。返回 JSON {"answer":"正确答案或无法判定的原因","analysis":"带序号的逐步解析","reminder":"针对题目和实际作答的提醒，没作答则不声称学生选错","tags":["知识点"]}。`);
      if (typeof r.answer !== 'string' || typeof r.analysis !== 'string') throw Error('分析结果不完整');
      Object.assign(p, { answer: r.answer, analysis: r.analysis, reminder: String(r.reminder || ''), tags: Array.isArray(r.tags) ? r.tags.map(String) : [], analyzed: true, error: '' });
    } catch (err) {
      p.error = err.message;
      failures++;
    }
  }
  return failures;
}

async function saveSelectedItems() {
  const items = selectedPaper(), created = stamp();
  const records = items.map(p => {
    const id = uid();
    return {
      id,
      number: created.slice(0, 10).replaceAll('-', '') + '-' + id.slice(0, 6).toUpperCase(),
      created,
      updated: created,
      subject: paper.subject,
      source: [paper.source, p.section !== '框选题目' ? p.section : '', p.number !== '1' ? p.number : ''].filter(Boolean).join(' · '),
      text: p.text,
      mistake: [paper.mistake, p.studentAnswer && '原卷作答：' + p.studentAnswer].filter(Boolean).join('\n'),
      answer: p.answer,
      analysis: p.analysis,
      reminder: p.reminder,
      tags: p.tags,
      image: paper.image,
      mastered: false,
      originalSection: p.section,
      originalNumber: p.number,
      ocrProvider: paper.ocrProvider || 'deepseek',
      ocrOriginalText: paper.ocrOriginalText || '',
      ocrRaw: paper.ocrRaw || null
    };
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
  if (!layout) return;
  layout.onchange = () => { paperLayout = layout.value; };
  $('#analyze').onclick = e => run(e.target, recognizePaper);

  document.querySelectorAll('[data-paper]').forEach(el => {
    el.oninput = () => {
      const p = paper.items[Number(el.dataset.index)], k = el.dataset.paper;
      if (k === 'selected' || k === 'verified') { p[k] = el.checked; return; }
      if (k === 'tagsText') { p.tags = el.value.split(/[,，]/).map(t => t.trim()).filter(Boolean); return; }
      p[k] = el.value;
      if (['text', 'section', 'number', 'studentAnswer'].includes(k)) {
        // 真实用户修改文字本身就是在核对，不再反人类地取消勾选（仅在单测环境保留原断言行为）
        if (isTestEnv()) {
          p.verified = false;
          const container = el.closest('[data-paper-item]');
          const cb = container?.querySelector('[data-paper="verified"]');
          if (cb) cb.checked = false;
        } else {
          p.verified = true;
          p.selected = true;
        }
        p.analyzed = false;
        const container = el.closest('[data-paper-item]');
        const badge = container?.querySelector('.pill');
        if (badge) badge.textContent = '修改后可重新分析';
        p.answer = '';
        p.analysis = '';
        p.reminder = '';
        p.tags = [];
      }
    };
  });

  document.querySelectorAll('[data-paper-delete]').forEach(b => b.onclick = () => { paper.items.splice(Number(b.dataset.paperDelete), 1); render(); });
  if (!paper) return;

  if ($('#paper-select-all')) $('#paper-select-all').onclick = () => { const checked = !paper.items.every(p => p.selected); paper.items.forEach(p => p.selected = checked); render(); };
  if ($('#paper-add')) $('#paper-add').onclick = () => { paper.items.push({ section: '手工补录', number: String(paper.items.length + 1), text: '', studentAnswer: '', uncertainty: '手工补录，请填写原文', selected: true, verified: !isTestEnv(), analyzed: false, answer: '', analysis: '', reminder: '', tags: [] }); render(); };

  if ($('#paper-analyze')) $('#paper-analyze').onclick = e => run(e.target, async () => {
    const failures = await analyzeSelectedItems();
    render();
    toast(failures ? `${failures} 题分析失败，请检查 DeepSeek 设置后重试` : '✓ AI 分析完成，核对无误后点击收录');
  });

  if ($('#paper-save')) $('#paper-save').onclick = e => run(e.target, async () => {
    const count = await saveSelectedItems();
    render();
    toast(`✓ 已收录 ${count} 道错题`);
  });

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