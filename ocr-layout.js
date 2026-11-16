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
  return {status,answer:status==='confirmed'?String(p.studentAnswer||'').trim():'',annotation:String(p.annotation||''),visualFeatures:String(p.visualFeatures||''),verified:Boolean(p.verified)};
}
function answerReviewFields(p,i) {
  const options=[['unknown','无法确认孩子作答（只解题，不判断错因）'],['confirmed','已确认孩子的作答'],['unanswered','已确认未作答']];
  return `<div class="answer-review"><label class="field"><span>作答证据状态</span><select data-paper="answerStatus" data-index="${i}">${options.map(([v,t])=>`<option value="${v}" ${(p.answerStatus||'unknown')===v?'selected':''}>${t}</option>`).join('')}</select></label>
    ${paperField('孩子实际作答（选择题填 A/B/C/D；填空题按第1空、第2空分别记录）','studentAnswer',p.studentAnswer,i,true)}
    ${paperField('批注／订正（不确定是谁写的就注明，不计作原始作答）','annotation',p.annotation||'',i,true)}
    ${paperField('原题视觉信息（如加点的是哪个字、划线范围；不清楚请写无法辨认）','visualFeatures',p.visualFeatures||'',i,true)}
    <p class="result-note">括号、横线是题目的作答位置，不能据此判断手写或已作答。圈画和红勾也不代表已知的原始作答／标准答案。请将手写内容从题干移到对应字段，原卷的错误选项必须保留。</p>
    <label class="verify"><input type="checkbox" data-paper="verified" data-index="${i}" ${p.verified?'checked':''}> 已对照图片核对原题、全部选项及作答／批注归属；必要的加点、划线信息已补充</label></div>`;
}
function invalidatePaperEvidence(p) {
  p.verified=false;p.analyzed=false;p.answer='';p.analysis='';p.reminder='';p.tags=[];p.aiVerdict='薄弱待练';p.diagnosisStatus='pending';
}
