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
 const all=[];function el(tag){const x={tagName:tag.toUpperCase(),children:[],parent:null,textContent:'',style:{},attributes:{},listeners:{},append(...items){for(const item of items){this.children.push(item);item.parent=this;}},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,fn){this.listeners[k]=fn;},remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;},click(){this.listeners.click?.();},scrollIntoView(){}};all.push(x);return x;}
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
