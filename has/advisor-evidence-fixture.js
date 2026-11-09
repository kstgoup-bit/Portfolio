/* Entirely invented offline input, never a real quote or financial source. */
'use strict';
function fixture(){
  const identity={ticker:'SYN-A',market:'US',currency:'USD',venue:'NASDAQ',adjustment:'split-adjusted'};
  const provenance={source:'SYNTHETIC fixture',reference:'invented offline fixture',asOfDate:'2026-11-09'};
  const base=()=>({identity:{...identity},provenance:{...provenance}});
  const days=Array.from({length:365},(_,i)=>({date:new Date(Date.parse('2025-11-10')+i*86400000).toISOString().slice(0,10),high:101,close:100,closed:false}));
  return {version:1,mode:'synthetic',identity,quote:{...base(),price:100,asOfTime:'2026-11-09T21:00:00Z'},high52w:{...base(),startDate:'2025-11-10',endDate:'2026-11-09',days},returns:{...base(),startDate:'2026-09-10',endDate:'2026-11-09',startPrice:60,endPrice:100,benchmark:{...base(),identity:{...identity,ticker:'SYN-BENCH'},startDate:'2026-09-10',endDate:'2026-11-09',startPrice:100,endPrice:105}},financials:{...base(),currency:'USD',unit:'currency-units',current:{startDate:'2026-07-01',endDate:'2026-09-30',revenue:110,freeCashFlow:20,debtToEquity:0.5},previous:{startDate:'2025-07-01',endDate:'2025-09-30',revenue:100,freeCashFlow:18,debtToEquity:0.5}},holding:{quantity:10,avgPrice:60,weightPct:12,cashPct:30},thesis:{intact:true,note:'Invented thesis intact'},sellReviewEvidence:{identity:{...identity},periodStartDate:'2026-07-01',periodEndDate:'2026-09-30',provenance:{...provenance},valuation:{overvalued:true,note:'Invented valuation evidence'},competitiveThesis:{intact:true,note:'Invented moat evidence'},costs:{considered:true,trimJustified:true,note:'Invented tax/fees/FX comparison'},holdAndReentryRisk:{considered:true,trimJustified:true,note:'Invented hold and reentry comparison'}},settings:{reviewWeightPct:10}};
}
module.exports={fixture,NOW:'2026-11-09T22:00:00Z'};
