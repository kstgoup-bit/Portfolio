/* Entirely invented, including evidence. Never market data. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.KSTSellFixtures=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const today='2026-10-29';
 const e=()=>({asOf:today,checkedAt:today,source:'https://example.invalid/synthetic',summary:'합성 연구 가정',counterEvidence:'합성 전망 회복 가능성 · 사실 검증 안 됨'});
 function base(){return {mode:'synthetic',id:'SELL-DEMO-A',quote:{synthetic:true,asOf:today,price:125,cost:100,currency:'USD',adjustment:'split-adjusted',costBasis:'same-split-basis'},valuation:{multiple:20,historicalHigh:30,historyYears:5,growthPct:10,outlookGrowthPct:12,fcfYieldPct:4,evidence:e()},thesis:{factors:['moat','earnings','cashflow','debt','marketShare'].map(name=>({name,state:'stable'})),evidence:e()},positions:[{account:'가상 연금',stock:'가상A',sector:'가상 업종1',value:50,currency:'BASE'},{account:'가상 해외',stock:'가상B',sector:'가상 업종2',value:50,currency:'BASE'}],approvedLimits:{account:0.6,stock:0.6,sector:0.6},replacement:{currentQuality:80,alternativeQuality:85,currentYield:5,alternativeYield:8,taxCost:1,tradeCost:1,cashNeed:0,availableCash:20,horizonYears:2,currency:'BASE',evidence:e()}};}
 function cases(){const a=base(),b=base(),c=base(),d=base(),f=base();b.id='SELL-DEMO-B';b.positions[0].value=90;c.id='SELL-DEMO-C';c.valuation.multiple=45;c.valuation.fcfYieldPct=1;d.id='SELL-DEMO-D';d.thesis.factors[0].state='structural-deterioration';f.id='SELL-DEMO-E';f.valuation=null;return [a,b,c,d,f];}
 return {today,base,cases};
});
