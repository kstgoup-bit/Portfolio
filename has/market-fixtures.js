/* Invented synthetic data only. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./valuation-fixtures.js'),require('./sec-facts-fixture.js'));else root.HASMarketFixtures=factory(root.HASValuationFixtures,root.HASSECFactFixtures);})(typeof globalThis!=='undefined'?globalThis:this,function(F,S){
'use strict';
const NOW='2026-11-08T10:00:00Z';
function create(){
 const d=F.create('technology'),instrument={ticker:d.ticker,market:d.market,currency:d.currency};
 const rights={reference:'SYNTHETIC: invented permission example',checkedAt:'2026-11-06T22:00:00Z',personalDisplay:true,derivedAnalytics:true,realtime:false,synthetic:true};
 const secFacts=S.create();secFacts.instrument={...instrument};secFacts.identityReview.ticker=instrument.ticker;
 const q={...instrument,price:60,source:'SYNTHETIC source A',originId:'invented-origin-a',reference:'SYNTHETIC quote example',priceKind:'close',adjustment:'split-adjusted',asOfDate:'2026-11-06',asOfTime:'2026-11-06T21:00:00Z',receivedAt:'2026-11-06T21:01:00Z',synthetic:true,rights};
 const dates=[];for(let t=Date.parse('2026-08-03');t<=Date.parse('2026-11-06');t+=86400000){const day=new Date(t);if(day.getUTCDay()!==0&&day.getUTCDay()!==6)dates.push(day.toISOString().slice(0,10));}
 const bars=dates.map((date,i)=>{const close=i===dates.length-1?60:70-i*.12+Math.sin(i*.5)*2;return {date,open:close+.1,high:close+1,low:close-1,close,volume:1000+i*10,closed:true,closeAt:date+'T21:00:00Z',availableAt:date+'T21:01:00Z'};});
 return {version:1,mode:'synthetic',instrument,secFacts,quotes:[q,{...q,source:'SYNTHETIC source B',originId:'invented-origin-b',price:60.03}],history:{...instrument,synthetic:true,source:'SYNTHETIC OHLCV',reference:'SYNTHETIC invented bars',calendarSource:'SYNTHETIC weekday calendar, not an exchange calendar',interval:'1d',adjustment:'split-adjusted',rights,receivedAt:'2026-11-06T21:02:00Z',sessionDates:dates,bars},valuationDocument:d};
}
return Object.freeze({NOW,create});
});
