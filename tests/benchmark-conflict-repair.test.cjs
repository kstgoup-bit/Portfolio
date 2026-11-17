'use strict';
// GPT-20261117-0940: 기준지수 보류충돌 dry-run 정리 도구. 합성 자료만 사용.
// 실제 계좌·브라우저 localStorage·백업 파일·GAS·네트워크 접근 없음. 실제 SPY 256건 복구 아님.
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const H=require('../has/benchmark-history-policy.js'),R=require('../has/benchmark-conflict-repair.js'),B=require('../backup/core.js');
const BASE=['2026-11-10','2026-11-11','2026-11-12','2026-11-13'],D16=BASE.concat('2026-11-16');
const R_POST='2026-11-16T22:00:00.000Z',NOW=Date.parse('2026-11-17T03:00:00.000Z');
const LEGACY=' {\n "SPY" : '+JSON.stringify(BASE.map((d,i)=>({ts:Date.parse(d+'T14:30:00Z'),close:100+i})))+', "QQQ": '+JSON.stringify(BASE.map((d,i)=>({ts:Date.parse(d+'T14:30:00Z'),close:500+i})))+', "KS200": []\n} ';
const gas=(sym,receipt,bars)=>{const c=H.parseGasHistory({[sym]:{source:'yahoo-chart-v8',symbol:sym,currency:'USD',exchange:sym==='QQQ'?'NasdaqGS':'NYSEArca',timezone:'America/New_York',instrumentType:'ETF',adjustment:'unverified',regularMarketTime:null,regularMarketPrice:null,fiftyTwoWeekHigh:null,bars,barCount:bars.length}},sym,receipt,{mode:'configured-gas'});a.equal(c.ok,true,c.reason);return c;};
const bars=(dates,f)=>dates.map((d,i)=>({d,c:f(d,i)}));
function merge(store,sym,receipt,f){const m=H.mergeHistoryStore(store,LEGACY,gas(sym,receipt,bars(D16,f)),sym,Date.parse(receipt));a.equal(m.ok,true,m.reason);return m.store;}
// SPY: 11-13 레거시 103 vs GAS 99 (마감 후 수신, finality unverified) 보류 1건 + 11-16 provisional 저장
function baseStore(){return merge(null,'SPY',R_POST,(d,i)=>d==='2026-11-13'?99:d==='2026-11-16'?745.82:100+i);}
// 같은 날짜·종가·출처·finality·기존값, 수신 시각만 다른 복제 보류(앱의 known 검사를 거치지 않은 과거 기록 가정)
function dupOf(c,minutes){const alt={...c.alternative,receivedAt:new Date(Date.parse(c.alternative.receivedAt)+minutes*60000).toISOString()};
 alt.id='o:'+H.fingerprint(JSON.stringify([alt.d,alt.close,alt.source,alt.receivedAt,alt.providerBarTs]));
 const o={d:c.d,existing:c.existing,alternative:{}};for(const k of ['id','d','close','source','receivedAt','providerBarTs','dateKind','adjustment','finality'])o.alternative[k]=alt[k];o.status=c.status;return o;}
function withDups(store,n){const s=JSON.parse(JSON.stringify(store)),c=s.series.SPY.conflicts.find(x=>x.status==='pending-review'&&x.alternative.finality==='unverified');
 for(let i=1;i<=n;i++)s.series.SPY.conflicts.push(dupOf(c,i));a.equal(H.validateStore(s,LEGACY,NOW).ok,true);return s;}
// 과거 앱(main 96f1509 이전)이 장중 당일 봉을 저장·비교하며 남긴 provisional 보류충돌을 합성으로 재현.
// 현재 앱은 장 마감+30분 전 당일 봉을 저장하지 않으므로(intraday-not-persisted) 새로 생기지 않지만, 기존 기록에는 남아 있다.
function intradayThenPost(n){const s=JSON.parse(JSON.stringify(baseStore())),g=s.series.SPY,ex=g.observations.find(o=>o.d==='2026-11-16');
 for(let i=0;i<n;i++){const alt={d:'2026-11-16',close:Math.round((740+(i+1)/100)*100)/100,source:'yahoo-chart-v8-via-gas',receivedAt:new Date(Date.parse('2026-11-16T15:00:00.000Z')+i*60000).toISOString(),providerBarTs:null,dateKind:'exchange-date-only',adjustment:'unverified',finality:'provisional'};
  alt.id='o:'+H.fingerprint(JSON.stringify([alt.d,alt.close,alt.source,alt.receivedAt,alt.providerBarTs]));
  const o={};for(const k of ['id','d','close','source','receivedAt','providerBarTs','dateKind','adjustment','finality'])o[k]=alt[k];g.conflicts.push({d:'2026-11-16',existing:ex,alternative:o,status:'pending-review'});}
 const v=H.validateStore(s,LEGACY,NOW);a.equal(v.ok,true,v.reason);return s;}
const CAL=(d,m)=>[1,2,3,4,5].includes(new Date(d+'T00:00:00Z').getUTCDay())?{open:true,closeMs:Date.parse(d+'T21:00:00.000Z')}:{open:false};
const ROUTES={'r-a':{upstream:'u-1'},'r-b':{upstream:'u-2'}};
const ev=(close,route,extra={})=>({id:'SPY',d:'2026-11-13',close,currency:'USD',market:'US',priceKind:'regular-close',route,asOf:'2026-11-13T22:00:00.000Z',...extra});
const active=(raw)=>JSON.stringify(H.readStore(JSON.parse(raw),LEGACY,NOW).series.SPY.points);

test('(1) 원본 문자열·객체 불변, 실행 2회 결과 동일(idempotence), 결과 재실행 시 추가 병합 0',()=>{
 const raw=JSON.stringify(withDups(baseStore(),3)),copy=raw.slice(),leg=LEGACY.slice();
 const p1=R.plan(raw,LEGACY,NOW),p2=R.plan(raw,LEGACY,NOW);
 a.equal(raw,copy);a.equal(LEGACY,leg);a.equal(p1.ok,true,p1.reason);a.deepEqual(p1,p2);
 a.equal(p1.dryRun,true);a.equal(p1.applied,false);a.equal(p1.counts['merge-duplicate'],1);
 a.equal(p1.series.SPY.before.pending,4);a.equal(p1.series.SPY.after.pending,1);
 const again=R.plan(p1.simulatedStoreRaw,LEGACY,NOW);a.equal(again.ok,true);a.equal(again.counts['merge-duplicate'],0);a.equal(again.simulatedStoreRaw,p1.simulatedStoreRaw);
 a.equal(p1.after.activePricesUnchanged,true);a.equal(active(p1.simulatedStoreRaw),active(raw));
});
test('(2) 보류 순서를 뒤섞어도 행동 목록·건수 동일(대표는 가장 이른 수신)',()=>{
 const s=withDups(intradayThenPost(5),4),raw=JSON.stringify(s),r=JSON.parse(raw);r.series.SPY.conflicts.reverse();
 const x=R.plan(raw,LEGACY,NOW),y=R.plan(JSON.stringify(r),LEGACY,NOW);a.equal(x.ok,true,x.reason);a.equal(y.ok,true);
 a.deepEqual(x.actions,y.actions);a.deepEqual(x.counts,y.counts);
 const m=x.actions.find(v=>v.action==='merge-duplicate');a.equal(m.keptId,s.series.SPY.conflicts.find(c=>c.alternative.finality==='unverified'&&c.status==='pending-review').alternative.id);
});
test('(3) 256건 포화: 확인된 중복만 병합 제안 → 여유 생김, 장중 미확정은 보류 유지',()=>{
 const st=intradayThenPost(200),n=256-st.series.SPY.conflicts.length,s=withDups(st,n),raw=JSON.stringify(s);
 a.equal(s.series.SPY.conflicts.length,256);
 // 포화 상태에서는 새 날짜 + 다른 값이 오면 병합 전체 거절(기존 동작 확인)
 const blocked=H.mergeHistoryStore(s,LEGACY,gas('SPY','2026-11-17T22:00:00.000Z',bars(D16.concat('2026-11-17'),(d,i)=>d==='2026-11-12'?50:100+i)),'SPY',Date.parse('2026-11-17T22:00:00.000Z'));
 a.equal(blocked.ok,false);a.equal(blocked.reason,'store-bound');
 const p=R.plan(raw,LEGACY,NOW);a.equal(p.ok,true,p.reason);
 a.equal(p.series.SPY.before.saturated,true);a.equal(p.series.SPY.after.saturated,false);a.equal(p.series.SPY.after.headroom,n);
 a.equal(p.counts['merge-duplicate'],1);a.equal(p.actions.find(v=>v.action==='merge-duplicate').ids.length,n);
 const holds=p.actions.filter(v=>v.action==='hold');a.ok(holds.filter(v=>v.reason==='intraday-provisional-unconfirmed').length>=190);
 a.equal(p.counts['replace-proposal'],0,'근거 없으면 교체 제안 0');a.equal(active(p.simulatedStoreRaw),active(raw));
});
test('(4) fail-closed: 형식 오류·레거시 변경·중복 키·잘못된 보류·비문자열 입력은 계획 없음',()=>{
 const raw=JSON.stringify(baseStore());
 const cases=[[raw,LEGACY.replace(' {',' { '),/store-invalid/],['{"version":2,"version":2}',LEGACY,/store-json/],['not json',LEGACY,/store-json/],
  [raw.replace('"pending-review"','"resolved"'),LEGACY,/store-invalid/],[raw.replace('"SPY":{','"XYZ":{'),LEGACY,/store-invalid/]];
 for(const[s,l,re]of cases){const p=R.plan(s,l,NOW);a.equal(p.ok,false);a.match(p.reason,re);a.deepEqual(p.actions,[]);a.equal(p.simulatedStoreRaw,undefined);}
 a.equal(R.plan(JSON.parse(raw),LEGACY,NOW).ok,false);a.equal(R.plan(raw,LEGACY,'now').ok,false);
});
test('(5) 교체 제안은 검증 달력 + 승인된 서로 다른 경로·원천 2개 이상 + 정규 종가 + 마감 후 기준시각일 때만, 적용은 안 함',()=>{
 const raw=JSON.stringify(baseStore()),hold=(o)=>{const p=R.plan(raw,LEGACY,NOW,o);a.equal(p.ok,true,p.reason);const x=p.actions.find(v=>v.d==='2026-11-13');return x;};
 a.equal(hold({}).reason,'calendar-unverified');
 a.equal(hold({closeCalendar:()=>{throw Error('x');}}).reason,'calendar-closed-or-unknown');
 a.equal(hold({closeCalendar:()=>false}).reason,'calendar-closed-or-unknown');
 a.equal(hold({closeCalendar:()=>true}).reason,'calendar-close-time-unverified','마감 시각 없는 true는 DST·조기폐장 미확인');
 a.equal(hold({closeCalendar:CAL,evidence:[ev(103,'r-a'),ev(103,'r-b')]}).reason,'independent-evidence-insufficient','기본 승인 경로 0');
 const base={closeCalendar:CAL,approvedRoutes:ROUTES};
 const ok=hold({...base,evidence:[ev(103,'r-a'),ev(103,'r-b')]});a.equal(ok.action,'replace-proposal');a.equal(ok.choice,'existing');a.equal(ok.requiresUserApproval,true);
 a.equal(hold({...base,evidence:[ev(99,'r-a'),ev(99,'r-b')]}).choice,'alternative');
 const bad=[[ev(103,'r-a',{currency:'KRW'}),ev(103,'r-b')],[ev(103,'r-a',{market:'KR'}),ev(103,'r-b')],[ev(103,'r-a',{priceKind:'adjusted-close'}),ev(103,'r-b')],
  [ev(103,'r-a',{asOf:'2026-11-13T16:00:00.000Z'}),ev(103,'r-b')],[ev(103,'r-a'),ev(103,'r-a')],[ev(103,'r-a'),ev(103,'r-z',{upstream:'u-9'})],
  [ev(103,'r-a',{d:'2026-11-12'}),ev(103,'r-b')],[ev(103,'r-a',{id:'QQQ'}),ev(103,'r-b')],[ev(NaN,'r-a'),ev(103,'r-b')]];
 for(const e of bad)a.equal(hold({...base,evidence:e}).reason,'independent-evidence-insufficient',JSON.stringify(e));
 a.equal(hold({closeCalendar:CAL,approvedRoutes:{'r-a':{upstream:'u-1'},'r-b':{upstream:'u-1'}},evidence:[ev(103,'r-a'),ev(103,'r-b')]}).reason,'independent-evidence-insufficient','같은 원천');
 a.equal(hold({...base,evidence:[ev(103,'r-a'),ev(104,'r-b')]}).reason,'evidence-disagrees');
 a.equal(hold({...base,evidence:[ev(110,'r-a'),ev(110,'r-b')]}).reason,'evidence-matches-neither');
 for(const t of [0.0051,1,-0.001,Infinity,NaN,'0.001',null])a.equal(hold({...base,tolerance:t,evidence:[ev(103,'r-a'),ev(103,'r-b')]}).reason,'tolerance-invalid',String(t));
 const p=R.plan(raw,LEGACY,NOW,{...base,evidence:[ev(103,'r-a'),ev(103,'r-b')]});
 a.equal(p.simulatedStoreRaw,raw,'교체 제안은 사본에도 적용하지 않음');a.equal(p.counts['replace-proposal'],1);
});
test('(6) 허용오차 안에서 기존값·대체값 둘 다 맞으면 보류(모호), 장중 미확정은 근거가 있어도 보류',()=>{
 const s=merge(null,'SPY',R_POST,(d,i)=>d==='2026-11-12'?102.1:d==='2026-11-16'?745.82:100+i); // 102 vs 102.1 (0.098%)
 const p=R.plan(JSON.stringify(s),LEGACY,NOW,{closeCalendar:CAL,approvedRoutes:ROUTES,tolerance:0.005,evidence:[{...ev(102.05,'r-a'),d:'2026-11-12'},{...ev(102.05,'r-b'),d:'2026-11-12'}]});
 a.equal(p.ok,true,p.reason);a.equal(p.actions.find(v=>v.d==='2026-11-12').reason,'evidence-ambiguous');
 const q=R.plan(JSON.stringify(intradayThenPost(3)),LEGACY,NOW,{closeCalendar:CAL,approvedRoutes:ROUTES,evidence:[{...ev(740,'r-a'),d:'2026-11-16'},{...ev(740,'r-b'),d:'2026-11-16'}]});
 for(const v of q.actions.filter(x=>x.d==='2026-11-16'&&x.action!=='keep'))a.equal(v.reason,'intraday-provisional-unconfirmed');
});
test('(7) 타 종목·타 계좌 영향 0: SPY만 계획하면 QQQ 그룹 바이트 동일, 계좌 키 무관',()=>{
 let s=withDups(baseStore(),2);s=merge(s,'QQQ',R_POST,(d,i)=>d==='2026-11-12'?1:500+i);
 s=JSON.parse(JSON.stringify(s));const qc=s.series.QQQ.conflicts[0];s.series.QQQ.conflicts.push(dupOf(qc,5));
 const raw=JSON.stringify(s),p=R.plan(raw,LEGACY,NOW,{ids:['SPY']});a.equal(p.ok,true,p.reason);
 a.equal(JSON.stringify(JSON.parse(p.simulatedStoreRaw).series.QQQ),JSON.stringify(s.series.QQQ));a.equal(p.series.QQQ.planned,false);
 a.ok(p.actions.every(v=>v.id==='SPY'));
 const mem=new Map(Object.entries({v5_gen:'[]',v5_dom:'[]',v5_ov:'[]',v5_pen:'[]',v5_benchHist:LEGACY,v5_benchHistV2:raw}));
 const storage={get length(){return mem.size;},key:i=>[...mem.keys()][i]??null,getItem:k=>mem.get(k)??null,setItem(){throw Error('write');},removeItem(){throw Error('write');}};
 const before=B.create(storage).storage;R.plan(storage.getItem('v5_benchHistV2'),storage.getItem('v5_benchHist'),NOW);a.deepEqual(B.create(storage).storage,before,'백업 바이트 불변');
});
test('(8) 백업 호환·되돌리기: 사본은 백업 파싱·미리보기 통과, undo 원문 = 원래 바이트',()=>{
 const raw=JSON.stringify(withDups(baseStore(),3)),p=R.plan(raw,LEGACY,NOW);
 const doc={format:B.FORMAT,schemaVersion:B.VERSION,exportedAt:R_POST,scope:'portfolio-only-no-secrets-no-radar',storage:{v5_gen:'[]',v5_dom:'[]',v5_ov:'[]',v5_pen:'[]',v5_benchHist:LEGACY,v5_benchHistV2:p.simulatedStoreRaw}};
 const plan=B.parse(JSON.stringify(doc));const mem=new Map(),writes=[];
 const dst={get length(){return mem.size;},key:i=>[...mem.keys()][i]??null,getItem:k=>mem.get(k)??null,setItem(k,v){writes.push(k);mem.set(k,String(v));},removeItem(k){writes.push(k);mem.delete(k);}};
 B.preview(dst,plan);a.equal(writes.length,0);
 a.equal(p.undo.restoreRaw,raw);a.equal(p.undo.restoreFingerprint,H.fingerprint(raw));a.equal(p.undo.expectCurrentFingerprint,H.fingerprint(p.simulatedStoreRaw));
 a.equal(p.before.legacyFingerprint,p.after.legacyFingerprint);
});
test('(9) 운영 앱 미로드·저장소/네트워크/타이머 접근 코드 없음',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../has/benchmark-conflict-repair.js'),'utf8');
 a.doesNotMatch(src,/localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|setItem|removeItem|setTimeout|setInterval|google\.script|navigator/);
 a.doesNotMatch(fs.readFileSync(path.join(__dirname,'../portfolio_v5.html'),'utf8'),/benchmark-conflict-repair/);
 a.ok(Object.isFrozen(R));
});

// ---- GPT-REVIEW-bench-history-repair-20261117-1332 CR-1~CR-4 ----
const perms=xs=>xs.length<=1?[xs]:xs.flatMap((x,i)=>perms(xs.slice(0,i).concat(xs.slice(i+1))).map(r=>[x,...r]));
const at13=(raw,o)=>{const p=R.plan(raw,LEGACY,NOW,o);a.equal(p.ok,true,p.reason);return p.actions.find(v=>v.d==='2026-11-13'&&v.action!=='merge-duplicate');};
test('(10) CR-1: 같은 승인 경로·원천의 상충 종가는 순서와 무관하게 전체 보류',()=>{
 const raw=JSON.stringify(baseStore()),base={closeCalendar:CAL,approvedRoutes:{...ROUTES,'r-c':{upstream:'u-1'}}};
 for(const e of perms([ev(103,'r-a'),ev(99,'r-a'),ev(103,'r-b')]))a.equal(at13(raw,{...base,evidence:e}).reason,'evidence-route-conflict',JSON.stringify(e.map(x=>x.close)));
 for(const e of perms([ev(103,'r-a'),ev(99,'r-c'),ev(103,'r-b')]))a.equal(at13(raw,{...base,evidence:e}).reason,'evidence-route-conflict','같은 상류 u-1의 다른 경로');
 // 시간상 쓸 수 없는(마감 전) 관측도 상충 검사에는 포함
 a.equal(at13(raw,{...base,evidence:[ev(99,'r-a',{asOf:'2026-11-13T16:00:00.000Z'}),ev(103,'r-a'),ev(103,'r-b')]}).reason,'evidence-route-conflict');
 // 동일 경로 동일값 중복 = 독립 1개
 a.equal(at13(raw,{...base,evidence:[ev(103,'r-a'),ev(103,'r-a'),ev(103,'r-c')]}).reason,'independent-evidence-insufficient');
 // 서로 다른 승인 원천의 정확히 일치하는 정규 종가 2개만 통과
 for(const e of perms([ev(103,'r-a'),ev(103,'r-b'),ev(103,'r-a')])){const x=at13(raw,{...base,evidence:e});a.equal(x.action,'replace-proposal');a.equal(x.choice,'existing');}
 // 미승인 경로의 상충 값은 근거가 아니므로 무시(승인 경로만 판단)
 a.equal(at13(raw,{...base,evidence:[ev(103,'r-a'),ev(99,'r-zz'),ev(103,'r-b')]}).action,'replace-proposal');
});
test('(11) CR-2: providerBarTs·dateKind 등 수신시각 외 메타가 다르면 병합하지 않고 개별 보류 + 감사 표기',()=>{
 const st=baseStore(),s=JSON.parse(JSON.stringify(st)),c=s.series.SPY.conflicts.find(x=>x.status==='pending-review'&&x.alternative.finality==='unverified');
 const mk=(ts,min)=>{const alt={...c.alternative,source:'yahoo-chart-v8',providerBarTs:ts,receivedAt:new Date(Date.parse(c.alternative.receivedAt)+min*60000).toISOString()};
  alt.id='o:'+H.fingerprint(JSON.stringify([alt.d,alt.close,alt.source,alt.receivedAt,alt.providerBarTs]));const o={d:c.d,existing:c.existing,alternative:{}};
  for(const k of ['id','d','close','source','receivedAt','providerBarTs','dateKind','adjustment','finality'])o.alternative[k]=alt[k];o.status=c.status;return o;};
 const t1=Date.parse('2026-11-13T14:30:00.000Z'),t2=Date.parse('2026-11-13T20:59:00.000Z');
 // 수신시각만 다른 2건(t1,t1) + 공급자 바 시각이 다른 1건(t2)
 s.series.SPY.conflicts.push(mk(t1,1),mk(t1,2),mk(t2,3));const v=H.validateStore(s,LEGACY,NOW);a.equal(v.ok,true,v.reason);
 const raw=JSON.stringify(s),p=R.plan(raw,LEGACY,NOW);a.equal(p.ok,true,p.reason);
 const merges=p.actions.filter(x=>x.action==='merge-duplicate');a.equal(merges.length,1);a.equal(merges[0].ids.length,1,'t1 수신시각 중복만 병합');
 const kept=JSON.parse(p.simulatedStoreRaw).series.SPY.conflicts.map(x=>x.alternative);
 a.ok(kept.some(x=>x.providerBarTs===t2),'다른 바 시각 관측은 사본에 그대로');a.ok(kept.some(x=>x.providerBarTs===null),'GAS 관측(바 시각 없음)도 별도 유지');
 const holds=p.actions.filter(x=>x.action==='hold'&&x.d==='2026-11-13');a.equal(holds.length,3,'GAS·t1·t2 각각 보류');
 a.equal(holds.filter(x=>x.auditNote==='metadata-differs-not-merged').length,2,'같은 출처에서 바 시각만 다른 t1·t2에 감사 표기');
 a.equal(holds.find(x=>x.source==='yahoo-chart-v8-via-gas').auditNote,undefined);
 // 원본·활성 가격·타 종목 불변
 a.equal(active(p.simulatedStoreRaw),active(raw));a.equal(JSON.stringify(JSON.parse(p.simulatedStoreRaw).series.QQQ),JSON.stringify(s.series.QQQ));
 // 수신시각만 다른 경우(기존 시험)는 감사 표기 없음
 const q=R.plan(JSON.stringify(withDups(st,2)),LEGACY,NOW);a.ok(q.actions.filter(x=>x.d==='2026-11-13').every(x=>x.auditNote===undefined));
});
test('(12) CR-3: 근거 기준시각은 엄격 ISO·검증 마감 이후·실행 now 이하만, 달력 마감시각 검증',()=>{
 const raw=JSON.stringify(baseStore()),base={closeCalendar:CAL,approvedRoutes:ROUTES},iso=t=>new Date(t).toISOString();
 const two=asOf=>at13(raw,{...base,evidence:[ev(103,'r-a',{asOf}),ev(103,'r-b')]});
 for(const x of [iso(NOW+60000),iso(NOW+5*365*864e5),'NaN','','2026-11-13 22:00:00','2026-11-13T22:00:00Z','2026-11-13T22:00:00.000+00:00','2026-11-31T22:00:00.000Z','2026-11-13T25:00:00.000Z',null,Date.parse('2026-11-13T22:00:00.000Z')])
  a.equal(two(x).reason,'independent-evidence-insufficient',String(x));
 const close=Date.parse('2026-11-13T21:00:00.000Z');
 a.equal(two(iso(close)).action,'replace-proposal','마감 시각 정확히 = 허용');a.equal(two(iso(close-1)).reason,'independent-evidence-insufficient','마감 1ms 전');
 a.equal(two(iso(NOW)).action,'replace-proposal','now 정확히 = 허용');
 const cal=c=>at13(raw,{...base,closeCalendar:()=>c,evidence:[ev(103,'r-a'),ev(103,'r-b')]}).reason;
 a.equal(cal({open:true}),'calendar-close-time-invalid');a.equal(cal({open:true,closeMs:NaN}),'calendar-close-time-invalid');
 a.equal(cal({open:true,closeMs:Date.parse('2026-11-14T05:30:00.000Z')}),'calendar-close-time-invalid','마감시각이 뉴욕 기준 다른 날짜');
 a.equal(cal({open:true,closeMs:NOW+1}),'calendar-close-time-invalid','미래 마감');a.equal(cal({open:'true',closeMs:close}),'calendar-closed-or-unknown');
 // 조기폐장(13:00 ET = 18:00Z)은 달력이 주면 그 시각 기준
 const early=at13(raw,{...base,closeCalendar:()=>({open:true,closeMs:Date.parse('2026-11-13T18:00:00.000Z')}),evidence:[ev(103,'r-a',{asOf:'2026-11-13T18:30:00.000Z'}),ev(103,'r-b')]});
 a.equal(early.action,'replace-proposal');
});
test('(13) CR-4: dry-run 사본 → 합성 백업 apply → undo 왕복, 실패 시 원상복구, 선택 안 한 종목·계좌 독립, 256 포화·순서 바뀜',()=>{
 const ACC=Object.fromEntries(B.ACCOUNTS.map((k,i)=>[k,JSON.stringify([{id:i+1,name:'합성 T'+i,ticker:'T'+i,quantity:i+1,avgPrice:100,currentPrice:110}])]));
 const mem=(extra,failKey=null)=>{const m=new Map(Object.entries({...ACC,...extra})),w=[];return {get length(){return m.size;},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,
  setItem(k,v){if(k===failKey)throw new Error('synthetic quota');w.push(k);m.set(k,String(v));},removeItem(k){w.push(k);m.delete(k);},all:()=>Object.fromEntries(m),w};};
 const docOf=v2=>JSON.stringify({format:B.FORMAT,schemaVersion:B.VERSION,exportedAt:R_POST,scope:'portfolio-only-no-secrets-no-radar',storage:{...ACC,v5_benchHist:LEGACY,v5_benchHistV2:v2}});
 const strip=o=>{const x={...o};delete x[B.JOURNAL];return x;};
 for(const variant of ['dups','saturated','reversed']){
  let s;if(variant==='saturated'){const st=intradayThenPost(200);s=withDups(st,256-st.series.SPY.conflicts.length);}else s=withDups(baseStore(),3);
  s=merge(s,'QQQ',R_POST,(d,i)=>d==='2026-11-12'?1:500+i);if(variant==='reversed'){s=JSON.parse(JSON.stringify(s));s.series.SPY.conflicts.reverse();}
  const raw=JSON.stringify(s),p=R.plan(raw,LEGACY,NOW,{ids:['SPY']});a.equal(p.ok,true,p.reason);a.equal(R.plan(raw,LEGACY,NOW,{ids:['SPY']}).simulatedStoreRaw,p.simulatedStoreRaw,'동일 입력 동일 결과');
  const dst=mem({v5_benchHist:LEGACY,v5_benchHistV2:raw}),before=dst.all();
  B.preview(dst,B.parse(docOf(p.simulatedStoreRaw)));a.equal(dst.w.length,0);
  B.apply(dst,B.parse(docOf(p.simulatedStoreRaw)));
  a.equal(dst.getItem('v5_benchHist'),LEGACY,'레거시 원문 바이트 동일');a.equal(dst.getItem('v5_benchHistV2'),p.simulatedStoreRaw);
  for(const k of B.ACCOUNTS)a.equal(dst.getItem(k),ACC[k],'계좌 '+k+' 불변');
  const after=JSON.parse(dst.getItem('v5_benchHistV2'));a.equal(JSON.stringify(after.series.QQQ),JSON.stringify(s.series.QQQ),'선택 안 한 QQQ 바이트 동일');
  a.equal(H.validateStore(after,LEGACY,NOW).ok,true);a.equal(active(dst.getItem('v5_benchHistV2')),active(raw),'활성 가격 불변');
  if(variant==='saturated'){a.equal(s.series.SPY.conflicts.length,256);a.ok(after.series.SPY.conflicts.length<256,'사본은 포화 해소');}
  B.undo(dst);a.deepEqual(strip(dst.all()),strip(before),'undo 후 원래 바이트');a.equal(dst.getItem('v5_benchHistV2'),raw);
  // 보조 기록 쓰기 실패 → 자동 원상복구
  const bad=mem({v5_benchHist:LEGACY,v5_benchHistV2:raw},'v5_benchHistV2'),b0=bad.all();
  a.throws(()=>B.apply(bad,B.parse(docOf(p.simulatedStoreRaw))),/복원 실패|복구/);a.deepEqual(strip(bad.all()),strip(b0));a.equal(B.readJournal(bad).status,'undone');
 }
 // 포화 원본은 여전히 fail-closed(store-bound) — dry-run은 원본을 고치지 않음
 const st=intradayThenPost(200),sat=withDups(st,256-st.series.SPY.conflicts.length),copy=JSON.stringify(sat);R.plan(copy,LEGACY,NOW);
 const blocked=H.mergeHistoryStore(JSON.parse(copy),LEGACY,gas('SPY','2026-11-17T22:00:00.000Z',bars(D16.concat('2026-11-17'),(d,i)=>d==='2026-11-12'?50:100+i)),'SPY',Date.parse('2026-11-17T22:00:00.000Z'));
 a.equal(blocked.ok,false);a.equal(blocked.reason,'store-bound');
});
