const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),rawFile=process.argv[2];
if(!rawFile)throw Error('Usage: node bank/build-seed.cjs path/to/cmath_dev.jsonl');
const raw=fs.readFileSync(rawFile,'utf8'),rows=raw.trim().split(/\r?\n/).map(JSON.parse),ctx={};
assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),'b9c6333a31fd740e7f5b5a71022bd59e00748798a3377364346d280549b25e3b','Use the exact pinned CMATH source; source text changed');
vm.runInNewContext(fs.readFileSync(path.join(root,'bank-catalog.js'),'utf8')+';globalThis.topics=BANK_TOPICS',ctx);
const specs=require('./curation.cjs'),commit='9fa13ef0b2d03f5a18c1ace7001248d3981d65ea';
function calculate(n){if(typeof n==='number'){assert.ok(Number.isFinite(n));return n}assert.ok(Array.isArray(n));const [op,...args]=n,v=args.map(calculate);if(op==='+')return v.reduce((a,b)=>a+b,0);if(op==='*')return v.reduce((a,b)=>a*b,1);if(op==='-')return v[0]-v[1];if(op==='/'){assert.notEqual(v[1],0);return v[0]/v[1]}if(op==='floor')return Math.floor(v[0]);if(op==='ceil')return Math.ceil(v[0]);throw Error('Unknown proof operation')}
function formula(n){if(typeof n==='number')return String(n);const [op,...a]=n;if(op==='floor')return '取整数部分('+formula(a[0])+')';if(op==='ceil')return '向上取整('+formula(a[0])+')';return '('+a.map(formula).join({'*':' × ','/':' ÷ ','+':' + ','-':' − '}[op])+')'}
const items=specs.map(([line,topicId,difficulty,unit,proof,explanation])=>{
 const source=rows[line-1],topic=ctx.topics.find(t=>t.id===topicId);assert.ok(source&&topic);const answer=calculate(proof);assert.ok(Math.abs(answer-Number(source.golden))<1e-9,'Source answer conflict at line '+line);assert.ok(explanation);
 return {id:'cmath-dev-'+String(line).padStart(4,'0'),subject:'数学',stage:'primary',grade:Math.max(source.grade,topic.minGrade),sourceGrade:source.grade,term:'通用',knowledgeId:topic.id,tags:[topic.label],prerequisites:topic.prerequisites,methods:topic.methods,difficulty,questionType:'application',text:source.input,numericAnswer:source.golden,unit,answer:source.golden+(unit?'（'+unit+'）':''),analysis:explanation+'\n计算：'+formula(proof)+' = '+source.golden+(unit?'（'+unit+'）':'')+'。',proof,source:'CMATH',originUrl:'https://github.com/XiaoMi/cmath/blob/'+commit+'/datasets/cmath_dev.jsonl#L'+line,license:'CC BY 4.0',attribution:'Tianwen Wei, Jian Luan, Wei Liu, Shuang Dong, Bin Wang — CMATH (2023)',modifications:'补充解析、算式复核、知识点与难度；适用年级为保守映射，未核对江苏具体教材章节。',reviewStatus:'checked',reviewMethod:'source-answer-and-arithmetic-proof',teacherReviewed:false,batch:'cmath-pilot-v1'};
});
assert.equal(items.length,50);assert.equal(new Set(items.map(i=>i.id)).size,50);
const manifest={batch:'cmath-pilot-v1',sourceCommit:commit,sourceSha256:crypto.createHash('sha256').update(raw).digest('hex'),license:'CC BY 4.0',count:items.length,review:'逐题核对题意、补充解析并按算式复算；不是教师签审或江苏教材逐章核验。',excluded:[{line:211,reason:'分成六块与剩下那块的表述不清'},{line:242,reason:'质量单位与提问个数不一致'},{line:262,reason:'两只熊猫四天56千克，每只每天应为7；原答案14冲突'},{line:332,reason:'相向而行与追及的提问矛盾'},{line:346,reason:'小米与小明的姓名不一致'}],items};
const payloadHash=crypto.createHash('sha256').update(JSON.stringify(items)).digest('hex');manifest.itemsSha256=payloadHash;
fs.writeFileSync(path.join(__dirname,'seed.json'),JSON.stringify(manifest,null,2)+'\n');
const quote=v=>"'"+String(v).replace(/'/g,"''")+"'";
let sql='-- Public CC BY 4.0 pilot only. Idempotent; never updates or deletes child records.\n';
for(const q of items)sql+=`INSERT OR IGNORE INTO bank_questions(id,subject,grade,knowledge_id,difficulty,review_status,batch,payload) VALUES(${[q.id,q.subject,q.grade,q.knowledgeId,q.difficulty,q.reviewStatus,q.batch,JSON.stringify(q)].map(quote).join(',')});\n`;
sql+=`INSERT OR IGNORE INTO bank_batches(id,source_commit,item_count,manifest_sha) VALUES(${[manifest.batch,commit,items.length,payloadHash].map(quote).join(',')});\n`;
fs.writeFileSync(path.join(__dirname,'seed.sql'),sql);
console.log(JSON.stringify({count:items.length,grades:[...new Set(items.map(q=>q.grade))],topics:[...new Set(items.map(q=>q.knowledgeId))],itemsSha256:payloadHash}));
module.exports={calculate};
