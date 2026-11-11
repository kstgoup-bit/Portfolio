'use strict';
// Optional real-browser layout check. Synthetic fragments only, no app boot.
// Not executed in the current environment (known internal-socket restriction).
const fs=require('node:fs'),path=require('node:path'),a=require('node:assert/strict'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(ROOT,p),'utf8'),html=read('portfolio_v5.html');
const styles=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')+'\n'+read('has/ledger-demo.css')+'\n'+read('has/risk-menu-shortcuts.css');
const nav=html.slice(html.indexOf('<!-- 대분류 탭 -->'),html.indexOf('<div id="hasPriceTrust"'));
const navigation=html.slice(html.indexOf('var TAB_GROUPS='),html.indexOf('// 노터치 자산 (연금보험'));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const width of [360,390,430,1280]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',isMobile:width<500,hasTouch:width<500});
  const attempts=[],errors=[];await context.route('**/*',r=>{attempts.push(r.request().url());return r.abort();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.setContent('<!doctype html><meta charset="utf-8"><style>'+styles+'</style>'+nav+'<main id="synthetic-panels"></main>');
  await page.evaluate(()=>{window.renderMemo=window.renderRetirement=window.renderNotouch=window.renderDebt=window.renderNetWorth=window.renderPrincipleDash=()=>{};});
  await page.addScriptTag({content:navigation});
  await page.evaluate(()=>{for(const tab of Object.keys(TAB_TO_GROUP)){const p=document.createElement('section');p.className='panel';p.id='panel-'+tab;document.querySelector('main').append(p);}switchTab('pretrade');});
  const shortcut=page.getByRole('link',{name:'환호성 레이더 · 합성 연구'});await shortcut.scrollIntoViewIfNeeded();
  a.equal(await shortcut.getAttribute('href'),'./sell/index.html');const box=await shortcut.boundingBox();a.ok(box.width>=44&&box.height>=44);a.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.getByRole('button',{name:'🧪 거래 기록·손익 계산 체험',exact:true}).click();a.equal(await page.locator('.panel.active').getAttribute('id'),'panel-ledgerdemo');
  await page.getByRole('button',{name:'📝 매매 점검',exact:true}).click();a.equal(await page.locator('.panel.active').getAttribute('id'),'panel-pretrade');
  for(const f of ['invest/ledger.js','has/ledger-demo-model.js','has/migration-sim.js','has/ledger-demo.js'])await page.addScriptTag({content:read(f)});
  await page.evaluate(()=>switchTab('ledgerdemo'));a.match(await page.locator('#panel-ledgerdemo h2').innerText(),/거래 기록·손익 계산 체험/);
  a.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));a.deepEqual(attempts,[]);a.deepEqual(errors,[]);
  console.log('PASS '+width+'px: synthetic menu and ledger fragment, preserved pretrade, no document overflow or network');await context.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
