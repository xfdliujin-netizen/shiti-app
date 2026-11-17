let releaseAnswerTransfer=null,answerMoveUndo=null;
function canUndoAnswerMove(){return answerMoveUndo?.paper===paper&&answerMoveUndo.after===paper.items[0]&&answerMoveUndo.subject===paper.subject&&answerMoveUndo.signature===JSON.stringify(paper.items[0])}
function answerTransferTools(){return `<div class="paper-answer-tools"><button type="button" class="secondary" id="paper-move-answer"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h10M4 9h8M4 13h5M12 17h8m-3-3 3 3-3 3"/></svg><span id="paper-move-answer-label">选文字作为孩子作答</span></button>${canUndoAnswerMove()?'<button type="button" class="secondary" id="paper-undo-answer">撤销移动</button>':''}<small id="paper-selection-note">长按选字后点击，或点按钮进入点选模式。</small></div><dialog id="answer-text-picker" class="compact-dialog"><div class="card-head"><h2>选择孩子实际写的答案</h2><button type="button" class="dialog-x" id="answer-picker-close" aria-label="关闭">×</button></div><p class="hint">点一下选起点，再点一下选终点；单个字点一次即可。选择后会从原题移出，并以空位替代。</p><div id="answer-picker-text"></div><div class="answer-picker-pages"><button type="button" class="secondary" id="answer-picker-prev">上一段</button><span id="answer-picker-page"></span><button type="button" class="secondary" id="answer-picker-next">下一段</button></div><div class="answer-picker-preview"><span>已选择</span><strong id="answer-picker-preview"></strong></div><button type="button" class="primary" id="answer-picker-confirm">移到孩子作答</button></dialog>`}
function answerCharacters(text){let offset=0;const chars=typeof Intl.Segmenter==='function'?Array.from(new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(text),v=>v.segment):Array.from(text);return chars.map(char=>{const token={text:char,start:offset,end:offset+char.length};offset=token.end;return token})}
function moveAnswerRange(item,text,start,end,subject){
  if(typeof text!=='string'||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>text.length||end<=start||!text.slice(start,end).trim())throw Error('请先选择孩子实际写的答案');
  const next=structuredClone(item),answer=text.slice(start,end);ensureAnswerStructure(next,subject);
  if(isChoiceType(next.questionType)){
    const value=answer.trim().replace(/^[（(]|[）)]$/g,'').trim().toUpperCase();
    if(!/^[A-H](?:[\s、,，/;；]*[A-H])*$/.test(value))throw Error('选择题请只选择 A～H 选项字母，或使用下方点选作答');
    next.choices=[...new Set(value.match(/[A-H]/g))];next.optionCount=Math.max(next.optionCount,...next.choices.map(v=>v.charCodeAt(0)-64));
  }else if(next.questionType==='fill'){
    let slot=next.blankAnswers.findIndex(v=>!String(v||'').trim());if(slot<0)slot=next.blankAnswers.length;
    if(slot>=20)throw Error('已有20空作答，请先整理现有空位');next.blankAnswers[slot]=answer;next.blankCount=Math.max(next.blankCount,slot+1);
  }else next.studentAnswer=[next.studentAnswer,answer].filter(Boolean).join('\n');
  updateStructuredAnswer(next);next.text=text.slice(0,start)+'____'+text.slice(end);next.answerStatus='confirmed';invalidatePaperEvidence(next);return next;
}
function bindAnswerTransfer(ta){
  if(!ta||!$('#paper-move-answer'))return;
  let saved=null,pressing=false,picker=null;const main=$('#paper-move-answer');
  const hint=()=>{const valid=saved&&saved.text===ta.value;$('#paper-move-answer-label').textContent=valid?'移入孩子作答':'选文字作为孩子作答';$('#paper-selection-note').textContent=valid?`已选 ${saved.text.slice(saved.start,saved.end).length} 个字，点击即可移动。`:'长按选字后点击，或点按钮进入点选模式。'};
  const remember=()=>{if(!ta.isConnected)return;const start=ta.selectionStart,end=ta.selectionEnd;if(Number.isInteger(start)&&end>start){saved={text:ta.value,start,end};hint()}else if(document.activeElement===ta&&!pressing){saved=null;hint()}};
  const selectionChange=()=>{if(document.activeElement===ta)remember()};document.addEventListener('selectionchange',selectionChange);
  for(const event of ['select','keyup','pointerup','touchend'])ta.addEventListener(event,remember);const input=()=>{saved=null;hint()};ta.addEventListener('input',input);
  releaseAnswerTransfer=()=>{document.removeEventListener('selectionchange',selectionChange);for(const event of ['select','keyup','pointerup','touchend'])ta.removeEventListener(event,remember);ta.removeEventListener('input',input)};
  const apply=range=>{if(!range||range.text!==ta.value){toast('原题已修改，请重新选择答案');return}try{const before=structuredClone(paper.items[0]),next=moveAnswerRange(before,range.text,range.start,range.end,paper.subject);answerMoveUndo={paper,before,after:next,subject:paper.subject,signature:JSON.stringify(next)};paper.items[0]=next;$('#answer-text-picker').close();render();toast('已移入孩子作答，请重新核对')}catch(error){saved=null;hint();toast(error.message)}};
  main.onpointerdown=()=>{remember();pressing=true};main.onpointercancel=()=>{pressing=false};main.onclick=()=>{pressing=false;const start=ta.selectionStart,end=ta.selectionEnd;if(end>start)saved={text:ta.value,start,end};if(saved?.text===ta.value&&saved.end>saved.start)apply(saved);else openPicker()};
  if($('#paper-undo-answer'))$('#paper-undo-answer').onclick=()=>{if(!canUndoAnswerMove()){toast('题目已继续编辑，无法撤销上一次移动');return}const original=structuredClone(answerMoveUndo.before);invalidatePaperEvidence(original);paper.items[0]=original;answerMoveUndo=null;render();toast('已撤销移动，请重新核对')};
  function openPicker(){
    if(!ta.value.trim()){toast('请先填写或识别原题文字');return}picker={text:ta.value,tokens:answerCharacters(ta.value),page:0,start:0,end:0,anchor:null};paint();$('#answer-text-picker').showModal();
  }
  function paint(){
    const tokens=picker.tokens.slice(picker.page*240,(picker.page+1)*240);$('#answer-picker-text').innerHTML=tokens.map(t=>`<button type="button" class="answer-char ${t.start<picker.end&&t.end>picker.start?'selected':''}" data-answer-offset="${t.start}" aria-label="${esc(t.text==='\n'?'换行':t.text===' '?'空格':t.text)}">${esc(t.text==='\n'?'↵':t.text===' '?'·':t.text)}</button>${t.text==='\n'?'<br>':''}`).join('');
    const pages=Math.max(1,Math.ceil(picker.tokens.length/240));$('#answer-picker-page').textContent=`${picker.page+1} / ${pages}`;$('#answer-picker-prev').disabled=picker.page===0;$('#answer-picker-next').disabled=picker.page>=pages-1;$('#answer-picker-preview').textContent=picker.end>picker.start?picker.text.slice(picker.start,picker.end):'尚未选择';$('#answer-picker-confirm').disabled=picker.end<=picker.start;
    document.querySelectorAll('[data-answer-offset]').forEach(el=>el.onclick=()=>{const t=picker.tokens.find(t=>t.start===Number(el.dataset.answerOffset));if(!picker.anchor){picker.anchor=t;picker.start=t.start;picker.end=t.end}else{picker.start=Math.min(picker.anchor.start,t.start);picker.end=Math.max(picker.anchor.end,t.end);picker.anchor=null}paint()});
  }
  $('#answer-picker-close').onclick=()=>$('#answer-text-picker').close();$('#answer-picker-prev').onclick=()=>{picker.page--;paint();$('#answer-picker-text').scrollTop=0};$('#answer-picker-next').onclick=()=>{picker.page++;paint();$('#answer-picker-text').scrollTop=0};$('#answer-picker-confirm').onclick=()=>apply(picker);
}
