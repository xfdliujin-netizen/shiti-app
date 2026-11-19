const cloudRuntime = {
  started: false, syncing: null, pending: false, timer: null, due: 0,
  socket: null, socketRoot: '', socketRetryAt: 0, socketFailures: 0,
  failures: 0, profile: '', status: '', refreshNeeded: false
};

function cloudSettings() {
  return `${field('云端接口地址','cloud-endpoint',cfg.cloudEndpoint||'https://api.86518925.xyz','url')}
    <label class="verify"><input type="checkbox" id="cloud-auto-sync" ${cfg.cloudAutoSync !== false ? 'checked' : ''}>自动同步此设备</label>
    <div class="actions"><button class="secondary" id="cloud-login">打开云端登录</button><button class="primary" id="cloud-sync">立即同步</button></div>
    <p class="result-note" id="cloud-sync-status" role="status">${esc(cloudRuntime.status || '登录后即可同步')}</p>
    <p class="hint">应用打开时自动同步。离线更改保存在本机，重新联网后补传。同一记录同时修改会提示冲突。</p>`;
}
function cloudRoot(useForm = false) {
  const value=((useForm && $('#cloud-endpoint')?.value)||cfg.cloudEndpoint||'https://api.86518925.xyz').trim();
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('云端接口请填写 HTTPS 域名，不带路径');
  return url.origin;
}
function bindCloudSettings() {
  const save=()=>{cfg.cloudEndpoint=cloudRoot(true);saveLocalConfig();return cfg.cloudEndpoint};
  $('#cloud-login').onclick=()=>{try{window.open(save()+'/api/session','_blank','noopener')}catch(e){toast(e.message)}};
  $('#cloud-sync').onclick=e=>run(e.target,async()=>{save();await runCloudSync();toast('云端同步完成')});
  $('#cloud-auto-sync').onchange = event => {
    cfg.cloudAutoSync = event.target.checked;
    saveLocalConfig();
    if (cfg.cloudAutoSync) queueCloudSync(0);
    else {
      clearTimeout(cloudRuntime.timer);
      cloudRuntime.timer = null;
      closeCloudSocket();
      setCloudStatus('自动同步已关闭');
    }
  };
}

function setCloudStatus(message) {
  cloudRuntime.status = message;
  const status = $('#cloud-sync-status');
  if (status) status.textContent = message;
}

function queueCloudSync(delay = 450) {
  if (!cloudRuntime.started || cfg.cloudAutoSync === false || navigator.onLine === false) return;
  if (cloudRuntime.syncing) {
    cloudRuntime.pending = true;
    return;
  }
  const due = Date.now() + delay;
  if (cloudRuntime.timer !== null && cloudRuntime.due <= due) return;
  clearTimeout(cloudRuntime.timer);
  cloudRuntime.due = due;
  cloudRuntime.timer = setTimeout(() => {
    cloudRuntime.timer = null;
    runCloudSync().catch(() => {});
  }, delay);
}

function closeCloudSocket() {
  const socket = cloudRuntime.socket;
  cloudRuntime.socket = null;
  cloudRuntime.socketRoot = '';
  cloudRuntime.socketRetryAt = 0;
  cloudRuntime.socketFailures = 0;
  socket?.close();
}

function connectCloudSocket(root) {
  if (!cloudRuntime.started || cfg.cloudAutoSync === false || typeof WebSocket !== 'function') return;
  if (cloudRuntime.socket && cloudRuntime.socketRoot !== root) closeCloudSocket();
  if (cloudRuntime.socket || cloudRuntime.socketRetryAt > Date.now()) return;
  const socket = new WebSocket(root.replace(/^https:/, 'wss:') + '/api/live');
  cloudRuntime.socket = socket;
  cloudRuntime.socketRoot = root;
  socket.onopen = () => {
    if (cloudRuntime.socket !== socket) return;
    cloudRuntime.socketFailures = 0;
    queueCloudSync(0);
  };
  socket.onmessage = event => {
    if (cloudRuntime.socket === socket && event.data === 'changed') queueCloudSync(200);
  };
  socket.onclose = () => {
    if (cloudRuntime.socket !== socket) return;
    cloudRuntime.socket = null;
    const delay = Math.min(60000, 1500 * 2 ** Math.min(cloudRuntime.socketFailures++, 6));
    cloudRuntime.socketRetryAt = Date.now() + delay;
    queueCloudSync(delay);
  };
}

function refreshCloudView() {
  if (!cloudRuntime.refreshNeeded || busy || document.querySelector('dialog[open]') ||
      document.activeElement?.matches?.('input, textarea, select, [contenteditable]')) return;
  const tab = current();
  if (!['notebook', 'libraries', 'variants', 'exam'].includes(tab)) return;
  cloudRuntime.refreshNeeded = false;
  render();
}

function runCloudSync() {
  if (cloudRuntime.syncing) return cloudRuntime.syncing;
  clearTimeout(cloudRuntime.timer);
  cloudRuntime.timer = null;
  cloudRuntime.pending = false;
  let retry = null;
  cloudRuntime.syncing = syncCloud().then(({ root, changed }) => {
    cloudRuntime.failures = 0;
    setCloudStatus(cfg.cloudAutoSync === false ? '自动同步已关闭 · 手动同步完成' : '已同步 · ' + new Date().toLocaleTimeString('zh-CN'));
    if (changed) {
      cloudRuntime.refreshNeeded = true;
      refreshCloudView();
    }
    try { connectCloudSocket(root); } catch { /* Periodic reconciliation remains available. */ }
  }).catch(error => {
    setCloudStatus(error.message);
    retry = error.code === 'local-change' ? 450 : Math.min(120000, 5000 * 2 ** Math.min(cloudRuntime.failures++, 5));
    throw error;
  }).finally(() => {
    cloudRuntime.syncing = null;
    if (retry !== null) queueCloudSync(retry);
    else if (cloudRuntime.pending) queueCloudSync(0);
  });
  return cloudRuntime.syncing;
}

function startCloudAutosync() {
  if (!db || cloudRuntime.started || typeof navigator === 'undefined') return;
  cloudRuntime.started = true;
  cloudRuntime.profile = JSON.stringify(cloudProfilePayload());
  window.addEventListener('online', () => queueCloudSync(0));
  window.addEventListener('focus', () => queueCloudSync(0));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) queueCloudSync(0); });
  document.addEventListener('focusout', () => setTimeout(refreshCloudView, 0));
  document.addEventListener('close', () => setTimeout(refreshCloudView, 0), true);
  setInterval(() => { if (!document.hidden) queueCloudSync(0); }, 60000);
  queueCloudSync(0);
}

function queueCloudProfileSync() {
  if (!cloudRuntime.started) return;
  const profile = JSON.stringify(cloudProfilePayload());
  if (profile === cloudRuntime.profile) return;
  cloudRuntime.profile = profile;
  queueCloudSync();
}
async function cloudRequest(root,path,options={}) {
  let r;try{r=await fetch(root+path,{...options,credentials:'include',redirect:'error',signal:AbortSignal.timeout(30000)})}catch{throw Error('云端连接失败：请先打开云端登录，并确认服务已部署、Access 跨域预检已配置')}
  if(!r.ok){let detail;try{detail=(await r.json()).error}catch{}throw Error(detail||`云端请求失败（${r.status}），请重新登录`)}
  return r;
}
async function cloudHash(value) {
  const bytes=typeof value==='string'?new TextEncoder().encode(value):value;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
}
async function compressCloudImage(src) {
  if(!/^data:image\//.test(src)||src.length>30*1024*1024)throw Error('题图格式或大小无效，请重新裁剪');
  const img=new Image();img.src=src;await img.decode();
  if(img.width*img.height>40000000)throw Error('题图尺寸过大，请先裁剪');
  const canvas=document.createElement('canvas'),scale=Math.min(1,1600/Math.max(img.width,img.height));
  canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  for(const quality of [.85,.75,.65,.55]) {
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
    if(blob&&blob.size<=300000)return new Uint8Array(await blob.arrayBuffer());
  }
  throw Error('题图压缩后仍超过 300 KB，请缩小裁剪范围；本地图保留');
}
async function cloudDataURL(response) {
  const blob=await response.blob();return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('题图读取失败'));r.readAsDataURL(blob)});
}
function cloudProfilePayload() {
  const profile = getStudentProfile();
  return {stage:cfg.stage||'primary',grade:profile.grade,term:profile.term||'上',region:profile.region,teachingStyle:cfg.teachingStyle||'step',teachingFocus:cfg.teachingFocus||'understanding',knowledgeProgress:cfg.knowledgeProgress||{},methodProgress:cfg.methodProgress||{},bankReviewed:cfg.bankReviewed||[],sourceChoices:cfg.sourceChoices,typeChoices:cfg.typeChoices};
}
function cloudEntries(notebook) {
  const result=new Map();
  for(const [kind,list] of [['question',notebook.questions],['practice',notebook.practices]])for(const p of list)result.set(kind+':'+p.id,{kind,id:p.id,payload:p,deleted:false});
  for(const [id,updated] of Object.entries(notebook.deleted)) {
    if(id.startsWith('exam:'))continue;
    if(id.startsWith('profile:')){const recordId=id.slice(8);result.set('profile:'+recordId,{kind:'profile',id:recordId,payload:{updated},deleted:true});continue}
    // Existing application uses a shared tombstone namespace; preserve its semantics.
    for(const kind of ['question','practice'])result.set(kind+':'+id,{kind,id,payload:{updated},deleted:true});
  }
  if(typeof extraCloudEntries==='function')for(const entry of extraCloudEntries(notebook))result.set(entry.kind+':'+entry.id,entry);
  result.set('profile:student',{kind:'profile',id:'student',payload:cloudProfilePayload(),deleted:false});
  return result;
}
async function syncCloud() {
  if(!db)throw Error('本地数据库不可用，请先导出备份');
  const root=cloudRoot(),stateKey='cloud-state:'+root;
  const state=(await req(db.transaction('data').objectStore('data').get(stateKey)))||{cursor:0,base:{}};
  const collections=typeof extraCloudEntries==='function';
  if(collections&&state.collectionsVersion!==1){state.cursor=0;state.collectionsVersion=1}
  const initial=data,profileInitial=JSON.stringify(cloudProfilePayload());
  const entries=cloudEntries(data),pending=new Map();
  for(const [key,entry] of entries){const hash=await cloudHash(JSON.stringify(entry));if(hash!==state.base[key]?.hash)pending.set(key,{...entry,hash})}
  let cursor=state.cursor;const received=[];
  for(let page=0;;page++) {
    if(page>=400)throw Error('本次同步记录过多，请联系管理员分批迁移');
    const result=await(await cloudRequest(root,'/api/changes?after='+cursor+(collections?'&collections=1':''))).json();
    received.push(...result.items);cursor=result.cursor;if(!result.more)break;
  }
  // Abort before applying anything when concurrent edits are detected.
  for(const r of received){const key=r.kind+':'+r.id;if(pending.has(key)&&r.revision!==(state.base[key]?.revision||0)) {
    const normalized={kind:r.kind,id:r.id,payload:r.payload,deleted:Boolean(r.deleted)};
    if(r.kind==='profile'&&r.id==='student'&&!state.base[key]){pending.delete(key);continue}
    if(!r.payload.cloudImage&&await cloudHash(JSON.stringify(normalized))===pending.get(key).hash){pending.delete(key);continue}
    throw Error('同步冲突：'+r.id+' 已在另一设备修改。本地内容已保留，请导出备份后核对；没有覆盖云端');
  }}
  let next,profile;
  for(const r of received) {
    const key=r.kind+':'+r.id;if(pending.has(key))continue;
    if(r.revision===state.base[key]?.revision)continue;
    if(r.kind==='profile'){
      const target=typeof extraCloudTarget==='function'?extraCloudTarget(r.id):null;
      if(target){next||=structuredClone(initial);const list=next[target.list]||=[];const index=list.findIndex(p=>p.id===target.id);if(r.deleted){if(index>=0)list.splice(index,1);next.deleted['profile:'+r.id]=r.payload.updated}else{if(r.payload.id!==target.id)throw Error('云端错题本或题库编号不一致');if(index>=0)list[index]=r.payload;else list.push(r.payload);delete next.deleted['profile:'+r.id]}}
      else if(r.id==='student')profile=r.payload;
      state.base[key]={revision:r.revision,hash:await cloudHash(JSON.stringify({kind:r.kind,id:r.id,payload:r.payload,deleted:Boolean(r.deleted)}))};continue;
    }
    next||=structuredClone(initial);
    const list=r.kind==='question'?next.questions:next.practices;
    const index=list.findIndex(q=>q.id===r.id);
    if(r.deleted){if(index>=0)list.splice(index,1);next.deleted[r.id]=r.payload.updated}
    else {
      const p={...r.payload};if(p.cloudImage)p.image=await cloudDataURL(await cloudRequest(root,'/api/image?id='+p.cloudImage));
      if(index>=0)list[index]=p;else list.push(p);delete next.deleted[r.id];
    }
    const entry=r.deleted?{kind:r.kind,id:r.id,payload:{updated:r.payload.updated},deleted:true}:{kind:r.kind,id:r.id,payload:list.find(q=>q.id===r.id),deleted:false};
    state.base[key]={revision:r.revision,hash:await cloudHash(JSON.stringify(entry))};
  }
  if(data!==initial||JSON.stringify(cloudProfilePayload())!==profileInitial||cloudRoot()!==root) {
    throw Object.assign(Error('同步期间本地内容发生变化，正在等待重试'),{code:'local-change'});
  }
  if(next){validate(next);await persist(next,{sync:false})}
  if(profile){cfg.stage=profile.stage;cfg.grade=profile.grade;cfg.term=['上','下'].includes(profile.term)?profile.term:getStudentProfile().term;cfg.region=profile.region;cfg.teachingStyle=profile.teachingStyle||'step';cfg.teachingFocus=profile.teachingFocus||'understanding';cfg.knowledgeProgress=profile.knowledgeProgress||{};cfg.methodProgress=profile.methodProgress||{};cfg.bankReviewed=profile.bankReviewed||[];if(Array.isArray(profile.sourceChoices))cfg.sourceChoices=profile.sourceChoices;if(profile.typeChoices&&typeof profile.typeChoices==='object')cfg.typeChoices=profile.typeChoices;cloudRuntime.profile=JSON.stringify(cloudProfilePayload());saveLocalConfig(false)}
  if(next||profile)await cloudSaveState(stateKey,state);
  // Persist progress per accepted record. Conflicts and interruptions never overwrite remote edits.
  for(const [key,entry] of pending) {
    const payload={...entry.payload};
    if(payload.image){const bytes=await compressCloudImage(payload.image),id=await cloudHash(bytes);await cloudRequest(root,'/api/image?id='+id,{method:'PUT',headers:{'Content-Type':'image/jpeg'},body:bytes});payload.cloudImage=id}
    delete payload.image;
    const result=await(await cloudRequest(root,'/api/record',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:entry.kind,id:entry.id,payload,deleted:entry.deleted,revision:state.base[key]?.revision||0})})).json();
    state.base[key]={revision:result.revision,hash:entry.hash};
    await cloudSaveState(stateKey,state);
  }
  state.cursor=cursor;await cloudSaveState(stateKey,state);
  if($('#save-status'))$('#save-status').textContent='已完成云端同步';
  return {root,changed:Boolean(next||profile)};
}
async function cloudSaveState(key,state) {
  const tx=db.transaction('data','readwrite');tx.objectStore('data').put(state,key);
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});
}
