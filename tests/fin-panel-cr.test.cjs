'use strict';
// 지피 GPT-REVIEW-fin-wire-20261128-0730 CR-FIN-1~3 시험(JSDOM, 가짜 fetch·가짜 타이머·가짜 스크립트 로드). 판단 라벨은 바꾸지 않는다.
const test=require('node:test'),a=require('node:assert/strict'),fs=require('fs'),path=require('path'),{JSDOM}=require('jsdom');
const R=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const tick=async(n)=>{for(let i=0;i<(n||6);i++)await new Promise(r=>setTimeout(r,0));};
const NOW=Date.parse('2026-11-26T01:00:00Z'),DAY=86400000;
const yrs=(n)=>Array.from({length:n},(_,i)=>{const y=2025-i;return {end:y+'-12-31',filed:(y+1)+'-02-10',revenue:1e9+i,operatingIncome:2e8,netIncome:1.5e8,ocf:1.8e8,capex:0.6e8,interest:1e6,equity:9e8,cash:3e8,debt:1e8,sources:{},conflicts:[]};});
const rec=(t,o,n)=>Object.assign({version:1,ticker:t,cik:'1',fetchedAt:'2026-11-26T00:00:00.000Z',source:'x',verification:'unverified',normalized:Object.assign({ok:true,version:'has-fundamental-v1',financial:false,cik:'1',name:t,ticker:t,years:yrs(5)},n||{})},o||{});
const card=(t,v,m)=>({ticker:t,market:m||'US',name:t+' Co',verdict:v,headline:'h '+t,reasons:['r'],risks:['k'],sources:[{title:'s',url:'https://example.com/'}]});
/* opt: files(티커→자료|'ERR'|'HANG'|undefined), cards(곡소리), hold(보유 카드), mods: true=미리 로드, false=지연 로드(가짜) */
function dom(opt){
  const d=new JSDOM('<!doctype html><body><div id="hasBriefStrip"><div class="hdb-head">머리줄</div></div><section id="m"></section></body>',{url:'https://example.test/',runScripts:'outside-only'});const w=d.window;
  const clock={now:NOW};w.Date.now=()=>clock.now;w.__fetched=[];w.__hang=[];
  const timers=[];w.setTimeout=(f,ms)=>{timers.push({f,ms,on:true});return timers.length;};w.clearTimeout=(id)=>{if(timers[id-1])timers[id-1].on=false;};
  const fire=(ms)=>timers.filter(t=>t.on&&t.ms===ms).forEach(t=>{t.on=false;t.f();});
  const mk=(cards)=>({v:1,reviewedAt:'2026-11-26T07:10:00+09:00',reviewer:'Claude',notice:'AI 검토 의견이며 투자 자문이 아닙니다.',cards});
  w.fetch=(u)=>{w.__fetched.push(u);const m=/data\/fundamentals\/([A-Z.\-]+)\.json/.exec(u);
    if(m){const f=(opt.files||{})[m[1]];if(f==='ERR')return Promise.reject(Error('net'));
      if(f==='HANG')return new Promise((res)=>w.__hang.push((v)=>res({ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(v))})));
      if(f===undefined)return Promise.resolve({ok:false,status:404,json:async()=>({})});return Promise.resolve({ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(f))});}
    if(/holdings-latest/.test(u))return Promise.resolve({ok:!!opt.hold,status:200,json:async()=>mk(opt.hold||[])});
    if(/fear-us-latest/.test(u))return Promise.resolve({ok:true,status:200,json:async()=>mk(opt.us||[])});
    return Promise.resolve({ok:/\/latest\.json$/.test(u),status:200,json:async()=>mk(opt.cards||[])});};
  w.eval(R('has/fundamental-filter.js'));
  if(opt.mods!==false){w.eval(R('has/review-fin-gate.js'));w.eval(R('has/fin-panel.js'));}
  w.eval(R('has/review-cards.js'));
  // 가짜 스크립트 로드: 태그 src를 보고 실제 파일을 eval한 뒤 onload, 또는 onerror.
  w.__load=(f,ok)=>{const s=w.document.head.querySelector('script[data-fin-src="'+f+'"]');a.ok(s,'script '+f);if(ok){w.eval(R(f));s.onload();}else s.onerror();};
  return {w,clock,fire,timers};}
async function show(w){const m=w.document.getElementById('m');w.HASReviewCards.mount(m);await tick();return m;}
const art=(m,t)=>[...m.querySelectorAll('article')].find(x=>x.textContent.includes('('+t+')'));
const fp=(m,t)=>art(m,t).querySelector('[data-testid=fin-panel]');

// ── CR-FIN-1 식별자·시점 교차검증
test('CR-FIN-1: 외피 AAA + 내부 BBB 재무는 AAA 카드에 표시하지 않음(식별자 불일치·판단 보류)',async()=>{
  const {w}=dom({files:{AAA:rec('AAA',null,{ticker:'BBB'})},cards:[card('AAA','buy-review')]});const m=await show(w);
  a.match(fp(m,'AAA').textContent,/식별자 불일치.* · 판단 보류/);a.equal(art(m,'AAA').querySelector('[data-testid=fin-label]'),null);});
test('CR-FIN-1: CIK가 외피·내부에서 다르거나 한쪽만 있으면 불일치',async()=>{
  const {w}=dom({files:{AAA:rec('AAA',{cik:'2'}),BBB:rec('BBB',{cik:undefined})},cards:[card('AAA','buy-review'),card('BBB','buy-review')]});const m=await show(w);
  for(const t of ['AAA','BBB']){a.match(fp(m,t).textContent,/식별자 불일치/);a.equal(art(m,t).querySelector('[data-testid=fin-label]'),null);}});
test('CR-FIN-1: 미래 수집 시각·느슨한 시각 형식은 판정하지 않음(음수 경과일로 최신 처리 금지)',async()=>{
  const {w}=dom({files:{FUT:rec('FUT',{fetchedAt:'2026-11-27T01:00:00.000Z'}),LOO:rec('LOO',{fetchedAt:'2026-11-26'}),OFS:rec('OFS',{fetchedAt:'2026-11-26T00:00:00+09:00'})},cards:['FUT','LOO','OFS'].map(t=>card(t,'buy-review'))});const m=await show(w);
  for(const t of ['FUT','LOO','OFS']){a.match(fp(m,t).textContent,/수집 시각 형식 오류 또는 미래 시각 · 판단 보류/,t);a.equal(art(m,t).querySelector('[data-testid=fin-label]'),null);}});
test('CR-FIN-1: 수집 뒤 공시·결산 전 공시·미래 결산은 차단',async()=>{
  const r1=rec('PFA');r1.normalized.years[0].filed='2026-11-27';            // 수집(11-26)보다 늦은 공시
  const r2=rec('PFB');r2.normalized.years[1].filed='2024-06-30';            // 결산(2024-12-31) 전 공시
  const r3=rec('PFC');r3.normalized.years.unshift({...yrs(1)[0],end:'2026-12-31',filed:''});r3.normalized.years.pop(); // 미래 결산
  const {w}=dom({files:{PFA:r1,PFB:r2,PFC:r3},cards:['PFA','PFB','PFC'].map(t=>card(t,'add-review'))});const m=await show(w);
  for(const t of ['PFA','PFB','PFC']){a.match(fp(m,t).textContent,/결산일·공시일 충돌\(미래 공시 또는 결산 전 공시\) · 판단 보류/,t);a.equal(art(m,t).querySelector('[data-testid=fin-label]'),null);}});
test('CR-FIN-1: 4일 경계 — 정확히 4일은 현재, 4일+1분은 과거 참고를 판정보다 먼저 표시하고 재무 없음 취급',async()=>{
  const {w}=dom({files:{EQD:rec('EQD',{fetchedAt:new Date(NOW-4*DAY).toISOString()}),GTD:rec('GTD',{fetchedAt:new Date(NOW-4*DAY-60000).toISOString()})},cards:[card('EQD','buy-review'),card('GTD','buy-review')]});const m=await show(w);
  a.equal(fp(m,'EQD').querySelector('[data-testid=fin-stale]'),null);a.doesNotMatch(fp(m,'EQD').querySelector('[data-testid=fin-gate]').textContent,/재무 자료 없음/);
  const box=fp(m,'GTD'),kids=[...box.children].map(x=>x.getAttribute('data-testid'));a.ok(kids.indexOf('fin-stale')>=0&&kids.indexOf('fin-stale')<kids.indexOf('fin-label'));
  a.match(box.querySelector('[data-testid=fin-label]').textContent,/과거 참고/);a.match(box.querySelector('[data-testid=fin-gate]').textContent,/재무 자료 없음·형식 불명/);
  a.match(art(m,'GTD').textContent,/🧠 매수 후보 · 판단 보류/);});
test('CR-FIN-1: IFRS(20-F) 제출 기업은 미지원 안내, 3년 미만 자료는 부족 판정으로 보류 유지(허위 결론 없음)',async()=>{
  const ifrs=rec('IFR',null,{ok:false,reason:'ifrs-filer',years:undefined});const few=rec('FEW');few.normalized.years=yrs(2);
  const {w}=dom({files:{IFR:ifrs,FEW:few},cards:[card('IFR','buy-review'),card('FEW','buy-review')]});const m=await show(w);
  a.match(fp(m,'IFR').textContent,/IFRS·20-F\) — 미지원 · 판단 보류/);a.equal(art(m,'IFR').querySelector('[data-testid=fin-label]'),null);
  a.match(fp(m,'FEW').querySelector('[data-testid=fin-label]').textContent,/연간 공시 3년 미만/);a.match(fp(m,'FEW').querySelector('[data-testid=fin-gate]').textContent,/판단 보류 유지/);
  a.match(fp(m,'FEW').querySelector('[data-testid=fin-meta]').textContent,/판정 임계값은 미검증 제안 기준/);});
test('CR-FIN-1: check()는 정상 자료만 ok',()=>{
  const {w}=dom({});const P=w.HASFinPanel,F=w.HASFundamentalFilter;
  a.equal(P.check(rec('AAA'),'AAA',F,NOW),'ok');a.equal(P.check(rec('AAA'),'BBB',F,NOW),'mismatch');a.equal(P.check(null,'AAA',F,NOW),'invalid');a.equal(P.check(rec('AAA',{version:2}),'AAA',F,NOW),'invalid');});

// ── CR-FIN-2 보유종목 팝업 비동기 갱신
async function holdDom(extra){const t=dom(Object.assign({hold:[card('HB','buy-review'),card('HW','hold-long')]},extra));t.w.document.dispatchEvent(new t.w.Event('DOMContentLoaded'));await tick();return t;}
const pane=(w)=>w.document.getElementById('hasHoldReview');
test('CR-FIN-2: 첫 팝업이 모듈을 지연 로드해도 로드 완료 뒤 같은 팝업 카드가 채워짐(다시 그리지 않음)',async()=>{
  const {w}=await holdDom({mods:false,files:{HB:rec('HB'),HW:rec('HW')}});w.HASReviewCards.openHoldings();
  const p=pane(w),hb=art(p,'HB');hb.querySelector('details').open=true;a.equal(hb.querySelector('[data-testid=fin-panel]'),null);
  w.__load('has/review-fin-gate.js',true);a.equal(hb.querySelector('[data-testid=fin-panel]'),null,'두 파일 모두 로드 전엔 준비 안 됨');
  w.__load('has/fin-panel.js',true);await tick();
  a.equal(art(p,'HB'),hb,'같은 카드 요소 유지');a.ok(hb.querySelector('details').open,'접힘 상태 유지');
  a.match(hb.querySelector('[data-testid=fin-label]').textContent,/SEC 공시 자동 수집/);a.match(hb.querySelector('[data-testid=fin-gate]').textContent,/판단 보류 유지/);
  a.ok(art(p,'HW').querySelector('[data-testid=fin-label]'),'비매수 카드도 재무 근거 표시');a.equal(art(p,'HW').querySelector('[data-testid=fin-gate]'),null);});
test('CR-FIN-2: 팝업의 "불러오는 중"은 fetch 완료 뒤 그 자리에서 갱신, 닫은 팝업에 늦게 온 응답은 무시하고 다시 연 팝업은 캐시로 표시',async()=>{
  const {w}=await holdDom({files:{HB:'HANG',HW:'HANG'}});w.HASReviewCards.openHoldings();let p=pane(w);
  a.match(art(p,'HB').querySelector('[data-testid=fin-panel]').textContent,/불러오는 중/);
  w.__hang[0](rec('HB'));await tick();a.match(art(p,'HB').querySelector('[data-testid=fin-label]').textContent,/SEC 공시/);
  w.HASReviewCards.openHoldings();const p2=pane(w);a.notEqual(p2,p);const old=art(p,'HB');
  a.ok(art(p2,'HB').querySelector('[data-testid=fin-label]'),'다시 연 팝업은 캐시로 바로 표시');
  // HW: 닫힌(교체된) 팝업 자리에는 쓰지 않고 새 팝업 자리만 채움
  const oldHW=art(p,'HW').querySelector('[data-testid=fin-slot]');w.__hang[1](rec('HW'));await tick();
  a.equal(oldHW.children.length,0);a.ok(art(p2,'HW').querySelector('[data-testid=fin-label]'));a.ok(old);
  a.equal(w.__fetched.filter(u=>/HB\.json$/.test(u)).length,1,'중복 요청 없음');});
test('CR-FIN-2: 국내/미국 탭 전환 뒤에도 미국 카드에 재무 블록 유지, 재요청 없음',async()=>{
  const {w}=dom({files:{UA:rec('UA')},us:[card('UA','buy-review')],cards:[card('005930','buy-review','KR')]});const m=await show(w);
  a.ok(fp(m,'UA'));w.HASFearMarket='KR';w.dispatchEvent(new w.Event('has:fear-market'));await tick();a.equal(art(m,'UA'),undefined);a.match(fp(m,'005930').textContent,/DART/);
  w.HASFearMarket='US';w.dispatchEvent(new w.Event('has:fear-market'));await tick();a.ok(fp(m,'UA').querySelector('[data-testid=fin-label]'));
  a.equal(w.__fetched.filter(u=>/UA\.json$/.test(u)).length,1);});

// ── CR-FIN-3 로드/캐시 실패 영구화 방지
test('CR-FIN-3: 모듈 하나만 실패해도 카드 표시는 그대로, 매수 카드엔 보류 안내 — 60초 뒤 다시 그리면 재시도, 최대 3회',async()=>{
  const {w,clock}=dom({mods:false,files:{AAA:rec('AAA')},cards:[card('AAA','buy-review'),card('WWW','wait')]});const m=await show(w);
  w.__load('has/review-fin-gate.js',true);w.__load('has/fin-panel.js',false);
  a.match(art(m,'AAA').querySelector('[data-testid=fin-module-error]').textContent,/재무 모듈을 불러오지 못함 · 판단 보류/);a.match(art(m,'AAA').textContent,/🧠 매수 후보 · 판단 보류/);
  a.equal(art(m,'WWW').querySelector('[data-testid=fin-module-error]'),null);
  w.HASReviewCards.mount(m);await tick();a.ok(art(m,'AAA').querySelector('[data-testid=fin-module-error]'),'60초 안에는 재시도 안 함');a.equal(w.document.head.querySelectorAll('script').length,0,'실패 세대 태그 정리');
  clock.now+=61000;w.HASReviewCards.mount(m);await tick();a.equal(w.document.head.querySelectorAll('script').length,2,'이전 태그 교체');
  w.__load('has/review-fin-gate.js',true);w.__load('has/fin-panel.js',true);await tick();a.ok(art(m,'AAA').querySelector('[data-testid=fin-label]'),'재시도 성공 시 채움');});
test('CR-FIN-3: 모듈 로드가 15초 넘게 끝나지 않으면 보류 안내(늦게 온 onload는 무시)',async()=>{
  const {w,fire}=dom({mods:false,cards:[card('AAA','buy-review')]});const m=await show(w);
  const tags=[...w.document.head.querySelectorAll('script')],cbs=tags.map(t=>t.onload);fire(15000);
  a.ok(art(m,'AAA').querySelector('[data-testid=fin-module-error]'));a.equal(w.document.head.querySelectorAll('script').length,0,'시간 초과 세대 태그 정리');
  a.ok(tags.every(t=>t.onload===null&&t.onerror===null),'콜백 정리');
  w.eval(R('has/review-fin-gate.js'));w.eval(R('has/fin-panel.js'));cbs.forEach(f=>f());await tick();   // 늦게 실행된 스크립트·옛 onload
  a.ok(art(m,'AAA').querySelector('[data-testid=fin-module-error]'),'시간 초과 뒤 onload로 덮어쓰지 않음');
  w.HASReviewCards.mount(m);await tick();a.ok(art(m,'AAA').querySelector('[data-testid=fin-module-error]'),'실패 세대 뒤 늦게 생긴 전역 객체를 바로 쓰지 않음');a.equal(art(m,'AAA').querySelector('[data-testid=fin-panel]'),null);});
test('CR-FIN-3: 자료 요청 15초 초과 → 오류·다시 불러오기, 늦게 온 응답 무시, 수동 재시도는 3회까지',async()=>{
  const {w,fire}=dom({files:{AAA:'HANG'},cards:[card('AAA','buy-review')]});const m=await show(w);
  fire(15000);const box=()=>fp(m,'AAA');a.match(box().textContent,/자료를 읽지 못함\(연결 실패 또는 시간 초과\) · 판단 보류/);
  w.__hang[0](rec('AAA'));await tick();a.equal(box().querySelector('[data-testid=fin-label]'),null,'늦은 응답 무시');
  a.match(box().querySelector('[data-testid=fin-retry]').textContent,/\(수동 1\/3\)/);a.match(box().querySelector('[data-testid=fin-auto-note]').textContent,/수동 재시도 횟수와 별개/);
  box().querySelector('[data-testid=fin-retry]').click();a.match(box().textContent,/불러오는 중/);fire(15000);
  a.match(box().querySelector('[data-testid=fin-retry]').textContent,/\(수동 2\/3\)/);box().querySelector('[data-testid=fin-retry]').click();fire(15000);
  a.match(box().querySelector('[data-testid=fin-retry]').textContent,/\(수동 3\/3\)/);box().querySelector('[data-testid=fin-retry]').click();fire(15000);
  a.equal(box().querySelector('[data-testid=fin-retry]'),null,'수동 3회 뒤 버튼 없음');a.equal(w.__fetched.filter(u=>/AAA\.json$/.test(u)).length,4,'처음 1 + 수동 3');});
test('CR-FIN-3: 수동 재시도 성공 시 그 카드만 채움, 오류는 60초 뒤 다시 그릴 때 자동 재요청, 성공 자료는 6시간 뒤 갱신',async()=>{
  const files={AAA:'ERR'};const {w,clock}=dom({files,cards:[card('AAA','buy-review')]});const m=await show(w);
  a.ok(fp(m,'AAA').querySelector('[data-testid=fin-retry]'));files.AAA=rec('AAA');
  w.HASReviewCards.mount(m);await tick();a.equal(w.__fetched.filter(u=>/AAA\.json$/.test(u)).length,1,'60초 안 자동 재요청 없음');
  fp(m,'AAA').querySelector('[data-testid=fin-retry]').click();await tick();a.ok(fp(m,'AAA').querySelector('[data-testid=fin-label]'));
  clock.now+=3*3600000;w.HASReviewCards.mount(m);await tick();a.equal(w.__fetched.filter(u=>/AAA\.json$/.test(u)).length,2);
  clock.now+=3*3600000+1000;w.HASReviewCards.mount(m);await tick();a.equal(w.__fetched.filter(u=>/AAA\.json$/.test(u)).length,3,'6시간 뒤 갱신');a.ok(fp(m,'AAA').querySelector('[data-testid=fin-label]'));});
test('CR-FIN-3: 같은 종목 동시 요청은 하나로 합쳐 두 카드 모두 채움',async()=>{
  const {w}=dom({files:{AAA:'HANG'},cards:[card('AAA','buy-review')],us:[card('AAA','add-review')]});const m=await show(w);
  a.equal(w.__fetched.filter(u=>/AAA\.json$/.test(u)).length,1);w.__hang[0](rec('AAA'));await tick();
  a.equal(m.querySelectorAll('[data-testid=fin-label]').length,2);});
test('CR-FIN-3: 정적 같은 사이트 JSON만 읽음(KIS·GAS·외부 주소 없음)',()=>{const s=R('has/fin-panel.js');a.ok(!/https?:\/\//.test(s.replace(/^\s*\/?\*.*$/gm,'')));a.ok(!/script\.google|kis|openapi/i.test(s));});

// ── CR-FIN-R1(지피 GPT-REVIEW-fin-wire-20261128-0930): CIK 표준화·잘못된 시각 안전 처리
test('CR-FIN-R1: CIK 선행 0 차이는 같은 회사(양방향·실제 4종목과 같은 형태), 다른 CIK는 불일치',()=>{
  const {w}=dom({});const P=w.HASFinPanel,F=w.HASFundamentalFilter;
  const c=(outer,inner)=>P.check(rec('AAA',{cik:outer},{cik:inner}),'AAA',F,NOW);
  for(const [o,i] of [['1736297','0001736297'],['0001736297','1736297'],['1973239','0001973239'],['1769628','0001769628'],['2023554','0002023554'],[1736297,'0001736297'],['0001736297',1736297],['24741','24741']])a.equal(c(o,i),'ok',o+'/'+i);
  for(const [o,i] of [['1736297','0001736298'],['0001973239','1973238'],[24741,'24742']])a.equal(c(o,i),'mismatch',o+'/'+i);});
test('CR-FIN-R1: CIK 누락(한쪽·양쪽)·숫자 형식 오류·객체·0·범위 초과는 보류(cik)',()=>{
  const {w}=dom({});const P=w.HASFinPanel,F=w.HASFundamentalFilter;
  const c=(outer,inner)=>{const r=rec('AAA',{cik:outer},{cik:inner});if(outer===undefined)delete r.cik;if(inner===undefined)delete r.normalized.cik;return P.check(r,'AAA',F,NOW);};
  const bad=[undefined,null,'',0,'0','0000000000',-1,'-1',1.5,'1.5',12345678901,'12345678901',{},[],{cik:'1'},'1a',' 1',NaN,Infinity,true];
  for(const b of bad){a.equal(c(b,'1'),'cik','outer '+String(b));a.equal(c('1',b),'cik','inner '+String(b));}
  a.equal(c(undefined,undefined),'cik','양쪽 누락');a.equal(c({},{}),'cik','양쪽 객체');a.equal(c(0,0),'cik','양쪽 0');});
test('CR-FIN-R1: CIK 누락 카드 표시 — 식별 불가 안내·판정 없음·판단 보류',async()=>{
  const r=rec('NOC');delete r.cik;delete r.normalized.cik;const {w}=dom({files:{NOC:r},cards:[card('NOC','buy-review')]});const m=await show(w);
  a.match(fp(m,'NOC').textContent,/회사 식별번호\(CIK\) 없음·형식 오류.* · 판단 보류/);a.equal(art(m,'NOC').querySelector('[data-testid=fin-label]'),null);a.match(art(m,'NOC').textContent,/판단 보류/);});
test('CR-FIN-R1: 존재하지 않는 날짜·잘못된 now는 예외 없이 시각 오류(time)',()=>{
  const {w}=dom({});const P=w.HASFinPanel,F=w.HASFundamentalFilter;
  for(const t of ['2026-13-01T00:00:00Z','2026-02-30T00:00:00.000Z','2026-00-10T00:00:00Z','2025-02-29T01:00:00Z','2026-11-26T24:00:00Z'])a.equal(P.check(rec('AAA',{fetchedAt:t}),'AAA',F,NOW),'time',t);
  for(const n of [NaN,Infinity,-Infinity,1e20,'1',null,undefined])a.equal(P.check(rec('AAA'),'AAA',F,n),'time',String(n));
  const r=rec('AAA');r.normalized.years[0].end='2025-13-31';a.doesNotThrow(()=>P.check(r,'AAA',F,NOW));a.notEqual(P.check(r,'AAA',F,NOW),'ok');});
test('CR-FIN-R1: 미래·경계 시각 — +5분은 시계 오차로만 허용(최신 근거로 안 씀), +5분+1ms는 시각 오류',async()=>{
  const {w}=dom({files:{SKW:rec('SKW',{fetchedAt:new Date(NOW+5*60000).toISOString()}),OVR:rec('OVR',{fetchedAt:new Date(NOW+5*60000+1).toISOString()}),EQN:rec('EQN',{fetchedAt:new Date(NOW).toISOString()})},cards:['SKW','OVR','EQN'].map(t=>card(t,'buy-review'))});const m=await show(w);
  a.ok(fp(m,'SKW').querySelector('[data-testid=fin-skew]'));a.match(fp(m,'SKW').querySelector('[data-testid=fin-gate]').textContent,/재무 자료 없음·형식 불명/);
  a.match(fp(m,'OVR').textContent,/수집 시각 형식 오류 또는 미래 시각 · 판단 보류/);
  a.equal(fp(m,'EQN').querySelector('[data-testid=fin-skew]'),null);a.doesNotMatch(fp(m,'EQN').querySelector('[data-testid=fin-gate]').textContent,/재무 자료 없음/);});
test('CR-FIN-R1: 비동기 갱신 중 표시 예외는 "불러오는 중"에 멈추지 않고 보류 안내',async()=>{
  const {w}=dom({files:{AAA:'HANG'},cards:[card('AAA','buy-review')]});const m=await show(w);a.match(fp(m,'AAA').textContent,/불러오는 중/);
  w.HASFundamentalFilter=Object.assign({},w.HASFundamentalFilter,{assess:()=>{throw new RangeError('boom');}});w.__hang[0](rec('AAA'));await tick();
  const slot=art(m,'AAA').querySelector('[data-testid=fin-slot]');a.doesNotMatch(slot.textContent,/불러오는 중/);a.match(slot.textContent,/재무 블록을 표시하지 못함 · 판단 보류/);a.match(art(m,'AAA').textContent,/🧠 매수 후보 · 판단 보류/);});
test('CR-FIN-R1: 저장소 실제 재무 JSON(읽기 전용)은 식별자 규칙을 통과(선행 0 4종목 포함) — 수집 시각은 고정 가정 없이 각 파일 기준',()=>{
  const {w}=dom({});const P=w.HASFinPanel,F=w.HASFundamentalFilter,dir=path.join(__dirname,'..','data','fundamentals');
  const files=fs.readdirSync(dir).filter(f=>/^[A-Z.\-]+\.json$/.test(f));a.ok(files.length>=1);
  for(const f of files){const j=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8')),t=f.replace(/\.json$/,'');if(!j||j.version!==1)continue;
    const now=Date.parse(j.fetchedAt)+3600000;a.ok(Number.isFinite(now),f);const r=P.check(j,t,F,now);a.ok(r==='ok'||r==='ifrs'||r==='invalid',f+' → '+r);a.notEqual(r,'cik',f);a.notEqual(r,'mismatch',f);a.notEqual(r,'time',f);}
  for(const t of ['ALAB','ARM','CRWV','SNDK']){const p=path.join(dir,t+'.json');if(!fs.existsSync(p))continue;const j=JSON.parse(fs.readFileSync(p,'utf8'));a.equal(P.check(j,t,F,Date.parse(j.fetchedAt)+3600000),'ok',t);}});

// ── CR-FIN-R2: 모듈 세대 정리·같은 티커 자리 동기화
test('CR-FIN-R2: 부분 로드 실패 뒤 늦은 onload·시간 초과는 무시, 60초 뒤 새 세대 성공 시 채움',async()=>{
  const {w,clock,fire}=dom({mods:false,files:{AAA:rec('AAA')},cards:[card('AAA','buy-review')]});const m=await show(w);
  const tags=[...w.document.head.querySelectorAll('script')],late=tags[1].onload;w.__load('has/review-fin-gate.js',true);w.__load('has/fin-panel.js',false);
  w.eval(R('has/fin-panel.js'));late();fire(15000);await tick();
  a.ok(art(m,'AAA').querySelector('[data-testid=fin-module-error]'));a.equal(w.document.head.querySelectorAll('script').length,0);
  w.HASReviewCards.mount(m);await tick();a.ok(art(m,'AAA').querySelector('[data-testid=fin-module-error]'),'실패 세대의 전역 객체 사용 안 함');
  clock.now+=61000;w.HASReviewCards.mount(m);await tick();a.equal(w.document.head.querySelectorAll('script').length,2,'새 세대');
  w.__load('has/review-fin-gate.js',true);w.__load('has/fin-panel.js',true);await tick();a.ok(art(m,'AAA').querySelector('[data-testid=fin-label]'));
  fire(15000);await tick();a.ok(art(m,'AAA').querySelector('[data-testid=fin-label]'),'성공 세대의 타이머는 해제됨');
  w.HASReviewCards.mount(m);await tick();a.ok(art(m,'AAA').querySelector('[data-testid=fin-label]'),'준비 상태 유지');});
test('CR-FIN-R2: 모듈 로드는 실제 3회 실패 뒤 더 시도하지 않음(카드 표시는 그대로)',async()=>{
  const {w,clock}=dom({mods:false,cards:[card('AAA','buy-review'),card('WWW','wait')]});const m=await show(w);let made=0;
  for(let i=0;i<3;i++){a.equal(w.document.head.querySelectorAll('script').length,2,'시도 '+(i+1));made++;w.__load('has/review-fin-gate.js',false);await tick();
    a.ok(art(m,'AAA').querySelector('[data-testid=fin-module-error]'));clock.now+=61000;w.HASReviewCards.mount(m);await tick();}
  a.equal(made,3);a.equal(w.document.head.querySelectorAll('script').length,0,'4번째 시도 없음');a.ok(art(m,'AAA').querySelector('[data-testid=fin-module-error]'));a.ok(art(m,'WWW'));
  clock.now+=10*61000;w.HASReviewCards.mount(m);await tick();a.equal(w.document.head.querySelectorAll('script').length,0);});
test('CR-FIN-R2: 같은 티커 두 열린 카드 — 한쪽 수동 재시도 성공 시 양쪽 채움',async()=>{
  const files={AAA:'ERR'};const {w}=dom({files,cards:[card('AAA','buy-review')],us:[card('AAA','add-review')]});const m=await show(w);
  const boxes=()=>[...m.querySelectorAll('[data-testid=fin-panel]')];a.equal(boxes().length,2);boxes().forEach(b=>a.match(b.querySelector('[data-testid=fin-retry]').textContent,/수동 1\/3/));
  files.AAA='HANG';boxes()[0].querySelector('[data-testid=fin-retry]').click();a.equal(boxes().filter(b=>/불러오는 중/.test(b.textContent)).length,2,'양쪽 같은 요청');
  w.__hang[0](rec('AAA'));await tick();a.equal(m.querySelectorAll('[data-testid=fin-label]').length,2);a.equal(m.querySelectorAll('[data-testid=fin-retry]').length,0);
  a.equal(w.__fetched.filter(u=>/AAA\.json$/.test(u)).length,2);});
test('CR-FIN-R2: 같은 티커 두 열린 카드 — 수동 상한 도달은 양쪽 버튼을 함께 없앰, 닫힌 자리는 제외',async()=>{
  const {w,fire}=dom({files:{AAA:'ERR'},cards:[card('AAA','buy-review')],us:[card('AAA','add-review')]});const m=await show(w);
  const boxes=()=>[...m.querySelectorAll('[data-testid=fin-panel]')];
  for(let i=0;i<3;i++){const b=boxes()[i%2].querySelector('[data-testid=fin-retry]');a.ok(b,'시도 '+i);b.click();await tick();
    boxes().forEach(x=>a.equal(!!x.querySelector('[data-testid=fin-retry]'),i<2,'양쪽 같은 상태 '+i));}
  a.equal(w.__fetched.filter(u=>/AAA\.json$/.test(u)).length,4);
  const gone=m.querySelector('[data-testid=fin-slot]');w.HASReviewCards.mount(m);await tick();a.equal(gone.isConnected,false);a.equal(boxes().length,2);boxes().forEach(x=>a.equal(x.querySelector('[data-testid=fin-retry]'),null));});
test('CR-FIN-R2: 다시 그려도 "재무 항목별 보기" 펼침 상태 유지(새 요청으로 잠깐 "불러오는 중"을 거쳐도)',async()=>{
  const {w,clock}=dom({files:{AAA:rec('AAA')},cards:[]});const P=w.HASFinPanel;const h1=w.document.createElement('div'),h2=w.document.createElement('div');w.document.body.append(h1,h2);
  P.attach(h1,card('AAA','buy-review'),{});await tick();const d=h1.querySelector('details');a.ok(d);d.open=true;d.dispatchEvent(new w.Event('toggle'));
  clock.now+=6*3600000+1000;P.attach(h2,card('AAA','buy-review'),{});a.match(h1.textContent,/불러오는 중/,'같은 요청 표시');await tick();
  a.equal(h1.querySelector('details').open,true,'펼침 유지');a.equal(h2.querySelector('details').open,false);});
