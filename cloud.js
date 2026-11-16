/* Explicit cloud sync. Offline notebook remains authoritative until a successful merge. */
function cloudSettings() {
  return `${field('云端接口地址','cloud-endpoint',cfg.cloudEndpoint||'https://api.86518925.xyz','url')}<div class="actions"><button class="secondary" id="cloud-login">打开云端登录</button><button class="primary" id="cloud-sync">合并并同步</button></div><p class="hint">同步为手动触发；同一记录在两台设备同时修改时停止并提示，不覆盖。密钥不会上传。</p>`;
}
function cloudRoot() {
  const value=($('#cloud-endpoint')?.value||cfg.cloudEndpoint||'https://api.86518925.xyz').trim();
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('云端接口请填写 HTTPS 域名，不带路径');
  return url.origin;
}
function bindCloudSettings() {
  const save=()=>{cfg.cloudEndpoint=cloudRoot();saveLocalConfig();return cfg.cloudEndpoint};
  $('#cloud-login').onclick=()=>{try{window.open(save()+'/api/session','_blank','noopener')}catch(e){toast(e.message)}};
  $('#cloud-sync').onclick=e=>run(e.target,async()=>{save();await syncCloud();toast('云端同步完成');render()});
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
function cloudEntries(notebook) {
  const result=new Map();
  for(const [kind,list] of [['question',notebook.questions],['practice',notebook.practices]])for(const p of list)result.set(kind+':'+p.id,{kind,id:p.id,payload:p,deleted:false});
  for(const [id,updated] of Object.entries(notebook.deleted)) {
    // Existing application uses a shared tombstone namespace; preserve its semantics.
    for(const kind of ['question','practice'])result.set(kind+':'+id,{kind,id,payload:{updated},deleted:true});
  }
  result.set('profile:student',{kind:'profile',id:'student',payload:{stage:cfg.stage||'primary',grade:getStudentProfile().grade,region:getStudentProfile().region,teachingStyle:cfg.teachingStyle||'step',teachingFocus:cfg.teachingFocus||'understanding'},deleted:false});
  return result;
}
async function syncCloud() {
  if(!db)throw Error('本地数据库不可用，请先导出备份');
  const root=cloudRoot(),stateKey='cloud-state:'+root;
  const state=(await req(db.transaction('data').objectStore('data').get(stateKey)))||{cursor:0,base:{}};
  const initial=JSON.stringify(data),profileInitial=JSON.stringify(cloudEntries(data).get('profile:student').payload);
  const entries=cloudEntries(data),pending=new Map();
  for(const [key,entry] of entries){const hash=await cloudHash(JSON.stringify(entry));if(hash!==state.base[key]?.hash)pending.set(key,{...entry,hash})}
  let cursor=state.cursor;const received=[];
  for(let page=0;;page++) {
    if(page>=400)throw Error('本次同步记录过多，请联系管理员分批迁移');
    const result=await(await cloudRequest(root,'/api/changes?after='+cursor)).json();
    received.push(...result.items);cursor=result.cursor;if(!result.more)break;
  }
  // Abort before applying anything when concurrent edits are detected.
  for(const r of received){const key=r.kind+':'+r.id;if(pending.has(key)&&r.revision!==(state.base[key]?.revision||0)) {
    const normalized={kind:r.kind,id:r.id,payload:r.payload,deleted:Boolean(r.deleted)};
    if(r.kind==='profile'&&!state.base[key]){pending.delete(key);continue}
    if(!r.payload.cloudImage&&await cloudHash(JSON.stringify(normalized))===pending.get(key).hash){pending.delete(key);continue}
    throw Error('同步冲突：'+r.id+' 已在另一设备修改。本地内容已保留，请导出备份后核对；没有覆盖云端');
  }}
  const next=structuredClone(data);let profile;
  for(const r of received) {
    const key=r.kind+':'+r.id;if(pending.has(key))continue;
    if(r.revision===state.base[key]?.revision)continue;
    if(r.kind==='profile'){profile=r.payload;state.base[key]={revision:r.revision,hash:await cloudHash(JSON.stringify({kind:r.kind,id:r.id,payload:r.payload,deleted:Boolean(r.deleted)}))};continue}
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
  if(JSON.stringify(data)!==initial||JSON.stringify(cloudEntries(data).get('profile:student').payload)!==profileInitial)throw Error('同步期间本地内容发生变化，请重试');
  validate(next);await persist(next);
  if(profile){cfg.stage=profile.stage;cfg.grade=profile.grade;cfg.region=profile.region;cfg.teachingStyle=profile.teachingStyle||'step';cfg.teachingFocus=profile.teachingFocus||'understanding';saveLocalConfig()}
  await cloudSaveState(stateKey,state);
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
}
async function cloudSaveState(key,state) {
  const tx=db.transaction('data','readwrite');tx.objectStore('data').put(state,key);
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});
}
