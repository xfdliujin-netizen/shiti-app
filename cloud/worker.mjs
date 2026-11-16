const json = (body, status=200, headers={}) => new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
const decode = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
let keyCache;
export async function authenticate(request, env) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length>12000) fail(401,'请先通过 Cloudflare Access 登录');
  const issuer = env.ACCESS_ISSUER?.replace(/\/$/,'');
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer||'') || !env.ACCESS_AUD || !env.ALLOWED_EMAIL) fail(503,'登录保护尚未配置');
  try {
    const parts=token.split('.'); if(parts.length!==3) throw Error();
    const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))), claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
    if(header.alg!=='RS256'||typeof header.kid!=='string') throw Error();
    const now=Date.now()/1000;
    if(claims.iss!==issuer || !Number.isFinite(claims.exp) || claims.exp<=now || (claims.nbf && claims.nbf>now) || !(Array.isArray(claims.aud)?claims.aud:[claims.aud]).includes(env.ACCESS_AUD) || claims.email?.toLowerCase()!==env.ALLOWED_EMAIL.toLowerCase()) throw Error();
    if(!keyCache || keyCache.issuer!==issuer || keyCache.until<Date.now()) {
      const r=await fetch(issuer+'/cdn-cgi/access/certs',{signal:AbortSignal.timeout(5000)});
      if(!r.ok) throw Error();
      const {keys}=await r.json(); keyCache={issuer,keys,until:Date.now()+300000};
    }
    const jwk=keyCache.keys.find(k=>k.kid===header.kid); if(!jwk) throw Error();
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]))) throw Error();
    return claims.email;
  } catch { fail(401,'登录已过期或无权访问，请重新登录'); }
}
async function bodyBytes(request, max) {
  if(Number(request.headers.get('content-length'))>max) fail(413,'内容过大');
  const reader=request.body?.getReader(); if(!reader) return new Uint8Array();
  const parts=[]; let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();fail(413,'内容过大')}parts.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}return bytes;
}
export const hex = bytes => Array.from(new Uint8Array(bytes), b=>b.toString(16).padStart(2,'0')).join('');
export async function handle(request, env) {
  const origin=request.headers.get('Origin'), allowed=env.ALLOWED_ORIGIN;
  const cors={'Access-Control-Allow-Origin':allowed||'https://shiti.86518925.xyz','Access-Control-Allow-Credentials':'true','Vary':'Origin','X-Content-Type-Options':'nosniff'};
  try {
    if(origin && origin!==allowed) fail(403,'来源不允许');
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET, PUT, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}});
    if(env.STORAGE_ENABLED!=='true') fail(503,'云端存储未启用或已暂停');
    await authenticate(request,env); // No DB access before successful signature + allowlist checks.
    if(!env.DB) fail(503,'D1 尚未绑定');
    if(!['GET','PUT'].includes(request.method)) fail(405,'不支持此操作');
    if(request.method==='PUT' && origin!==allowed) fail(403,'写入需要可信网页来源');
    const url=new URL(request.url), path=url.pathname;
    if(!['/api/session','/api/changes','/api/record','/api/image'].includes(path)) fail(404,'接口不存在');
    const write=request.method==='PUT'?1:0, day=new Date().toISOString().slice(0,10);
    const quota=await env.DB.prepare(`INSERT INTO quotas(day,requests,writes) VALUES(?,1,?) ON CONFLICT(day) DO UPDATE SET requests=requests+1,writes=writes+excluded.writes WHERE requests<10000 AND writes+excluded.writes<=2000 RETURNING requests`).bind(day,write).first();
    if(!quota) fail(429,'今日云端请求达到安全上限，本地仍可使用');
    const db=env.DB.withSession?env.DB.withSession('first-primary'):env.DB;
    if(path==='/api/session'&&request.method==='GET') return json({ok:true},200,cors);
    if(path==='/api/changes'&&request.method==='GET') {
      const after=Number(url.searchParams.get('after')||0);
      if(!Number.isSafeInteger(after)||after<0) fail(400,'游标无效');
      const rows=await db.prepare('SELECT kind,id,payload,deleted,revision,seq FROM records WHERE seq>? ORDER BY seq LIMIT 50').bind(after).all();
      return json({items:rows.results.map(r=>({...r,payload:JSON.parse(r.payload)})),cursor:rows.results.at(-1)?.seq||after,more:rows.results.length===50},200,cors);
    }
    if(path==='/api/record'&&request.method==='PUT') {
      let b;try{b=JSON.parse(new TextDecoder().decode(await bodyBytes(request,65536)))}catch(e){if(e.status)throw e;fail(400,'无效 JSON')}
      if(!['question','practice','profile'].includes(b.kind)||typeof b.id!=='string'||!b.id||b.id.length>100||!Number.isSafeInteger(b.revision)||b.revision<0||typeof b.deleted!=='boolean')fail(400,'记录无效');
      const p=b.payload;
      if(!p||typeof p!=='object'||Array.isArray(p)||p.image)fail(400,'图片须单独上传');
      if(!b.deleted && b.kind!=='profile' && (p.id!==b.id||typeof p.text!=='string'||!Number.isFinite(Date.parse(p.updated))||!Number.isFinite(Date.parse(p.created))))fail(400,'题目或练习字段不完整');
      if(!b.deleted&&b.kind==='question'&&(!Array.isArray(p.tags)||!p.number||!p.subject))fail(400,'题目标签或科目缺失');
      if(p.cloudImage && !await db.prepare('SELECT id FROM images WHERE id=?').bind(p.cloudImage).first())fail(400,'题图尚未上传');
      const payload=JSON.stringify(p);
      const updated=b.revision===0
        ? await db.prepare('INSERT INTO records(kind,id,payload,deleted,revision) VALUES(?,?,?,?,1) ON CONFLICT(kind,id) DO NOTHING RETURNING revision').bind(b.kind,b.id,payload,b.deleted?1:0).first()
        : await db.prepare('UPDATE records SET payload=?,deleted=?,revision=revision+1 WHERE kind=? AND id=? AND revision=? RETURNING revision').bind(payload,b.deleted?1:0,b.kind,b.id,b.revision).first();
      if(!updated)fail(409,'另一设备修改了同一记录；已保留本地数据，请先备份并处理冲突');
      return json(updated,200,cors);
    }
    if(path==='/api/image') {
      const id=url.searchParams.get('id'); if(!/^[a-f0-9]{64}$/.test(id||''))fail(400,'图片编号无效');
      if(request.method==='GET') {
        const row=await db.prepare('SELECT mime,bytes FROM images WHERE id=?').bind(id).first();if(!row)fail(404,'题图不存在');
        return new Response(new Uint8Array(row.bytes),{headers:{...cors,'Content-Type':row.mime,'Cache-Control':'private, max-age=86400'}});
      }
      const bytes=await bodyBytes(request,300000), mime=request.headers.get('Content-Type');
      if(mime!=='image/jpeg'||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)fail(415,'仅接收压缩 JPEG 题图');
      if(hex(await crypto.subtle.digest('SHA-256',bytes))!==id)fail(400,'图片校验失败');
      await db.prepare('INSERT OR IGNORE INTO images(id,mime,bytes) VALUES(?,?,?)').bind(id,mime,bytes).run();
      return json({id},200,cors);
    }
    fail(405,'接口方法不允许');
  } catch(e) { return json({error:e.status?e.message:'存储暂不可用，请保留本地数据稍后重试'},e.status||503,cors); }
}
export default {fetch:handle};
