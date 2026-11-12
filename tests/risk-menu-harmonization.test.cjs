'use strict';
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {JSDOM}=require('jsdom');
const ROOT=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const html=read('portfolio_v5.html'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function navDOM(){
 const section=html.slice(html.indexOf('<!-- 대분류 탭 -->'),html.indexOf('<div id="hasPriceTrust"'));
 const d=new JSDOM('<!doctype html>'+section+'<main></main>',{url:'https://synthetic.invalid/portfolio_v5.html',runScripts:'outside-only'}),w=d.window;
 w.scrollTo=()=>{};w.renderMemo=w.renderRetirement=w.renderNotouch=w.renderDebt=w.renderNetWorth=w.renderPrincipleDash=()=>{};
 w.eval(html.slice(html.indexOf('var TAB_GROUPS='),html.indexOf('// 노터치 자산 (연금보험')));
 for(const tab of Object.keys(w.TAB_TO_GROUP)){const p=w.document.createElement('section');p.className='panel';p.id='panel-'+tab;w.document.querySelector('main').append(p);}
 return d;
}
test('risk menu preserves every existing internal destination and adds a separate same-origin euphoria entry',()=>{
 const d=navDOM();try{const w=d.window,nav=w.document.querySelector('#subtabs-risk');
 a.deepEqual(Array.from(w.TAB_GROUPS.risk),['principledash','risk','commandments','news','radar','ledgerdemo','staff','pretrade']);
 a.equal([...nav.querySelectorAll('.tab')].some(b=>/AI자문|'advisor'/.test(b.textContent+b.getAttribute('onclick'))),false); // 순태씨 결정 2026-11-11: AI자문 메뉴 제거(패널 코드는 보존)
 const buttons=[...nav.querySelectorAll('.tab')];a.equal(buttons.length,w.TAB_GROUPS.risk.length);
 a.match(buttons.find(b=>b.getAttribute('onclick').includes('ledgerdemo')).textContent,/거래 기록·손익 계산 체험/);
 a.match(buttons.find(b=>b.getAttribute('onclick').includes('pretrade')).textContent,/매매 점검/);
 const link=nav.querySelector('a.has-risk-shortcut');a.equal(link.getAttribute('href'),'./sell/index.html');a.match(link.textContent,/환호성 레이더/);a.equal(link.matches('.tab'),false);a.equal(link.hasAttribute('target'),false);
 a.equal(nav.textContent.includes('가상 검증·실운용 준비'),false);
 }finally{d.window.close();}
});
test('every internal menu still activates exactly its intended panel and button after the inserted anchor',()=>{
 const d=navDOM();try{const w=d.window;
 for(const [group,tabs]of Object.entries(w.TAB_GROUPS))for(const tab of tabs){
  w.switchTab(tab);a.deepEqual([...w.document.querySelectorAll('.panel.active')].map(n=>n.id),['panel-'+tab]);
  const nav=w.document.querySelector('#subtabs-'+group);if(nav){const active=nav.querySelectorAll('.tab.active');a.equal(active.length,1);a.equal(active[0].getAttribute('onclick'),"switchTab('"+tab+"')");}
 }
 w.switchTab('pretrade');w.switchGroup('invest');w.switchGroup('risk');a.equal(w.document.querySelector('.panel.active').id,'panel-pretrade');
 w.switchTab('unknown');a.equal(w.document.querySelector('.panel.active').id,'panel-pretrade');
 }finally{d.window.close();}
});
function ledgerDOM(){
 const d=new JSDOM('<!doctype html><section id="panel-ledgerdemo"></section>',{url:'https://synthetic.invalid/portfolio_v5.html',runScripts:'outside-only'}),w=d.window;let calls=[];
 for(const key of ['localStorage','sessionStorage','indexedDB'])Object.defineProperty(w,key,{get(){throw Error('Forbidden storage access: '+key);},configurable:true});
 w.fetch=()=>{throw Error('Forbidden network');};w.XMLHttpRequest=function(){throw Error('Forbidden network');};w.switchTab=t=>calls.push(t);
 for(const p of ['invest/ledger.js','has/ledger-demo-model.js','has/migration-sim.js','has/ledger-demo.js'])w.eval(read(p));
 w.HASLedgerDemo.onTabChange('pretrade');w.HASLedgerDemo.onTabChange('ledgerdemo');return {d,w,calls};
}
test('renamed ledger remains synthetic, with unchanged independently expected account totals',()=>{
 const {d,w}=ledgerDOM();try{
 const root=w.document.querySelector('#panel-ledgerdemo');a.match(root.querySelector('h2').textContent,/거래 기록·손익 계산 체험.*합성/);a.match(root.textContent,/실제 보유·수익이 아닙니다/);a.match(root.textContent,/저장되지 않으며 새로고침하면 사라집니다/);
 const gen=root.querySelector('[data-testid=hld-sum-gen]').textContent;a.match(gen,/165,150원/);a.match(gen,/9,880원/);a.match(gen,/2,538원/);
 const ov=root.querySelector('[data-testid=hld-sum-ov]').textContent;a.match(ov,/163,313원/);a.match(ov,/26,613원/);a.match(ov,/2,380원/);
 }finally{d.window.close();}
});
test('synthetic buy, oversell rejection, reset, repeat entry and back preserve the existing flow',()=>{
 const {d,w,calls}=ledgerDOM();try{
 const submit=(type,qty)=>{const f=w.document.querySelector('form');f.elements.type.value=type;f.elements.qty.value=String(qty);f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));};
 submit('buy',1);a.match(w.document.querySelector('[data-testid=hld-notice]').textContent,/추가한 시험 거래 1건/);
 a.match(w.document.querySelector('[data-testid=hld-sum-gen]').textContent,/175,150원/);
 submit('sell',9999);a.match(w.document.querySelector('[role=alert]').textContent,/추가하지 않았습니다/);
 w.document.querySelector('[data-testid=hld-reset]').click();a.match(w.document.querySelector('[data-testid=hld-sum-gen]').textContent,/165,150원/);
 w.HASLedgerDemo.onTabChange('ledgerdemo');a.equal(w.document.querySelectorAll('#panel-ledgerdemo h2').length,1);
 w.document.querySelector('[data-testid=hld-back]').click();a.deepEqual(calls,['pretrade']);
 }finally{d.window.close();}
});
test('existing euphoria destination remains an isolated synthetic research page without a new live connection',()=>{
 const page=read('sell/index.html');a.match(page,/환호성 매도 레이더/);a.match(page,/합성 데모.*실제 감시 0종목/);a.match(page,/connect-src 'none'/);a.match(page,/실제 보유 기록을 읽거나 변경하지 않습니다/);a.match(page,/\.\.\/portfolio_v5\.html#kst-radar\/real\/list/);
 const nav=html.slice(html.indexOf('id="subtabs-risk"'),html.indexOf('id="subtabs-asset"'));a.doesNotMatch(nav,/https?:|window\.open|iframe|실운용 준비/);
});
test('new shortcut is keyboard-accessible, bounded to its class and has declared 44px target sizing',()=>{
 const css=read('has/risk-menu-shortcuts.css');a.match(css,/min-height:44px/);a.match(css,/min-width:44px/);a.match(css,/:focus-visible/);a.doesNotMatch(css,/@import|url\(|position:fixed|\.tab[{:]/);
});
test('exact two edited runtime files reverse to the previous candidate and all old pins are retained',()=>{
 const pins=require('./lib/risk-menu-pins.json'),p=require('./lib/risk-menu-projection.cjs');
 a.equal(pins.baselineCommit,'8005cd0cd2540ad6a94612477cfface6236d7d63');a.deepEqual(Object.keys(pins.currentSha256).sort(),['has/ledger-demo.js','portfolio_v5.html']);
 for(const file of Object.keys(pins.currentSha256)){a.equal(sha(require('./lib/speed-minimal-projection.cjs').beforeSpeedBytes(file)),pins.currentSha256[file]);a.equal(sha(p.beforeRiskMenuBytes(file)),pins.baselineSha256[file]);}
 for(const[file,hash]of Object.entries(pins.addedRuntimeFiles))a.equal(sha(read(file)),hash);
 a.equal(require('./lib/daily-followup-pins.json').currentSha256['portfolio_v5.html'],pins.baselineSha256['portfolio_v5.html']);
});
