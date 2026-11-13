'use strict';
// Entirely synthetic offline contract/transport tests. Not the user's 245-bar sample.
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const H=require('../has/benchmark-history-policy.js'),B=require('../backup/core.js');
const ISO='2026-11-11T03:00:00.000Z',NOW=Date.parse(ISO);
function fixture(dates=['2026-11-09','2026-11-10','2026-11-11']){return {'069500':{source:'yahoo-chart-v8',symbol:'069500.KS',currency:'KRW',exchange:'KSE',timezone:'Asia/Seoul',instrumentType:'ETF',adjustment:'unverified',regularMarketTime:ISO,regularMarketPrice:103,fiftyTwoWeekHigh:150,barCount:dates.length,bars:dates.map((d,i)=>({d,c:101+i}))}};}
const parse=x=>H.parseGasHistory(x,'KS200',ISO,{mode:'configured-gas'});
const clone=x=>JSON.parse(JSON.stringify(x));
test('configured Korean GAS bars persist as dated unofficial observations, never timestamps or final closes',()=>{
 const c=parse(fixture());a.equal(c.ok,true);a.equal(c.synthetic,false);a.equal(c.points,null);a.equal(c.source,'yahoo-chart-v8-via-gas');a.equal(c.latestness,'unconfirmed');a.equal(c.signalHold,true);
 const r=H.mergeHistoryStore(null,null,c,'KS200',NOW);a.equal(r.ok,true);a.equal(H.validateStore(r.store,null,NOW).ok,true);
 for(const p of r.store.series.KS200.observations){a.equal(p.providerBarTs,null);a.equal('ts' in p,false);a.equal(p.adjustment,'unverified');}
 a.equal(r.store.series.KS200.observations.at(-1).finality,'provisional');
 const state=H.readStore(r.store,null,NOW),selected=H.selectPointAtOrBefore(state.series.KS200.points,'KS200',NOW,{now:NOW});a.equal(selected.date,'2026-11-10');a.equal(selected.latestness,'unconfirmed');
 B.validateStoredValue('v5_benchHistV2',JSON.stringify(r.store));
});
test('synthetic preview still cannot persist; omitted mode, US live mode and forged candidates fail',()=>{
 const c=H.parseGasHistory(fixture(),'KS200',ISO,{mode:'synthetic'});a.equal(c.ok,true);a.equal(H.admitCandidate(c,'KS200',NOW).ok,false);a.equal(H.admitCandidate(clone(parse(fixture())),'KS200',NOW).ok,false);
 a.equal(H.parseGasHistory(fixture(),'KS200',ISO).ok,false);a.equal(H.parseGasHistory(fixture(),'QQQ',ISO,{mode:'configured-gas'}).ok,false);
});
test('bad identity, dates, metadata, shape and hostile values are rejected',()=>{
 const changes=[r=>r.symbol='069500.KQ',r=>r.currency='USD',r=>r.timezone='UTC',r=>r.exchange='KOSDAQ',r=>r.source='official',r=>r.instrumentType='INDEX',r=>r.adjustment='verified',r=>r.barCount=245,r=>r.bars[0].c=null,r=>r.bars[0].c=0,r=>r.bars[0].d='2026-02-30',r=>r.bars[2].d='2026-11-12',r=>r.bars[0].d='2026-11-08',r=>r.bars[1].d=r.bars[0].d,r=>r.bars.reverse(),r=>r.bars[0].ts=NOW,r=>r.regularMarketTime='2026-11-12T00:00:00Z'];
 for(const change of changes){const x=fixture();change(x['069500']);a.equal(parse(x).ok,false);}
 let called=false;const x=fixture();Object.defineProperty(x['069500'],'currency',{get(){called=true;return 'KRW';},enumerable:true});a.equal(parse(x).ok,false);a.equal(called,false);a.equal(parse({'069500':null}).ok,false);
});
test('same data does not refresh receipt; conflicting historical dates retain original and independent later append',()=>{
 const first=H.mergeHistoryStore(null,null,parse(fixture(['2026-11-09','2026-11-10'])),'KS200',NOW),before=JSON.stringify(first.store);
 a.equal(H.mergeHistoryStore(first.store,null,parse(fixture(['2026-11-09','2026-11-10'])),'KS200',NOW).changed,false);
 const x=fixture();x['069500'].bars[0].c=999;const next=H.mergeHistoryStore(first.store,null,parse(x),'KS200',NOW);a.equal(JSON.stringify(first.store),before);a.deepEqual(next.acceptedDates,['2026-11-11']);a.equal(next.pendingConflicts.length,1);a.equal(next.store.series.KS200.observations[0].close,101);
});
function harness({url='https://script.google.com/macros/s/SYNTHETIC_DEPLOYMENT/exec',legacy=null,quota=false}={}){
 const html=fs.readFileSync(require('node:path').join(__dirname,'../portfolio_v5.html'),'utf8');
 const code=html.slice(html.indexOf('var _benchFetchInFlight=false;'),html.indexOf('function getBenchDescription(key)'));
 const timers=[],scripts=[],fetches=[],writes=[],map=new Map();if(legacy!==null)map.set('v5_benchHist',legacy);
 const storage={getItem:k=>map.get(k)??null,setItem(k,v){if(quota)throw Error('synthetic quota');writes.push(k);map.set(k,v);}};
 const head={appendChild(s){s.parentNode=head;scripts.push(s);},removeChild(s){s.parentNode=null;}};
 const w={URL,TextDecoder,Date:class extends Date{constructor(...args){super(...args.length?args:[NOW]);}static now(){return NOW;}},HASBenchmarkHistory:H,KSTPortfolioBackup:B,gasUrl:url,localStorage:storage,
 document:{querySelectorAll:()=>[],createElement:()=>({}),head},setTimeout(fn,ms){const t={fn,ms,cancelled:false};timers.push(t);return t;},clearTimeout(t){if(t)t.cancelled=true;},snapshotWriteBlocked:()=>false,invalidateSnapshotEvidence:()=>{},loadBenchmarkCacheSync:()=>{},renderAllReturnsTables:()=>{},refreshAllLineCharts:()=>{},getAlphaVantageKey:()=>'',fetch(url){fetches.push(url);return Promise.reject(Error('offline fixture transport'));}};
 w.window=w;w.readBenchmarkState=()=>{const legacyRaw=storage.getItem('v5_benchHist'),sideRaw=storage.getItem('v5_benchHistV2'),r=H.readStore(sideRaw?JSON.parse(sideRaw):null,legacyRaw,NOW);return {...r,legacyRaw,sideRaw,readOnly:false};};
 vm.runInNewContext(code,w);
 return {w,timers,scripts,fetches,writes,storage,callback:()=>new URL(scripts.at(-1).src).searchParams.get('callback')};
}
async function drain(){for(let i=0;i<150;i++)await Promise.resolve();}
// QQQ와 SPY도 설정된 GAS를 먼저 조회한다(market=US). 시험에서는 두 응답을 비워 기존 경로(오프라인)로 넘기고 끝까지 흘려보낸다.
async function settleUS(h){for(const sym of ['QQQ','SPY']){await drain();const sc=h.scripts.at(-1),u=new URL(sc.src);a.equal(u.searchParams.get('tickers'),sym);a.equal(u.searchParams.get('market'),'US');h.w[u.searchParams.get('callback')]({[sym]:null});}for(let i=0;i<6;i++)await drain();}
test('configured GAS is first, sends exact bounded request, succeeds without Korean Yahoo fallback and preserves legacy bytes',async()=>{
 const raw=' { "KS200": [] } ',h=harness({legacy:raw});h.w.fetchBenchmarkHistory(true);a.equal(h.fetches.length,0);a.equal(h.scripts.length,1);
 const s=h.scripts[0],u=new URL(s.src),cb=h.callback();a.deepEqual([...u.searchParams.keys()],['type','tickers','market','callback']);a.equal(u.searchParams.get('type'),'history');a.equal(u.searchParams.get('tickers'),'069500');a.equal(u.searchParams.get('market'),'KR');a.match(cb,/^[A-Za-z_][A-Za-z0-9_]{0,60}$/);
 h.w[cb](fixture());await settleUS(h);a.equal(s.parentNode,null);a.equal(h.w[cb],undefined);a.equal(h.fetches.some(x=>x.includes('069500')),false);a.equal(h.storage.getItem('v5_benchHist'),raw);a.deepEqual(h.writes,['v5_benchHistV2']);a.equal(h.w._benchFetchInFlight,false);
});
test('invalid GAS falls back to existing Korean route without leaking configured GAS address',async()=>{
 const h=harness();h.w.fetchBenchmarkHistory(true);h.w[h.callback()]({'069500':null});await drain();a.match(h.fetches[0],/069500/);a.equal(h.fetches.some(x=>x.includes('SYNTHETIC_DEPLOYMENT')),false);a.equal(h.writes.length,0);
});
test('older GAS cannot displace newer cache; Korean fallback remains available',async()=>{
 const raw=JSON.stringify({KS200:[{ts:Date.parse('2026-11-11T00:00Z'),close:105}]}),h=harness({legacy:raw});h.w.fetchBenchmarkHistory(true);h.w[h.callback()](fixture(['2026-11-09','2026-11-10']));await drain();a.match(h.fetches[0],/069500/);a.equal(h.storage.getItem('v5_benchHist'),raw);a.equal(h.writes.length,0);
});
test('JSONP timeout cleans script and callback; retained late callback cannot write',async()=>{
 const h=harness();h.w.fetchBenchmarkHistory(true);const cb=h.callback(),late=h.w[cb];h.timers.find(t=>t.ms===8000).fn();late(fixture());await drain();a.equal(h.w[cb],undefined);a.equal(h.scripts[0].parentNode,null);a.equal(h.writes.length,0);a.match(h.fetches[0],/069500/);
});
test('restore invalidation and global watchdog clean JSONP and block late results',()=>{
 for(const watchdog of [false,true]){const h=harness();h.w.fetchBenchmarkHistory(true);const cb=h.callback(),late=h.w[cb];if(watchdog)h.timers.find(t=>t.ms===240000).fn();else h.w.invalidateBackupRuntime();late(fixture());a.equal(h.w[cb],undefined);a.equal(h.scripts[0].parentNode,null);a.equal(h.fetches.length,0);a.equal(h.writes.length,0);}
});
test('repeat click shares current request; superseding run cancels old callback',()=>{
 const h=harness();h.w.fetchBenchmarkHistory(true);const first=h.callback(),late=h.w[first];h.w.fetchBenchmarkHistory(true);a.equal(h.scripts.length,1);h.w._benchFetchStartedAt-=21000;h.w.fetchBenchmarkHistory(true);a.equal(h.scripts.length,2);a.notEqual(h.callback(),first);a.equal(h.w[first],undefined);late(fixture());a.equal(h.fetches.length,0);h.w.invalidateBackupRuntime();
});
test('missing or untrusted route never executes JSONP and uses existing fallback',async()=>{
 for(const url of ['', 'https://example.invalid/exec','http://script.google.com/macros/s/ID/exec','https://script.google.com@evil.invalid/macros/s/ID/exec']){const h=harness({url});h.w.fetchBenchmarkHistory(true);await drain();a.equal(h.scripts.length,0);a.match(h.fetches[0],/069500/);a.equal(h.writes.length,0);}
});
test('script error and quota failure preserve original legacy and no false success',async()=>{
 const h=harness();h.w.fetchBenchmarkHistory(true);const cb=h.callback();h.scripts[0].onerror();await drain();a.equal(h.w[cb],undefined);a.equal(h.writes.length,0);
 const q=harness({quota:true,legacy:'{}'});q.w.fetchBenchmarkHistory(true);q.w[q.callback()](fixture());await settleUS(q);a.equal(q.storage.getItem('v5_benchHist'),'{}');a.equal(q.storage.getItem('v5_benchHistV2'),null);a.match(q.w._benchStatusMsg,/실패/);
});
