'use strict';
/* 지피 GPT-REVIEW-postmerge-queue-20261125-2030 CR-Q3-R1~R3 합성 시험(순태씨 E1~E4 승인 범위 안 보완).
 * 실제 기록·백업·GAS·네트워크 없음. 시계는 모두 고정 값(now 인자)으로 준다. */
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const S=require('../has/scorecard.js'),B=require('../backup/core.js');
const SRC=fs.readFileSync(path.join(__dirname,'../has/scorecard.js'),'utf8');
const bars=(arr)=>arr.map(([d,c])=>({d,c}));
const tr=(i,o={})=>({id:'trial-'+i,market:'KR',ticker:'001440',date:'2026-11-02',qty:1,price:100,...o});
const NOW=Date.parse('2026-11-27T10:00:00+09:00');
let JSDOM=null;try{({JSDOM}=require('jsdom'));}catch(e){}

// ---------- R1: 옛 형식 보존 ≠ 계산 허용 ----------
test('R1: 이전 앱이 저장하던 숫자 문자열은 옛 형식(보존)이지만 계산·조회에서 빠짐, 앱=백업 분류',()=>{
  const c=[tr(1),tr(2,{qty:'5',price:'100'})];
  a.equal(S.classifyTrades(c),'legacy');a.equal(B.trialClass(c),'legacy');
  a.doesNotThrow(()=>B.validateStoredValue('has_trialTrades_v1',JSON.stringify(c)));
  const r=S.trialScore(c,{'KR:001440':bars([['2026-11-02',100],['2026-11-26',120]]),'KR:069500':bars([['2026-11-02',100],['2026-11-26',100]])},[],NOW);
  a.equal(r.excluded,1);a.equal(r.rows[1].excluded,'format');a.equal(r.total.KR.all,1);a.equal(r.total.KR.cost,100);a.equal(r.nExcess,1);
  a.deepEqual(S.usableTrades(c,NOW).map(t=>t.id),['trial-1']);
  // 새 저장은 여전히 숫자만
  a.notEqual(S.checkWrite(c),'');a.equal(S.validTrade(tr(3,{qty:'5'})),false);
  // 숫자가 아닌 문자열·0·음수는 옛 형식도 아님
  for(const q of ['abc','0','-5','',' ']) a.equal(S.classifyTrades([tr(1,{qty:q})]),B.trialClass([tr(1,{qty:q})]),q);
  a.equal(S.classifyTrades([tr(1,{qty:'abc'})]),'bad');
});
test('R1: 옛 백업 규칙만 통과한 잘못된 매도가(음수)는 보존하되 실전 성적·확정 손익에 안 들어감',()=>{
  const bad={market:'KR',ticker:'001440',date:'2026-11-02',qty:1,price:100,sellDate:'2026-11-05',sellPrice:-50};
  a.equal(S.classifyTrades([bad]),'legacy');a.equal(B.trialClass([bad]),'legacy');
  const r=S.trialScore([bad,tr(9,{sellDate:'2026-11-05',sellPrice:110})],{},[],NOW);
  a.equal(r.rows[0].excluded,'format');a.equal(r.realized.KR,10);a.equal(r.byKind.normal.n,1);a.equal(r.total.KR.all,1);
});
test('R1: 같은 ID 중복(특수 ID __proto__ 포함)은 앱·백업 모두 정상 아님, 계산은 첫 행만',()=>{
  for(const id of ['trial-x','__proto__','constructor','hasOwnProperty']){
    const c=[tr(1,{id}),tr(2,{id,price:200})];
    a.equal(S.classifyTrades(c),'legacy',id);a.equal(B.trialClass(c),'legacy',id);
    a.notEqual(S.checkWrite(c),'',id);a.equal(S.parseTrades(JSON.stringify(c)),null,id);
    // 실제 저장값 검사 경로도 같은 결과(보존 허용), safeTree 그대로
    a.doesNotThrow(()=>B.validateStoredValue('has_trialTrades_v1',JSON.stringify(c)),id);
    const r=S.trialScore(c,{},[],NOW);a.equal(r.rows[1].excluded,'dup',id);a.equal(r.excluded,1,id);
  }
  // 키 자체가 __proto__인 객체(중첩 자료)는 백업 safeTree가 계속 거절
  a.throws(()=>B.validateStoredValue('has_trialTrades_v1','[{"__proto__":{"x":1},"id":"a","market":"KR","ticker":"001440","date":"2026-11-02","qty":1,"price":1}]'));
});
test('R1/E2: 옛 형식 실전 기록이 든 백업은 키 단위 경고와 함께 원문 그대로 복원 계획(정상 기록은 경고 없음)',()=>{
  const mem=(seed={})=>{const m=new Map(Object.entries(seed));return{get length(){return m.size;},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};};
  const seed=Object.fromEntries(B.ACCOUNTS.map(k=>[k,'[]']));
  const legacyRaw=JSON.stringify([tr(1,{qty:'5'})]);
  const p1=B.parse(JSON.stringify(B.create(mem({...seed,has_trialTrades_v1:legacyRaw}))));
  a.ok(p1.warnings.some(w=>/실전 검증 기록\(has_trialTrades_v1\)에 옛 형식/.test(w)));a.equal(p1.values.has_trialTrades_v1,legacyRaw);
  const p2=B.parse(JSON.stringify(B.create(mem({...seed,has_trialTrades_v1:JSON.stringify([tr(1)])}))));
  a.equal(p2.warnings.some(w=>/실전 검증 기록/.test(w)),false);
  // 손상(bad)은 여전히 백업 전체 거절(키별 격리 복원은 별도 승인 사항 — 이번 변경 없음)
  a.throws(()=>B.validateStoredValue('has_trialTrades_v1','[{"x":1}]'));
});

// ---------- R2: 평가와 지수 비교 분리, 미래·장중 매도 ----------
test('R2: 지피 예 — 최신 종목 종가(11/26 120)로 평가, 지수 비교는 같은 날짜 쌍(11/25)까지 따로',()=>{
  const t=tr(1,{date:'2026-11-24',price:100});
  const s={'KR:001440':bars([['2026-11-24',100],['2026-11-25',90],['2026-11-26',120]]),'KR:069500':bars([['2026-11-24',100],['2026-11-25',100]])};
  const r=S.trialScore([t],s,[],NOW),x=r.rows[0];
  a.equal(x.endDate,'2026-11-26');a.equal(x.last,120);a.ok(Math.abs(x.ret-20)<1e-9);a.equal(r.total.KR.val,120);
  a.equal(x.cmpEnd,'2026-11-25');a.ok(Math.abs(x.cmpRet+10)<1e-9);a.ok(Math.abs(x.benchRet)<1e-9);a.ok(Math.abs(x.excess+10)<1e-9);
});
test('R2: 지수 최신일 누락 — 지수에 산 날만 있으면 평가는 최신, 지수 비교는 검증 불가',()=>{
  const t=tr(1,{date:'2026-11-24',price:100});
  const r=S.trialScore([t],{'KR:001440':bars([['2026-11-24',100],['2026-11-26',130]]),'KR:069500':bars([['2026-11-24',100]])},[],NOW);
  a.equal(r.rows[0].endDate,'2026-11-26');a.equal(r.rows[0].benchUnverifiable,true);a.equal(r.rows[0].excess,undefined);a.equal(r.benchUnverifiable,1);
});
test('R2: 당일 장중 매도 — 매도 손익은 확정 손익에 넣고, 확정 전 지수 봉(장중)은 쓰지 않고 비교 보류',()=>{
  const now=Date.parse('2026-11-26T10:00:00+09:00'); // 한국 장중(확정 종가일 11/25)
  const t=tr(1,{date:'2026-11-24',price:100,sellDate:'2026-11-26',sellPrice:110});
  const r=S.trialScore([t],{'KR:069500':bars([['2026-11-24',100],['2026-11-26',999]])},[],now);
  a.equal(r.rows[0].benchPending,true);a.equal(r.rows[0].excess,undefined);a.equal(r.benchPending,1);a.equal(r.realized.KR,10);a.equal(r.nExcess,0);
  // 장 마감 뒤에는 그 날 지수 종가로 비교
  const r2=S.trialScore([t],{'KR:069500':bars([['2026-11-24',100],['2026-11-26',105]])},[],Date.parse('2026-11-26T16:00:00+09:00'));
  a.ok(Math.abs(r2.rows[0].excess-5)<1e-9);
});
test('R2: 미래 매도일은 저장 전 거절, 이미 저장된 미래 매도·매수 기록은 원문 유지·계산 보류',()=>{
  const t=tr(1,{date:'2026-11-24'});
  a.match(S.applySell([t],'trial-1',{date:'2026-11-28',qty:1,price:110},'n',NOW).error,/미래/);
  a.ok(S.applySell([t],'trial-1',{date:'2026-11-27',qty:1,price:110},'n',NOW).trades);
  const fut=[tr(2,{sellDate:'2026-12-01',sellPrice:500}),tr(3,{date:'2026-12-01'})];
  a.equal(S.classifyTrades(fut),'ok'); // 형식은 정상(원문 보존·삭제 가능)
  const r=S.trialScore(fut,{},[],NOW);a.equal(r.excluded,2);a.equal(r.rows[0].excluded,'future');a.equal(r.realized.KR,0);a.equal(S.usableTrades(fut,NOW).length,0);
});
test('R2: 뉴욕/한국 날짜 경계 — 한국 11/26 08:00은 뉴욕 11/25, 미국 매도일 11/26은 미래',()=>{
  const now=Date.parse('2026-11-26T08:00:00+09:00');
  a.equal(S.marketDay('US',now),'2026-11-25');a.equal(S.marketDay('KR',now),'2026-11-26');
  const u={id:'u1',market:'US',ticker:'MSFT',date:'2026-11-24',qty:1,price:100};
  a.match(S.applySell([u],'u1',{date:'2026-11-26',qty:1,price:110},'n',now).error,/뉴욕/);
  a.ok(S.applySell([u],'u1',{date:'2026-11-25',qty:1,price:110},'n',now).trades);
  a.ok(S.applySell([tr(1,{date:'2026-11-24'})],'trial-1',{date:'2026-11-26',qty:1,price:110},'n',now).trades);
  // 서머타임 해제 뒤(11월) 뉴욕 16:00 = 한국 다음 날 06:00: 05:59 한국 시각엔 아직 11/25 미국 종가 미확정
  a.equal(S.baseDate('US',Date.parse('2026-11-26T05:59:00+09:00')),'2026-11-24');a.equal(S.baseDate('US',Date.parse('2026-11-26T06:00:00+09:00')),'2026-11-25');
});

// ---------- R3: 날짜 직접 선택 보존, 카드 표시 ----------
test('R3: 같은 날 카드는 매수 전 확정 연결이 아니라 참고 카드로 따로',()=>{
  const prior={market:'KR',ticker:'001440',verdict:'buy-review',reviewedAt:'2026-11-20T22:00:00+09:00',src:'a.json'},same={...prior,verdict:'wait',reviewedAt:'2026-11-24T09:00:00+09:00',src:'b.json'};
  const r=S.trialScore([tr(1,{date:'2026-11-24'})],{},[prior,same],NOW).rows[0];a.equal(r.card,prior);a.equal(r.sameDayCard,same);
});
test('R3 DOM: 날짜를 직접 고르면(오늘 값이어도) 시장을 바꿔도 유지, 계산 제외 행·참고 채점 표시',{skip:!JSDOM&&'jsdom 없음'},()=>{
  const dom=new JSDOM('<!doctype html><body></body>',{url:'https://example.test/',runScripts:'outside-only'}),w=dom.window;let fetched=0;w.fetch=()=>{fetched++;return new Promise(()=>{});};w.eval(SRC);w.HASScorecard.open();
  const f=w.document.querySelector('[data-testid="trial"] form'),mk=f.querySelector('select'),dt=f.querySelector('input[type="date"]');
  const picked=dt.value;dt.dispatchEvent(new w.Event('input'));mk.value='US';mk.dispatchEvent(new w.Event('change'));a.equal(dt.value,picked);
  // 옛 형식 기록: 읽기 전용 + 계산 제외 행을 문자로만 표시, 원문 불변
  const raw=JSON.stringify([tr(1),tr(2,{qty:'5'}),tr(1,{price:300})]);w.localStorage.setItem(S.TRIAL_KEY,raw);w.HASScorecard.open();
  const box=w.document.querySelector('[data-testid="trial"]');a.match(box.textContent,/참고 채점/);a.match(box.textContent,/계산 제외 2건/);
  a.match(box.textContent,/원문 보존 · 계산 제외\(형식이 지금 규칙과 다름\): 001440 · 2026-11-02 · 수량 5/);a.match(box.textContent,/원문 보존 · 계산 제외\(같은 ID 중복\)/);
  a.equal(w.localStorage.getItem(S.TRIAL_KEY),raw);a.equal(fetched,0);a.equal(w.document.querySelectorAll('script[src]').length,0);
  w.close();
});
