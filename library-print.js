const librarySelected=new Set();
let libraryPrintOne='';
function libraryPrintDialog(){return `<dialog id="library-print-dialog" class="compact-dialog"><div class="card-head"><h2>打印题库题目</h2><button type="button" class="dialog-x" id="library-print-close" aria-label="关闭">×</button></div><label class="field"><span>打印范围</span><select id="library-print-scope"></select></label><div class="form-row"><label class="field"><span>从第几题</span><input id="library-print-from" type="number" min="1"></label><label class="field"><span>到第几题</span><input id="library-print-to" type="number" min="1"></label></div><p class="hint" id="library-print-count"></p><label class="verify"><input type="checkbox" id="library-print-answers">附参考答案和解析（另起一页）</label><p class="hint">单次最多100题。尚未支持的配图题无法打印；待核对题目会保留提示。可在打印窗口选择“另存为 PDF”。</p><button type="button" class="primary" id="library-print-confirm">打印 / 存 PDF</button></dialog>`}
function currentLibrary(){return importedLibraries().find(b=>b.libraryId===activeLibrary)}
function filteredLibraryQuestions(bank=currentLibrary()){return bank?.questions.filter(q=>(!libraryGrade||String(q.grade)===libraryGrade)&&[q.text,...(q.tags||[])].join(' ').toLowerCase().includes(librarySearch.toLowerCase()))||[]}
function libraryPrintPool(scope,bank=currentLibrary()){if(!bank)return [];if(scope==='one')return bank.questions.filter(q=>q.id===libraryPrintOne);if(scope==='selected')return bank.questions.filter(q=>librarySelected.has(q.id));return scope==='all'?bank.questions:filteredLibraryQuestions(bank)}
function openLibraryPrint(id=''){
  const bank=currentLibrary();if(!bank)throw Error('请先打开一个题库');libraryPrintOne=id;
  $('#library-print-scope').innerHTML=id?'<option value="one">此题</option>':`${librarySelected.size?`<option value="selected">已勾选（${librarySelected.size}题）</option>`:''}<option value="filtered">当前筛选（${filteredLibraryQuestions(bank).length}题）</option><option value="all">本题库全部（${bank.questions.length}题）</option>`;
  const reset=()=>{const n=libraryPrintPool($('#library-print-scope').value).length;$('#library-print-from').value=1;$('#library-print-to').value=Math.min(100,n);$('#library-print-count').textContent=`当前范围共 ${n} 题，可分批打印。`};$('#library-print-scope').onchange=reset;reset();$('#library-print-answers').checked=false;$('#library-print-dialog').showModal();
}
function prepareLibraryPrint(bank,questions){
  if(!bank?.complete)throw Error('题库尚未同步完整，请先完成同步');if(!questions.length||questions.length>100)throw Error('请选择1～100道题');if(questions.some(q=>q.hasVisual))throw Error('所选题目含尚未支持的配图，请排除配图题后打印');
  return {title:bank.name,items:questions.map(q=>({...q,printReviewed:q.sourceType==='cmath'||(cfg.bankReviewed||[]).includes(q.id),source:q.source||bank.source,license:q.license||bank.license,originUrl:safeSourceUrl(q.originUrl||bank.sourceUrl)}))};
}
function printQuestionBody(item, index, preview) {
  const text = typeof item.text === 'string' ? item.text.trim() : '';
  const needsOptions = ['choice', 'single', 'multiple'].includes(item.questionType) &&
    !/(?:^|\s)[A-HＡ-Ｈ]\s*[.．、:：)）]/m.test(text);
  const message = !text ? '这道题尚未保存文字题干。' : needsOptions ? '正文未检测到选项，请核对是否完整。' : '';
  const note = preview && message ? `<p class="pending" data-preview-only>${message}</p>` : '';
  const edit = preview && item.recordId ? `<button type="button" data-preview-only data-edit-question="${index}">校对题干</button>` : '';
  return `<div class="q-text">${renderStudyText(text)}</div>${note}${edit}`;
}

function libraryPrintHtml(sheet,includeAnswers=false,baseUrl=location.href,preview=false){
  const answersOnly = includeAnswers === "only";
  const mathCss=new URL('vendor/katex/katex.min.css',baseUrl).href;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(sheet.title)}${answersOnly ? " · 答案解析" : ""}</title><link rel="stylesheet" href="${esc(mathCss)}"><style>@page{size:A4;margin:15mm}body{font:15px/1.75 -apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif;color:#111;background:#fff;max-width:800px;margin:24px auto;padding:0 18px}h1{font-size:22px;margin:0 0 8px}h2{font-size:15px;margin:0}.sheet-meta{border-bottom:2px solid #111;padding-bottom:12px}.q{margin:24px 0;break-inside:avoid}.q-text,.answer{white-space:pre-wrap;overflow-wrap:anywhere}.question-image{display:block;max-width:100%;max-height:155mm;width:auto;height:auto;object-fit:contain;margin:12px 0}.space{height:42px;border-bottom:1px dashed #ccc}.pending{font-size:11px;color:#555}.answers{break-before:page}.source{font-size:10px;overflow-wrap:anywhere;color:#555}.source-list{border-top:1px solid #ccc;margin-top:24px}.katex{font-size:1.05em}.katex-display{white-space:normal;max-width:100%;overflow:hidden}.print-tools{margin-bottom:20px}button{padding:10px 16px}@media print{body{margin:0;padding:0;max-width:none}.print-tools{display:none}}</style></head><body><div class="print-tools"><button onclick="window.print()">打印 / 存 PDF</button></div><h1>${esc(sheet.title)}${answersOnly ? " · 答案解析" : ""}</h1><div class="sheet-meta">共 ${sheet.items.length} 题　姓名：____________　日期：____________</div>${answersOnly ? "" : sheet.items.map((q,i)=>`<section class="q"><h2>${i+1}. ${q.printReviewed?'':'<span class="pending">资料待核对</span>'}</h2>${printQuestionBody(q,i,preview)}${printQuestionImages(q)}<div class="space"></div></section>`).join('')}${includeAnswers?`<section class="answers" ${answersOnly ? 'style="break-before:auto"' : ''}>${answersOnly ? "" : "<h1>参考答案与解析</h1>"}${sheet.items.map((q,i)=>`<section class="q answer"><h2>${i+1}. ${q.printReviewed?'':'资料待核对'}</h2>${renderStudyText(q.answer||'暂无参考答案')}<br>${renderStudyText(q.analysis||'暂无解析')}</section>`).join('')}</section>`:''}<section class="source-list"><h2>来源与许可</h2>${sheet.items.map((q,i)=>`<div class="source">${i+1}. ${esc(q.source||'来源待核对')} · ${esc(q.license||'许可待核对')}${q.originUrl?` · <a href="${esc(q.originUrl)}" rel="noopener">${esc(q.originUrl)}</a>`:''}</div>`).join('')}</section></body></html>`;
}
function printsSourcePhoto(item, attachment) {
  return isStudyImage(item.image) && (attachment === 'all' || attachment === 'auto' && !validFigureRegion(item.figureRegion));
}

async function preparePrintImages(sheet, mode, attachment, isCurrent, cleanedCopies = new Map()) {
  const items = [];
  let failures = 0;
  for (const item of sheet.items) {
    if (!isCurrent()) return null;
    const source = isStudyImage(item.image) ? item.image : '';
    const hasFigure = source && validFigureRegion(item.figureRegion);
    const includeSource = printsSourcePhoto(item, attachment);
    const printSource = cleanedCopies.has(source) ? cleanedCopies.get(source) : source;
    let image = '', extraImage = '', isFigure = false;
    try {
      if (hasFigure) {
        // Preserve color, dashed lines and pale labels in the selected diagram.
        image = await studyImageCopy(source, 'original', item.figureRegion);
        isFigure = true;
        if (includeSource && printSource) extraImage = await studyImageCopy(printSource, mode);
      } else if (includeSource && printSource) image = await studyImageCopy(printSource, mode);
    } catch {
      failures++;
      if (includeSource && !isFigure) image = printSource;
      else if (includeSource) extraImage = printSource;
    }
    items.push({ ...item, image, extraImage, isFigure });
  }
  return { sheet: { ...sheet, items }, failures };
}

function printQuestionImages(item) {
  const image = (src, caption) => typeof src === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(src)
    ? `<img class="question-image" src="${esc(src)}" alt="${caption}">` : '';
  return image(item.image, item.isFigure ? '题目配图' : '原题图片') + image(item.extraImage, '整题原图');
}

function launchLibraryPrint(sheet, includeAnswers = false) {
  const dialog = document.createElement('dialog');
  dialog.className = 'print-preview';
  const offersPhotos = includeAnswers !== 'only' && sheet.items.some(item => isStudyImage(item.image));
  dialog.innerHTML = `<div class="print-preview-toolbar">
    <strong>打印预览</strong>
    ${offersPhotos ? `
      <label>整题照片 <select data-print-source>
        <option value="auto">仅无独立题图时附上</option><option value="all">全部附上</option><option value="none">不附整题照片</option>
      </select></label>
      <label>照片效果 <select data-print-image-mode>
        <option value="gray">增强灰度</option><option value="bw">黑白扫描</option><option value="original">原图</option>
      </select></label>
      <button type="button" class="secondary" data-clean-photos>去手写</button>` : ''}
    <button type="button" class="secondary" data-print-download disabled>下载文档</button>
    <button type="button" class="primary" data-print-now disabled>打印／存 PDF</button>
    <button type="button" class="secondary" data-print-close aria-label="关闭预览">×</button>
  </div>
  <p class="hint" data-print-status role="status" hidden></p>
  <iframe title="打印文档"></iframe>
  <p class="hint">如果微信没有打开打印窗口，可下载文档后在系统浏览器中打开打印。</p>`;
  const frame = dialog.querySelector('iframe');
  const print = dialog.querySelector('[data-print-now]');
  const download = dialog.querySelector('[data-print-download]');
  const mode = dialog.querySelector('[data-print-image-mode]');
  const source = dialog.querySelector('[data-print-source]');
  const clean = dialog.querySelector('[data-clean-photos]');
  const status = dialog.querySelector('[data-print-status]');
  const cleanedCopies = new Map();
  let cleaning = false;
  let documentUrl, html, revision = 0;
  const sourcePhotos = () => [...new Set(sheet.items.filter(item => printsSourcePhoto(item, source.value)).map(item => item.image))];
  async function update() {
    const request = ++revision;
    const current = () => request === revision && dialog.open;
    print.disabled = download.disabled = true;
    status.hidden = !mode;
    status.textContent = mode ? '正在生成预览…' : '';
    const photos = mode ? sourcePhotos() : [];
    const outstanding = photos.filter(photo => !cleanedCopies.has(photo)).length;
    if (mode) {
      mode.disabled = !photos.length;
      clean.disabled = cleaning || !photos.length;
      clean.textContent = outstanding ? `去手写（${outstanding} 张）` : photos.length ? '恢复手写原图' : '去手写';
    }
    const output = mode ? await preparePrintImages(sheet, mode.value, source.value, current, cleanedCopies) : { sheet, failures: 0 };
    if (!output || !current()) return;
    if (documentUrl) URL.revokeObjectURL(documentUrl);
    documentUrl = undefined;
    html = libraryPrintHtml(output.sheet, includeAnswers);
    const failed = photos.filter(photo => cleanedCopies.has(photo) && !cleanedCopies.get(photo)).length;
    const notices = [];
    if (failed) notices.push(`${failed} 张照片去手写失败，已从本次导出中省略。可恢复原图后重新尝试。`);
    if (output.failures) notices.push(`${output.failures} 道题的图片转换未完成，请核对预览。`);
    status.hidden = !notices.length;
    status.textContent = notices.join(' ');
    frame.onload = () => {
      if (!current() || frame.contentDocument?.body?.dataset.previewVersion !== String(request)) return;
      print.disabled = download.disabled = false;
      frame.contentDocument.querySelectorAll('[data-edit-question]').forEach(button => {
        button.onclick = () => {
          const item = sheet.items[Number(button.dataset.editQuestion)];
          if (!item?.recordId) return;
          dialog.close();
          openQuestion(item.recordId);
        };
      });
    };
    frame.srcdoc = libraryPrintHtml(output.sheet, includeAnswers, location.href, true)
      .replace('</head>', '<style>.print-tools{display:none}@media print{[data-preview-only]{display:none!important}}</style></head>')
      .replace('<body>', `<body data-preview-version="${request}">`);
  }
  if (mode) mode.onchange = update;
  if (source) source.onchange = update;
  if (clean) clean.onclick = async () => {
    const photos = sourcePhotos();
    const pending = photos.filter(photo => !cleanedCopies.has(photo));
    if (!pending.length) {
      cleanedCopies.clear();
      update();
      return;
    }
    if (!confirm(`将这 ${pending.length} 张照片提交百度「文档去手写 V2」，每张使用 1 次调用额度。继续吗？`)) return;
    cleaning = true;
    ++revision;
    mode.disabled = source.disabled = clean.disabled = print.disabled = download.disabled = true;
    status.hidden = false;
    try {
      for (let index = 0; index < pending.length && dialog.open; index++) {
        status.textContent = `正在去手写（${index + 1}/${pending.length}）…`;
        try {
          cleanedCopies.set(pending[index], await removeStudyHandwriting(pending[index]));
        } catch (error) {
          pending.slice(index).forEach(photo => cleanedCopies.set(photo, null));
          toast(error.message || '无法去手写');
          break;
        }
      }
    } finally {
      cleaning = false;
      if (dialog.open) { source.disabled = false; update(); }
    }
  };
  print.onclick = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch {
      toast('当前浏览器无法启动打印，请下载文档后在系统浏览器打开');
    }
  };
  download.onclick = () => {
    documentUrl ||= URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = documentUrl;
    link.download = '拾题打印文档.html';
    link.click();
  };
  dialog.querySelector('[data-print-close]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    revision++;
    if (documentUrl) URL.revokeObjectURL(documentUrl);
    dialog.remove();
  }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
  update();
}

function bindLibraryPrint(){
  document.querySelectorAll('[data-library-select]').forEach(el=>el.onchange=()=>{el.checked?librarySelected.add(el.dataset.librarySelect):librarySelected.delete(el.dataset.librarySelect);const count=$('#library-selected-count');if(count)count.textContent=`已选 ${librarySelected.size} 题`});
  document.querySelectorAll('[data-library-print-one]').forEach(el=>el.onclick=e=>run(e.target,()=>openLibraryPrint(el.dataset.libraryPrintOne)));
  if($('#library-print'))$('#library-print').onclick=e=>run(e.target,()=>openLibraryPrint());
  if($('#library-print-close'))$('#library-print-close').onclick=()=>$('#library-print-dialog').close();
  if($('#library-print-confirm'))$('#library-print-confirm').onclick=e=>run(e.target,()=>{const pool=libraryPrintPool($('#library-print-scope').value),from=Number($('#library-print-from').value),to=Number($('#library-print-to').value);if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<from||to>pool.length)throw Error('请填写有效打印题号范围');const sheet=prepareLibraryPrint(currentLibrary(),pool.slice(from-1,to));const includeAnswers=$('#library-print-answers').checked;$('#library-print-dialog').close();launchLibraryPrint(sheet,includeAnswers)});
}
