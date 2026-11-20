const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
  const {createOCRService}=await import('./proxy/worker.mjs');
  const env={BAIDU_API_KEY:'server-api-key',BAIDU_SECRET_KEY:'server-secret-key',OCR_PROXY_TOKEN:'random-personal-access-token-123456',ALLOWED_ORIGIN:'https://xfdliujin-netizen.github.io'};
  const words=[{words:'  A. 程相并进，坚特  ',probability:{average:.7}},{words:'B. 横七坚八'}];let auth=0,ocr=0;
  const handler=createOCRService(async(url,options)=>{if(url.endsWith('/token')){auth++;assert.equal(options.body.get('client_secret'),env.BAIDU_SECRET_KEY);return Response.json({access_token:'cached-server-token',expires_in:3600})}ocr++;assert.ok(url.startsWith('https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?'));assert.equal(options.body.get('image'),'Q1JPUA==');assert.equal(options.body.get('probability'),'true');assert.equal(options.body.get('detect_direction'),'true');return Response.json({words_result:words,log_id:123})});
  function request({origin=env.ALLOWED_ORIGIN,token=env.OCR_PROXY_TOKEN,method='POST',image='data:image/png;base64,Q1JPUA==',body}={}){return new Request('https://proxy.example/api/ocr',{method,headers:{Origin:origin,'X-OCR-Token':token,'Content-Type':'application/json'},...(method==='OPTIONS'?{}:{body:body??JSON.stringify({image})})})}
  let r=await handler(request({method:'OPTIONS'}),env);assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),env.ALLOWED_ORIGIN);assert.equal(auth,0);
  assert.equal((await handler(request({origin:'https://other.example'}),env)).status,403);assert.equal((await handler(request({token:'wrong'}),env)).status,401);assert.equal(auth,0);assert.equal((await handler(request({body:'{'}),env)).status,400);assert.equal((await handler(request({image:'https://other.example/image'}),env)).status,400);
  r=await handler(request(),env);const j=await r.json();assert.equal(j.words_result[0].words,words[0].words);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.ok(!JSON.stringify(j).includes('server-secret'));await handler(request(),env);assert.equal(auth,1);assert.equal(ocr,2);
  let errors=0;const quotaHandler=createOCRService(async url=>url.endsWith('/token')?Response.json({access_token:'x',expires_in:3600}):(errors++,Response.json({error_code:17,error_msg:'not exposed'})));assert.equal((await(await quotaHandler(request(),env)).json()).error_code,17);assert.equal(errors,1);
  const image = 'data:image/jpeg;base64,Q1JPUA==';
  const taskId = '1996199501805445169';
  let polls = 0, submissions = 0, completions = 0;
  const integrationHandler = createOCRService(async (url, options) => {
    if (url.endsWith('/token')) return Response.json({ access_token: 'vendor-token', expires_in: 3600 });
    const payload = JSON.parse(options.body);
    if (url.includes('/create_task?')) {
      submissions++;
      assert.deepEqual(payload, { image: 'Q1JPUA==' });
      return Response.json({ error_code: '0', result: { task_id: taskId } });
    }
    if (url.includes('/get_result?')) {
      assert.deepEqual(payload, { task_id: taskId });
      if (++polls === 1) return Response.json({ error_code: 60, result: { status: 'Running' } });
      return Response.json({ error_code: 0, result: { status: 'Success', imageResults: [
        { result: [{ seqence: 0, correctResult: 2, cropUrl: 'https://private.example/image', slot: [{ reason: '核对进位' }] }] }
      ] } });
    }
    assert.equal(url, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer server-qwen-credential');
    assert.equal(payload.model, Array.isArray(payload.messages[1].content) ? 'qwen3-vl-plus' : 'qwen-plus');
    if (Array.isArray(payload.messages[1].content)) assert.deepEqual(payload.messages[1].content, [
      { type: 'text', text: '识别题目' }, { type: 'image_url', image_url: { url: image } }
    ]);
    assert.equal(payload.enable_thinking, false);
    completions++;
    return Response.json({ choices: [{ message: { content: '{"ok":true}' } }], usage: { total_tokens: 25 } });
  });
  const invoke = async (payload, overrides = {}) => integrationHandler(request({ body: JSON.stringify(payload), ...overrides }), {
    ...env, QWEN_API_KEY: 'server-qwen-credential'
  });
  assert.equal((await invoke({ action: 'homework-create', image }, { token: 'wrong' })).status, 401);
  assert.equal((await invoke({ action: 'homework-result', task_id: '../invalid' })).status, 400);
  assert.deepEqual(await (await invoke({ action: 'homework-create', image })).json(), { task_id: taskId });
  assert.deepEqual(await (await invoke({ action: 'homework-result', task_id: taskId })).json(), { status: 'pending' });
  assert.deepEqual(await (await invoke({ action: 'homework-result', task_id: taskId })).json(), {
    status: 'complete', questions: [{ number: 1, verdict: 2, reasons: ['核对进位'] }]
  });
  const payload = { model: 'qwen-plus', max_tokens: 8000, messages: [
    { role: 'system', content: 'JSON' }, { role: 'user', content: '题目' }
  ] };
  assert.equal((await invoke({ action: 'qwen-completion', payload }, { token: 'wrong' })).status, 401);
  assert.equal((await invoke({ action: 'qwen-completion', payload: {...payload, max_tokens: 9000} })).status, 400);
  assert.equal((await (await invoke({ action: 'qwen-completion', payload })).json()).usage.total_tokens, 25);
  const vision = url => ({...payload, model:'qwen3-vl-plus', messages:[
    payload.messages[0], { role:'user', content:[{type:'text',text:'识别题目'}, {type:'image_url',image_url:{url}}] }
  ]});
  assert.equal((await invoke({action:'qwen-completion', payload:vision('https://example.com/image.jpg')})).status,400);
  assert.equal((await (await invoke({action:'qwen-completion', payload:vision(image)})).json()).usage.total_tokens,25);
  assert.deepEqual([submissions, polls, completions], [1, 2, 2]);
  const controls={'#subject':{value:'语文'},'#source':{value:'课堂练习'},'#mistake':{value:''},'#paper-progress':{},'#paper-area':{scrollIntoView(){}}};let fetches=0;
  const c={assert,console,AbortSignal,TextEncoder,TextDecoder,crypto:globalThis.crypto,setTimeout,clearTimeout,confirm:()=>true,location:{hash:'#capture'},localStorage:{getItem:()=>null},sessionStorage:{getItem:k=>k==='shiti-ocr-token'?env.OCR_PROXY_TOKEN:null},window:{addEventListener(){}},document:{querySelector:s=>controls[s]||null,querySelectorAll:()=>[]},fetch:async(url,options)=>{fetches++;assert.equal(url,'https://proxy.example/api/ocr');assert.deepEqual(JSON.parse(options.body),{image:'data:image/png;base64,Q1JPUA==',mode:'accurate'});assert.equal(options.headers['X-OCR-Token'],env.OCR_PROXY_TOKEN);return Response.json({words_result:words,log_id:123})}};
  vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/ocr-layout.js','utf8'),c);for(const p of ['crop.js','paper.js','baidu.js','app.js'])vm.runInContext(fs.readFileSync(__dirname+'/'+p,'utf8').replace(/window\.addEventListener\('hashchange',\s*render\);\s*boot\(\);\s*$/,''),c);
  await vm.runInContext(`(async()=>{assert.equal(usesBaidu(),true);cfg.ocrProxy='https://proxy.example/api/ocr';exportCrop=()=> 'data:image/png;base64,Q1JPUA==';image='FULL_ORIGINAL_NOT_SENT';cropState.rect={x:0,y:0,w:.2,h:.2};cropCanvas={width:1000,height:1000};render=()=>{};toast=()=>{};ai=()=>{throw Error('OCR must not call DeepSeek')};await recognizeWithBaidu();assert.equal(paper.ocrProvider,'baidu');assert.equal(paper.items[0].text,['  A. 程相并进，坚特  ','B. 横七坚八'].join(String.fromCharCode(10)));assert.equal(paper.ocrOriginalText,paper.items[0].text);assert.equal(paper.items[0].studentAnswer,'');assert.equal(paper.items[0].verified,false);assert.equal(paper.items[0].analyzed,false);assert.ok(paper.warnings.some(s=>s.includes('置信度')));ai=async(prompt,img)=>{assert.equal(img,undefined);assert.ok(prompt.includes('程相并进'));return {answer:'齐头并进',analysis:'分析内容',reminder:'对照原字',tags:['错别字']}};assert.equal(paper.items[0].answerStatus,'confirmed');paper.items[0].answerStatus='unknown';paper.items[0].selected=true;paper.items[0].verified=true;globalThis.analysisButton={disabled:false,textContent:'分析',isConnected:false};const baseQuery=document.querySelector;const buttonMap={};for(const id of ['#paper-layout','#analyze','#paper-select-all','#paper-add','#paper-analyze','#paper-save'])buttonMap[id]={};document.querySelector=s=>buttonMap[s]||baseQuery(s);bindPaper();await buttonMap['#paper-analyze'].onclick({target:analysisButton});assert.equal(paper.items[0].answer,'齐头并进');assert.equal(paper.items[0].text,paper.ocrOriginalText);persist=async next=>{data=next};await buttonMap['#paper-save'].onclick({target:analysisButton});assert.equal(data.questions[0].ocrProvider,'baidu');assert.equal(data.questions[0].ocrRaw.words_result[0].words,'  A. 程相并进，坚特  ');assert.ok(!JSON.stringify(data).includes('random-personal-access-token'));const previous=paper;fetch=async()=>({ok:true,json:async()=>({error_code:17})});await assert.rejects(()=>recognizeWithBaidu(),/额度/);assert.equal(paper,previous);mode='text';document.querySelector=()=>({value:'手动原文',scrollIntoView(){}});await recognizeWithBaidu();assert.equal(paper.ocrProvider,'manual');assert.equal(paper.items[0].text,'手动原文');assert.equal(paper.image,'')})()`,c);
  assert.equal(fetches,1);
  const {createServer}=require('./server.cjs');const local=createServer({});async function localRead(url){return await new Promise((resolve,reject)=>{const req=require('node:stream').Readable.from([]);req.url=url;req.method='GET';req.headers={};const res={writeHead(status){this.status=status},end(bytes){resolve({status:this.status,text:bytes?bytes.toString():''})}};local.emit('request',req,res)})}assert.equal((await localRead('/.env')).status,404);assert.equal((await localRead('/proxy/worker.mjs')).status,404);assert.equal((await localRead('/')).status,200);assert.ok((await localRead('/baidu.js')).text.includes('recognizeWithBaidu'));
  console.log('Passed: Baidu-only crop routing without DeepSeek key, literal lines/typos, quota failure retention, manual input without API, upstream form/auth caching, CORS/access control, no retries or secret leakage.');
})().catch(e=>{console.error(e);process.exitCode=1});
