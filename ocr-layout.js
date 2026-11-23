// Geometry only: this module never corrects characters or identifies handwriting.
function arrangeOCRLines(blocks) {
  const original = blocks.map(b => String(b.words ?? '')).join('\n');
  const located = blocks.every(b => b.location && ['left','top','width','height'].every(k => Number.isFinite(b.location[k])) && b.location.height > 0);
  if (!blocks.length || !located) return {text:original, located:false, rows:[]};
  const rows=[];
  for (const block of [...blocks].sort((a,b)=>a.location.top-b.location.top || a.location.left-b.location.left)) {
    const box=block.location, center=box.top+box.height/2;
    // Small handwritten corrections above a printed row must not drag that row upward.
    let row=rows.find(r=>Math.abs(r.center-center)<=Math.min(r.height,box.height)*.35 && Math.max(r.height,box.height)/Math.min(r.height,box.height)<1.8);
    if(!row){row={center,height:box.height,blocks:[]};rows.push(row)}
    row.blocks.push(block);
  }
  rows.sort((a,b)=>a.center-b.center);
  for(const row of rows)row.blocks.sort((a,b)=>a.location.left-b.location.left);
  return {located:true,rows,text:rows.map(row=>row.blocks.map(b=>b.words).join('　')).join('\n')};
}
function answerEvidence(p) {
  const status=p.answerStatus||'unknown';
  return {status,questionType:p.questionTypeName||QUESTION_TYPE_NAMES[p.questionType]||'未分类',answer:status==='confirmed'?String(p.studentAnswer||'').trim():'',annotation:String(p.annotation||''),visualFeatures:String(p.visualFeatures||''),verified:Boolean(p.verified)};
}
const QUESTION_TYPE_NAMES={other:'其他题型',choice:'选择题',single:'选择题',multiple:'选择题',fill:'填空题',judge:'判断题',answer:'问答题',calculation:'计算题',application:'应用题',proof:'证明题',reading:'阅读理解',writing:'写作题',cloze:'完形填空',translation:'翻译题',experiment:'实验探究题',material:'材料分析题'};
function normalizeQuestionType(type){return ['single','multiple'].includes(type)?'choice':type}
function isChoiceType(type){return normalizeQuestionType(type)==='choice'}
function questionTypesFor(subject) {
  const bySubject={语文:['choice','fill','judge','reading','answer','writing'],数学:['choice','fill','judge','calculation','application','proof'],英语:['choice','fill','judge','cloze','reading','translation','writing','answer'],物理:['choice','fill','calculation','experiment','answer'],化学:['choice','fill','calculation','experiment','answer'],生物:['choice','fill','experiment','answer'],科学:['choice','fill','judge','experiment','answer']};
  return [...(bySubject[subject]||['choice','fill','judge','material','answer']),'other'];
}
function selectedCaptureQuestionType(subject) {
  const type=normalizeQuestionType($('#capture-question-type')?.value||cfg.questionTypes?.[subject]||'other');
  return questionTypesFor(subject).includes(type)?type:'other';
}
function questionTypeOptions(subject,type) {return questionTypesFor(subject).map(t=>`<option value="${t}" ${t===normalizeQuestionType(type)?'selected':''}>${QUESTION_TYPE_NAMES[t]}</option>`).join('')}
function ensureAnswerStructure(p,subject) {
  const type=normalizeQuestionType(p.questionType||((typeof paper!=='undefined'&&paper)?paper.questionType:null)||'other');
  p.questionType=questionTypesFor(subject).includes(type)?type:'other';
  p.answerDrafts ||= {};
  if(!Array.isArray(p.choices))p.choices=/^[A-H](?:[、,，\s]*[A-H])*$/.test(p.studentAnswer||'')?[...new Set(p.studentAnswer.match(/[A-H]/g))]:[];
  if(!Array.isArray(p.blankAnswers)){
    const lines=String(p.studentAnswer||'').split('\n'),numbered=lines.length&&lines.every(x=>/^第\d+空[：:]/.test(x));
    p.blankAnswers=numbered?lines.map(x=>x.replace(/^第\d+空[：:]/,'')):p.studentAnswer?[p.studentAnswer]:[];
  }
  p.blankCount=Math.min(20,Math.max(1,Number(p.blankCount)||Math.max(2,p.blankAnswers.length)));
  p.optionCount=Math.min(8,Math.max(2,Number(p.optionCount)||Math.max(5,...p.choices.map(x=>x.charCodeAt(0)-64))));
}
function updateStructuredAnswer(p) {
  if(isChoiceType(p.questionType))p.studentAnswer=p.choices.slice().sort().join('、');
  else if(p.orderedAnswers) p.studentAnswer = p.blankAnswers.slice(0,p.blankCount).flatMap((value,i)=>String(value||'').trim()?[`第${i+1}空：${value}`]:[]).join('\n');
  else if(p.questionType==='fill')p.studentAnswer=p.blankAnswers.slice(0,p.blankCount).some(v=>String(v||'').trim())?Array.from({length:p.blankCount},(_,i)=>`第${i+1}空：${p.blankAnswers[i]||'【未填写】'}`).join('\n'):'';
}
function switchQuestionType(p,type,subject) {
  type=normalizeQuestionType(type);
  ensureAnswerStructure(p,subject);
  const target = questionTypesFor(subject).includes(type) ? type : 'other';
  if (target === p.questionType) return;
  const previous = {
    studentAnswer: p.studentAnswer || '', choices: [...p.choices], blankAnswers: [...p.blankAnswers],
    blankCount: p.blankCount, optionCount: p.optionCount, answerStatus: p.answerStatus, carriedAnswer: p.carriedAnswer
  };
  p.answerDrafts[p.questionType] = previous;
  p.questionType = target;
  const saved = p.answerDrafts[target];
  const source = saved?.studentAnswer || saved?.carriedAnswer ? saved : previous;
  const text = source.studentAnswer || source.carriedAnswer || '';
  p.studentAnswer = text;
  p.choices = [];
  p.blankAnswers = [];
  p.blankCount = saved?.blankCount || 2;
  p.optionCount = saved?.optionCount || previous.optionCount;
  p.carriedAnswer = '';
  if (source === saved) {
    p.choices = [...saved.choices];
    p.blankAnswers = [...saved.blankAnswers];
    p.carriedAnswer = saved.carriedAnswer || '';
  } else if (target === 'fill' && text) {
    const numbered = text.split('\n').map(line => /^第(\d+)空[：:](.*)$/.exec(line));
    if (numbered.every(match => match && Number(match[1]) >= 1 && Number(match[1]) <= 20)) {
      for (const [, slot, value] of numbered) p.blankAnswers[Number(slot) - 1] = value === '【未填写】' ? '' : value;
      p.blankCount = Math.max(p.blankCount, p.blankAnswers.length);
    } else p.blankAnswers[0] = text;
  } else if (isChoiceType(target) && text) {
    if (/^[A-H](?:[、,，\s]*[A-H])*$/.test(text.trim())) p.choices = [...new Set(text.match(/[A-H]/g))];
    else p.carriedAnswer = text;
    p.optionCount = Math.max(p.optionCount, ...p.choices.map(letter => letter.charCodeAt(0) - 64));
  }
  updateStructuredAnswer(p);
  p.answerStatus = p.studentAnswer ? source.answerStatus || 'unknown' : source.answerStatus === 'unanswered' ? 'unanswered' : 'unknown';
  invalidatePaperEvidence(p);
}
function structuredAnswerFields(p,i) {
  if(isChoiceType(p.questionType)){
    return `<div class="field"><span>孩子实际选择（直接点选）</span><div class="answer-choices" role="group" aria-label="孩子实际选择">${Array.from({length:p.optionCount},(_,j)=>String.fromCharCode(65+j)).map(letter=>`<button type="button" class="answer-choice ${p.choices.includes(letter)?'selected':''}" aria-pressed="${p.choices.includes(letter)}" data-answer-choice="${letter}" data-index="${i}">${letter}</button>`).join('')}<label class="choice-count">选项数 <select data-answer-count="options" data-index="${i}">${Array.from({length:7},(_,j)=>j+2).map(n=>`<option ${n===p.optionCount?'selected':''}>${n}</option>`).join('')}</select></label></div><div class="answer-tools"><span data-choice-summary>${esc(p.studentAnswer?'已选：'+p.studentAnswer:'尚未选择')}</span></div>${p.carriedAnswer ? `<p class="hint prose">切换题型前的作答已保留：${esc(p.carriedAnswer)}</p>` : ''}</div>`;
  }
  if (p.orderedAnswers || p.questionType === 'fill') {
    const numbers = ['一','二','三','四','五','六','七','八','九','十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十'];
    const rows = Array.from({length:p.blankCount}, (_, j) => {
      const label = p.blankCount > 1 ? '第' + numbers[j] + '空' : '孩子作答';
      const attributes = `data-blank-answer="${j}" data-index="${i}" aria-label="${label}"`;
      const answer = esc(p.blankAnswers[j] || '');
      const field = p.orderedAnswers
        ? `<textarea rows="1" ${attributes}>${answer}</textarea>`
        : `<input type="text" ${attributes} value="${answer}">`;
      return `<label class="blank-answer-row">${p.blankCount > 1 ? '<span>' + label + '</span>' : ''}${field}</label>`;
    });
    const title = p.blankCount > 1 ? '孩子作答（按原卷顺序）' : '孩子作答';
    return `<div class="field"><div class="answer-tools"><span>${title}</span><label>空数 <input type="number" min="1" max="20" value="${p.blankCount}" data-answer-count="blanks" data-index="${i}"></label></div><div class="blank-answer-list">${rows.join('')}</div></div>`;
  }
  return paperField(p.questionType==='calculation'?'孩子的计算结果与过程':'孩子实际作答','studentAnswer',p.studentAnswer,i,true);
}
function questionNumberPrefix(subject, grade, term, day) {
  const middleGrade = /[（(](初[一二三])[）)]$/.exec(grade)?.[1];
  const shortGrade = middleGrade || (grade.endsWith('年级') ? '小' + grade.slice(0, -2) : grade);
  return `${subject.slice(0, 1)}-${shortGrade}${term}-${day.slice(-6)}-`;
}

function shortQuestionNumber(number) {
  const text = String(number ?? '');
  const legacy = /^([^-]+)-([^-]+)[（(]([上下])[）)]-(\d{8})-(\d+)$/.exec(text);
  if (!legacy) return text;
  const [, subject, grade, term, day, sequence] = legacy;
  return questionNumberPrefix(subject, grade, term, day) + sequence;
}

function questionNumber(subject,date,existing,offset=0,profile=typeof getStudentProfile==='function'?getStudentProfile():{grade:'四年级',term:'上'}) {
  const day = (typeof date === 'string' ? date : new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit'
  }).format(date)).replace(/-/g, '');
  const prefix = questionNumberPrefix(subject, profile.grade, profile.term, day);
  const max = existing.reduce((latest, question) => {
    const number = shortQuestionNumber(question.number);
    return number.startsWith(prefix) ? Math.max(latest, Number(number.slice(prefix.length)) || 0) : latest;
  }, 0);
  return prefix + String(max + offset + 1).padStart(3, '0');
}
function answerReviewFields(p,i) {
  const subject=typeof paper!=='undefined'&&paper?paper.subject:currentSubject;
  ensureAnswerStructure(p,subject);
  if(!p.answerStatus)p.answerStatus='confirmed';
  const options=[['unknown','无法确认孩子作答（只解题，不判断错因）'],['confirmed','已确认孩子的作答'],['unanswered','已确认未作答']];
  return `<div class="answer-review">${p.orderedAnswers ? '' : typeof editableTypeFields==='function'?editableTypeFields(p,i,subject):`<label class="field"><span>题型</span><select data-paper="questionType" data-index="${i}">${questionTypeOptions(subject,p.questionType)}</select></label>`}
    ${typeof readingScopeField === 'function' && ['reading', 'material'].includes(p.questionType) ? `<div data-reading-scope-host="${i}">${readingScopeField(p, i)}</div>` : ''}
    ${p.suggestedQuestionType === p.questionType && !p.questionTypeName ? '<p class="hint">题型由 DeepSeek 建议，可在上方修改。</p>' : ''}
    ${p.ocrStudentAnswer ? '<p class="hint prose">作答转录供核对：' + esc(p.ocrStudentAnswer) + '</p>' : ''}
    ${structuredAnswerFields(p,i)}
    <label class="field"><span>作答证据状态</span><select data-paper="answerStatus" data-index="${i}">${options.map(([v,t])=>`<option value="${v}" ${(p.answerStatus||'unknown')===v?'selected':''}>${t}</option>`).join('')}</select></label>
    <details class="answer-extra" data-answer-extra="${i}" ${p.showAnswerExtra?'open':''}><summary>补充批注与原题视觉信息（选填）</summary>
    ${paperField('批注／订正（不确定是谁写的就注明，不计作原始作答）','annotation',p.annotation||'',i,true)}
    ${paperField('原题视觉信息（如加点的是哪个字、划线范围；不清楚请写无法辨认）','visualFeatures',p.visualFeatures||'',i,true)}
    <p class="result-note">括号、横线是题目的作答位置，不能据此判断手写或已作答。圈画和红勾也不代表已知的原始作答／标准答案。请将手写内容从题干移到对应字段，原卷的错误选项必须保留。</p></details>
    <label class="verify"><input type="checkbox" data-paper="verified" data-index="${i}" ${p.verified?'checked':''}> 已对照图片核对原题、全部选项及作答／批注归属；必要的加点、划线信息已补充</label></div>`;
}
function bindStructuredAnswerFields() {
  const reset=(p,i)=>{invalidatePaperEvidence(p);p.error='';const cb=document.querySelector(`[data-paper="verified"][data-index="${i}"]`);if(cb)cb.checked=false;const state=document.querySelector(`[data-paper="answerStatus"][data-index="${i}"]`);if(state)state.value=p.answerStatus};
  document.querySelectorAll('[data-answer-extra]').forEach(el=>el.ontoggle=()=>{const p=paper?.items[Number(el.dataset.answerExtra)];if(p)p.showAnswerExtra=el.open});
  document.querySelectorAll('[data-answer-choice]').forEach(el=>el.onclick=()=>{
    const i=Number(el.dataset.index),p=paper.items[i],v=el.dataset.answerChoice;
    p.choices=p.choices.includes(v)?p.choices.filter(x=>x!==v):[...p.choices,v];
    updateStructuredAnswer(p);p.answerStatus=p.studentAnswer?'confirmed':'unknown';reset(p,i);
    const pressed = p.choices.includes(v);
    el.classList.toggle('selected', pressed);
    el.setAttribute('aria-pressed', String(pressed));
    el.closest('.field').querySelector('[data-choice-summary]').textContent = p.studentAnswer ? '已选：' + p.studentAnswer : '尚未选择';
    el.closest('.card, .paper-item')?.querySelector('[data-paper-analysis-output]')?.remove();
  });
  document.querySelectorAll('[data-blank-answer]').forEach(el=>el.oninput=()=>{
    const i=Number(el.dataset.index),p=paper.items[i];p.blankAnswers[Number(el.dataset.blankAnswer)]=el.value;updateStructuredAnswer(p);p.answerStatus=p.studentAnswer?'confirmed':'unknown';reset(p,i);
  });
  document.querySelectorAll('[data-answer-count]').forEach(el=>el.onchange=()=>{
    const i=Number(el.dataset.index),p=paper.items[i];
    if(el.dataset.answerCount==='blanks'){
      const lastFilled = p.blankAnswers.findLastIndex(value => String(value || '').trim()) + 1;
      p.blankCount=Math.min(20,Math.max(1,p.orderedAnswers ? lastFilled : 1,Number(el.value)||1));
    }
    else {p.optionCount=Math.min(8,Math.max(2,Number(el.value)||5));p.choices=p.choices.filter(v=>v.charCodeAt(0)-64<=p.optionCount)}
    updateStructuredAnswer(p);p.answerStatus='unknown';reset(p,i);render();
  });
}
function invalidatePaperEvidence(p) {
  p.verified=false;p.analyzed=false;p.answer='';p.analysis='';p.reminder='';p.tags=[];p.aiVerdict='薄弱待练';p.diagnosisStatus='pending';
}
