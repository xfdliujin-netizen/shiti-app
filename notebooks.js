let activeNotebook='all';
const DEFAULT_NOTEBOOK='default';
function notebookList(notebook=data){return [{id:DEFAULT_NOTEBOOK,name:'未分类',subject:'全部',color:'blue'},...(notebook.notebooks||[])]}
function questionNotebook(q,notebook=data){return notebookList(notebook).some(b=>b.id===q.notebookId)?q.notebookId:DEFAULT_NOTEBOOK}
function captureNotebookId(){const id=$('#capture-notebook')?.value||cfg.lastNotebookId||DEFAULT_NOTEBOOK;return notebookList().some(b=>b.id===id)?id:DEFAULT_NOTEBOOK}
function notebookOptions(id){return notebookList().map(b=>`<option value="${b.id}" ${b.id===id?'selected':''}>${esc(b.name)}</option>`).join('')}
function captureNotebookField(){if(!(data.notebooks||[]).length)return '';return `<label class="capture-destination"><span>收录到</span><select id="capture-notebook">${notebookOptions(activeNotebook!=='all'?activeNotebook:captureNotebookId())}</select></label>`}
function paperNotebookField(){if(!(data.notebooks||[]).length)return '';return `<label class="paper-destination"><span>错题本</span><select id="paper-notebook">${notebookOptions(paper.notebookId||captureNotebookId())}</select></label>`}
function notebooksPanel(){
  if(!notebookList().some(b=>b.id===activeNotebook)&&activeNotebook!=='all')activeNotebook='all';
  const hasBooks=Boolean(data.notebooks?.length),all=hasBooks?notebookList().filter(b=>b.id!==DEFAULT_NOTEBOOK||data.questions.some(q=>questionNotebook(q)===DEFAULT_NOTEBOOK)):[];return `<section class="notebook-shelf ${hasBooks?'':'no-custom-books'}"><div class="section-title">${hasBooks?'<h2>我的错题本</h2>':''}${activeNotebook!=='all'?'<button type="button" class="text-button" data-notebook="all">← 全部错题</button>':''}<button type="button" class="primary small-button" id="create-notebook">＋ 新建错题本</button></div>${hasBooks?'<div class="notebook-grid">':''}${all.map(b=>`<button type="button" class="notebook-tile ${activeNotebook===b.id?'selected':''}" data-notebook="${b.id}"><span class="notebook-cover ${b.color||'blue'}">▤</span><strong>${esc(b.name)}</strong><small>${data.questions.filter(q=>questionNotebook(q)===b.id).length} 题 · ${esc(b.subject||'全部')}</small></button>`).join('')}${hasBooks?'</div>':''}${activeNotebook!=='all'&&activeNotebook!==DEFAULT_NOTEBOOK?'<div class="notebook-manage"><button type="button" class="text-button" id="rename-notebook">重命名</button><button type="button" class="text-button" id="delete-notebook">删除空本</button></div>':''}</section><dialog id="notebook-editor" class="compact-dialog"><form id="notebook-form"><div class="card-head"><h2 id="notebook-editor-title">新建错题本</h2><button type="button" class="dialog-x" id="notebook-cancel" aria-label="关闭">×</button></div><label class="field"><span>名称</span><input id="notebook-name" maxlength="40" required placeholder="例如：语文积累、数学专项"></label><label class="field"><span>科目</span><select id="notebook-subject"><option>全部</option>${subjects.map(s=>`<option>${s}</option>`).join('')}</select></label><label class="field"><span>封面颜色</span><select id="notebook-color">${[['blue','蓝色'],['green','绿色'],['purple','紫色'],['orange','橙色']].map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label><button class="primary" type="submit">保存错题本</button></form></dialog>`;
}
async function saveNotebook({id,name,subject='全部',color='blue'}){
  name=String(name||'').trim();if(!name||name.length>40)throw Error('请输入1～40字的错题本名称');
  if(notebookList().some(b=>b.name===name&&b.id!==id))throw Error('已存在同名错题本');
  if(!['全部',...subjects].includes(subject)||!['blue','green','purple','orange'].includes(color))throw Error('错题本设置无效');
  if((data.notebooks||[]).length>=100&&!id)throw Error('最多创建100个错题本');
  const previous=(data.notebooks||[]).find(b=>b.id===id),now=stamp();
  const book={id:id||'nb-'+uid().replace(/-/g,''),name,subject,color,created:previous?.created||now,updated:now};
  await persist({...data,notebooks:[...(data.notebooks||[]).filter(b=>b.id!==book.id),book]});return book;
}
function bindNotebooks(){
  if($('#capture-notebook'))$('#capture-notebook').onchange=e=>{cfg.lastNotebookId=e.target.value;saveLocalConfig()};
  document.querySelectorAll('[data-notebook]').forEach(b=>b.onclick=()=>{activeNotebook=b.dataset.notebook;query='';filter='全部';aiFilter='全部';render()});
  if($('#create-notebook'))$('#create-notebook').onclick=()=>openNotebookEditor();
  if($('#rename-notebook'))$('#rename-notebook').onclick=()=>openNotebookEditor(activeNotebook);
  if($('#delete-notebook'))$('#delete-notebook').onclick=e=>run(e.target,async()=>{if(data.questions.some(q=>questionNotebook(q)===activeNotebook))throw Error('请先把本内题目移出，才能删除错题本');const id=activeNotebook;await persist({...data,notebooks:(data.notebooks||[]).filter(b=>b.id!==id),deleted:{...data.deleted,['profile:notebook:'+id]:stamp()}});activeNotebook='all';render()});
  if($('#notebook-cancel'))$('#notebook-cancel').onclick=()=>$('#notebook-editor').close();
  if($('#detail-notebook'))$('#detail-notebook').onchange=e=>{const qid=e.target.dataset.id,id=e.target.value;run(e.target,async()=>{await persist({...data,questions:data.questions.map(q=>q.id===qid?{...q,notebookId:id,updated:stamp()}:q)});$('#detail').close();render();toast('已移动到目标错题本')})};
}
function openNotebookEditor(id){
  const book=(data.notebooks||[]).find(b=>b.id===id),dlg=$('#notebook-editor');$('#notebook-editor-title').textContent=book?'编辑错题本':'新建错题本';$('#notebook-name').value=book?.name||'';$('#notebook-subject').value=book?.subject||'全部';$('#notebook-color').value=book?.color||'blue';
  $('#notebook-form').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{const saved=await saveNotebook({id:book?.id,name:$('#notebook-name').value,subject:$('#notebook-subject').value,color:$('#notebook-color').value});activeNotebook=saved.id;dlg.close();render()})};dlg.showModal();$('#notebook-name').focus();
}
function extraCloudEntries(notebook){
  return [...(notebook.notebooks||[]).map(p=>({kind:'profile',id:'notebook:'+p.id,payload:p,deleted:false})),...(notebook.bankRecords||[]).map(p=>({kind:'profile',id:'library:'+p.id,payload:p,deleted:false}))];
}
function extraCloudTarget(id){return id.startsWith('notebook:')?{list:'notebooks',id:id.slice(9)}:id.startsWith('library:')?{list:'bankRecords',id:id.slice(8)}:null}
function validateExtraData(notebook){
  if(notebook.notebooks!==undefined){if(!Array.isArray(notebook.notebooks)||notebook.notebooks.length>100)throw Error('错题本数据无效');const ids=new Set();for(const b of notebook.notebooks){if(!b||!/^nb-[a-zA-Z0-9]{20,60}$/.test(b.id)||ids.has(b.id)||typeof b.name!=='string'||!b.name.trim()||b.name.length>40||!['全部',...subjects].includes(b.subject)||!['blue','green','purple','orange'].includes(b.color)||!Number.isFinite(Date.parse(b.updated))||!Number.isFinite(Date.parse(b.created)))throw Error('错题本数据无效');ids.add(b.id)}}
  if(notebook.bankRecords!==undefined){
    if(!Array.isArray(notebook.bankRecords)||notebook.bankRecords.length>1000)throw Error('题库缓存数据过多');
    const ids=new Set();
    for(const r of notebook.bankRecords){
      if(!r||!/^lib-[a-f0-9]{24}$/.test(r.libraryId)||ids.has(r.id)||!['meta','part'].includes(r.type)||new TextEncoder().encode(JSON.stringify(r)).length>48000||!Number.isFinite(Date.parse(r.updated))||!Number.isFinite(Date.parse(r.created)))throw Error('题库记录无效');
      if(r.type==='part'){
        if(!new RegExp('^part-'+r.libraryId+'-[0-9]{1,3}$').test(r.id)||!Array.isArray(r.questions)||!r.questions.length||r.questions.length>10)throw Error('题库分块无效');
        for(const q of r.questions)if(!q||!/^liq-[a-f0-9]{12}-[0-9]{1,3}$/.test(q.id)||typeof q.text!=='string'||typeof q.answer!=='string'||typeof q.analysis!=='string'||!Array.isArray(q.tags)||q.tags.some(t=>typeof t!=='string')||!['external','cmath'].includes(q.sourceType)||q.grade!==null&&(!Number.isInteger(q.grade)||q.grade<1||q.grade>12))throw Error('题库题目无效');
      }else if(r.id!=='meta-'+r.libraryId||typeof r.name!=='string'||!r.name.trim()||r.name.length>120||typeof r.source!=='string'||typeof r.license!=='string'||!Number.isInteger(r.count)||r.count<1||r.count>500||!Array.isArray(r.parts)||!r.parts.length||r.parts.length>100||new Set(r.parts).size!==r.parts.length||r.parts.some(id=>!new RegExp('^part-'+r.libraryId+'-[0-9]{1,3}$').test(id)))throw Error('题库目录无效');
      ids.add(r.id);
    }
  }
}
