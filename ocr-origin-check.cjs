const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 let calls=0;const panel={textContent:''};const c={console,location:{protocol:'file:',origin:'null'},cfg:{},esc:v=>v,field:()=>'',localStorage:{getItem:()=>''},sessionStorage:{getItem:()=>''},$:()=>panel,fetch:async()=>{calls++;throw Error('should not fetch')},AbortSignal};
 vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/baidu.js','utf8'),c);
 await vm.runInContext('testOCRConnection()',c);assert.match(panel.textContent,/压缩包临时目录/);assert.match(panel.textContent,/导出 JSON/);assert.equal(calls,0);
 await assert.rejects(()=>vm.runInContext("callBaiduOCR('data:image/png;base64,Q1JPUA==')",c),/来源为 null/);assert.equal(calls,0);
 c.location={protocol:'https:',origin:'https://shiti.86518925.xyz'};
 assert.equal(vm.runInContext('ocrLocalFileWarning()',c),'');
 c.fetch=async()=>{calls++;return new Response('{}',{status:400})};await vm.runInContext('testOCRConnection()',c);assert.match(panel.textContent,/连接成功/);assert.equal(calls,1);
 console.log('Passed: file-origin diagnosis, export-before-migration guidance, no requests or credentials sent from file pages, HTTPS probe unaffected.');
})().catch(e=>{console.error(e);process.exitCode=1});
