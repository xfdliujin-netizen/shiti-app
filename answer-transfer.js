let releaseAnswerTransfer=null,answerMoveUndo=null;
function canUndoAnswerMove(){return answerMoveUndo?.paper===paper&&answerMoveUndo.after===paper.items[0]&&answerMoveUndo.subject===paper.subject&&answerMoveUndo.signature===JSON.stringify(paper.items[0])}
function answerTransferTools(){return `<div class="paper-answer-tools"><button type="button" class="secondary" id="paper-move-answer"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h10M4 9h8M4 13h5M12 17h8m-3-3 3 3-3 3"/></svg><span id="paper-move-answer-label">选文字作为孩子作答</span></button><button type="button" class="secondary" id="paper-mark-visual">标记加点／划线</button>${canUndoAnswerMove()?'<button type="button" class="secondary" id="paper-undo-answer">撤销移动</button>':''}<small id="paper-selection-note">长按选字，或点按钮选取</small></div>
  <dialog id="answer-text-picker" class="compact-dialog">
    <div class="card-head"><h2 id="answer-picker-title">选择孩子实际写的答案</h2><button type="button" class="dialog-x" id="answer-picker-close" aria-label="关闭">×</button></div>
    <p class="hint">点选起点和终点。只选一个字时，点一次即可。</p>
    <div id="answer-picker-text"></div>
    <div class="answer-picker-pages"><button type="button" class="secondary" id="answer-picker-prev">上一段</button><span id="answer-picker-page"></span><button type="button" class="secondary" id="answer-picker-next">下一段</button></div>
    <div class="answer-picker-preview"><span>已选择</span><strong id="answer-picker-preview"></strong></div>
    <label class="field" id="answer-picker-slot-field" hidden><span>填到哪个空</span><select id="answer-picker-slot"></select></label>
    <div class="actions"><button type="button" class="primary" id="answer-picker-confirm">移到孩子作答</button><button type="button" class="secondary" id="answer-picker-underline" hidden>标记为划线</button></div>
  </dialog>`}
function answerCharacters(text){let offset=0;const chars=typeof Intl.Segmenter==='function'?Array.from(new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(text),v=>v.segment):Array.from(text);return chars.map(char=>{const token={text:char,start:offset,end:offset+char.length};offset=token.end;return token})}
function moveAnswerRange(item,text,start,end,subject,targetSlot){
  if(typeof text!=='string'||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>text.length||end<=start||!text.slice(start,end).trim())throw Error('请先选择孩子实际写的答案');
  const next=structuredClone(item),answer=text.slice(start,end);ensureAnswerStructure(next,subject);
  if(isChoiceType(next.questionType)){
    const value=answer.trim().replace(/^[（(]|[）)]$/g,'').trim().toUpperCase();
    if(!/^[A-H](?:[\s、,，/;；]*[A-H])*$/.test(value))throw Error('选择题请只选择 A～H 选项字母，或使用下方点选作答');
    next.choices=[...new Set(value.match(/[A-H]/g))];next.optionCount=Math.max(next.optionCount,...next.choices.map(v=>v.charCodeAt(0)-64));
  }else if(next.orderedAnswers || next.questionType==='fill'){
    let slot = targetSlot ?? Array.from({length:next.blankCount}, (_, i) => i).find(i => !String(next.blankAnswers[i] || '').trim()) ?? next.blankCount;
    if(!Number.isInteger(slot)||slot<0||slot>=20)throw Error('已有20空作答，请先整理现有空位');
    if (String(next.blankAnswers[slot] || '').trim()) throw Error(`第${slot+1}空已有作答，请先核对`);
    next.blankAnswers[slot]=answer;next.blankCount=Math.max(next.blankCount,slot+1);
  }else next.studentAnswer=[next.studentAnswer,answer].filter(Boolean).join('\n');
  updateStructuredAnswer(next);next.text=text.slice(0,start)+'____'+text.slice(end);next.answerStatus='confirmed';invalidatePaperEvidence(next);return next;
}
function bindAnswerTransfer(ta) {
  const main = $('#paper-move-answer');
  if (!ta || !main) return;
  const dialog = $('#answer-text-picker'), pickerText = $('#answer-picker-text');
  const confirm = $('#answer-picker-confirm'), underline = $('#answer-picker-underline');
  const slot = $('#answer-picker-slot'), slotField = $('#answer-picker-slot-field');
  let saved = null, pressing = false, picker = null;
  const item = () => paper.items[0];

  function hint() {
    const valid = saved?.text === ta.value;
    $('#paper-move-answer-label').textContent = valid ? '移入孩子作答' : '选文字作为孩子作答';
    $('#paper-selection-note').textContent = valid ? `已选 ${saved.end-saved.start} 个字` : '长按选字，或点按钮选取';
  }
  function remember() {
    if (!ta.isConnected) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    if (end > start) saved = {text:ta.value,start,end};
    else if (document.activeElement === ta && !pressing) saved = null;
    hint();
  }
  const selectionChange = () => { if (document.activeElement === ta) remember(); };
  const events = ['select','keyup','pointerup','touchend'];
  const input = () => { saved = null; hint(); };
  document.addEventListener('selectionchange', selectionChange);
  events.forEach(event => ta.addEventListener(event, remember));
  ta.addEventListener('input', input);
  releaseAnswerTransfer = () => {
    document.removeEventListener('selectionchange', selectionChange);
    events.forEach(event => ta.removeEventListener(event, remember));
    ta.removeEventListener('input', input);
  };

  function apply(range, action = 'answer') {
    if (!range || range.text !== ta.value) return toast('原题已修改，请重新选择文字');
    try {
      if (action === 'answer') {
        const before = structuredClone(item());
        const target = dialog.open && !slotField.hidden && slot.value !== '' ? Number(slot.value) : undefined;
        const next = moveAnswerRange(before, range.text, range.start, range.end, paper.subject, target);
        answerMoveUndo = {paper,before,after:next,subject:paper.subject,signature:JSON.stringify(next)};
        paper.items[0] = next;
      } else {
        const text = range.text.slice(range.start, range.end).trim();
        if (!text) throw Error('请先选择要标记的文字');
        const mark = (action === 'dot' ? '加点' : '划线') + '：「' + text + '」';
        const marks = item().visualFeatures?.split('\n').filter(Boolean) || [];
        if (!marks.includes(mark)) item().visualFeatures = [...marks, mark].join('\n');
        item().showAnswerExtra = true;
        invalidatePaperEvidence(item());
      }
      if (dialog.open) dialog.close();
      render();
      toast(action === 'answer' ? '已移入孩子作答，请重新核对' : '已标记原题文字');
    } catch (error) { toast(error.message); }
  }

  function paintSelection() {
    pickerText.querySelectorAll('[data-answer-offset]').forEach(button => {
      const selected = Number(button.dataset.answerOffset) < picker.end && Number(button.dataset.answerEnd) > picker.start;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    const text = picker.text.slice(picker.start, picker.end);
    $('#answer-picker-preview').textContent = text || '尚未选择';
    confirm.disabled = !text.trim() || (!slotField.hidden && slot.value === '');
    underline.disabled = !text.trim();
    confirm.textContent = picker.mode === 'visual' ? '标记为加点' :
      !slotField.hidden && slot.value !== '' ? `填入第 ${Number(slot.value) + 1} 空` : '移到孩子作答';
  }
  function paintPage() {
    const tokens = picker.tokens.slice(picker.page * 240, (picker.page + 1) * 240);
    pickerText.innerHTML = tokens.map(token => `<button type="button" class="answer-char" data-answer-offset="${token.start}" data-answer-end="${token.end}" aria-label="${esc(token.text === '\n' ? '换行' : token.text === ' ' ? '空格' : token.text)}">${esc(token.text === '\n' ? '↵' : token.text === ' ' ? '·' : token.text)}</button>${token.text === '\n' ? '<br>' : ''}`).join('');
    const pages = Math.max(1, Math.ceil(picker.tokens.length / 240));
    $('#answer-picker-page').textContent = `${picker.page + 1} / ${pages}`;
    $('#answer-picker-prev').disabled = picker.page === 0;
    $('#answer-picker-next').disabled = picker.page >= pages - 1;
    paintSelection();
  }
  function openPicker(mode, range) {
    if (!ta.value.trim()) return toast('请先填写或识别原题文字');
    const tokens = answerCharacters(ta.value);
    const offset = range ? tokens.findIndex(token => token.end > range.start) : 0;
    picker = {mode,text:ta.value,tokens,page:Math.floor(Math.max(0, offset) / 240),start:range?.start || 0,end:range?.end || 0,anchor:null};
    $('#answer-picker-title').textContent = mode === 'visual' ? '选择原题中的加点或划线文字' : '选择孩子实际写的答案';
    underline.hidden = mode !== 'visual';
    slotField.hidden = mode !== 'answer' || (item().questionType !== 'fill' && !item().orderedAnswers);
    if (!slotField.hidden) {
      const count = item().blankCount;
      const empty = Array.from({length:count}, (_, i) => i).filter(i => !String(item().blankAnswers[i] || '').trim());
      if (!empty.length && count < 20) empty.push(count);
      slot.innerHTML = empty.length ? empty.map(i => `<option value="${i}">第 ${i + 1} 空${i === count ? '（新增）' : ''}</option>`).join('') :
        '<option value="">所有空位已填写</option>';
    }
    paintPage();
    dialog.showModal();
  }

  function fromSelection(mode) {
    pressing = false;
    const range = saved?.text === ta.value ? saved : null;
    if (mode === 'answer' && range && (item().orderedAnswers || item().questionType !== 'fill')) apply(range);
    else openPicker(mode, range);
  }
  for (const [button, mode] of [[main, 'answer'], [$('#paper-mark-visual'), 'visual']]) {
    button.onpointerdown = () => { remember(); pressing = true; };
    button.onpointercancel = () => { pressing = false; };
    button.onclick = () => { if (!busy) fromSelection(mode); };
  }
  $('#paper-undo-answer')?.addEventListener('click', () => {
    if (!canUndoAnswerMove()) return toast('题目已继续编辑，无法撤销上一次移动');
    const original = structuredClone(answerMoveUndo.before);
    invalidatePaperEvidence(original);
    paper.items[0] = original;
    answerMoveUndo = null;
    render();
    toast('已撤销移动，请重新核对');
  });
  pickerText.onclick = event => {
    const button = event.target.closest('[data-answer-offset]');
    if (!button) return;
    const start = Number(button.dataset.answerOffset), end = Number(button.dataset.answerEnd);
    if (picker.anchor === null) {
      picker.anchor = {start,end};
      picker.start = start;
      picker.end = end;
    } else {
      picker.start = Math.min(picker.anchor.start, start);
      picker.end = Math.max(picker.anchor.end, end);
      picker.anchor = null;
      if (picker.mode === 'answer' && item().orderedAnswers && !confirm.disabled && picker.text.slice(picker.start,picker.end).trim()) return apply(picker);
    }
    paintSelection();
  };
  $('#answer-picker-close').onclick = () => dialog.close();
  $('#answer-picker-prev').onclick = () => { picker.page--; paintPage(); pickerText.scrollTop = 0; };
  $('#answer-picker-next').onclick = () => { picker.page++; paintPage(); pickerText.scrollTop = 0; };
  slot.onchange = paintSelection;
  confirm.onclick = () => apply(picker, picker.mode === 'visual' ? 'dot' : 'answer');
  underline.onclick = () => apply(picker, 'underline');
}
