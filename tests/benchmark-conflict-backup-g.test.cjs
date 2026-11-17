'use strict';
// GPT-REVIEW-bench-conflict-cause-20261117-0830 CR-1: (g) 복구·백업 호환을 (f)와 분리해 시험.
// 합성 Map 저장소·합성 지수 자료만 사용. 실제 계좌·브라우저 localStorage·백업 파일·네트워크 접근 없음.
const test=require('node:test'),a=require('node:assert/strict');
const H=require('../has/benchmark-history-policy.js'),B=require('../backup/core.js');
const BASE=['2026-11-10','2026-11-11','2026-11-12','2026-11-13'],D16=BASE.concat('2026-11-16');
const R_POST='2026-11-16T22:00:00.000Z',NOW=Date.parse(R_POST);
function memory(extra={},failKey=null){
 const m=new Map(Object.entries({...Object.fromEntries(B.ACCOUNTS.map(k=>[k,'[]'])),...extra})),writes=[];
 return {get length(){return m.size;},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,
  setItem(k,v){if(k===failKey)throw new Error('synthetic quota');writes.push([k,String(v)]);m.set(k,String(v));},
  removeItem(k){writes.push([k,null]);m.delete(k);},all:()=>Object.fromEntries(m),writes};
}
const gas=(sym,receipt,bars)=>{const c=H.parseGasHistory({[sym]:{source:'yahoo-chart-v8',symbol:sym,currency:'USD',exchange:sym==='QQQ'?'NasdaqGS':'NYSEArca',timezone:'America/New_York',instrumentType:'ETF',adjustment:'unverified',regularMarketTime:null,regularMarketPrice:null,fiftyTwoWeekHigh:null,barCount:bars.length,bars}},sym,receipt,{mode:'configured-gas'});a.equal(c.ok,true,c.reason);return c;};
const bars=(dates,f)=>dates.map((d,i)=>({d,c:f(d,i)}));
// 레거시 원문: 공백·줄바꿈이 있는 그대로 보존되어야 지문이 맞는다.
const LEGACY=' {\n "SPY" : '+JSON.stringify(BASE.map((d,i)=>({ts:Date.parse(d+'T14:30:00Z'),close:100+i})))+', "QQQ": [], "KS200": []\n} ';
// 레거시와 11-13 값이 다른 GAS 수신 → 11-13 pending-review 충돌 1건 + 11-16 provisional 저장
function conflictStore(legacy=LEGACY){
 const m=H.mergeHistoryStore(null,legacy,gas('SPY',R_POST,bars(D16,(d,i)=>d==='2026-11-13'?99:d==='2026-11-16'?745.82:100+i)),'SPY',NOW);
 a.equal(m.ok,true,m.reason);return m.store;
}
const doc=values=>({format:B.FORMAT,schemaVersion:B.VERSION,exportedAt:R_POST,scope:'portfolio-only-no-secrets-no-radar',storage:{...memory().all(),...values}});
const parse=o=>B.parse(JSON.stringify(o));
function noWrites(storage,run,re){const before=storage.all(),n=storage.writes.length;a.throws(run,re);a.deepEqual(storage.all(),before);a.equal(storage.writes.length,n);}
const pending=(raw,legacy)=>H.readStore(JSON.parse(raw),legacy,NOW).series.SPY.pendingConflicts.length;

test('(g1) 보류충돌 저장소 create→parse→preview→apply→undo: 레거시 원문·보조 기록 그대로, 복원 뒤 보류 유지·읽기 가능',()=>{
 const st=conflictStore(),v2=JSON.stringify(st),src=memory({v5_benchHist:LEGACY,v5_benchHistV2:v2}),before=src.all();
 const out=B.create(src);a.deepEqual(src.all(),before);a.equal(src.writes.length,0,'백업 생성은 원본에 쓰지 않음');
 a.equal(out.storage.v5_benchHist,LEGACY,'레거시 원문 바이트 동일');a.equal(out.storage.v5_benchHistV2,v2);
 const plan=parse(out);a.match(plan.warnings.join('\n'),/충돌 보류/);
 const dst=memory();B.preview(dst,plan);a.equal(dst.writes.length,0,'미리보기는 쓰지 않음');
 B.apply(dst,plan);a.equal(dst.getItem('v5_benchHist'),LEGACY);a.equal(dst.getItem('v5_benchHistV2'),v2);
 const view=H.readStore(JSON.parse(dst.getItem('v5_benchHistV2')),dst.getItem('v5_benchHist'),NOW);
 a.equal(view.ok,true);a.equal(view.series.SPY.ok,true);a.equal(view.series.SPY.pendingConflicts.length,1,'보류충돌 자동 해소·삭제 없음');
 a.equal(view.series.SPY.byDate['2026-11-13'].close,103,'보류 중에는 기존 레거시 값 유지');a.equal(view.series.SPY.byDate['2026-11-16'].close,745.82);
 B.undo(dst);a.equal(dst.getItem('v5_benchHist'),null);a.equal(dst.getItem('v5_benchHistV2'),null);
});
test('(g2) legacyFingerprint 불일치: 백업 안의 레거시 원문이 한 글자 다르면 preview·apply 모두 거절, 대상 무변경',()=>{
 const v2=JSON.stringify(conflictStore()),altered=LEGACY.replace('"QQQ": []','"QQQ":[]');a.notEqual(altered,LEGACY);
 const plan=parse(doc({v5_benchHist:altered,v5_benchHistV2:v2}));
 const dst=memory({v5_benchHist:LEGACY,v5_benchHistV2:v2});
 noWrites(dst,()=>B.preview(dst,plan),/연결/);noWrites(dst,()=>B.apply(dst,plan),/연결/);
});
test('(g3) 백업에 보조 기록만 있을 때: 현재 레거시와 지문이 맞으면 복원, 다르면 거절·무변경',()=>{
 const v2=JSON.stringify(conflictStore()),plan=parse(doc({v5_benchHistV2:v2}));
 const ok=memory({v5_benchHist:LEGACY});B.apply(ok,plan);a.equal(ok.getItem('v5_benchHist'),LEGACY,'현재 레거시 원문 불변');
 a.equal(ok.getItem('v5_benchHistV2'),v2);a.equal(pending(ok.getItem('v5_benchHistV2'),LEGACY),1);
 const other=' {"SPY":[],"QQQ":[],"KS200":[]} ',bad=memory({v5_benchHist:other});
 noWrites(bad,()=>B.apply(bad,parse(doc({v5_benchHistV2:v2}))),/연결/);a.equal(bad.getItem('v5_benchHist'),other);
});
test('(g4) 현재 보조 기록에만 있는 그룹: 지문 같으면 합쳐 보존, 지문 다르면 거절·무변경',()=>{
 const spy=conflictStore(),qq=H.mergeHistoryStore(spy,LEGACY,gas('QQQ',R_POST,bars(D16,(d,i)=>500+i)),'QQQ',NOW);a.equal(qq.ok,true);
 const current=JSON.stringify(qq.store),incoming=JSON.stringify(spy);a.ok(qq.store.series.QQQ&&!spy.series.QQQ);
 const s=memory({v5_benchHist:LEGACY,v5_benchHistV2:current});B.apply(s,parse(doc({v5_benchHist:LEGACY,v5_benchHistV2:incoming})));
 const merged=JSON.parse(s.getItem('v5_benchHistV2'));a.deepEqual(Object.keys(merged.series).sort(),['QQQ','SPY']);a.equal(H.validateStore(merged,LEGACY,NOW).ok,true);
 // 지문이 다른 백업(다른 레거시로 만든 SPY 보조 기록) + 현재 QQQ 그룹 → 합치지 않음
 const other=' {"SPY":'+JSON.stringify(BASE.map((d,i)=>({ts:Date.parse(d+'T14:30:00Z'),close:200+i})))+',"QQQ":[],"KS200":[]} ';
 const foreign=JSON.stringify(conflictStore(other)),t=memory({v5_benchHist:LEGACY,v5_benchHistV2:current});
 noWrites(t,()=>B.apply(t,parse(doc({v5_benchHistV2:foreign}))),/원본 연결/);
});
test('(g5) 저장 실패 중간 발생: 보조 기록 쓰기 실패 시 이전 값으로 되돌리고 레거시 원문 그대로',()=>{
 const v2=JSON.stringify(conflictStore()),newLegacy=LEGACY.replace('100,','100.5,');
 const newV2=JSON.stringify(conflictStore(newLegacy));
 const s=memory({v5_benchHist:LEGACY,v5_benchHistV2:v2},'v5_benchHistV2'),before=s.all();
 a.throws(()=>B.apply(s,parse(doc({v5_benchHist:newLegacy,v5_benchHistV2:newV2}))),/복원 실패|복구/);
 const after=s.all();delete after[B.JOURNAL];a.deepEqual(after,before,'레거시·보조 기록·계좌 모두 이전 값');
 a.equal(B.readJournal(s).status,'undone');
});
test('(g6) 256건 보류 저장소도 백업 왕복은 바이트 동일·읽기 가능 — 단 복원은 store-bound 위험을 해소하지 않음(별도 승인 대상)',()=>{
 const t0=NOW;let st=H.mergeHistoryStore(null,null,gas('SPY',R_POST,bars(D16,()=>700)),'SPY',t0).store;
 for(let i=1;i<=256;i++){const r=new Date(t0+i*60000).toISOString(),m=H.mergeHistoryStore(st,null,gas('SPY',r,bars(D16,(d)=>d==='2026-11-16'?700+i/100:700)),'SPY',Date.parse(r));a.equal(m.ok,true);st=m.store;}
 const v2=JSON.stringify(st),src=memory({v5_benchHistV2:v2}),dst=memory();B.apply(dst,parse(B.create(src)));
 a.equal(dst.getItem('v5_benchHistV2'),v2);const back=JSON.parse(dst.getItem('v5_benchHistV2'));
 a.equal(H.readStore(back,null,Date.parse('2026-11-17T15:00:00.000Z')).series.SPY.ok,true);a.equal(back.series.SPY.conflicts.length,256);
 const RN='2026-11-17T22:00:00.000Z',next=H.mergeHistoryStore(back,null,gas('SPY',RN,bars(D16.concat('2026-11-17'),(d)=>d>='2026-11-16'?750:700)),'SPY',Date.parse(RN));
 a.equal(next.ok,false,'충돌 1건이 더 생기면 새 날짜 11-17도 함께 거절');a.equal(next.reason,'store-bound');
});
