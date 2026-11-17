let activeNotebook='all';
const DEFAULT_NOTEBOOK='default';
function notebookList(notebook=data){return [{id:DEFAULT_NOTEBOOK,name:'未分类',subject:'全部',color:'blue'},...(notebook.notebooks||[])]}
function questionNotebook(q,notebook=data){return notebookList(notebook).some(b=>b.id===q.notebookId)?q.notebookId:DEFAULT_NOTEBOOK}
function captureNotebookId(){return DEFAULT_NOTEBOOK}
// Retained only for compatibility with previously synced notebook metadata.
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
