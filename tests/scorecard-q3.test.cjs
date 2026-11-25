'use strict';
/* 큐 3 사후 검토 CR-Q3-1~4 (순태씨 E1~E4 승인) 합성 시험. 실제 기록·백업·GAS·네트워크 없음. */
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const S=require('../has/scorecard.js'),B=require('../backup/core.js');
const SRC=fs.readFileSync(path.join(__dirname,'../has/scorecard.js'),'utf8');
const bars=(arr)=>arr.map(([d,c])=>({d,c}));
const tr=(i,o={})=>({id:'trial-'+i,market:'KR',ticker:'001440',date:'2026-11-02',qty:1,price:100,...o});
const many=(n)=>Array.from({length:n},(_,i)=>tr(i));
let JSDOM=null;try{({JSDOM}=require('jsdom'));}catch(e){}

test('E1: 499→500 허용, 500→501 추가·부분매도는 쓰기 전 거절, 500 전량매도·삭제 허용',()=>{
  a.equal(S.checkWrite(many(500)),'');a.match(S.checkWrite(many(501)),/최대 500건/);
  const r=S.applySell(many(500),'trial-3',{date:'2026-11-05',qty:0.5,price:110},'trial-new');a.match(r.error,/최대 500건/);
  const f=S.applySell(many(500),'trial-3',{date:'2026-11-05',qty:1,price:110},'trial-new');a.equal(f.trades.length,500);a.equal(f.trades[3].sellPrice,110);
  a.equal(S.checkWrite(many(500).slice(1)),'');
});
test('E1: 중복 ID·숫자 문자열·없는 날짜·매도일 역전·매도 쌍 불일치 거절, 작은 소수 수량 보존',()=>{
  a.notEqual(S.checkWrite([tr(1),tr(1)]),'');
  a.equal(S.validTrade(tr(1,{qty:'5'})),false);a.equal(S.validTrade(tr(1,{price:'100'})),false);
  a.equal(S.validTrade(tr(1,{date:'2026-02-30'})),false);a.equal(S.validTrade(tr(1,{date:'2026-13-01'})),false);
  a.equal(S.validTrade(tr(1,{sellDate:'2026-11-01',sellPrice:90})),false);
  a.equal(S.validTrade(tr(1,{sellDate:'2026-11-05'})),false);a.equal(S.validTrade(tr(1,{sellPrice:90})),false);
  a.equal(S.validTrade(tr(1,{kind:null})),false);a.ok(S.validTrade(tr(1,{kind:'exception'})));
  const r=S.applySell([tr(1,{qty:0.2})],'trial-1',{date:'2026-11-05',qty:0.0727,price:120},'trial-2');
  a.equal(r.trades[0].qty,0.1273);a.equal(r.trades[1].qty,0.0727);
  a.ok(S.applySell([tr(1)],'trial-1',{date:'2026-02-30',qty:1,price:1},'x').error);
  a.ok(S.applySell([tr(1)],'trial-1',{date:'2026-11-05',qty:0.5,price:1},'trial-1').error);
});
test('E2: 앱 분류와 백업 분류가 같은 입력에 같은 결과(정상·옛 형식·손상), 백업은 손상만 거절',()=>{
  const corpus=[[],many(3),many(500),many(501),many(2000),many(2001),[tr(1),tr(1)],[{market:'KR',ticker:'X',date:'x',qty:1,price:1}],
    [tr(1,{qty:'5'})],[tr(1,{date:'2026-02-30'})],[tr(1,{sellDate:'2026-11-01',sellPrice:9})],[tr(1,{kind:null})],[tr(1,{kind:'yolo'})],
    [{ticker:'001440',market:'KR',date:'2026-11-02',qty:1,price:1}],[tr(1,{market:'JP'})],[tr(1,{qty:0})],[null],[[1]],{},'x',[tr(1,{sellPrice:9})],[tr(1,{id:''})]];
  for(const c of corpus){
    const app=S.classifyTrades(c),bak=B.trialClass(c);a.equal(app,bak,JSON.stringify(c).slice(0,80));
    const raw=JSON.stringify(c);if(app==='bad')a.throws(()=>B.validateStoredValue('has_trialTrades_v1',raw));else a.doesNotThrow(()=>B.validateStoredValue('has_trialTrades_v1',raw));
    a.equal(S.classifyText(raw).state,app);
  }
  a.equal(S.classifyTrades(many(501)),'legacy');a.equal(S.parseTrades(JSON.stringify(many(501))),null);
  a.equal(S.classifyTrades([{ticker:'001440',market:'KR',date:'2026-11-02',qty:1,price:1}]),'legacy');
  a.equal(S.classifyTrades([tr(1,{qty:'5'})]),'bad');
});
test('E2: 옛 형식 원문은 백업 생성·복원·되돌리기에서 바이트 그대로 보존',()=>{
  const mem=(seed={})=>{const m=new Map(Object.entries(seed));return{get length(){return m.size;},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),all:()=>Object.fromEntries(m)};};
  const legacyRaw=JSON.stringify([{ticker:'001440',market:'KR',date:'2026-11-02',qty:1,price:1}]);
  const seed=Object.fromEntries(B.ACCOUNTS.map(k=>[k,'[]']));
  const src=mem({...seed,has_trialTrades_v1:legacyRaw}),text=JSON.stringify(B.create(src));
  const dst=mem({...seed,has_trialTrades_v1:JSON.stringify([tr(9)])}),before=dst.getItem('has_trialTrades_v1');
  B.apply(dst,B.parse(text));a.equal(dst.getItem('has_trialTrades_v1'),legacyRaw);
  B.undo(dst);a.equal(dst.getItem('has_trialTrades_v1'),before);
});
test('E3: 종목·지수 기간이 다르면 검증 불가(분모 제외), 같은 날짜 쌍만 채점',()=>{
  const now=Date.parse('2026-11-27T10:00:00+09:00'),at='2026-11-24T22:30:00+09:00';
  // 지피 예: 종목 11/24→11/26 100→110, 지수 11/23→11/25 100→105
  const s1={'KR:001440':bars([['2026-11-24',100],['2026-11-26',110]]),'KR:069500':bars([['2026-11-23',100],['2026-11-25',105]])};
  const r1=S.score([{ticker:'001440',market:'KR',name:'a',verdict:'buy-review',reviewedAt:at}],s1,now);
  a.equal(r1.rows[0].status,'unverifiable');a.equal(r1.rows[0].hit,undefined);a.equal(r1.groups['buy-review'].scored,0);a.equal(r1.groups['buy-review'].unverifiable,1);
  const s2={'KR:001440':bars([['2026-11-24',100],['2026-11-25',104],['2026-11-26',110]]),'KR:069500':bars([['2026-11-24',100],['2026-11-25',105]])};
  const r2=S.score([{ticker:'001440',market:'KR',name:'a',verdict:'buy-review',reviewedAt:at}],s2,now).rows[0];
  a.equal(r2.status,'ok');a.equal(r2.startDate,'2026-11-24');a.equal(r2.lastDate,'2026-11-25');a.ok(Math.abs(r2.excess+1)<1e-9);a.equal(r2.hit,false);
});
test('E3: 확정 전(장중·미래) 봉 제외, 상충 중복일 보류, 같은 값 중복은 하나로, 없는 날짜 버림',()=>{
  const at='2026-11-24T22:30:00+09:00',e=[{ticker:'001440',market:'KR',name:'a',verdict:'buy-review',reviewedAt:at}];
  const s={'KR:001440':bars([['2026-11-24',100],['2026-11-25',110],['2026-11-26',150]]),'KR:069500':bars([['2026-11-24',100],['2026-11-25',100],['2026-11-26',100]])};
  const r=S.score(e,s,Date.parse('2026-11-26T10:00:00+09:00')).rows[0];a.equal(r.lastDate,'2026-11-25');a.ok(Math.abs(r.ret-10)<1e-9);
  const c=S.cleanBars({bars:[{d:'2026-11-24',c:100},{d:'2026-11-24',c:100},{d:'2026-11-25',c:110},{d:'2026-11-25',c:111},{d:'2026-02-30',c:5}]});
  a.equal(c.length,2);a.equal(c[0].c,100);a.ok(Number.isNaN(c[1].c));a.equal(c[1].conflict,true);
  const s3={'KR:001440':c,'KR:069500':bars([['2026-11-24',100],['2026-11-25',100]])};
  const r3=S.score(e,s3,Date.parse('2026-11-27T10:00:00+09:00')).rows[0];a.equal(r3.status,'unverifiable');a.match(r3.why,/상충/);
  const r4=S.score(e,{'KR:001440':bars([['2026-11-24',100]]),'KR:069500':bars([['2026-11-24',100]])},Date.parse('2026-11-27T10:00:00+09:00')).rows[0];a.equal(r4.status,'too-early');
});
test('E3: 실전 검증 — 지수는 산 날·끝날 같은 날짜 종가만, 없으면 검증 불가, 부분 합계 건수 표시',()=>{
  const now=Date.parse('2026-11-27T10:00:00+09:00');
  const t1=tr(1,{date:'2026-11-24',price:100}),t2=tr(2,{date:'2026-11-22',price:100}),t3=tr(3,{ticker:'005930',date:'2026-11-24'});
  const series={'KR:001440':bars([['2026-11-22',100],['2026-11-24',100],['2026-11-26',120],['2026-11-27',999]]),'KR:069500':bars([['2026-11-24',100],['2026-11-26',110]])};
  const r=S.trialScore([t1,t2,t3],series,[],now);
  a.equal(r.rows[0].endDate,'2026-11-26');a.ok(Math.abs(r.rows[0].excess-10)<1e-9);a.equal(r.rows[0].benchStart,'2026-11-24');
  a.equal(r.rows[1].benchUnverifiable,true);a.equal(r.rows[1].excess,undefined);a.ok(Math.abs(r.rows[1].ret-20)<1e-9);
  a.equal(r.rows[2].ret,undefined);a.equal(r.total.KR.n,2);a.equal(r.total.KR.all,3);a.equal(r.nExcess,1);a.equal(r.benchUnverifiable,1);
});
test('E4: 카드 연결은 산 날 이전 카드만, 뒤 카드만 있으면 연결 미확인, 같은 날 표시, 미국은 뉴욕 날짜',()=>{
  const c1={market:'KR',ticker:'001440',verdict:'buy-review',reviewedAt:'2026-11-20T22:00:00+09:00'},c2={...c1,verdict:'wait',reviewedAt:'2026-11-30T22:00:00+09:00'};
  let l=S.linkCard(tr(1,{date:'2026-11-25'}),[c2,c1]);a.equal(l.card,c1);a.equal(l.sameDay,false);
  l=S.linkCard(tr(1,{date:'2026-11-19'}),[c1,c2]);a.equal(l.card,null);a.equal(l.laterOnly,true);
  l=S.linkCard(tr(1,{date:'2026-11-20'}),[c1]);a.equal(l.card,c1);a.equal(l.sameDay,true);
  const u={market:'US',ticker:'MSFT',verdict:'buy-review',reviewedAt:'2026-11-25T08:00:00+09:00'};// 뉴욕 11-24
  a.equal(S.linkCard({market:'US',ticker:'MSFT',date:'2026-11-24'},[u]).card,u);
});
test('E4: 창을 열기만 하면 조회 0, 옛 형식은 읽기 전용·저장 막음, 쓰기 실패 시 원문 불변',{skip:!JSDOM&&'jsdom 없음'},()=>{
  const dom=new JSDOM('<!doctype html><body></body>',{url:'https://example.test/',runScripts:'outside-only'}),w=dom.window;let fetched=0;
  w.fetch=()=>{fetched++;return new Promise(()=>{});};w.gasUrl='https://script.google.com/macros/s/abc/exec';w.eval(SRC);
  const H=w.HASScorecard;H.open();
  a.equal(fetched,0);a.equal(w.document.querySelectorAll('script[src]').length,0);a.ok(w.document.getElementById('hasScorecard'));
  // 500건 + 1 추가: 쓰기 전 거절, 원문 바이트 불변
  const raw500=JSON.stringify(many(500));w.localStorage.setItem(S.TRIAL_KEY,raw500);
  a.match(H._writeTrades(many(501)),/최대 500건/);a.equal(w.localStorage.getItem(S.TRIAL_KEY),raw500);
  // setItem 실패 → 원문 불변
  const st=w.localStorage,orig=w.Storage.prototype.setItem;w.Storage.prototype.setItem=function(){throw new Error('quota');};
  try{a.match(H._writeTrades(many(3)),/저장하지 못했습니다/);}finally{w.Storage.prototype.setItem=orig;}a.equal(st.getItem(S.TRIAL_KEY),raw500);
  a.equal(H._writeTrades(many(499)),'');a.equal(JSON.parse(st.getItem(S.TRIAL_KEY)).length,499);
  // 옛 형식: 읽기 전용 안내, 입력 폼·매도·삭제 버튼 없음, 원문 그대로
  const legacy=JSON.stringify(many(501));st.setItem(S.TRIAL_KEY,legacy);H.open();
  const box=w.document.querySelector('[data-testid="trial"]');a.match(box.textContent,/읽기 전용/);a.equal(box.querySelector('form'),null);
  a.equal([...box.querySelectorAll('button')].filter(b=>/삭제|매도/.test(b.textContent)).length,0);a.equal(st.getItem(S.TRIAL_KEY),legacy);
  // 정상 기록: 같은 건수로 교체되면 새 원문으로 다시 계산
  st.setItem(S.TRIAL_KEY,JSON.stringify([tr(1,{ticker:'001440'})]));H.open();a.match(w.document.querySelector('[data-testid="trial"]').textContent,/001440 · 2026-11-02/);
  st.setItem(S.TRIAL_KEY,JSON.stringify([tr(1,{ticker:'005930'})]));H.open();const tb=w.document.querySelector('[data-testid="trial"]').textContent;a.match(tb,/005930/);a.doesNotMatch(tb,/001440 ·/);
  a.match(tb,/예외 정찰로 분류.*매수 안내가 아닙니다/);
  a.equal(fetched,0);dom.window.close();
});
test('E4: 미국 시장 선택 시 날짜 상한은 뉴욕 날짜, 직접 고른 날짜는 유지',{skip:!JSDOM&&'jsdom 없음'},()=>{
  const dom=new JSDOM('<!doctype html><body></body>',{url:'https://example.test/',runScripts:'outside-only'}),w=dom.window;w.eval(SRC);w.HASScorecard.open();
  const ny=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const f=w.document.querySelector('[data-testid="trial"] form'),mk=f.querySelector('select'),dt=f.querySelector('input[type="date"]');
  mk.value='US';mk.dispatchEvent(new w.Event('change'));a.equal(dt.max,ny);a.equal(dt.value,ny);
  dt.value='2026-11-01';mk.value='KR';mk.dispatchEvent(new w.Event('change'));a.equal(dt.value,'2026-11-01');
  dom.window.close();
});
