const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const controls={'#subject':{value:'语文'},'#source':{value:'课堂练习'},'#mistake':{value:''},'#paper-layout':{value:'2'},'#paper-progress':{},'#paper-area':{scrollIntoView(){}}};
const c={console,assert,TextEncoder,TextDecoder,AbortController,URL,AbortSignal,crypto:globalThis.crypto,setTimeout,clearTimeout,confirm:()=>true,location:{hash:'#capture'},localStorage:{getItem:()=>null},sessionStorage:{getItem:()=> 'test-key'},window:{addEventListener(){}},document:{querySelector:s=>controls[s]||null}};vm.createContext(c);
vm.runInContext(fs.readFileSync(__dirname+'/crop.js','utf8'),c);vm.runInContext(fs.readFileSync(__dirname+'/paper.js','utf8'),c);vm.runInContext(fs.readFileSync(__dirname+'/baidu.js','utf8'),c);vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8').replace("window.addEventListener('hashchange',render);boot();",''),c);
vm.runInContext(`
(async()=>{
  const rects=tileRects(4096,3072,2);assert.equal(rects.length,6);
  for(const r of rects){assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=4096&&r.y+r.height<=3072)}
  assert.ok(rects[0].y+rects[0].height>rects[1].y);assert.ok(rects[0].x+rects[0].width>rects[3].x);
  assert.throws(()=>normalizeOCR({text:'只返回一道题'}));assert.throws(()=>normalizeOCR({items:[{text:'缺题号'}]}));
  const originalAI=ai;let payload;
  fetch=async(url,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'{"items":[]}'}}]})}};
  await originalAI('test',['data:image/jpeg;base64,AA==','data:image/jpeg;base64,AQ==']);assert.equal(payload.messages[1].content.length,3);assert.equal(payload.messages[1].content[1].image_url.detail,'original');assert.equal(payload.max_tokens,8000);
  fetch=async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:'{}'}}]})});await assert.rejects(()=>originalAI('test'),/截断/);
  render=()=>{};paperTiles=async()=>Array.from({length:6},(_,i)=>({column:Math.floor(i/3),url:'tile-'+i}));image='data:image/jpeg;base64,AA==';
  const inventory=[{section:'三、选择题',number:'1'},{section:'三、选择题',number:'2'},{section:'四、填空',number:'1'}];
  let calls=0;ai=async(prompt,images)=>{calls++;if(calls===1)return {inventory,warnings:[]};assert.equal(images.length,3);assert.match(prompt,/不解题/);return {items:[{section:'三、选择题',number:String(calls-1),text:'原题'+calls,studentAnswer:'D',uncertainty:''}]}};
  await recognizePaper();assert.equal(calls,3);assert.equal(paper.items.length,2);assert.equal(paper.complete,true);assert.ok(paperView().includes('四、填空'));assert.ok(paper.items.every(p=>!p.selected&&!p.verified&&!p.analyzed));
  assert.throws(()=>selectedPaper(),/选择/);paper.items[0].selected=true;assert.throws(()=>selectedPaper(),/核对/);paper.items[0].verified=true;assert.equal(selectedPaper().length,1);
  calls=0;ai=async()=>{calls++;if(calls===1)return {inventory,warnings:[]};if(calls===3)throw Error('模拟网络失败');return {items:[{section:'三、选择题',number:'1',text:'已识别题目',studentAnswer:'',uncertainty:''}]}};
  await assert.rejects(()=>recognizePaper(),/模拟网络失败/);assert.equal(paper.items.length,1);assert.equal(paper.complete,false);assert.ok(paper.warnings.some(s=>s.includes('识别未完成')));
  console.log('Passed: overlapping crop coverage, OCR schema rejection, multi-image payload, truncation rejection, full-paper multi-call flow, missing-question warnings, manual verification gate, partial-failure retention.');
})().catch(e=>{console.error(e);globalThis.failed=true});
`,c);setTimeout(()=>{if(c.failed)process.exitCode=1},200);
