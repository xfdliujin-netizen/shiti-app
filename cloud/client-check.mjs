import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Simulated transport with optimistic revisions; exercises actual browser sync code.
const records=new Map(),images=new Map();let sequence=0,requests=0;
function client(withCollections=false){
 const stored=new Map();
 const c={console,URL,TextEncoder,crypto,AbortSignal,structuredClone,subjects:['语文','数学','英语'],Image:class{},cfg:{cloudEndpoint:'https://api.86518925.xyz'},data:{version:1,questions:[],practices:[],deleted:{}},$:()=>null,getStudentProfile:()=>({grade:'四年级',region:'江苏',term:c.cfg.term||'上'}),saveLocalConfig(){},validate:v=>v,req:async v=>v};
 c.db={transaction:()=>({objectStore:()=>({get:key=>structuredClone(stored.get(key))})})};
 c.persist=async next=>{c.data=next};
 c.fetch=async(url,opts={})=>{
   requests++;const u=new URL(url),path=u.pathname;
   if(path==='/api/changes'){const rows=[...records.values()].filter(r=>r.seq>Number(u.searchParams.get('after'))&&(u.searchParams.get('collections')==='1'||r.kind!=='profile'||r.id==='student')).sort((a,b)=>a.seq-b.seq);return Response.json({items:rows,cursor:rows.at(-1)?.seq||Number(u.searchParams.get('after')),more:false})}
   if(path==='/api/image'){const id=u.searchParams.get('id');if(opts.method==='PUT'){images.set(id,opts.body);return Response.json({id})}return new Response(images.get(id))}
   const b=JSON.parse(opts.body),key=b.kind+':'+b.id,old=records.get(key);
   if((old?.revision||0)!==b.revision)return Response.json({error:'conflict'},{status:409});
   const revision=b.revision+1;records.set(key,{...b,revision,seq:++sequence});return Response.json({revision});
 };
 vm.createContext(c);if(withCollections){vm.runInContext(readFileSync(new URL('../notebooks.js',import.meta.url),'utf8'),c);c.validate=v=>c.validateExtraData(v)}vm.runInContext(readFileSync(new URL('../cloud.js',import.meta.url),'utf8'),c);
 c.cloudSaveState=async(key,state)=>stored.set(key,structuredClone(state));
 c.compressCloudImage=async()=>new Uint8Array([255,216,255,217]);
 c.cloudDataURL=async()=> 'data:image/jpeg;base64,/9j/2Q==';
 return c;
}
const a=client(),b=client();
const now=new Date().toISOString();a.data.questions.push({id:'a',number:'001',subject:'语文',tags:[],text:'第一题',created:now,updated:now,image:'data:image/jpeg;base64,/9j/2Q=='});
await a.syncCloud();assert.equal(records.size,2);assert.equal(images.size,1);
await b.syncCloud();assert.equal(b.data.questions[0].text,'第一题');assert.match(b.data.questions[0].image,/^data:image/);
const prior=sequence;await a.syncCloud();await b.syncCloud();assert.equal(sequence,prior,'unchanged data must not be rewritten');
a.cfg.sourceChoices=['周末专项卷'];a.cfg.typeChoices={'语文':[{label:'拼音填词',kind:'fill'}]};a.cfg.teachingStyle='guiding';a.cfg.teachingFocus='transfer';a.cfg.term='下';a.cfg.knowledgeProgress={area:'introduced'};a.cfg.methodProgress={decimal:'learned'};await a.syncCloud();await b.syncCloud();assert.equal(b.cfg.sourceChoices[0],'周末专项卷');assert.equal(b.cfg.typeChoices['语文'][0].kind,'fill');assert.equal(b.cfg.teachingStyle,'guiding');assert.equal(b.cfg.teachingFocus,'transfer');assert.equal(b.cfg.term,'下');assert.equal(b.cfg.knowledgeProgress.area,'introduced');assert.equal(b.cfg.methodProgress.decimal,'learned');
b.data.questions[0].text='第二版';await b.syncCloud();await a.syncCloud();assert.equal(a.data.questions[0].text,'第二版');
a.data.questions[0].text='甲';b.data.questions[0].text='乙';await a.syncCloud();await assert.rejects(()=>b.syncCloud(),/同步冲突/);assert.equal(b.data.questions[0].text,'乙');assert.equal(records.get('question:a').payload.text,'甲');
const d=client();await d.syncCloud();d.data.questions=[];d.data.deleted.a=new Date().toISOString();await d.syncCloud();
const e=client();await e.syncCloud();assert.equal(e.data.questions.length,0);assert.ok(e.data.deleted.a);
console.log('Client checks passed: two-device migration, compressed images, no-op sync, incremental update, conflict preserves both sides, deletion propagation. Requests:',requests);

const n1=client(true),n2=client(true);
await n1.syncCloud();await n2.syncCloud();
const book={id:'nb-'+('b'.repeat(32)),name:'数学专项',subject:'数学',color:'blue',created:now,updated:now};
const lib='lib-'+('c'.repeat(24));
const part={id:'part-'+lib+'-0',type:'part',libraryId:lib,questions:[{id:'liq-'+('c'.repeat(12))+'-0',grade:4,text:'1+1',answer:'2',analysis:'加法',tags:['加法'],sourceType:'external'}],created:now,updated:now};
const meta={id:'meta-'+lib,type:'meta',libraryId:lib,name:'导入样本',source:'test',license:'CC BY-NC 4.0',parts:[part.id],count:1,created:now,updated:now};
n1.data.notebooks=[book];n1.data.bankRecords=[part,meta];await n1.syncCloud();await n2.syncCloud();
assert.equal(n2.data.notebooks[0].name,'数学专项');assert.equal(n2.data.bankRecords.length,2);assert.equal(n2.data.questions.length,0);
let seq=sequence;await n1.syncCloud();await n2.syncCloud();assert.equal(sequence,seq,'collection no-op sync');
const legacy=client();await legacy.syncCloud();assert.equal(legacy.cfg.grade,'四年级');assert.equal(legacy.data.bankRecords,undefined);
n1.data.notebooks[0].name='甲改名';n2.data.notebooks[0].name='乙改名';await n1.syncCloud();await assert.rejects(()=>n2.syncCloud(),/同步冲突/);assert.equal(n2.data.notebooks[0].name,'乙改名');
const n3=client(true);await n3.syncCloud();n3.data.bankRecords=[];for(const r of [part,meta])n3.data.deleted['profile:library:'+r.id]=now;await n3.syncCloud();await n1.syncCloud();assert.equal(n1.data.bankRecords.length,0);assert.equal(n1.data.notebooks[0].name,'甲改名');
// An upload interrupted after its immutable part succeeds resumes without rewriting that part.
const n4=client(true);await n4.syncCloud();n4.data.bankRecords=[part,meta];for(const r of [part,meta])delete n4.data.deleted['profile:library:'+r.id];
const transport=n4.fetch;let interrupted=false;n4.fetch=async(url,opts)=>{if(opts?.method==='PUT'&&JSON.parse(opts.body).id==='library:'+meta.id&&!interrupted){interrupted=true;throw Error('offline')}return transport(url,opts)};
await assert.rejects(()=>n4.syncCloud(),/连接失败/);const partRevision=records.get('profile:library:'+part.id).revision;n4.fetch=transport;await n4.syncCloud();assert.equal(records.get('profile:library:'+part.id).revision,partRevision);const n5=client(true);await n5.syncCloud();assert.equal(n5.data.bankRecords.length,2);
console.log('Collection sync passed: new/legacy clients, private chunks, no-op, rename conflicts, isolated deletion and interrupted upload resume.');
