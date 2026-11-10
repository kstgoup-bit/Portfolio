'use strict';
// Read-only source inspection + pure synthetic functions. No actual browser,
// provider, credentials, user storage, restore, repository edits, or intended fix.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const ROOT = process.env.HAS_REVIEW_ROOT ? path.resolve(process.env.HAS_REVIEW_ROOT) : path.resolve(__dirname, '../../..');
const OLD = process.env.HAS_PREDAILY_FILE ? path.resolve(process.env.HAS_PREDAILY_FILE) : path.join(__dirname, 'historical-reference/portfolio_v5.functions.js.txt');
const guard = require(path.join(ROOT, 'tests/lib/no-network.cjs'));
const P = require(path.join(ROOT, 'has/snapshot-policy.js'));
const H = require(path.join(ROOT, 'has/benchmark-history-policy.js'));
const B = require(path.join(ROOT, 'backup/core.js'));
const html = fs.readFileSync(path.join(ROOT, 'portfolio_v5.html'), 'utf8');
// Only required historical function excerpts, not the full HTML source.
// Never initialize or render the old app. Original full-source hash and exact
// excerpt ranges are recorded separately in SOURCE-MANIFEST.json.
const oldBytes = fs.readFileSync(OLD);
const oldHash = crypto.createHash('sha256').update(oldBytes).digest('hex');
assert.equal(oldHash, 'c7a946df8c755deb8ce45f455c37fb758a43feb4dd76859578ad242fbac5fb72', 'exact pre-daily historical function excerpts required');
const oldHtml = oldBytes.toString('utf8');
const copy = x => JSON.parse(JSON.stringify(x));
const T0 = Date.parse('2026-11-03T15:00:00Z');
const NOW = Date.parse('2026-11-10T15:00:00Z');
const DAY = 86400000;
const rows = (quantity = 10, avgPrice = 100, ticker = 'SYNTH_A') => [{ id: 1, name: 'Synthetic holding', ticker, quantity, avgPrice, currentPrice: 100 }];
function evaluate(stocks = rows(), now = T0, extra = {}) {
  const freshPrice = {}, quoteMeta = {}, quoteValues = {};
  for (const s of stocks) { const k = 'KR:' + s.ticker; freshPrice[k] = true; quoteMeta[k] = now - 1000; quoteValues[k] = s.currentPrice; }
  return P.evaluate({key:'gen', accounts:{gen:stocks}, now, freshPrice, quoteMeta, quoteValues, ...extra});
}
function snap(stocks = rows(), now = T0) { const r = evaluate(stocks, now); assert.equal(r.ok, true); return r.snapshot; }
// Extract only explicitly selected declarations, never initialize the whole app.
function fn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, name);
  const end = src.indexOf('\nfunction ', start + 1);
  return src.slice(start, end < 0 ? src.length : end);
}
function app(src = html, snapshots = [], candidate = snap(rows(11), NOW), deposits = []) {
  const context = vm.createContext({
    snapshots:{gen:snapshots}, deposits:{gen:deposits}, HASSnapshotPolicy:P,
    snapshotEvaluation:() => candidate === null ? {ok:false} : {ok:true,snapshot:candidate},
    getBenchmarkReturnPct:() => 1, Date, Number, Math, Object, window:{HASSnapshotPolicy:P}
  });
  const names = ['getDepositsForKey','calcModifiedDietz','findSnapAtOrBefore','returnRowHtml'];
  if (src === html) names.push('snapshotComparisonStatus');
  vm.runInContext(names.map(name => fn(src,name)).join('\n'), context);
  return context;
}
function yahoo(closes = [623.23, 624], dates = ['2026-11-05','2026-11-06'], id = 'QQQ') {
  const s = H.specs[id];
  return {chart:{error:null,result:[{meta:{symbol:s.symbol,currency:s.currency,exchangeTimezoneName:s.timezone,exchangeName:id==='KS200'?'KSC':'NMS',instrumentType:'ETF',dataGranularity:'1d'},timestamp:dates.map(d=>Date.parse(d+(id==='KS200'?'T00:00:00Z':'T14:30:00Z'))/1000),indicators:{quote:[{close:closes}]}}]}};
}
function candidate(closes, dates, id='QQQ') { const r=H.parseYahoo(yahoo(closes,dates,id),id,new Date(NOW).toISOString()); assert.equal(r.ok,true); return r; }
function gas() { return {QQQ:{source:'yahoo-chart-v8',symbol:'QQQ',currency:'USD',timezone:'America/New_York',exchange:'NMS',instrumentType:'ETF',adjustment:'unverified',barCount:2,bars:[{d:'2026-11-05',c:623.23},{d:'2026-11-06',c:624}]}}; }
function readOnlyStorage(data) { return {length:Object.keys(data).length,key:i=>Object.keys(data)[i]??null,getItem:k=>data[k]??null,setItem:()=>{throw Error('MUTATION FORBIDDEN');},removeItem:()=>{throw Error('MUTATION FORBIDDEN');}}; }
const results = [];
function test(name, kind, body) { try { const detail=body(); results.push({name,kind,ok:true,detail}); console.log('PASS ['+kind+'] '+name+'\n  '+JSON.stringify(detail)); } catch(e) { results.push({name,kind,ok:false,error:e.stack}); console.error('FAIL ['+kind+'] '+name+'\n'+e.stack); } }
console.log('CURRENT-BEHAVIOR REGRESSION INVENTORY, NOT A FIX PASS');
console.log('timezone='+process.env.TZ+'; ROOT='+ROOT+'; PREDAILY='+OLD);
console.log('historical excerpt sha256 portfolio_v5.functions.js.txt '+oldHash);
for(const file of ['has/snapshot-policy.js','has/benchmark-history-policy.js','backup/core.js','portfolio_v5.html']) console.log('source sha256 '+file+' '+crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,file))).digest('hex'));

test('computable legacy without cost differs from malformed metadata', 'REGRESSION', () => {
  const legacy=[{ts:T0,val:1000},{ts:NOW-DAY,val:1100}];
  assert.equal(P.validateRecord(legacy[0]).ok,true);
  assert.equal(P.validateRecord({...legacy[0],schemaVersion:1}).ok,false);
  const current=app(html,legacy), old=app(oldHtml,legacy);
  for(const mode of ['raw','dietz']) { assert.match(current.returnRowHtml({label:'1W',days:7},'gen',1100,NOW,mode),/비교 보류/); assert.match(old.returnRowHtml({label:'1W',days:7},'gen',1100,NOW,mode),/\+10\.00%/); }
  return {legacyValid:true,partialSchemaValid:false,oldRawAndDietz:'+10.00%',current:'held despite computable legacy endpoints'};
});
test('missing live quote remains incomplete and no candidate is invented', 'SAFETY CONTROL', () => {
  const missing=evaluate(rows(),NOW,{freshPrice:{}}); assert.equal(missing.ok,false); assert.equal(missing.snapshot,null);
  const c=app(html,[snap(rows(),T0),snap(rows(),NOW-DAY)],null);
  assert.deepEqual(copy(c.snapshotComparisonStatus('gen',T0,NOW,true)),{hold:true,reasons:['current-incomplete']});
  return {missing:missing.missing.map(x=>x.code),ui:'current-incomplete'};
});
test('one saved endpoint plus valid current endpoint is still called insufficient', 'REGRESSION', () => {
  const first=snap(rows(),T0), current=snap(rows(),NOW), r=P.comparisonStatus([first],T0,NOW,current);
  assert.deepEqual(r,{hold:true,reasons:['insufficient-history']});
  assert.match(app(oldHtml,[first],current).returnRowHtml({label:'1W',days:7},'gen',1000,NOW,'raw'),/\+0\.00%/);
  return r;
});
test('same account synthetic rebalance at equal total triggers holdings hold', 'REGRESSION / MISSING EVENT MODEL', () => {
  const first=snap(rows(),T0), next=snap(rows(10,100,'SYNTH_B'),T0+DAY);
  const r=P.appendDaily([first],next); assert.equal(r.ok,true); assert.equal(r.records.at(-1).comparisonHold,true);
  assert.deepEqual(r.records.at(-1).scopeChange.types,['holdings']);
  assert.equal(app(html,r.records,next).calcModifiedDietz('gen',T0,T0+DAY,1000,1000),0);
  return {values:[first.val,next.val],calculatedDietz:0,status:P.comparisonStatus(r.records,T0,T0+DAY),note:'Fixture describes a rebalance; runtime accepts no transaction/event proof.'};
});
test('recorded contribution gives zero Dietz but quantity gate suppresses it', 'REGRESSION', () => {
  const first=snap(rows(),T0), next=snap(rows(15),T0+DAY), r=P.appendDaily([first],next);
  const flows=[{ts:T0+DAY/2,amount:500}], c=app(html,r.records,next,flows);
  assert.equal(c.calcModifiedDietz('gen',T0,T0+DAY,1000,1500),0);
  const status=P.comparisonStatus(r.records,T0,T0+DAY); assert.equal(status.hold,true);
  return {flows,calculatedDietz:0,status};
});
test('same endpoint change without contribution has identical policy decision', 'MISSING EVENT MODEL', () => {
  const records=P.appendDaily([snap(rows(),T0)],snap(rows(15),T0+DAY)).records;
  const c=app(html,records,records.at(-1),[]); assert.equal(c.calcModifiedDietz('gen',T0,T0+DAY,1000,1500),50);
  assert.equal(P.comparisonStatus(records,T0,T0+DAY).hold,true);
  return {calculatedDietz:50,status:P.comparisonStatus(records,T0,T0+DAY),note:'comparisonStatus receives no deposits or event argument; no inference can distinguish the prior case.'};
});
test('unexplained asset removal is still held and original remains intact', 'SAFETY CONTROL', () => {
  const holdings=[...rows(),{...rows(5)[0],id:2,ticker:'SYNTH_B'}], first=snap(holdings,T0), bytes=JSON.stringify(first);
  const r=P.appendDaily([first],snap(rows(),T0+DAY)); assert.equal(r.ok,true); assert.equal(JSON.stringify(first),bytes);
  assert.equal(P.comparisonStatus(r.records,T0,T0+DAY).hold,true);
  return {before:first.val,after:r.records.at(-1).val,status:P.comparisonStatus(r.records,T0,T0+DAY)};
});
test('event marker on starting row contaminates entirely post-event interval', 'REGRESSION', () => {
  let r=P.appendDaily([snap(rows(15),T0)],snap(rows(),T0+DAY));
  r=P.appendDaily(r.records,snap(rows(),T0+2*DAY));
  r=P.appendDaily(r.records,snap(rows(),T0+3*DAY));
  const contaminated=P.comparisonStatus(r.records,T0+DAY,T0+2*DAY);
  const clean=P.comparisonStatus(r.records,T0+2*DAY,T0+3*DAY);
  assert.deepEqual(contaminated,{hold:true,reasons:['scope-change']}); assert.deepEqual(clean,{hold:false,reasons:[]});
  return {contaminated,clean,eventPreviousTs:r.records[1].scopeChange.previousTs,intervalStart:T0+DAY};
});
test('basis correction suppresses raw and Dietz despite unchanged value', 'REGRESSION', () => {
  const r=P.appendDaily([snap(rows(),T0)],snap(rows(10,90),T0+DAY));
  assert.equal(r.records.at(-1).val,1000); assert.equal(r.records.at(-1).cost,900);
  assert.deepEqual(r.records.at(-1).scopeChange.types,['cost-basis']); assert.equal(P.comparisonStatus(r.records,T0,T0+DAY).hold,true);
  return {unchangedVal:1000,changedCost:900,status:P.comparisonStatus(r.records,T0,T0+DAY)};
});
test('invalid row outside selected interval still blocks whole history', 'POLICY CHOICE TO ISOLATE', () => {
  const good=[snap(rows(),T0),snap(rows(),T0+DAY)], all=[{ts:T0-DAY,val:-1},...good];
  assert.equal(P.comparisonStatus(good,T0,T0+DAY).hold,false);
  assert.deepEqual(P.comparisonStatus(all,T0,T0+DAY),{hold:true,reasons:['invalid-history']});
  return {goodInterval:'computable',unrelatedBadRow:'global invalid-history hold; never overwrite invalid source'};
});
test('same-day revisions preserve exact original and backup parse/export bytes', 'PRESERVATION CONTROL', () => {
  const first=snap(rows(),T0); first.syntheticAnnotation={retain:'exact original'};
  const r=P.appendDaily([first],snap([{...rows()[0],currentPrice:105}],T0+10000)); assert.equal(r.ok,true);
  assert.deepEqual(r.records[0].dailyHistory.entries[0].point,first);
  const data=Object.fromEntries(B.ACCOUNTS.map(k=>[k,'[]'])); data.v5_snap=JSON.stringify({gen:r.records});
  const before=JSON.stringify(data), exported=B.create(readOnlyStorage(data)), parsed=B.parse(JSON.stringify(exported));
  assert.equal(parsed.values.v5_snap,data.v5_snap); assert.equal(JSON.stringify(data),before);
  return {revisionEntries:r.records[0].dailyHistory.entries.length,backupSchema:exported.schemaVersion,readOnlyRoundTrip:true};
});
test('precision-only overlap conflicts reject all unrelated new dates', 'REGRESSION', () => {
  const old=candidate([623.23,624]).points, bytes=JSON.stringify(old);
  const incoming=candidate([623.2299,624,625,626],['2026-11-05','2026-11-06','2026-11-09','2026-11-10']);
  const r=H.mergeSeries(old,incoming,'QQQ',NOW);
  assert.deepEqual(r,{ok:false,reason:'historical-correction-needs-review'}); assert.equal(JSON.stringify(old),bytes);
  return {delta:623.23-623.2299,unrelatedNewDates:2,result:r,priorBarsPreserved:true};
});
test('material historical correction also rejects unrelated newer observations', 'REGRESSION / REVIEW POLICY', () => {
  const old=candidate([100,101]).points, r=H.mergeSeries(old,candidate([50,101,102],['2026-11-05','2026-11-06','2026-11-09']),'QQQ',NOW);
  assert.equal(r.ok,false); assert.equal(r.reason,'historical-correction-needs-review');
  return {result:r,note:'Historical replacement requires review; rejecting unrelated 11/09 is unnecessary coupling.'};
});
test('clean append retains old objects and their arbitrary inert metadata', 'PRESERVATION CONTROL', () => {
  const old=candidate([100,101]).points; old[0].note={legacy:'keep'};
  const bytes=JSON.stringify(old), r=H.mergeSeries(old,candidate([101,102],['2026-11-06','2026-11-09']),'QQQ',NOW);
  assert.equal(r.ok,true); assert.equal(r.points[0],old[0]); assert.equal(JSON.stringify(old),bytes);
  return {appended:r.points.length-old.length,prefixExact:true};
});
test('empty latest date is not backfilled by compact response', 'DOCUMENTED POLICY CHOICE', () => {
  const old=candidate([100,102],['2026-11-05','2026-11-09']).points;
  const r=H.mergeSeries(old,candidate([100,101,102],['2026-11-05','2026-11-06','2026-11-09']),'QQQ',NOW);
  assert.equal(r.ok,true); assert.equal(r.changed,false); assert.equal(r.points.length,2);
  return {result:r.reason,missingDate:'2026-11-06',note:'Intentional append-only rule, not proof provider lacks date.'};
});
test('invalid QQQ cache hides valid KS200 metadata too', 'POLICY CHOICE TO ISOLATE', () => {
  const ks=candidate([100,101],undefined,'KS200').points;
  const cache={KS200:ks,QQQ:[{ts:NOW,close:null}]};
  assert.equal(H.readCache(cache,NOW).ok,false);
  const d=H.describe(cache,'gen',{},NOW); assert.equal(d.rows[0].latestDate,null);
  return {validKS200LastDate:'2026-11-06',displayedKS200LastDate:d.rows[0].latestDate};
});
test('date-only bars need schema and consumers, not a fabricated clock', 'COMPATIBILITY BLOCKER', () => {
  const dateOnly={QQQ:[{d:'2026-11-05',close:623.23},{d:'2026-11-06',close:624}]};
  assert.equal(H.readCache(dateOnly,NOW).ok,false);
  assert.throws(()=>B.parse(JSON.stringify({version:'v5',benchHist:dateOnly})),/지수 기록/);
  const c=vm.createContext({}); vm.runInContext(fn(html,'findBenchAtOrBefore'),c);
  assert.equal(c.findBenchAtOrBefore(dateOnly.QQQ,NOW),null);
  return {policy:'cache-point',backup:'rejects missing ts',consumer:'returns null for d-only bars'};
});
test('GAS date-only sample remains synthetic and cannot persist', 'SAFETY / INTEGRATION CONTROL', () => {
  const c=H.parseGasHistory(gas(),'QQQ',new Date(NOW).toISOString(),{mode:'synthetic'});
  assert.equal(c.ok,true); assert.equal(c.points,null); assert.equal(c.barTimestampKind,'absent');
  assert.equal(H.parseGasHistory(gas(),'QQQ',new Date(NOW).toISOString()).reason,'live-gas-disabled');
  assert.equal(H.mergeSeries([],c,'QQQ',NOW).reason,'candidate-not-persistable');
  return {parsedSynthetic:true,persistable:false,inventedTimestamp:false};
});
test('new top-level metadata cannot be quietly inserted into current backup schema', 'COMPATIBILITY BLOCKER', () => {
  const cache={QQQ:candidate([100,101]).points,revisionLog:[]};
  assert.equal(H.readCache(cache,NOW).ok,false);
  assert.throws(()=>B.parse(JSON.stringify({version:'v5',benchHist:cache})),/지원하지 않는 지수 기록 필드/);
  return {runtimeAndBackupReject:'revisionLog top-level without explicit schema change'};
});
test('backup accepts two same-exchange-day timestamps that runtime rejects', 'VALIDATOR MISMATCH', () => {
  const ts=Date.parse('2026-11-06T14:30:00Z'), cache={QQQ:[{ts,close:100},{ts:ts+60000,close:100}]};
  const parsed=B.parse(JSON.stringify({version:'v5',benchHist:cache})); assert.ok(parsed.values.v5_benchHist);
  assert.equal(H.readCache(cache,NOW).reason,'cache-date-conflict');
  return {backup:'accept',runtime:'cache-date-conflict',note:'Synthetic parse only, no restore applied.'};
});
test('fall back transport removed in current source while old AV invented time', 'KNOWN REGRESSION SOURCE CONTROL', () => {
  const cur=html.slice(html.indexOf('function fetchBenchmarkHistory(force)'),html.indexOf('function findBenchAtOrBefore'));
  const old=oldHtml.slice(oldHtml.indexOf('function fetchBenchmarkHistory(force)'));
  assert.match(old,/TIME_SERIES_DAILY/); assert.match(old,/query2/); assert.match(old,/Date\.UTC\(\+pp\[0\],\+pp\[1\]-1,\+pp\[2\],14,30\)/);
  assert.doesNotMatch(cur,/TIME_SERIES_DAILY|query2|Date\.UTC/);
  return {oldAV:true,oldQuery2:true,currentAV:false,currentQuery2:false,warning:'Restoring old implementation verbatim would restore timestamp fabrication and overwrite behavior.'};
});
test('Dietz start uses requested target instead of actual selected snapshot time in both baselines', 'INHERITED DEFECT, NOT DAILY INTRODUCED', () => {
  const legacy=[{ts:T0-2*DAY,val:1000},{ts:NOW-DAY,val:1500}], flows=[{ts:T0-DAY,amount:500}];
  const old=app(oldHtml,legacy,snap(rows(15),NOW),flows);
  const targetRate=old.calcModifiedDietz('gen',T0,NOW,1000,1500);
  const endpointRate=old.calcModifiedDietz('gen',legacy[0].ts,NOW,1000,1500);
  assert.equal(targetRate,50); assert.equal(endpointRate,0);
  assert.match(old.returnRowHtml({label:'1W',days:7},'gen',1500,NOW,'dietz'),/\+50\.00%/);
  assert.match(fn(html,'returnRowHtml'),/calcModifiedDietz\(key, targetTs, now, snap\.val, current\)/);
  assert.match(fn(oldHtml,'returnRowHtml'),/calcModifiedDietz\(key, targetTs, now, snap\.val, current\)/);
  return {requestedStart:new Date(T0).toISOString(),actualSnapshot:new Date(legacy[0].ts).toISOString(),currentCallRate:targetRate,consistentEndpointRate:endpointRate};
});
test('deposit schema allows signed flows while existing input UI only accepts positive', 'INHERITED MODEL LIMIT', () => {
  const parsed=B.parse(JSON.stringify({version:'v5',deposits:{gen:[{ts:T0+DAY,amount:-100}]}})); assert.ok(parsed.values.v5_deposits);
  assert.match(fn(html,'addDeposit'),/amt<=0/); assert.match(fn(html,'addDeposit'),/입금\(매수\)/);
  return {backupAcceptsWithdrawal:true,UIOnlyPositive:true,warning:'Do not reinterpret all old deposits as correctly classified external flows.'};
});
test('no external networking was attempted', 'SAFETY CONTROL', () => { assert.equal(guard.attempts.length,0); return {externalAttempts:0}; });

const failed=results.filter(x=>!x.ok).length;
console.log('\nSUMMARY '+JSON.stringify({total:results.length,passed:results.length-failed,failed,meaning:'Expected CURRENT behavior matched. REGRESSION entries intentionally demonstrate UNFIXED defects.'}));
process.exitCode=failed?1:0;
