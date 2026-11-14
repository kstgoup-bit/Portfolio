'use strict';
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('real-mode radar (운영 기본) shows one 400종목 entry link, no request',t=>{
 const d=new JSDOM('<div id="panel-radar"></div>',{url:'https://synthetic.invalid/portfolio_v5.html',runScripts:'outside-only'}),w=d.window;t.after(()=>w.close());let fetches=0;
 w.fetch=()=>{fetches++;throw Error('No network');};w.scrollTo=()=>{};w.switchTab=()=>{};
 w.KSTRadarCore={loadState:()=>({state:{settings:{}}}),fixtureProvider:()=>({})};w.KSTRadarProviders={};w.KSTRadarVerification={};w.HASLivePricePanel={mount:()=>{}};
 w.eval(read('radar/ui.js'));
 const links=[...w.document.querySelectorAll('#panel-radar a')].filter(x=>x.getAttribute('href')==='./has/universe-screen.html');
 a.equal(links.length,1);a.equal(links[0].textContent,'400종목 가격 선별');a.equal(fetches,0);
 w.KSTRadar.openEuphoria();a.equal([...w.document.querySelectorAll('#panel-radar a')].filter(x=>x.getAttribute('href')==='./has/universe-screen.html').length,1);
});
test('screen copy is factual and failure reasons are Korean',async t=>{
 const html=read('has/universe-screen.html');a.doesNotMatch(html,/별도 포함/);a.match(html,/보유·확신 종목은 기존 곡소리 화면에서 확인/);
 const d=new JSDOM(html,{url:'https://example.invalid/has/universe-screen.html',runScripts:'outside-only'}),w=d.window;t.after(()=>w.close());
 for(const f of ['live-price-reference.js','universe-screen.js','universe-screen-ui.js'])w.eval(read('has/'+f));
 w.document.querySelector('#refresh').click();await new Promise(r=>setTimeout(r,0));
 const s=w.document.querySelector('#status').textContent;a.match(s,/조회 보류: GAS 주소가 없거나 형식이 맞지 않음/);a.doesNotMatch(s,/invalid-/);
});
