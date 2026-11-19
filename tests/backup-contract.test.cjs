'use strict';
/* Synthetic memory only. No user storage, browser, requests, migrations or deployment. */
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const B=require('../backup/core.js');
const core=fs.readFileSync(require.resolve('../backup/core.js'),'utf8'),ui=fs.readFileSync(require.resolve('../backup/ui.js'),'utf8');
const iso='2026-11-10T01:00:00.000Z',ts=Date.parse(iso);
const stock=(id=1)=>({id,name:'합성 금',ticker:'SYNTH_GOLD',quantity:2,avgPrice:100,currentPrice:120});
const manual=()=>({value:120,priceAsOf:iso,currency:'KRW',unit:'per-held-unit',maxAgeDays:1});
const point=()=>({ts,val:240,cost:200,schemaVersion:1,origin:'manual-included',priceAsOf:iso,recordedAt:iso,quality:'unconfirmed',signalHold:true,manualComponents:[{account:'gen',ticker:'SYNTH_GOLD',...manual()}],components:[{account:'gen',ticker:'SYNTH_GOLD',quantity:2,price:120,currency:'KRW',unit:'per-held-unit',origin:'manual',priceAsOf:iso,receivedAt:null,maxAgeDays:1}],fx:null,annotation:{note:'사용자 입력 · 미확인',nullable:null,extension:[true,3]}});
function memory(seed={}){const m=new Map(Object.entries(seed));return{get length(){return m.size;},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),all:()=>Object.fromEntries(m)};}
const seeded=()=>memory(Object.fromEntries(B.ACCOUNTS.map(k=>[k,JSON.stringify([stock()])])));
const parse=o=>B.parse(typeof o==='string'?o:JSON.stringify(o));
const bench=()=>({KS200:[{ts,close:100}],QQQ:[{ts,close:200}],SPY:[{ts,close:300}],fetchedAt:'Tue Nov 10 2026',fetchedAtISO:iso});
function refused(o){const s=seeded(),before=s.all();a.throws(()=>B.apply(s,parse(o)));a.deepEqual(s.all(),before);}

test('v7 exports preserve all legacy allowlisted fields, manual provenance and actual QQQ benchmark metadata',()=>{
 const src=seeded();src.setItem('v5_gen',JSON.stringify([{...stock(),pricingMode:'manual',manualPrice:manual()}]));
 const values={v5_snap:{all:[point()],gen:[point()],dom:[],ov:[],pen:[]},v5_deposits:{gen:[{ts,amount:-10,note:'출금'}]},v5_div:[{date:'2026-11-10',amount:1}],v5_balGoals:{all:80,gen:0},v5_ledger:{'2026-11':{income:[],expense:[],invest:[{name:'합성',amount:-5}]}},v5_fxHistory:[{d:'2026-11-10',v:1400}],v5_memos:[{text:'보존'}],v5_userThemeMap:{SYNTH_GOLD:'금'},v5_investPrinciples:{p1:'기록'},v5_debtBank:[{name:'합성',balance:1}],v5_debtHouse:[{name:'합성',amount:2}],v5_nonFinAssets:[{name:'합성',amount:3}],v5_benchHist:bench(),v5_riskData:{vix:20},v5_rkCache:{vix:20}};
 for(const[k,v]of Object.entries(values))src.setItem(k,JSON.stringify(v));
 for(const k of B.TEXT_KEYS)src.setItem(k,k==='v5_fx'?'1400':k==='v5_lastAutoSnap'?String(ts):'0');src.setItem('calc_q1_gen_1','');
 const text=JSON.stringify(B.create(src)),dst=seeded(),plan=parse(text),before=dst.all();B.preview(dst,plan);a.deepEqual(dst.all(),before);B.apply(dst,plan);
 for(const[k,v]of Object.entries(src.all()))a.equal(dst.getItem(k),v,k);
 a.deepEqual(JSON.parse(dst.getItem('v5_snap')).gen[0],point());a.equal(JSON.parse(dst.getItem('v5_benchHist')).QQQ[0].close,200);
 a.equal(B.parse(JSON.stringify(B.create(dst))).sourceVersion,7);
 const legacy=B.create(src);legacy.schemaVersion=6;const legacyPlan=parse(legacy),legacyDst=seeded();a.equal(legacyPlan.sourceVersion,6);B.apply(legacyDst,legacyPlan);for(const[k,v]of Object.entries(src.all()))a.equal(legacyDst.getItem(k),v,k);
});
test('v5 omits general account/benchmark: preserves existing bytes; absent group differs from explicit empty group',()=>{
 const s=seeded();s.setItem('v5_benchHist',JSON.stringify(bench()));s.setItem('v5_snap',JSON.stringify({gen:[point()],dom:[{ts:1,val:2}]}));const before=s.all();
 B.apply(s,parse({version:'v5',domStocks:[],snapshots:{dom:[]}}));a.equal(s.getItem('v5_gen'),before.v5_gen);a.equal(s.getItem('v5_benchHist'),before.v5_benchHist);a.deepEqual(JSON.parse(s.getItem('v5_snap')),{gen:[point()],dom:[]});
 const p=parse({version:'v5',genStocks:[],benchHist:{KS200:[]}});B.apply(s,p);a.equal(s.getItem('v5_gen'),'[]');a.deepEqual(JSON.parse(s.getItem('v5_benchHist')),{...bench(),KS200:[]});
});
test('v6 missing benchmark and nested snapshot groups do not erase existing data',()=>{
 const s=seeded(),doc=B.create(seeded());doc.schemaVersion=6;s.setItem('v5_benchHist',JSON.stringify(bench()));s.setItem('v5_snap',JSON.stringify({gen:[point()]}));doc.storage.v5_snap=JSON.stringify({dom:[]});B.apply(s,parse(doc));a.deepEqual(JSON.parse(s.getItem('v5_benchHist')),bench());a.deepEqual(JSON.parse(s.getItem('v5_snap')),{gen:[point()],dom:[]});
});
for(const [name,text]of [
 ['outer duplicate','{"version":"v5","genStocks":[],"genStocks":[]}'],
 ['escaped duplicate','{"version":"v5","genStocks":[],"gen\\u0053tocks":[]}'],
 ['prototype','{"version":"v5","genStocks":[],"__proto__":{}}'],
 ['deep','{"version":"v5","genStocks":[],"memos":[{"text":"x","extra":'+ '['.repeat(35)+'0'+']'.repeat(35)+'}]}'],
 ['oversized',' '.repeat(B.MAX_BYTES+1)],
 ['numeric overflow','{"version":"v5","genStocks":[],"fg":1e999}'],
 ['null supplied account','{"version":"v5","genStocks":null}'],
 ['unknown future metadata','{"version":"v5","genStocks":[],"futureData":{}}']
])test(name+' input fails closed without writes',()=>refused(text));
test('duplicate key inside serialized v6 storage JSON is rejected, not hidden by JSON.parse',()=>{const d=B.create(seeded());d.schemaVersion=6;d.storage.v5_benchHist='{"QQQ":[],"QQQ":[]}';refused(d);});
test('array and total node budgets reject bounded-size hostile JSON',()=>{
 refused({version:'v5',memos:Array.from({length:B.LIMITS.array+1},()=>({text:'x'}))});
 const row={text:'x',extra:Array(11).fill(0)};refused({version:'v5',memos:Array(40000).fill(row)});
});
for(const [name,change]of [
 ['negative quantity',s=>s.quantity=-1],['numeric string',s=>s.currentPrice='1'],['null price',s=>s.avgPrice=null],['unsafe id',s=>s.id=Number.MAX_SAFE_INTEGER+1],['manual mode missing metadata',s=>s.pricingMode='manual'],['manual bad date',s=>{s.manualPrice=manual();s.manualPrice.priceAsOf='2026-02-30T01:00:00Z';}],['manual invalid expiry',s=>{s.manualPrice=manual();s.manualPrice.maxAgeDays=0;}]
])test('stock rejects '+name,()=>{const s=stock();change(s);refused({version:'v5',genStocks:[s]});});
for(const [name,change]of [
 ['negative close',b=>b.QQQ[0].close=-1],['string close',b=>b.QQQ[0].close='1'],['fractional timestamp',b=>b.QQQ[0].ts=1.5],['duplicate timestamp',b=>b.QQQ.push({...b.QQQ[0]})],['reverse order',b=>b.QQQ.push({ts:1,close:1})],['wrong runtime alias',b=>b.NDX=[]],['bad received time',b=>b.fetchedAtISO='yesterday']
])test('benchmark rejects '+name,()=>{const b=bench();change(b);refused({version:'v5',benchHist:b});});
for(const [name,change]of [
 ['negative cost',p=>p.cost=-1],['unknown schema',p=>p.schemaVersion=2],['false trust label',p=>p.quality='verified'],['signal permission',p=>p.signalHold=false],['missing component',p=>p.components=[]],['duplicate component',p=>p.components.push({...p.components[0]})],['mismatched price',p=>p.manualComponents[0].value=121],['unknown source',p=>p.origin='fresh'],['credential field',p=>p.annotation.apiKey='synthetic-key'],['credential URL',p=>p.annotation.note='https://example.invalid/path?token=synthetic-secret']
])test('snapshot rejects '+name,()=>{const p=point();change(p);refused({version:'v5',snapshots:{gen:[p]}});});
test('same ticker with distinct holding IDs preserves each provenance component',()=>{
 const p=point();p.manualComponents[0].stockId=1;p.components[0].stockId=1;p.manualComponents.push({...p.manualComponents[0],stockId:2});p.components.push({...p.components[0],stockId:2});p.val=480;p.cost=400;
 const s=seeded();B.apply(s,parse({version:'v5',snapshots:{gen:[p]}}));a.deepEqual(JSON.parse(s.getItem('v5_snap')).gen[0],p);
 p.components[1].stockId=1;refused({version:'v5',snapshots:{gen:[p]}});
});
test('legacy GAS URL is excluded from plan, current credential keys remain untouched, credential-shaped unknown fields reject',()=>{
 const s=seeded();s.setItem('v5_gas','SYNTHETIC-EXISTING');const p=parse({version:'v5',genStocks:[],gasUrl:'https://example.invalid/exec?token=synthetic'});a.doesNotMatch(JSON.stringify(p),/example.invalid|token=synthetic/);B.apply(s,p);a.equal(s.getItem('v5_gas'),'SYNTHETIC-EXISTING');refused({version:'v5',genStocks:[],apiKey:'synthetic'});
});
test('future or forged plans and recovery exports cannot be applied',()=>{
 const s=seeded(),before=s.all();for(const p of [{values:{v5_gen:'[]'},legacy:false},JSON.parse(JSON.stringify(parse({version:'v5',genStocks:[]})))])a.throws(()=>B.apply(s,p),/검증된/);a.deepEqual(s.all(),before);
 refused({format:'kst-portfolio-recovery',schemaVersion:1,journal:{}});
});
test('preview and plan are read-only; post-preview target or journal changes block before any write',()=>{
 for(const change of [s=>s.setItem('v5_gen','[]'),s=>s.setItem(B.JOURNAL,'broken')]){const s=seeded(),p=parse({version:'v5',genStocks:[]});B.preview(s,p);change(s);const before=s.all();a.throws(()=>B.apply(s,p));a.deepEqual(s.all(),before);a.equal(Object.isFrozen(p.values),true);}
});
test('pending/malformed journal blocks export/apply/undo/recover without modifying any byte',()=>{
 for(const j of ['broken',JSON.stringify({version:1,status:'prepared',before:{v5_gen:'[]'}})]){const s=seeded();s.setItem(B.JOURNAL,j);const before=s.all();a.equal(B.isWriteBlocked(s),true);for(const run of [()=>B.create(s),()=>B.apply(s,parse({version:'v5',genStocks:[]})),()=>B.undo(s),()=>B.recover(s)])a.throws(run);a.deepEqual(s.all(),before);}
});
test('unsupported applied legacy journal cannot authorize undo or a replacement restore',()=>{const s=seeded();s.setItem(B.JOURNAL,JSON.stringify({version:1,status:'applied',before:{v5_gen:'[]'}}));const before=s.all();a.equal(B.isWriteBlocked(s),true);a.throws(()=>B.undo(s));a.throws(()=>B.apply(s,parse({version:'v5',genStocks:[]})));a.deepEqual(s.all(),before);});
test('undo refuses post-restore edits and retains both the edited data and recovery journal',()=>{const s=seeded();B.apply(s,parse({version:'v5',genStocks:[]}));s.setItem('v5_gen',JSON.stringify([stock(2)]));const before=s.all();a.throws(()=>B.undo(s),/복원 이후 자료/);a.deepEqual(s.all(),before);});
test('interleaved foreign edit is not overwritten by rollback and leaves pending journal',()=>{
 const s=seeded(),set=s.setItem;let injected=false;s.setItem=(k,v)=>{set(k,v);if(k==='v5_gen'&&!injected){injected=true;set('v5_dom',JSON.stringify([stock(7)]));}};
 a.throws(()=>B.apply(s,parse({version:'v5',genStocks:[],domStocks:[]})),/자동 복구가 끝나지/);a.equal(JSON.parse(s.getItem('v5_dom'))[0].id,7);a.equal(B.readJournal(s).status,'prepared');a.equal(B.isWriteBlocked(s),true);
});
test('interleaved foreign journal is not clobbered by rollback',()=>{
 const s=seeded(),set=s.setItem;s.setItem=(k,v)=>{set(k,v);if(k==='v5_gen')set(B.JOURNAL,'foreign-journal');};a.throws(()=>B.apply(s,parse({version:'v5',genStocks:[]})),/자동 복구가 끝나지/);a.equal(s.getItem(B.JOURNAL),'foreign-journal');
});
test('export refuses corrupted source even with valid memory override',()=>{const s=seeded();s.setItem('v5_benchHist','{"QQQ":[],"QQQ":[]}');const before=s.all();a.throws(()=>B.create(s,{v5_benchHist:'{}'}));a.deepEqual(s.all(),before);});

// Minimal DOM is enough to exercise the real backup adapter without a browser or jsdom.
function harness(seed={},runtime=true){
 const storage=seeded();for(const[k,v]of Object.entries(seed))storage.setItem(k,v);
 const all=[];function el(tag){const x={tagName:tag.toUpperCase(),children:[],parent:null,textContent:'',style:{},attributes:{},listeners:{},append(...items){for(const item of items){this.children.push(item);item.parent=this;}},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,fn){this.listeners[k]=fn;},remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;},click(){this.listeners.click?.();},scrollIntoView(){},appendChild(x){this.append(x);return x;}};all.push(x);return x;}
 const body=el('body'),host=el('div'),message=el('div');host.id='portfolioBackupTools';message.id='backupMsg';const fx=el('input');fx.id='usdKrw';fx.value='1400';body.append(host,message,fx);
 const document={body,createElement:el,getElementById:id=>all.find(x=>x.id===id&&x.parent)||null};
 const calls=[],downloads=[];const context={backupStateLoaded:true,document,localStorage:storage,TextEncoder,Blob,URL:{createObjectURL:b=>{downloads.push(b);return 'blob:synthetic';},revokeObjectURL(){}},setTimeout(){},confirm:()=>true,console};context.window=context;
 const ctx=vm.createContext(context);for(const file of ['quote-model','snapshot-policy','return-assessment','benchmark-history-policy'])vm.runInContext(fs.readFileSync(require.resolve('../has/'+file+'.js'),'utf8'),ctx);vm.runInContext(core,ctx);vm.runInContext(`var genStocks=[],domStocks=[],ovStocks=[],penStocks=[],divList=[],snapshots={},deposits={},balGoals={},benchmarkHistory={KS200:[{ts:1,close:1}],NDX:[{ts:1,close:1}],SPY:[]};function getRate(){return 1400;}function loadDebtBank(){return [];}function loadDebtHouse(){return [];}function loadNonFinAssets(){return [];}function load(){call('load');}function renderAll(){call('render');}function loadBenchmarkCacheSync(){call('bench');var b=JSON.parse(localStorage.getItem('v5_benchHist')||'null');if(b&&b.KS200&&b.QQQ)benchmarkHistory={KS200:b.KS200,NDX:b.QQQ,SPY:b.SPY||[]};}`,ctx);
 ctx.call=v=>calls.push(v);if(runtime)ctx.invalidateBackupRuntime=()=>calls.push('invalidate');vm.runInContext(ui,ctx);
 return{ctx,storage,calls,downloads,document,message,all,async select(text){await ctx.importData({target:{files:[{size:Buffer.byteLength(text),text:async()=>text}],value:'x'}});},button(text){return all.find(x=>x.parent&&x.textContent===text);}};
}
test('UI startup pending recovery shows hold/export control, never automatically recovers or exports ordinary unloaded globals',()=>{
 const j=JSON.stringify({version:1,status:'prepared',before:{v5_gen:'[]'}}),h=harness({[B.JOURNAL]:j}),before=h.storage.all();a.ok(h.document.getElementById('portfolioRecoveryHold'));a.equal(h.ctx.HASBackupUI.isWriteBlocked(),true);h.ctx.exportData();a.equal(h.downloads.length,0);a.deepEqual(h.storage.all(),before);a.deepEqual(h.calls,[]);h.button('복원 전 사본 내보내기').click();a.equal(h.downloads.length,1);a.deepEqual(h.storage.all(),before);
});
test('UI cancel and stale repeated selection cannot apply old preview',async()=>{
 const h=harness(),before=h.storage.all();await h.select(JSON.stringify({version:'v5',genStocks:[]}));const oldApply=h.button('복원 적용');h.button('복원 취소').click();oldApply.click();a.deepEqual(h.storage.all(),before);a.match(h.message.textContent,/이전 미리보기/);
});
test('UI requires runtime invalidation hook before writes',async()=>{const h=harness({},false),before=h.storage.all();await h.select(JSON.stringify({version:'v5',genStocks:[]}));h.button('복원 적용').click();a.deepEqual(h.storage.all(),before);a.match(h.message.textContent,/안전 연결/);});
test('UI restore invalidates callbacks before writes and refreshes explicit empty benchmark cache into empty memory',async()=>{
 const h=harness();await h.select(JSON.stringify({version:'v5',genStocks:[],benchHist:{KS200:[],QQQ:[],SPY:[]}}));h.button('복원 적용').click();a.deepEqual(h.calls,['invalidate','load','bench','render']);a.equal(JSON.stringify(h.ctx.benchmarkHistory),'{"KS200":[],"NDX":[],"SPY":[]}');a.equal(h.storage.getItem('v5_gen'),'[]');
});
test('UI memory edits after preview refuse even when storage has not yet changed',async()=>{const h=harness(),before=h.storage.all();await h.select(JSON.stringify({version:'v5',genStocks:[]}));vm.runInContext('genStocks.push({id:99});',h.ctx);h.button('복원 적용').click();a.deepEqual(h.storage.all(),before);a.match(h.message.textContent,/화면 자료가 바뀌/);});
test('UI out-of-order file reads keep the latest selection only',async()=>{
 const h=harness();let done;const first=h.ctx.importData({target:{files:[{size:10,text:()=>new Promise(r=>{done=r;})}],value:'x'}});await h.select(JSON.stringify({version:'v5',domStocks:[]}));done(JSON.stringify({version:'v5',genStocks:[]}));await first;h.button('복원 적용').click();a.notEqual(h.storage.getItem('v5_gen'),'[]');a.equal(h.storage.getItem('v5_dom'),'[]');
});

test('UI missing/invalid actual FX or unloaded globals cannot export fallback 1370 or overwrite storage',()=>{
 for(const invalid of [null,'','NaN','0']){const h=harness(),before=h.storage.all();if(invalid===null)h.document.getElementById('usdKrw').remove();else h.document.getElementById('usdKrw').value=invalid;h.ctx.exportData();a.equal(h.downloads.length,0);a.deepEqual(h.storage.all(),before);}
 const h=harness(),before=h.storage.all();h.ctx.backupStateLoaded=false;h.ctx.exportData();a.equal(h.downloads.length,0);a.deepEqual(h.storage.all(),before);
});
test('policy-emitted quote/manual/cash/FX snapshots are all backup-compatible, including duplicate ticker lots',()=>{
 const P=require('../has/snapshot-policy.js'),base={now:ts,key:'gen',freshPrice:{'KR:SYNTH_GOLD':true,'US:SYNTH_GOLD':true},quoteMeta:{'KR:SYNTH_GOLD':ts-100,'US:SYNTH_GOLD':ts-100,FX:ts-100},quoteValues:{'KR:SYNTH_GOLD':120,'US:SYNTH_GOLD':120,FX:1400},fx:1400};
 const m={...stock(),pricingMode:'manual',manualPrice:manual()};
 for(const input of [{...base,accounts:{gen:[stock()]}},{...base,accounts:{gen:[m,{...m,id:2}]}},{...base,accounts:{gen:[{...stock(),ticker:'DEP_GEN'}]}},{...base,key:'ov',accounts:{ov:[stock()]}}]){
  const result=P.evaluate(input);a.equal(result.ok,true,JSON.stringify(result.missing));const s=seeded();B.apply(s,parse({version:'v5',snapshots:{[input.key]:[result.snapshot]}}));a.deepEqual(JSON.parse(s.getItem('v5_snap'))[input.key][0],result.snapshot);
 }
});
test('평균단가 계산기 단가 쉼표(12,345.5 / 1,200.)는 백업 사본에서만 숫자로 정리하고 실제 저장값은 그대로 둔다',async()=>{
 const h=harness({calc_p1_gen_1:'12,345.5',calc_p2_gen_1:'1,200.',calc_q1_gen_1:'3',calc_p3_gen_1:''}),before=h.storage.all();h.ctx.exportData();
 a.equal(h.downloads.length,1,h.message.textContent);a.deepEqual(h.storage.all(),before);
 const b=JSON.parse(await h.downloads[0].text()),flat=JSON.stringify(b);a.match(flat,/"calc_p1_gen_1":"12345\.5"/);a.match(flat,/"calc_p2_gen_1":"1200"/);a.match(flat,/"calc_q1_gen_1":"3"/);
 a.doesNotThrow(()=>B.parse(JSON.stringify(b)),'정리된 백업은 복원 검사를 통과해야 함');
});
test('정리할 수 없는 계산기 값(문자 섞임)은 그대로 두어 백업을 막고 항목 이름을 알린다',()=>{
 const h=harness({calc_p1_gen_1:'12,34a'});h.ctx.exportData();a.equal(h.downloads.length,0);a.match(h.message.textContent,/항목: calc_p1_gen_1/);
});
{
 // 규칙 A 2단위: 설정 화면 '기준지수 같은 값 보류 정리' (합성 자료)
 const P=require('../has/benchmark-history-policy.js'),D=['2026-11-05','2026-11-06','2026-11-09'],T0=Date.parse('2026-11-10T22:00:00.000Z');
 const legacyRaw=JSON.stringify({QQQ:D.map((d,i)=>({ts:Date.parse(d+'T14:30:00Z'),close:[701.53,702.1,700][i]}))});
 const sv=P.specs.QQQ,yh=closes=>P.parseYahoo({chart:{result:[{meta:{symbol:sv.symbol,currency:sv.currency,exchangeTimezoneName:sv.timezone,exchangeName:'NMS',fullExchangeName:'NasdaqGS',instrumentType:'ETF',dataGranularity:'1d',regularMarketTime:T0/1000-3600},timestamp:D.map(d=>Date.parse(d+'T14:30:00Z')/1000),indicators:{quote:[{close:closes}]}}],error:null}},'QQQ','2026-11-10T22:00:00.000Z');
 function sideRaw(sameCloses){
  const base=P.mergeHistoryStore(null,legacyRaw,yh([701.54,702.1,700]),'QQQ',T0),real=base.store.series.QQQ.conflicts[0];
  const extra=sameCloses.map(([d,close],i)=>{const p={...real.alternative,d,close,receivedAt:'2026-11-10T21:0'+i+':00.000Z',providerBarTs:Date.parse(d+'T14:30:00Z')};p.id='o:'+P.fingerprint(JSON.stringify([p.d,p.close,p.source,p.receivedAt,p.providerBarTs]));return {d,existing:JSON.parse(legacyRaw).QQQ[D.indexOf(d)],alternative:p,status:'pending-review'};});
  return JSON.stringify({...base.store,series:{...base.store.series,QQQ:{...base.store.series.QQQ,conflicts:[real,...extra]}}});
 }
 const settleInput=h=>h.all.findLast(x=>x.parent&&x.parent.id==='benchSettleVerify'&&x.tagName==='INPUT');
 async function pick(h,text){const inp=settleInput(h);inp.files=text===null?[]:[{size:Buffer.byteLength(text),text:async()=>text}];await inp.listeners.change();}
 const APPLY='정리 저장 (사본 확인함)';
 test('지수 같은 값 보류 정리: 다운로드는 시도만 표시, 내려받은 사본을 다시 골라 확인해야 [정리 저장]이 열리고, 저장 후 사본으로 원상복구 왕복',async()=>{
  const raw=sideRaw([['2026-11-05',701.530029296875],['2026-11-06',702.0999755859375]]);
  const h=harness({v5_benchHist:legacyRaw,v5_benchHistV2:raw});h.button('기준지수 같은 값 보류 정리').click();
  a.equal(h.storage.getItem('v5_benchHistV2'),raw,'미리보기 단계에서는 저장 금지');a.equal(h.downloads.length,1);a.match(h.message.textContent,/QQQ 3→1건/);a.match(h.message.textContent,/저장 여부 미확인/);a.doesNotMatch(h.message.textContent,/내려받았습니다/);
  a.equal(h.button(APPLY),undefined,'사본 확인 전에는 저장 버튼 없음');
  const text=await h.downloads[0].text(),arc=JSON.parse(text);a.equal(arc.format,'kst-bench-same-value-archive');a.equal(arc.schemaVersion,2);
  a.equal(arc.keys.v5_benchHistV2.raw,raw);a.equal(arc.keys.v5_benchHist.raw,legacyRaw,'CR-1 지수 원본 원문 포함');a.equal(arc.keys.v5_benchHist.fingerprint,P.fingerprint(legacyRaw));a.equal(arc.binding.legacyFingerprint,JSON.parse(raw).legacyFingerprint);a.equal(arc.removed.length,2);a.match(arc.purpose,/일반 복원 파일이 아니/);
  await pick(h,text);a.match(h.message.textContent,/사본 확인 완료/);a.match(h.message.textContent,/전체 복원 되돌리기'로는 이 정리를 취소할 수 없습니다/);
  let asked='';h.ctx.confirm=q=>{asked=q;return true;};h.button(APPLY).click();a.match(asked,/취소할 수 없습니다/);
  const after=h.storage.getItem('v5_benchHistV2'),next=JSON.parse(after);a.equal(next.series.QQQ.conflicts.length,1);a.equal(next.series.QQQ.conflicts[0].alternative.close,701.54);
  a.equal(h.storage.getItem('v5_benchHist'),legacyRaw);a.ok(h.calls.includes('invalidate'));a.match(h.message.textContent,/정리를 저장했습니다/);a.equal(h.button(APPLY),undefined);a.equal(h.document.getElementById('benchSettleVerify'),null);
  // 사본 → 검증 → 원상복구 왕복(합성 로컬 자료, 자동 복원 UI 없음): 사본의 원문으로 두 키를 되돌리면 바이트 동일·검사 통과
  const v=P.verifySettleArchive(text,legacyRaw,raw,after,Date.parse('2026-11-10T22:00:00.000Z'));a.equal(v.ok,true,v.reason);
  h.storage.setItem('v5_benchHist',v.restore.v5_benchHist);h.storage.setItem('v5_benchHistV2',v.restore.v5_benchHistV2);a.equal(h.storage.getItem('v5_benchHistV2'),raw);a.equal(P.validateStore(JSON.parse(raw),legacyRaw,Date.parse('2026-11-10T22:00:00.000Z')).ok,true);
  a.equal(h.button('전체 복원 되돌리기')!==undefined,true);a.equal(typeof h.ctx.HASBenchmarkHistory.restoreSettleArchive,'undefined','자동 복원 기능 없음');
 });
 test('지수 같은 값 보류 정리: 재선택 사본이 없거나 손상·불일치·다른 미리보기·확인 취소면 저장 0',async()=>{
  const raw=sideRaw([['2026-11-05',701.530029296875],['2026-11-06',702.0999755859375]]);
  const h=harness({v5_benchHist:legacyRaw,v5_benchHistV2:raw});h.button('기준지수 같은 값 보류 정리').click();const text=await h.downloads[0].text(),arc=JSON.parse(text);
  const bad=[[null,/고르지 않았습니다/],['{',/파일을 읽을 수 없습니다/],[JSON.stringify({format:'kst-portfolio-backup'}),/형식이 아닙니다/],
   [JSON.stringify({...arc,keys:{...arc.keys,v5_benchHist:{...arc.keys.v5_benchHist,raw:arc.keys.v5_benchHist.raw.replace('700','701')}}}),/해시가 맞지 않습니다/],
   [JSON.stringify({...arc,keys:{...arc.keys,v5_benchHist:{raw:'{}',fingerprint:P.fingerprint('{}')}}}),/미리보기 시점 자료와 다릅니다/],
   [JSON.stringify({...arc,binding:{legacyFingerprint:P.fingerprint('x')}}),/연결값/],
   [JSON.stringify({...arc,plan:{...arc.plan,nextFingerprint:P.fingerprint('x')}}),/이번 미리보기의 사본이 아닙니다/]];
  for(const[t,re]of bad){await pick(h,t);a.match(h.message.textContent,re);a.equal(h.button(APPLY),undefined);a.equal(h.storage.getItem('v5_benchHistV2'),raw);}
  const big={size:9e6,text:async()=>text};const inp=settleInput(h);inp.files=[big];await inp.listeners.change();a.match(h.message.textContent,/파일 크기/);a.equal(h.button(APPLY),undefined);
  await pick(h,text);const oldApply=h.button(APPLY);a.ok(oldApply);
  h.ctx.confirm=()=>false;oldApply.click();a.equal(h.storage.getItem('v5_benchHistV2'),raw,'확인 취소 → 저장 0');h.ctx.confirm=()=>true;
  h.button('기준지수 같은 값 보류 정리').click();a.equal(h.button(APPLY),undefined,'새 미리보기는 이전 확인을 무효화');oldApply.click();a.equal(h.storage.getItem('v5_benchHistV2'),raw);a.match(h.message.textContent,/사본 확인이 끝나지 않았습니다/);
 });
 test('지수 같은 값 보류 정리: 확인 후 두 키 중 하나라도 바뀌면 저장 0, 저장 실패는 불변·안내, 정리할 것 없으면 파일 0',async()=>{
  for(const key of ['v5_benchHistV2','v5_benchHist']){
   const raw=sideRaw([['2026-11-05',701.530029296875]]),h=harness({v5_benchHist:legacyRaw,v5_benchHistV2:raw});h.button('기준지수 같은 값 보류 정리').click();await pick(h,await h.downloads[0].text());
   const changed=key==='v5_benchHistV2'?sideRaw([['2026-11-06',702.0999755859375]]):legacyRaw.replace('700','699');h.storage.setItem(key,changed);h.button(APPLY).click();
   a.equal(h.storage.getItem(key),changed);a.equal(h.storage.getItem('v5_benchHistV2'),key==='v5_benchHistV2'?changed:raw);a.match(h.message.textContent,/바뀌었습니다/);a.ok(!h.calls.includes('invalidate'));
  }
  const raw=sideRaw([['2026-11-05',701.530029296875]]),h=harness({v5_benchHist:legacyRaw,v5_benchHistV2:raw});h.button('기준지수 같은 값 보류 정리').click();await pick(h,await h.downloads[0].text());
  const set=h.storage.setItem.bind(h.storage);h.storage.setItem=(k,v)=>{if(k==='v5_benchHistV2')throw Error('QuotaExceededError');return set(k,v);};h.button(APPLY).click();
  a.equal(h.storage.getItem('v5_benchHistV2'),raw);a.match(h.message.textContent,/저장하지 못했고 지수 기록은 그대로입니다/);a.equal(h.button(APPLY),undefined);h.storage.setItem=set;
  h.button('기준지수 같은 값 보류 정리').click();a.equal(h.downloads.length,2,'실패 후 재실행은 다시 미리보기부터');
  const none=sideRaw([]),h2=harness({v5_benchHist:legacyRaw,v5_benchHistV2:none});h2.button('기준지수 같은 값 보류 정리').click();
  a.equal(h2.downloads.length,0);a.equal(h2.storage.getItem('v5_benchHistV2'),none);a.match(h2.message.textContent,/정리할 같은 값 보류가 없습니다/);
  const h3=harness();h3.button('기준지수 같은 값 보류 정리').click();a.equal(h3.downloads.length,0);a.match(h3.message.textContent,/정리할 지수 보류 기록이 없습니다/);
 });

 // 지피 0830 CR-5: 같은 미리보기 안 비동기 재선택 경합 — 최신 선택만 결과를 바꾼다(합성 지연 Promise, 실제 Android 재현 아님).
 function deferred(){let res,rej;const pr=new Promise((a1,b1)=>{res=a1;rej=b1;});return {pr,res,rej};}
 function slowPick(h,size){const d=deferred(),inp=settleInput(h);inp.files=[{size,text:()=>d.pr}];const run=inp.listeners.change();return {d,run};}
 test('지수 같은 값 보류 정리 CR-5: A 읽는 중 B 실패·취소·새 미리보기면 A 늦은 성공이 [정리 저장]을 되살리지 못함',async()=>{
  const raw=sideRaw([['2026-11-05',701.530029296875]]),fresh=()=>{const h=harness({v5_benchHist:legacyRaw,v5_benchHistV2:raw});h.button('기준지수 같은 값 보류 정리').click();return h;};
  // (1) A 정상 시작 → B 손상 → A 늦게 완료
  let h=fresh(),text=await h.downloads[0].text();let A=slowPick(h,text.length);await pick(h,'{');a.match(h.message.textContent,/파일을 읽을 수 없습니다/);
  A.d.res(text);await A.run;a.equal(h.button(APPLY),undefined,'최신 B 실패 후 A 늦은 성공 → 버튼 0');a.match(h.message.textContent,/파일을 읽을 수 없습니다/,'구 요청이 최신 문구를 덮지 않음');
  h.ctx.confirm=()=>true;a.equal(h.storage.getItem('v5_benchHistV2'),raw,'setItem 0');
  // (1b) A 정상 시작 → B 미선택 → A 늦게 완료
  h=fresh();text=await h.downloads[0].text();A=slowPick(h,text.length);await pick(h,null);A.d.res(text);await A.run;a.equal(h.button(APPLY),undefined);a.match(h.message.textContent,/고르지 않았습니다/);
  // (1c) A 정상 시작 → 파일 선택 창 취소(cancel) → A 늦게 완료
  h=fresh();text=await h.downloads[0].text();A=slowPick(h,text.length);settleInput(h).listeners.cancel();A.d.res(text);await A.run;a.equal(h.button(APPLY),undefined);a.equal(h.storage.getItem('v5_benchHistV2'),raw);
  // (1d) A 정상 시작 → B 읽기 reject → A 늦게 완료: 둘 다 버튼 0
  h=fresh();text=await h.downloads[0].text();A=slowPick(h,text.length);const B=slowPick(h,text.length);B.d.rej(Error('NotReadableError'));await B.run;a.equal(h.button(APPLY),undefined);A.d.res(text);await A.run;a.equal(h.button(APPLY),undefined);a.equal(h.storage.getItem('v5_benchHistV2'),raw);
  // (2) A 정상 시작 → B 정상 진행 중 → A 먼저 완료: B 완료 전 버튼 0, B 검증 후에만 버튼
  h=fresh();text=await h.downloads[0].text();A=slowPick(h,text.length);const B2=slowPick(h,text.length);A.d.res(text);await A.run;a.equal(h.button(APPLY),undefined,'최신 B 검증 전 버튼 0');a.equal(h.storage.getItem('v5_benchHistV2'),raw);
  B2.d.res(text);await B2.run;a.ok(h.button(APPLY),'마지막 정상 파일 검증 후에만 버튼');a.match(h.message.textContent,/사본 확인 완료/);
  // (2b) 버튼이 열린 뒤 다시 고르기 시작하면 옛 버튼은 사라지고, 옛 버튼 참조를 눌러도 저장 0
  const old=h.button(APPLY);const C=slowPick(h,text.length);a.equal(h.button(APPLY),undefined);old.click();a.equal(h.storage.getItem('v5_benchHistV2'),raw);a.match(h.message.textContent,/사본 확인이 끝나지 않았습니다/);C.d.rej(Error('x'));await C.run;
  // (3) A 정상 시작 → 새 미리보기 → A 완료: 버튼 0
  h=fresh();text=await h.downloads[0].text();A=slowPick(h,text.length);h.button('기준지수 같은 값 보류 정리').click();A.d.res(text);await A.run;a.equal(h.button(APPLY),undefined);a.equal(h.storage.getItem('v5_benchHistV2'),raw);
  // 새 미리보기의 사본을 정상 선택하면 열림(정상 경로 유지)
  await pick(h,await h.downloads[1].text());a.ok(h.button(APPLY));
 });
}
