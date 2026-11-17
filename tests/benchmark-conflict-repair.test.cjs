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
// 장중 먼저 → 마감 후 보류 순서로 만든 저장소 (실제 앱 경로 재현)
function intradayThenPost(n){let s=null;for(let i=0;i<n;i++){const t=new Date(Date.parse('2026-11-16T15:00:00.000Z')+i*60000).toISOString();
 const m=H.mergeHistoryStore(s,LEGACY,gas('SPY',t,bars(D16,(d,j)=>d==='2026-11-16'?740+i/100:100+j)),'SPY',Date.parse(t));a.equal(m.ok,true,m.reason);s=m.store;}
 return merge(s,'SPY','2026-11-17T01:00:00.000Z',(d,i)=>d==='2026-11-13'?99:d==='2026-11-16'?745.82:100+i);}
const CAL=(d,m)=>[1,2,3,4,5].includes(new Date(d+'T00:00:00Z').getUTCDay());
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
