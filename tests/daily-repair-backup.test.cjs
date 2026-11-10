'use strict';
// Synthetic Maps and pure parsers only. No browser, user storage or network.
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const B=require('../backup/core.js'),H=require('../has/benchmark-history-policy.js');
const ISO='2026-11-10T22:00:00.000Z',NOW=Date.parse(ISO);
const clone=v=>JSON.parse(JSON.stringify(v));
function memory(extra={}){
 const m=new Map(Object.entries({...Object.fromEntries(B.ACCOUNTS.map(k=>[k,'[]'])),...extra})),writes=[];
 return {get length(){return m.size;},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem(k,v){writes.push([k,String(v)]);m.set(k,String(v));},removeItem(k){writes.push([k,null]);m.delete(k);},all:()=>Object.fromEntries(m),writes};
}
const typed=(change={})=>({activityVersion:1,id:'synthetic-activity-1',account:'gen',kind:'external-in',ts:NOW-3600000,amount:100,currency:'KRW',recordedAt:ISO,timeCertainty:'instant',...change});
const flowRaw=rows=>JSON.stringify({gen:rows,dom:[],ov:[],pen:[]});
function candidate(dates=['2026-11-06','2026-11-09'],prices=[100,101],id='QQQ'){
 const s=H.specs[id],payload={chart:{error:null,result:[{meta:{symbol:s.symbol,currency:s.currency,exchangeTimezoneName:s.timezone,exchangeName:id==='KS200'?'KSC':'NMS',instrumentType:'ETF',dataGranularity:'1d'},timestamp:dates.map(d=>Date.parse(d+(id==='KS200'?'T00:00:00Z':'T14:30:00Z'))/1000),indicators:{quote:[{close:prices}]}}]}};
 const c=H.parseYahoo(payload,id,ISO);a.equal(c.ok,true);return c;
}
function paired(raw=' {\n "QQQ" : [{"ts":1793975400000,"close":100}], "KS200": [], "SPY": []\n} '){
 const c=candidate(['2026-11-06','2026-11-09'],[100.0001,101]);
 const merged=H.mergeHistoryStore(null,raw,c,'QQQ',NOW);a.equal(merged.ok,true,JSON.stringify(merged));
 return {'v5_benchHist':raw,'v5_benchHistV2':JSON.stringify(merged.store)};
}
const doc=(values={},version=7)=>({format:B.FORMAT,schemaVersion:version,exportedAt:ISO,scope:'portfolio-only-no-secrets-no-radar',storage:{...memory().all(),...values}});
const parse=o=>B.parse(JSON.stringify(o));
function noWrites(storage,run){const before=storage.all(),count=storage.writes.length;a.throws(run);a.deepEqual(storage.all(),before);a.equal(storage.writes.length,count);}

test('v7 export includes all accounts, typed rows, exact legacy text and separate pending conflict data',()=>{
 const data=paired(),flows=flowRaw([typed({kind:'internal-buy'}),{ts:1,amount:-4,id:'old',kind:'external-in',note:'untouched legacy'}]);
 const src=memory({...data,v5_deposits:flows}),before=src.all(),out=B.create(src);
 a.equal(B.VERSION,7);a.equal(out.schemaVersion,7);a.equal(out.storage.v5_benchHist,data.v5_benchHist);a.equal(out.storage.v5_deposits,flows);a.deepEqual(src.all(),before);a.equal(src.writes.length,0);
 const plan=parse(out);a.equal(plan.sourceVersion,7);a.match(plan.warnings.join('\n'),/충돌 보류/);
 const dst=memory(),rows=B.preview(dst,plan);a.equal(dst.writes.length,0);a.ok(rows.some(r=>r.key==='v5_benchHistV2'));
 B.apply(dst,plan);for(const[k,v]of Object.entries(before))a.equal(dst.getItem(k),v,k);
 const store=JSON.parse(dst.getItem('v5_benchHistV2')),view=H.readStore(store,dst.getItem('v5_benchHist'),NOW);
 a.equal(view.series.QQQ.pendingConflicts.length,1);a.equal(view.series.QQQ.byDate['2026-11-06'].close,100);a.equal(view.series.QQQ.byDate['2026-11-09'].close,101);
 B.undo(dst);a.equal(dst.getItem('v5_benchHist'),null);a.equal(dst.getItem('v5_benchHistV2'),null);
});
for(const kind of ['external-in','external-out','internal-buy','internal-sell'])test('strict v7 activity roundtrip: '+kind,()=>{
 const raw=flowRaw([typed({kind})]),src=memory({v5_deposits:raw}),dst=memory();B.apply(dst,parse(B.create(src)));a.equal(dst.getItem('v5_deposits'),raw);
});
for(const [name,change]of [
 ['unknown version',{activityVersion:2}],['invalid marker',{activityVersion:null}],['wrong account',{account:'ov'}],['unknown kind',{kind:'trade'}],['negative amount',{amount:-1}],['zero amount',{amount:0}],['missing ID',{id:''}],['currency mismatch',{currency:'USD'}],['source after receipt',{recordedAt:'2026-11-09T22:00:00Z'}],['date-only missing bounds',{timeCertainty:'date-only'}],['unsupported extension',{note:'do not infer'}]
])test('stored-value validator rejects typed '+name+' without writes',()=>{
 const s=memory({v5_deposits:flowRaw([typed(change)])});noWrites(s,()=>B.create(s));a.throws(()=>B.validateStoredValue('v5_deposits',s.getItem('v5_deposits')));
});
test('typed duplicates within and across groups fail, legacy duplicates and inert metadata remain untouched',()=>{
 a.throws(()=>B.validateStoredValue('v5_deposits',flowRaw([typed(),typed({id:'second'})])));
 a.throws(()=>B.validateStoredValue('v5_deposits',JSON.stringify({gen:[typed()],ov:[typed({account:'ov'})]})));
 const old={ts:0,amount:0,id:'old',kind:'internal-buy',account:'ov',note:'legacy metadata'},raw=flowRaw([old,clone(old),typed()]);
 a.doesNotThrow(()=>B.validateStoredValue('v5_deposits',raw));const s=memory({v5_deposits:raw});a.equal(B.create(s).storage.v5_deposits,raw);a.equal(s.writes.length,0);
});
for(const version of [4,'v4',5,'v5',6])test('old import '+version+' preserves rows and cannot smuggle typed semantics',()=>{
 const rows=[{ts:0,amount:0,id:'same',kind:'internal-buy'},{ts:0,amount:0,id:'same',kind:'internal-buy'}];
 const input=version===6?doc({v5_deposits:flowRaw(rows)},6):{version,genStocks:[],deposits:{gen:rows}};
 const plan=parse(input),s=memory();B.apply(s,plan);a.deepEqual(JSON.parse(s.getItem('v5_deposits')).gen,rows);
 const bad=clone(input);if(version===6)bad.storage.v5_deposits=flowRaw([typed()]);else bad.deposits.gen=[typed()];a.throws(()=>parse(bad));
});
test('v6 sidecar and future envelopes are rejected, v7 requires all four accounts',()=>{
 a.throws(()=>parse(doc(paired(),6)));a.throws(()=>parse(doc({},8)));const d=doc();delete d.storage.v5_gen;a.throws(()=>parse(d));
});
test('legacy duplicate-date series remains backupable byte-for-byte and restore warns read-only',()=>{
 const legacy=' {"SPY":[{"ts":1793975400000,"close":100},{"ts":1793979000000,"close":101}],"QQQ":[],"KS200":[]} ',data=paired(legacy),s=memory(data),d=B.create(s);
 a.equal(H.readStore(JSON.parse(data.v5_benchHistV2),legacy,NOW).series.SPY.ok,false);a.equal(d.storage.v5_benchHist,legacy);a.equal(s.writes.length,0);
 const plan=parse(d);a.match(plan.warnings.join('\n'),/SPY.*읽기 전용/);const target=memory();B.apply(target,plan);a.equal(target.getItem('v5_benchHist'),legacy);a.equal(target.getItem('v5_benchHistV2'),data.v5_benchHistV2);
});
test('same-source benchmark validator rejects wrong aliases, new observations in legacy, and malformed sequences',()=>{
 const observed=JSON.parse(paired().v5_benchHistV2).series.QQQ.observations[0];
 for(const raw of ['{"NDX":[]}',JSON.stringify({QQQ:[observed]}),'{"QQQ":[{"ts":1,"close":1}]}','{"QQQ":[{"ts":1793975400000,"close":100},{"ts":1793975400000,"close":100}]}'])a.throws(()=>B.validateStoredValue('v5_benchHist',raw));
});
test('paired restore retains noncanonical incoming legacy bytes when they fully cover current fields',()=>{
 const data=paired(),s=memory({v5_benchHist:'{"QQQ":[],"SPY":[]}'});B.apply(s,parse(doc(data)));a.equal(s.getItem('v5_benchHist'),data.v5_benchHist);a.equal(H.validateStore(JSON.parse(s.getItem('v5_benchHistV2')),s.getItem('v5_benchHist')).ok,true);
});
test('paired restore cannot discard omitted current legacy groups or receipt metadata to preserve binding',()=>{
 for(const current of ['{"QQQ":[],"SPY":[]}','{"QQQ":[],"fetchedAt":"old receipt"}']){
  const data=paired('{"QQQ":[]}'),s=memory({v5_benchHist:current}),p=parse(doc(data));noWrites(s,()=>B.preview(s,p));noWrites(s,()=>B.apply(s,p));
 }
});
test('sidecar-only restore uses unchanged current legacy and exact whitespace binding',()=>{
 const data=paired(),p=parse(doc({v5_benchHistV2:data.v5_benchHistV2})),s=memory({v5_benchHist:data.v5_benchHist});
 B.preview(s,p);B.apply(s,p);a.equal(s.getItem('v5_benchHist'),data.v5_benchHist);a.equal(s.writes.some(([k])=>k==='v5_benchHist'),false);
 const changed=memory({v5_benchHist:data.v5_benchHist+' '});noWrites(changed,()=>B.preview(changed,p));noWrites(changed,()=>B.apply(changed,p));
});
test('missing legacy is a null binding, not an empty object or an empty string',()=>{
 const data=paired(null),p=parse(doc({v5_benchHistV2:data.v5_benchHistV2})),s=memory();B.apply(s,p);a.equal(s.getItem('v5_benchHist'),null);
 for(const raw of ['{}','']){const changed=memory({v5_benchHist:raw});noWrites(changed,()=>B.apply(changed,p));}
});
test('v4/v5/v6 imports lacking sidecar preserve existing sidecar exactly and warn about stale binding',()=>{
 for(const version of ['v4','v5',6]){
  const data=paired(),s=memory(data),input=version===6?doc({v5_benchHist:'{"QQQ":[]}'},6):{version,genStocks:[],benchHist:{QQQ:[]}},p=parse(input);
  a.match(p.warnings.join('\n'),/현재 보조 기록.*보류/);B.apply(s,p);a.equal(s.getItem('v5_benchHistV2'),data.v5_benchHistV2);a.equal(s.writes.some(([k])=>k==='v5_benchHistV2'),false);
  a.equal(H.validateStore(JSON.parse(data.v5_benchHistV2),s.getItem('v5_benchHist')).ok,false);a.equal(B.create(s).storage.v5_benchHistV2,data.v5_benchHistV2);
 }
});
test('sidecar omitted series are merged only under identical baseline without dropping current evidence',()=>{
 const data=paired(),raw=data.v5_benchHist,prior=JSON.parse(data.v5_benchHistV2),empty={version:2,legacyFingerprint:H.fingerprint(raw),series:{}};
 const s=memory(data);B.apply(s,parse(doc({v5_benchHistV2:JSON.stringify(empty)})));a.deepEqual(JSON.parse(s.getItem('v5_benchHistV2')),prior);
 const other=paired(null),blocked=memory(data);noWrites(blocked,()=>B.apply(blocked,parse(doc(other))));
});
test('sidecar malformed structure, duplicate serialized fields, bad conflict target and overlap fail without writes',()=>{
 const data=paired(),store=JSON.parse(data.v5_benchHistV2);
 const malformed=clone(store);malformed.series.QQQ.conflicts[0].status='accepted';a.throws(()=>B.validateStoredValue('v5_benchHistV2',JSON.stringify(malformed)));
 a.throws(()=>B.validateStoredValue('v5_benchHistV2','{"version":2,"version":2}'));
 for(const modify of [x=>{x.series.QQQ.conflicts[0].existing.close=999;},x=>{x.legacyFingerprint=H.fingerprint(null);},x=>{x.series.QQQ.observations.unshift(x.series.QQQ.conflicts[0].alternative);}]){
  const x=clone(store);modify(x);const s=memory();noWrites(s,()=>B.apply(s,parse(doc({...data,v5_benchHistV2:JSON.stringify(x)}))));
 }
});
test('preview detects baseline edits even when only sidecar would be written',()=>{
 const data=paired(),s=memory({v5_benchHist:data.v5_benchHist}),p=parse(doc({v5_benchHistV2:data.v5_benchHistV2}));B.preview(s,p);s.setItem('v5_benchHist',data.v5_benchHist+' ');noWrites(s,()=>B.apply(s,p));
});
test('sidecar dependencies detect edits between validation and journal without creating journal',()=>{
 const data=paired(),s=memory({v5_benchHist:data.v5_benchHist}),p=parse(doc({v5_benchHistV2:data.v5_benchHistV2})),get=s.getItem;let reads=0;
 s.getItem=k=>{const raw=get(k);if(k==='v5_benchHist'&&++reads===1)s.setItem(k,raw+' ');return raw;};
 a.throws(()=>B.apply(s,p),/자료가 바뀌어/);a.equal(get(B.JOURNAL),null);a.equal(get('v5_benchHistV2'),null);a.equal(s.writes.length,1);
});
test('mid-write baseline change is not overwritten; owned targets roll back and journal marks undone',()=>{
 const data=paired(),s=memory({v5_benchHist:data.v5_benchHist}),set=s.setItem,p=parse(doc({v5_benchHistV2:data.v5_benchHistV2}));let once=false;
 s.setItem=(k,v)=>{set.call(s,k,v);if(k==='v5_benchHistV2'&&!once){once=true;set.call(s,'v5_benchHist',data.v5_benchHist+' ');}};
 a.throws(()=>B.apply(s,p),/복구했습니다/);a.equal(s.getItem('v5_benchHist'),data.v5_benchHist+' ');a.equal(s.getItem('v5_benchHistV2'),null);a.equal(B.readJournal(s).status,'undone');
});
test('write failure restores exact old sidecar bytes and legacy evidence',()=>{
 const old=paired(),fresh=paired('{"QQQ":[],"KS200":[],"SPY":[]}'),s=memory(old),before=s.all(),set=s.setItem;let once=false;
 s.setItem=(k,v)=>{if(k==='v5_benchHistV2'&&!once){once=true;throw Error('synthetic quota');}set.call(s,k,v);};
 a.throws(()=>B.apply(s,parse(doc(fresh))),/복구했습니다/);for(const[k,v]of Object.entries(before))a.equal(s.getItem(k),v);a.equal(B.readJournal(s).status,'undone');
});
test('read-only public validator throws on invalid inputs and exports no storage behavior',()=>{
 const valid=flowRaw([typed()]);a.doesNotThrow(()=>B.validateStoredValue('v5_deposits',valid));
 for(const[k,v]of [['v5_deposits','{"gen":[],"gen":[]}'],['v5_benchHistV2','null'],['v5_secret','{}'],['v5_deposits',{}]])a.throws(()=>B.validateStoredValue(k,v));
});
test('preview rejects typed IDs colliding with an omitted current account group',()=>{
 const s=memory({v5_deposits:JSON.stringify({ov:[typed({account:'ov'})]})}),p=parse(doc({v5_deposits:JSON.stringify({gen:[typed()]})}));
 noWrites(s,()=>B.preview(s,p));noWrites(s,()=>B.apply(s,p));
});
function dateOnly(day,startOffset,endOffset){
 const midnight=Date.parse(day+'T00:00:00Z'),start=midnight+startOffset*60000;
 return typed({timeCertainty:'date-only',effectiveDate:day,utcOffsetMinutes:startOffset,dateEndTs:midnight+86400000+endOffset*60000,endUtcOffsetMinutes:endOffset,ts:start+3600000});
}
for(const[day,startOffset,endOffset,hours]of [['2026-03-08',300,240,23],['2026-11-01',240,300,25]])test('DST date-only '+hours+' hour activity survives v7 backup without normalization',()=>{
 const row=dateOnly(day,startOffset,endOffset),raw=flowRaw([row]),src=memory({v5_deposits:raw}),dst=memory();
 a.equal(row.dateEndTs-(Date.parse(day+'T00:00:00Z')+startOffset*60000),hours*3600000);
 a.doesNotThrow(()=>B.validateStoredValue('v5_deposits',raw));const out=B.create(src);a.equal(out.storage.v5_deposits,raw);B.apply(dst,parse(out));a.equal(dst.getItem('v5_deposits'),raw);a.equal(src.writes.length,0);
});
test('older typed date-only row is preserved without manufacturing DST end bounds',()=>{
 const row=dateOnly('2026-11-01',240,300);delete row.dateEndTs;delete row.endUtcOffsetMinutes;
 const raw=flowRaw([row]),src=memory({v5_deposits:raw}),dst=memory();B.apply(dst,parse(B.create(src)));a.equal(dst.getItem('v5_deposits'),raw);a.equal(Object.hasOwn(JSON.parse(dst.getItem('v5_deposits')).gen[0],'dateEndTs'),false);
});
for(const[name,change]of [
 ['missing end instant',r=>{delete r.dateEndTs;}],['missing end offset',r=>{delete r.endUtcOffsetMinutes;}],['wrong midnight end',r=>{r.dateEndTs++;}],['end offset outside range',r=>{r.endUtcOffsetMinutes=841;}],['fractional end offset',r=>{r.endUtcOffsetMinutes=300.5;}],['nonpositive local span',r=>{r.utcOffsetMinutes=840;r.endUtcOffsetMinutes=-840;r.dateEndTs=Date.parse('2026-11-02T00:00:00Z')-840*60000;}],['representative before start',r=>{r.ts=Date.parse('2026-11-01T03:59:59.999Z');}],['representative at exclusive end',r=>{r.ts=r.dateEndTs;}],['bounds mixed into instant',r=>{r.timeCertainty='instant';}],['only extra DST fields on instant',r=>{r.timeCertainty='instant';delete r.effectiveDate;delete r.utcOffsetMinutes;}]
])test('backup rejects date-only DST '+name+' before writes',()=>{
 const row=dateOnly('2026-11-01',240,300);change(row);const raw=flowRaw([row]),s=memory({v5_deposits:raw});
 a.throws(()=>B.validateStoredValue('v5_deposits',raw));noWrites(s,()=>B.create(s));const target=memory();noWrites(target,()=>B.apply(target,parse(doc({v5_deposits:raw}))));
});
test('browser bundle requires the same policy validators and UI advertises v7 and old imports',()=>{
 const context={TextEncoder};context.globalThis=context;const ctx=vm.createContext(context);
 for(const path of ['has/quote-model.js','has/snapshot-policy.js','has/return-assessment.js','has/benchmark-history-policy.js','backup/core.js'])vm.runInContext(fs.readFileSync(require.resolve('../'+path),'utf8'),ctx);
 a.equal(ctx.KSTPortfolioBackup.VERSION,7);ctx.raw=flowRaw([typed()]);a.doesNotThrow(()=>vm.runInContext("KSTPortfolioBackup.validateStoredValue('v5_deposits',raw)",ctx));
 const ui=fs.readFileSync(require.resolve('../backup/ui.js'),'utf8');a.match(ui,/KST-전체백업-v7-/);a.match(ui,/v4·v5·v6 가져오기/);a.match(ui,/별도 관측\/충돌 보류/);a.match(ui,/자동 삭제·재연결하지/);
});


test('actual rehearsal HTML loads local policies before core and roundtrips v7 in VM-only storage',()=>{
 const path=require('node:path'),htmlPath=require.resolve('../has/restore-rehearsal.html'),html=fs.readFileSync(htmlPath,'utf8'),sources=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)].map(m=>m[1]);
 a.deepEqual(sources,['quote-model.js','snapshot-policy.js','return-assessment.js','benchmark-history-policy.js','../backup/core.js','../mobile-lab/sha256.js','restore-rehearsal.js']);
 a.match(html,/connect-src 'none'/);a.match(html,/default-src 'none'/);a.match(html,/script-src 'self'/);a.doesNotMatch(html,/https?:\/\//);a.match(html,/KST-전체백업-v7-/);
 let forbidden=0;const blocked=()=>{forbidden++;throw Error('forbidden real storage or network');},nodes=new Map();
 const context={TextEncoder,document:{getElementById(id){if(!nodes.has(id))nodes.set(id,{addEventListener(){}});return nodes.get(id);}},fetch:blocked,XMLHttpRequest:blocked,WebSocket:blocked};context.window=context;
 for(const name of ['localStorage','sessionStorage','indexedDB'])Object.defineProperty(context,name,{get:blocked});
 const ctx=vm.createContext(context);for(const src of sources){a.doesNotMatch(src,/^[a-z]+:/i);vm.runInContext(fs.readFileSync(path.resolve(path.dirname(htmlPath),src),'utf8'),ctx,{filename:src});}
 const P=require('../has/snapshot-policy.js'),evaluated=P.evaluate({now:NOW,key:'gen',accounts:{gen:[{id:1,name:'synthetic',ticker:'SYNTH',quantity:1,avgPrice:90,currentPrice:100}]},freshPrice:{'KR:SYNTH':true},quoteMeta:{'KR:SYNTH':NOW-1000},quoteValues:{'KR:SYNTH':100},fx:1400});a.equal(evaluated.ok,true);
 const data=paired(),raw=flowRaw([dateOnly('2026-11-01',240,300),typed({id:'internal',kind:'internal-buy'})]);
 const cases=[doc({...data,v5_deposits:raw,v5_snap:JSON.stringify({gen:[evaluated.snapshot]})}),doc({v5_snap:JSON.stringify({gen:[evaluated.snapshot]})},6),{version:'v5',genStocks:[],domStocks:[]},{version:'v4',genStocks:[],domStocks:[]}];
 for(const fixture of cases){ctx.input=JSON.stringify(fixture);const result=vm.runInContext('HASRestoreRehearsal.run(input)',ctx);a.equal(result.res.length,10);a.equal(result.res.every(r=>r.ok),true,JSON.stringify(result.res));if(fixture.schemaVersion)a.match(result.res[0].detail,new RegExp('v'+fixture.schemaVersion));if(fixture.schemaVersion===7){a.equal(result.plan.values.v5_benchHist,data.v5_benchHist);a.equal(result.plan.values.v5_deposits,raw);}}
 a.equal(forbidden,0);a.equal(ctx.KSTPortfolioBackup.VERSION,7);
});
