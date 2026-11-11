'use strict';
// Runs actual browser DOM behavior without external requests or installation.
const assert = require('node:assert/strict');
const path = require('node:path');
let playwright; try { playwright = require('playwright'); } catch (_) { console.error('playwright is required. Install the declared development dependencies before running browser checks.'); process.exit(2); }
const url = 'file://' + path.join(__dirname, '../has/data-workbench.html');
async function run(width = 1280) {
 const browser = await playwright.chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
 try {
  const context = await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  const external=[],errors=[],writes=[];
  await context.route(u=>!u.href.startsWith('file:'),r=>{external.push(r.request().url());return r.abort();});
  await context.exposeBinding('__write',(_,v)=>writes.push(v));
  await context.addInitScript(()=>{localStorage.setItem('HAS_SENTINEL','unchanged');sessionStorage.setItem('HAS_SESSION','unchanged');['setItem','removeItem','clear'].forEach(key=>{const original=Storage.prototype[key];Storage.prototype[key]=function(...args){window.__write([key,...args]);return original.apply(this,args);};});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));await page.goto(url);
  const click=id=>page.locator('#'+id).click(), input=v=>page.locator('#document-input').fill(v), status=()=>page.locator('#status').innerText();
  assert.equal(await page.locator('#document-input').inputValue(),'');await click('analyze');assert.match(await status(),/입력하세요/);
  for(const v of ['{broken','null','[]','1']){await input(v);await click('analyze');assert.match(await status(),/JSON/);}
  await input('가'.repeat(333334));await click('analyze');assert.match(await status(),/1 MB/);
  await input('{}');await click('analyze');assert.equal(await page.locator('#chart-body svg').count(),0);
  // Controlled engine result tests UI independently from numerical engine validation.
  await page.evaluate(()=>{window.__actualEngine=window.HASMarketData;window.__calls=[];window.HASMarketData={analyzeJSON:(raw,now)=>{const pack=JSON.parse(raw);window.__calls.push(now);return {status:'invalid',mode:pack.mode,instrument:{ticker:'<img src=x onerror=alert(1)>',currency:'KRW'},quote:{status:'rejected',label:'거절 · stale',selected:{source:'<script>alert(1)</script>',exchangeTimestamp:'2000-01-01T00:00:00Z',receivedAt:'2000-01-01T00:00:00Z'},issues:['오래된 시세 거절']},chart:{status:'ok',points:pack.points||[{date:'2026-01-01',close:10,sma20:null,sma50:null,volume:1},{date:'2026-01-02',close:null},{date:'2026-01-03',close:10}],metrics:{}},valuation:{ticker:'WRONG-VALUATION-IDENTITY',quality:{status:'missing'}},issues:['사용 권리 확인 필요']};}};});
  await input('{"mode":"synthetic"}');await click('analyze');assert.match(await status(),/검사 완료/);assert.equal(await page.locator('[data-signal]').count(),3);assert.equal(await page.locator('#quote-body img,#quote-body script,#chart-body img').count(),0);assert.match(await page.locator('#quote-body').innerText(),/IMPORTED/);assert.doesNotMatch(await page.locator('#chart-body').innerText(),/WRONG-VALUATION/);assert.equal(await page.locator('svg polyline.close').count(),2);
  assert.ok(Date.now()-Date.parse(await page.evaluate(()=>window.__calls.at(-1)))<60000);
  for(const points of [[],[{date:'one',close:0}],[{date:'a',close:1},{date:'b',close:1}]]){await input(JSON.stringify({points}));assert.equal(await page.locator('svg').count(),0);await click('analyze');assert.doesNotMatch(await page.locator('#chart-body').innerHTML(),/NaN|Infinity/);}
  await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));assert.equal(await page.locator('[data-signal]').count(),0);
  await page.evaluate(()=>{window.HASMarketData=null;});await click('analyze');assert.match(await status(),/엔진/);
  await page.evaluate(()=>{window.HASMarketData=window.__actualEngine;});
  await click('load-sample');assert.match(await status(),/SYNTHETIC/);await click('analyze');assert.match(await status(),/검사 완료/);assert.ok(await page.locator('svg polyline.close').count()>0);assert.match(await page.locator('#quote-body').innerText(),/SYNTHETIC/);
  for(const hash of ['input','quote','chart','signals']){await page.locator('nav a[href="#'+hash+'"]').click();assert.equal(new URL(page.url()).hash,'#'+hash);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const targets=await page.locator('button,nav a').evaluateAll(nodes=>nodes.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));assert.ok(targets.every(r=>r.w>=44&&r.h>=44));
  await click('reset');await click('reset');assert.equal(await page.locator('#document-input').inputValue(),'');assert.equal(await page.locator('svg').count(),0);
  assert.deepEqual(await page.evaluate(()=>[localStorage.getItem('HAS_SENTINEL'),localStorage.length,sessionStorage.getItem('HAS_SESSION'),sessionStorage.length]),['unchanged',1,'unchanged',1]);assert.deepEqual(writes,[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  await context.close();console.log('PASS data workbench DOM and layout '+width+'px');
 } finally {await browser.close();}
}
(async()=>{for(const width of [360,390,430,1280])await run(width);})().catch(e=>{console.error(e);process.exitCode=1;});
