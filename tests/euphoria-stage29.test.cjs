'use strict';
const test=require('node:test'),a=require('node:assert/strict');
const W=require('../has/watch-engine'),A=require('../has/advisor-core'),G=require('../has/advice-guard'),F=require('./lib/fixtures-stage23.cjs');
const returns=(o={})=>Object.assign({ticker:'SYN-A',venue:'XKRX',benchVenue:'XKRX',stockPct:55,benchPct:8,periodDays:60,periodUnit:'calendar-days',startDate:'2026-09-06',benchStartDate:'2026-09-06',asOfDate:'2026-11-05',benchAsOfDate:'2026-11-05',market:'KR',benchMarket:'KR',currency:'KRW',benchCurrency:'KRW',adjustment:'split-adjusted',benchAdjustment:'split-adjusted',benchmark:'SYN-INDEX',source:'SYNTHETIC',benchSource:'SYNTHETIC',verification:'independent-verified'},o);
const evidence=()=>({ticker:'SYN-A',market:'KR',currency:'KRW',venue:'XKRX',adjustment:'split-adjusted',synthetic:true,periodStartDate:'2026-07-01',periodEndDate:'2026-09-30',asOfDate:'2026-11-05',source:'SYNTHETIC-REVIEW',verification:'independent-verified',valuation:{overvalued:true,note:'합성 가치 비교 완료'},competitiveThesis:{intact:true,note:'합성 경쟁력 유지'},costs:{considered:true,trimJustified:true,note:'합성 비용 검토 완료'},holdAndReentryRisk:{considered:true,trimJustified:true,note:'합성 보유 및 재진입 검토 완료'}});
const hot=(o={})=>F.stock(Object.assign({quote:Object.assign({},F.quote({price:98}),{venue:'XKRX',adjustment:'split-adjusted'}),fundamentals:F.fund({ticker:'SYN-A',market:'KR',currency:'KRW',venue:'XKRX',adjustment:'split-adjusted',synthetic:true,periodStartDate:'2026-07-01',periodEndDate:'2026-09-30'}),high52w:{ticker:'SYN-A',venue:'XKRX',price:100,asOfDate:'2026-11-05',source:'SYNTHETIC',market:'KR',currency:'KRW',adjustment:'split-adjusted',verification:'independent-verified'},returns:returns(),held:{quantity:10,avgPrice:50}},o));
const run=(s=hot(),weight=15,settings,ctx={})=>A.analyze(s,null,F.ctx(Object.assign({weightPct:weight},ctx)),F.NOW,settings);
const signal=s=>W.evaluateStock(s,F.ctx(),F.NOW).signals.find(x=>x.type==='euphoria');
test('synthetic calendar-window rise/relative-rise/near-high detection is independent of sell judgment',()=>{
 for(const [pct,level] of [[35,30],[55,50],[90,80]]) a.equal(signal(hot({returns:returns({stockPct:pct})})).level,level);
 for(const s of [hot({returns:returns({stockPct:25})}),hot({returns:returns({benchPct:50})}),hot({quote:F.quote({price:85})})]) a.equal(signal(s),undefined);
 a.equal(run().opinion,'판단 보류'); a.equal(run().sellReview.eligible,false);
});
test('strict comparison provenance and bounded actual windows',()=>{
 for(const field of ['startDate','benchStartDate','benchAsOfDate','market','benchMarket','currency','benchCurrency','adjustment','benchAdjustment','verification','benchmark','benchSource','periodUnit']) {
  const r=returns();delete r[field];a.equal(signal(hot({returns:r})),undefined,field);
 }
 for(const patch of [{periodDays:3660},{startDate:'2026-09-07'},{periodDays:60.5},{benchCurrency:'USD'},{benchMarket:'US'},{benchAdjustment:'total-return'},{stockPct:Infinity},{benchPct:NaN}]) a.equal(signal(hot({returns:returns(patch)})),undefined,JSON.stringify(patch));
 for(const patch of [{verification:'unverified'},{asOfDate:'2026-10-01'},{source:null}])a.equal(signal(hot({quote:F.quote(Object.assign({price:98},patch))})),undefined);
 a.equal(signal(hot({high52w:{price:100,asOfDate:'2026-11-05',source:'S'}})),undefined);
});
test('missing fundamentals or thesis and unverified weight cannot cause either role to trim',()=>{
 for(const stock of [hot(),hot({fundamentals:null}),hot({thesis:null}),hot({fundamentals:F.fund({freeCashFlow:-1,freeCashFlowPrev:undefined}),sellReviewEvidence:evidence()})]){
  const r=run(stock);a.equal(r.opinion,'판단 보류');a.equal(r.aggressive.stance,'판단 보류');a.equal(r.defensive.stance,'판단 보류');
 }
 for(const weight of [15,30,-1,101])a.notEqual(run(hot({sellReviewEvidence:evidence()}),weight,undefined,{weightBasis:'unverified'}).opinion,'비중 축소 검토');
});
test('complete review may yield trim review but great-company aggressive role retains hold',()=>{
 const r=run(hot({sellReviewEvidence:evidence()}));a.equal(r.opinion,'비중 축소 검토');a.equal(r.aggressive.stance,'보유');a.equal(r.defensive.stance,'비중 축소 검토');a.ok(r.reasonsAgainst.some(x=>x.includes('위대한 기업')));
 const bad=hot({fundamentals:F.fund({freeCashFlow:-5,ticker:'SYN-A',market:'KR',currency:'KRW',venue:'XKRX',adjustment:'split-adjusted',synthetic:true,periodStartDate:'2026-07-01',periodEndDate:'2026-09-30'}),sellReviewEvidence:evidence()});a.equal(run(bad).aggressive.stance,'비중 축소 검토');
});
test('10% is adjustable review threshold, not automatic trim, and costs/reentry opposition blocks trim',()=>{
 const s=hot({sellReviewEvidence:evidence()});for(const wt of [6,10])a.equal(run(s,wt).opinion,'보유');
 a.equal(run(s,15,{reviewWeightPct:20}).opinion,'보유');a.equal(run(s,15,{reviewWeightPct:NaN}).sellReview.thresholdPct,10);
 for(const key of ['costs','holdAndReentryRisk']){const e=evidence();e[key].trimJustified=false;a.equal(run(hot({sellReviewEvidence:e})).opinion,'보유');}
 const e=evidence();e.valuation.overvalued=false;a.equal(run(hot({sellReviewEvidence:e})).opinion,'보유');
});
test('all review fields necessary; nonholdings never receive trim',()=>{
 for(const key of ['valuation','competitiveThesis','costs','holdAndReentryRisk','source','verification','asOfDate']){const e=evidence();delete e[key];a.equal(run(hot({sellReviewEvidence:e})).opinion,'판단 보류',key);}
 a.notEqual(run(hot({held:null,sellReviewEvidence:evidence()}),0).opinion,'비중 축소 검토');
});
test('grounding checks assert actual returned array, not nonexistent .errors',()=>{
 for(const s of [hot(),hot({sellReviewEvidence:evidence()})]){const r=run(s);a.deepEqual(G.validateGrounding(r),[]);a.equal(G.guard(r,F.NOW).ok,true);}
 const forged=run();forged.reasonsFor.push('예상 수익 987654321%');a.ok(G.validateGrounding(forged).length>0);
});
test('research settings bounded and configurable',()=>{
 a.equal(W.evaluateStock(hot(),F.ctx(),F.NOW,{euphoriaLevels:[60,80,100]}).signals.some(x=>x.type==='euphoria'),false);
 for(const settings of [{euphoriaLevels:[]},{euphoriaLevels:[NaN]},{euphoriaMaxDays:5000},{euphoriaMinDays:-1}])a.ok(W.evaluateStock(hot(),F.ctx(),F.NOW,settings).signals.some(x=>x.type==='euphoria'));
});
test('confirmed thesis damage permits review below priority threshold only with complete evidence',()=>{
 const s=hot({thesis:{intact:false,note:'합성 논리 훼손'},sellReviewEvidence:evidence()});
 const r=run(s,5);a.equal(r.opinion,'비중 축소 검토');a.equal(r.sellReview.priorityReview,false);a.equal(r.aggressive.stance,'비중 축소 검토');
 delete s.sellReviewEvidence.costs;a.equal(run(s,5).opinion,'판단 보류');
});
test('review identity, period, date and synthetic mode mismatches are withheld',()=>{
 for(const patch of [{ticker:'OTHER'},{market:'US'},{currency:'USD'},{synthetic:false},{periodStartDate:'2026-07-02'},{periodEndDate:'2026-09-29'},{asOfDate:'2026-11-06'},{asOfDate:'2026-02-30'}]){
  const r=run(hot({sellReviewEvidence:Object.assign(evidence(),patch)}));a.equal(r.opinion,'판단 보류',JSON.stringify(patch));a.equal(r.synthetic,true);a.equal(r.basis,'synthetic');
 }
 for(const field of ['ticker','market','currency','synthetic','periodStartDate','periodEndDate']){const e=evidence();delete e[field];a.equal(run(hot({sellReviewEvidence:e})).opinion,'판단 보류',field);}
 const s=hot({sellReviewEvidence:evidence()});s.fundamentals.synthetic=false;a.equal(run(s).opinion,'판단 보류');
});
test('wrong company, exchange or adjustment cannot create euphoria in direct watch path',()=>{
 for(const part of ['returns','high52w','quote'])for(const patch of [{ticker:'OTHER'},{venue:'OTHER'},{adjustment:'total-return'}]){
  const s=hot();Object.assign(s[part],patch);a.equal(signal(s),undefined,part+JSON.stringify(patch));
 }
});
test('confirmed competitive damage cannot yield buy roles alongside trim review',()=>{
 const e=evidence();e.competitiveThesis.intact=false;
 const s=hot({quote:Object.assign({},F.quote({price:60}),{venue:'XKRX',adjustment:'split-adjusted'}),sellReviewEvidence:e});
 const r=run(s,5);a.equal(r.opinion,'비중 축소 검토');a.equal(r.aggressive.stance,'비중 축소 검토');a.equal(r.defensive.stance,'비중 축소 검토');
});
test('own ticker is not an independent benchmark',()=>{
 a.equal(signal(hot({returns:returns({benchmark:'SYN-A'})})),undefined);
});
test('trim evidence requires full matching fundamentals and review identities',()=>{
 for(const part of ['fundamentals','sellReviewEvidence'])for(const field of ['ticker','market','currency','venue','adjustment'])for(const omit of [false,true]){
  const s=hot({sellReviewEvidence:evidence()});if(omit)delete s[part][field];else s[part][field]='OTHER';
  const r=run(s);a.equal(r.opinion,'판단 보류',part+'.'+field+(omit?' omitted':' mismatch'));a.equal(r.sellReview.evidenceComplete,false);
 }
});
test('financial period cannot launder stale, impossible or future data with fresh asOf',()=>{
 for(const [start,end] of [['2020-07-01','2020-09-30'],['2026-02-01','2026-02-30'],['2026-09-30','2026-07-01'],['2026-12-01','2026-12-31']]){
  const s=hot({sellReviewEvidence:evidence()});
  s.fundamentals.periodStartDate=s.sellReviewEvidence.periodStartDate=start;
  s.fundamentals.periodEndDate=s.sellReviewEvidence.periodEndDate=end;
  // Keep the old fresh asOf to reproduce the laundering attempt.
  const r=run(s);a.equal(r.opinion,'판단 보류',start+'..'+end);a.equal(r.sellReview.evidenceComplete,false);
 }
});
