const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const controls={'#subject':{value:'语文'},'#source':{value:'第二单元'},'#mistake':{value:''},'#paper-progress':{textContent:''},'#paper-area':{scrollIntoView(){}}};let drawn;
const ctx={assert,console,AbortSignal,TextEncoder,TextDecoder,crypto:globalThis.crypto,setTimeout,clearTimeout,confirm:()=>true,location:{hash:'#capture'},localStorage:{getItem:()=>null},sessionStorage:{getItem:()=> 'test'},window:{addEventListener(){}},document:{querySelector:s=>controls[s]||null,createElement:()=>({getContext:()=>({drawImage(...args){drawn=args}}),toDataURL:()=> 'data:image/png;base64,Q1JPUA=='})}};
vm.createContext(ctx);for(const file of ['crop.js','paper.js','app.js'])vm.runInContext(fs.readFileSync(__dirname+'/'+file,'utf8').replace("window.addEventListener('hashchange',render);boot();",''),ctx);
vm.runInContext(`(async()=>{
  assert.equal(recognitionScope,'crop');
  assert.equal(rotatedSize(400,300,90).width,300);assert.equal(rotatedSize(400,300,90).height,400);
  assert.equal(rotatedSize(400,300,180).width,400);assert.equal(rotatedSize(400,300,180).height,300);
  for(const angle of [-90,-5,0,5,90,180,270]){const d=rotatedSize(400,300,angle);assert.ok(d.width>0&&d.height>0)}
  const rect=constrainRect({x:-1,y:.95,w:2,h:1});assert.ok(rect.x>=0&&rect.x+rect.w<=1&&rect.y+rect.h<=1);
  const pixels=cropPixels({x:.25,y:.5,w:.5,h:.25},400,300);assert.equal(pixels.x,100);assert.equal(pixels.y,150);assert.equal(pixels.width,200);assert.equal(pixels.height,75);
  assert.throws(()=>exportCrop(),/框选/);image='ORIGINAL_FULL_IMAGE';cropState={source:image,rotation:90,rect:{x:.25,y:.5,w:.5,h:.25}};cropCanvas={width:400,height:300};
  const cropped=exportCrop();assert.equal(cropped,'data:image/png;base64,Q1JPUA==');
  assert.match(OCR_RULES,/错字/);assert.match(OCR_RULES,/不能猜字补全/);assert.match(OCR_RULES,/禁止按语义/);
  const wrong='A. 程相并进，坚特，横七坚八';const normalized=normalizeOCR({items:[{section:'三',number:'2',text:wrong,studentAnswer:'错别自',uncertainty:''}]});assert.equal(normalized[0].text,wrong);assert.equal(normalized[0].studentAnswer,'错别自');
  let count=0;ai=async(prompt,src,opts)=>{count++;assert.equal(src,cropped);assert.ok(!prompt.includes('ORIGINAL_FULL_IMAGE'));assert.equal(opts.ocr,true);assert.equal(opts.maxTokens,6000);return {items:[{section:'三',number:'2',text:wrong,studentAnswer:'错别自',uncertainty:''}]}};render=()=>{};
  await recognizeSelection();assert.equal(count,1);assert.equal(paper.image,cropped);assert.equal(paper.items[0].text,wrong);assert.equal(paper.scope,'crop');assert.equal(paper.items[0].analyzed,false);
  recordUsage({prompt_tokens:250,completion_tokens:80,total_tokens:330});recordUsage(null);assert.match(usageText(),/330/);assert.match(usageText(),/部分用量未知/);
  console.log('Passed: rotation bounds, crop constraints/pixels, missing-selection rejection, literal typo preservation, single-request cropped-only OCR, deferred analysis, usage aggregation.');
})().catch(e=>{console.error(e);globalThis.failed=true})`,ctx);
setTimeout(()=>{if(ctx.failed)process.exitCode=1;else{assert.equal(drawn[1],100);assert.equal(drawn[2],150);assert.equal(drawn[3],200);assert.equal(drawn[4],75)}},200);
