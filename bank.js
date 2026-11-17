const bankState={items:[],details:new Map(),cursor:'',more:false,key:'',root:''};
function bankGrade(profile=getStudentProfile()){
  const grades=['一年级','二年级','三年级','四年级','五年级','六年级'];
  return profile.stage==='primary'?Math.max(1,grades.indexOf(profile.grade)+1):profile.stage==='middle'?9:12;
}
function bankTopic(id){return BANK_TOPICS.find(t=>t.id===id)}
function methodAllowed(id,profile=getStudentProfile()){
  const state=cfg.methodProgress?.[id];return state==='learned'||state!=='not_yet'&&(BANK_METHODS.find(m=>m.id===id)?.minGrade||99)<=bankGrade(profile);
}
function topicLearned(id,profile=getStudentProfile()){
  const state=cfg.knowledgeProgress?.[id];return ['introduced','practicing','secure'].includes(state)||state!=='unseen'&&(bankTopic(id)?.minGrade||99)<=bankGrade(profile);
}
function bankFits(q,profile=getStudentProfile(),goal='consolidate'){
  const topic=bankTopic(q.knowledgeId);if(!topic||q.reviewStatus!=='checked')return false;
  if(cfg.knowledgeProgress?.[topic.id]==='unseen')return false;
  if(q.grade>bankGrade(profile)&&!['introduced','practicing','secure'].includes(cfg.knowledgeProgress?.[topic.id]))return false;
  if(!q.methods.every(id=>methodAllowed(id,profile))||!q.prerequisites.every(id=>topicLearned(id,profile)))return false;
  return goal==='extend'||q.difficulty<=2;
}
function rankBankItems(items,goal='consolidate'){
  const groups=typeof learningIndex==='function'?learningIndex().groups:[],profile=getStudentProfile(),now=Date.now();
  const score=q=>{const related=groups.filter(g=>g.subject===q.subject&&(!g.grade||g.grade===profile.grade)&&(!g.term||g.term===profile.term)&&q.tags.includes(g.tag));let value=0;
    for(const g of related){value+=3*(g.originalIncorrect+g.practiceIncorrect+g.resultIncorrect)-g.practiceCorrect-g.resultCorrect;if(g.reviewAt&&Date.parse(g.reviewAt)<=now)value+=8}
    const attempts=data.practices.filter(p=>p.bankId===q.id&&!p.assisted),last=attempts.map(p=>Date.parse(p.created)).filter(Number.isFinite).sort((a,b)=>b-a)[0];
    if(last&&now-last<86400000)value-=12;
    value-=Math.abs(q.difficulty-(goal==='extend'?3:related.some(g=>g.originalIncorrect+g.practiceIncorrect+g.resultIncorrect>g.practiceCorrect+g.resultCorrect)?1:2));
    return value;
  };
  return items.map(q=>({q,score:score(q)})).sort((a,b)=>b.score-a.score||a.q.id.localeCompare(b.q.id)).map(({q})=>q);
}
function unifiedProfileFields(){
  return `<details class="unified-profile"><summary>已学内容与解题方法</summary><div class="bank-profile-grid">${BANK_TOPICS.map(t=>`<label class="field"><span>${esc(t.label)}</span><select data-knowledge-progress="${t.id}">${[['','按年级默认'],['unseen','尚未学过'],['introduced','已经接触'],['practicing','能够独立尝试'],['secure','自评比较熟练']].map(([v,label])=>`<option value="${v}" ${(cfg.knowledgeProgress?.[t.id]||'')===v?'selected':''}>${label}</option>`).join('')}</select></label>`).join('')}</div><div class="bank-profile-grid">${BANK_METHODS.map(m=>`<label class="field"><span>${m.label}</span><select data-method-progress="${m.id}">${[['','按年级默认'],['learned','已经学过，可以使用'],['not_yet','尚未学过，暂不使用']].map(([v,label])=>`<option value="${v}" ${(cfg.methodProgress?.[m.id]||'')===v?'selected':''}>${label}</option>`).join('')}</select></label>`).join('')}</div><p class="hint">来源统一记录；接触过和自评熟练不等于客观掌握，实际表现按作答积累。</p></details>`;
}
function unifiedProfilePrompt(){
  const known=BANK_TOPICS.filter(t=>['introduced','practicing','secure'].includes(cfg.knowledgeProgress?.[t.id])).map(t=>t.label);
  const denied=BANK_TOPICS.filter(t=>cfg.knowledgeProgress?.[t.id]==='unseen').map(t=>t.label);
  return '统一学习档案：明确已接触的知识点为'+JSON.stringify(known)+'；明确未学为'+JSON.stringify(denied)+'。可使用的方法为'+JSON.stringify(BANK_METHODS.filter(m=>methodAllowed(m.id)).map(m=>m.label))+'。年级作为默认参考；提升练习可使用明确已学的较高年级内容，不得使用未学方法，也不能把自评当成客观掌握。';
}
function bindUnifiedProfile(){
  for(const [attr,key]of[['knowledge-progress','knowledgeProgress'],['method-progress','methodProgress']])document.querySelectorAll('[data-'+attr+']').forEach(el=>el.onchange=()=>{const id=el.getAttribute('data-'+attr);cfg[key]={...cfg[key]};if(el.value)cfg[key][id]=el.value;else delete cfg[key][id];saveLocalConfig()});
}
function bankKey(){return JSON.stringify([bankState.topic||'',bankState.goal||'consolidate',getStudentProfile().grade,cfg.knowledgeProgress||{},cfg.methodProgress||{},cloudRoot()])}
function bankItemValid(q,detail=false){
  return q&&/^cmath-dev-\d{4}$/.test(q.id)&&q.subject==='数学'&&Number.isInteger(q.grade)&&q.grade>=1&&q.grade<=6&&bankTopic(q.knowledgeId)&&[1,2,3].includes(q.difficulty)&&q.reviewStatus==='checked'&&typeof q.text==='string'&&q.text.length<=4000&&Array.isArray(q.tags)&&q.tags.every(t=>typeof t==='string')&&Array.isArray(q.methods)&&q.methods.every(id=>BANK_METHODS.some(m=>m.id===id))&&Array.isArray(q.prerequisites)&&q.prerequisites.every(id=>bankTopic(id))&&q.license==='CC BY 4.0'&&/^https:\/\/github\.com\/XiaoMi\/cmath\/blob\/[a-f0-9]{40}\/datasets\/cmath_dev\.jsonl#L\d+$/.test(q.originUrl)&&(!detail||typeof q.answer==='string'&&typeof q.analysis==='string'&&typeof q.numericAnswer==='string'&&typeof q.unit==='string');
}
async function saveBankCache(){if(!db)return;const tx=db.transaction('data','readwrite');tx.objectStore('data').put({root:bankState.root,items:bankState.items.slice(0,100),details:[...bankState.details].slice(-100)},'bank-cache:v1');await new Promise((ok,no)=>{tx.oncomplete=ok;tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error)})}
async function restoreBankCache(){if(!db)return;try{const saved=await req(db.transaction('data').objectStore('data').get('bank-cache:v1'));if(saved&&saved.root===cloudRoot()){bankState.root=saved.root;bankState.items=(saved.items||[]).filter(q=>bankItemValid(q));bankState.details=new Map((saved.details||[]).filter(([,q])=>bankItemValid(q,true)));bankState.key=bankKey()}}catch{/* Public cache is disposable; notebook remains independent. */}}
async function loadBank(more=false){
  const key=bankKey(),root=cloudRoot(),learned=BANK_TOPICS.filter(t=>['introduced','practicing','secure'].includes(cfg.knowledgeProgress?.[t.id])).map(t=>t.id);
  const params=new URLSearchParams({subject:'数学',grade:String(bankGrade()),limit:'20',topic:bankState.topic||'',learned:learned.join(',')});
  if(more&&key===bankState.key&&bankState.cursor)params.set('after',bankState.cursor);
  const result=await(await cloudRequest(root,'/api/bank?'+params)).json();
  if(key!==bankKey())return;
  if(!Array.isArray(result.items)||result.items.length>20||!result.items.every(q=>bankItemValid(q)))throw Error('题库返回格式不符合要求，未采用');
  if(bankState.root!==root)bankState.details.clear();
  bankState.root=root;bankState.items=more&&bankState.key===key?[...new Map([...bankState.items,...result.items].map(q=>[q.id,q])).values()].slice(-100):result.items;
  bankState.key=key;bankState.cursor=result.cursor||'';bankState.more=Boolean(result.more);await saveBankCache();
  if(current()==='variants')render();
}
async function startBankPractice(id){
  const root=cloudRoot();let q=bankState.root===root?bankState.details.get(id):null;
  if(!q){q=(await(await cloudRequest(root,'/api/bank/item?id='+encodeURIComponent(id))).json()).item;if(!bankItemValid(q,true))throw Error('题目详情不完整，未采用');bankState.details.set(id,q);bankState.root=root;await saveBankCache()}
  if(!bankFits(q,getStudentProfile(),bankState.goal||'consolidate'))throw Error('此题不符合当前已学内容或解题方法，请先核对学情档案');
  const p=getStudentProfile();practice={sourceKind:'bank',sourceId:q.id,bankId:q.id,number:q.id,subject:q.subject,grade:p.grade,term:p.term,tags:q.tags,knowledgeId:q.knowledgeId,originUrl:q.originUrl,attribution:q.attribution,license:q.license,difficulty:['','基础','巩固','提升'][q.difficulty],items:[{text:q.text,answer:q.answer,analysis:q.analysis,numericAnswer:q.numericAnswer,unit:q.unit,originUrl:q.originUrl}]};render();$('#exercise')?.scrollIntoView({behavior:'smooth'});
}
async function makeBankVariant(id){
  await startBankPractice(id);const q=practice.items[0],source=bankState.details.get(id),profile=getStudentProfile();
  const r=await ai(`围绕这道已复算的数学母题生成1道新练习，改变情境或数值，保留考点、条件充分。练习目标：${bankState.goal==='extend'?'提升':'巩固'}。原题：${q.text}。参考解法：${q.analysis}。返回 JSON {"items":[{"text":"完整题干","answer":"答案","analysis":"解析"}]}。`,undefined,{learning:{subject:'数学',text:q.text,tags:source.tags}});
  if(!Array.isArray(r.items)||r.items.length!==1||r.items.some(i=>typeof i.text!=='string'||!i.text||typeof i.answer!=='string'||!i.answer||typeof i.analysis!=='string'||!i.analysis))throw Error('AI 变式不完整，保留原题练习');
  practice={...practice,sourceKind:'bank-variant',grade:profile.grade,term:profile.term,items:r.items};render();$('#exercise')?.scrollIntoView({behavior:'smooth'});
}
function numericFraction(text){
  if(!/^[+-]?\d{1,12}(?:\.\d{1,8})?(?:\/\d{1,12})?$/.test(text))return null;
  const [decimal,divisor='1']=text.split('/'),[whole,fraction='']=decimal.split('.');const denominator=10n**BigInt(fraction.length)*BigInt(divisor);if(!denominator)return null;
  return {n:BigInt((whole.startsWith('-')?'-':'')+whole.replace(/^[+-]/,'')+fraction),d:denominator};
}
function bankAttribution(items){
  const rows=items.filter(q=>q.originUrl&&q.license==='CC BY 4.0');if(!rows.length)return '';
  return `<div class="bank-attribution" style="font-size:10px;color:#6b7280;margin-top:16px">题库来源：CMATH（Tianwen Wei, Jian Luan, Wei Liu, Shuang Dong, Bin Wang，2023），<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>。本系统补充解析、标签和适用范围，不代表原作者背书。原题：${rows.map(q=>`<a href="${esc(q.originUrl)}" target="_blank" rel="noopener">${esc(q.id)}</a>`).join(' · ')}。</div>`;
}
function checkBankNumber(response,expected,unit){
  const value=String(response).trim().replace(/[０-９]/g,c=>String(c.charCodeAt(0)-65296));
  const match=value.match(/^([+-]?\d+(?:\.\d+)?(?:\/\d+)?)(.*)$/);if(!match)return {status:'unknown',feedback:'这里只核对单一数值；完整解题过程可自查解析或主动使用 AI 批改。'};
  const enteredUnit=match[2].trim().replace(/^[（(]|[）)]$/g,'');
  if(enteredUnit&&enteredUnit!==unit)return {status:'unknown',feedback:'单位与本题要求不同，暂不判断；请按题目单位填写数值，或核对解析。'};
  const a=numericFraction(match[1]),b=numericFraction(expected);if(!a||!b)return {status:'unknown',feedback:'数值格式暂不支持，请自查解析或使用 AI 批改。'};
  const same=a.n*b.d===b.n*a.d;
  return {status:same?'correct':'incorrect',feedback:same?'数值与已复算参考答案一致；解题步骤及单位仍需核对。':'数值与已复算参考答案不同，请对照解析检查。这里只判断数值，不推断错因。'};
}
function bindBank(){
  document.querySelectorAll('[id^="response-"]').forEach(el=>el.oninput=()=>{const i=Number(el.id.slice(9)),p=practice?.items[i];if(!p||p.saved||el.value===p.response)return;if(p.revealed)p.answerViewed=true;p.response=el.value;p.aiStatus='';p.aiFeedback='';p.resultCheck='';p.checkFeedback='';p.suggestedRating='';p.revealed=false;el.closest('.practice-card')?.querySelectorAll('.ai-eval-box,.bank-check-feedback').forEach(node=>node.remove());$('#solution-'+i)?.classList.add('hidden')});
  if($('#bank-topic'))$('#bank-topic').onchange=e=>{bankState.topic=e.target.value;bankState.cursor='';bankState.more=false;render()};
  if($('#bank-goal'))$('#bank-goal').onchange=e=>{bankState.goal=e.target.value;render()};
  if($('#bank-load'))$('#bank-load').onclick=e=>run(e.target,()=>loadBank(false));
  if($('#bank-more'))$('#bank-more').onclick=e=>run(e.target,()=>loadBank(true));
  if($('#bank-login'))$('#bank-login').onclick=()=>window.open(cloudRoot()+'/api/session','_blank','noopener');
  document.querySelectorAll('[data-bank-start]').forEach(b=>b.onclick=e=>run(e.target,()=>startBankPractice(b.dataset.bankStart)));
  document.querySelectorAll('[data-bank-variant]').forEach(b=>b.onclick=e=>run(e.target,()=>makeBankVariant(b.dataset.bankVariant)));
  document.querySelectorAll('[data-bank-check]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.bankCheck),p=practice.items[i],value=$('#response-'+i).value.trim();if(!value){toast('请先填写作答');return}const result=checkBankNumber(value,p.numericAnswer,p.unit);p.response=value;p.resultCheck=result.status;p.checkFeedback=result.feedback;p.revealed=true;render()});
}
