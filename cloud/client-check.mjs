import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Simulated transport with optimistic revisions; exercises actual browser sync code.
const records=new Map(),images=new Map();let sequence=0,requests=0;
function client(){
 const stored=new Map();
 const c={console,URL,TextEncoder,crypto,AbortSignal,structuredClone,Image:class{},cfg:{cloudEndpoint:'https://api.86518925.xyz'},data:{version:1,questions:[],practices:[],deleted:{}},$:()=>null,getStudentProfile:()=>({grade:'四年级',region:'江苏'}),saveLocalConfig(){},validate:v=>v,req:async v=>v};
 c.db={transaction:()=>({objectStore:()=>({get:key=>structuredClone(stored.get(key))})})};
 c.persist=async next=>{c.data=next};
 c.fetch=async(url,opts={})=>{
   requests++;const u=new URL(url),path=u.pathname;
   if(path==='/api/changes'){const rows=[...records.values()].filter(r=>r.seq>Number(u.searchParams.get('after'))).sort((a,b)=>a.seq-b.seq);return Response.json({items:rows,cursor:rows.at(-1)?.seq||Number(u.searchParams.get('after')),more:false})}
   if(path==='/api/image'){const id=u.searchParams.get('id');if(opts.method==='PUT'){images.set(id,opts.body);return Response.json({id})}return new Response(images.get(id))}
   const b=JSON.parse(opts.body),key=b.kind+':'+b.id,old=records.get(key);
   if((old?.revision||0)!==b.revision)return Response.json({error:'conflict'},{status:409});
   const revision=b.revision+1;records.set(key,{...b,revision,seq:++sequence});return Response.json({revision});
 };
 vm.createContext(c);vm.runInContext(readFileSync(new URL('../cloud.js',import.meta.url),'utf8'),c);
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
a.cfg.teachingStyle='guiding';a.cfg.teachingFocus='transfer';await a.syncCloud();await b.syncCloud();assert.equal(b.cfg.teachingStyle,'guiding');assert.equal(b.cfg.teachingFocus,'transfer');
b.data.questions[0].text='第二版';await b.syncCloud();await a.syncCloud();assert.equal(a.data.questions[0].text,'第二版');
a.data.questions[0].text='甲';b.data.questions[0].text='乙';await a.syncCloud();await assert.rejects(()=>b.syncCloud(),/同步冲突/);assert.equal(b.data.questions[0].text,'乙');assert.equal(records.get('question:a').payload.text,'甲');
const d=client();await d.syncCloud();d.data.questions=[];d.data.deleted.a=new Date().toISOString();await d.syncCloud();
const e=client();await e.syncCloud();assert.equal(e.data.questions.length,0);assert.ok(e.data.deleted.a);
console.log('Client checks passed: two-device migration, compressed images, no-op sync, incremental update, conflict preserves both sides, deletion propagation. Requests:',requests);
