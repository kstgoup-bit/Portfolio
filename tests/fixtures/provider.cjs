/* Entirely synthetic prices/calendar, even when named after the approved pilot tickers. */
'use strict';
const P=require('../../radar/providers.js');
function fixture(){
 const sessions=[];for(let t=Date.parse('2025-10-29');t<=Date.parse('2026-10-28');t+=86400000){const d=new Date(t);if(![0,6].includes(d.getUTCDay()))sessions.push(d.toISOString().slice(0,10));}
 const calendar={checkedAt:'2026-10-29',asOf:'2026-10-28',windowStart:'2025-10-29',comparisonStart:'2026-07-28',closeTime:'2026-10-28T20:00:00Z',sourceURL:'https://example.invalid/synthetic-calendar',verification:'verified',sessions};
 const row=ticker=>({ticker,company:'합성 계약 시험 '+ticker,exchange:['VRT','JPM'].includes(ticker)?'NYSE':'NASDAQ',currency:'USD',timezone:'America/New_York',adjustment:'split-adjusted',session:'regular',asOf:calendar.asOf,fetchedAt:'2026-10-29T00:30:00Z',delay:'eod',source:{name:'SyntheticTestVendor',url:'https://example.invalid/synthetic-bars'},bars:sessions.map(date=>({date,high:100,close:date===calendar.asOf?(P.PILOT.includes(ticker)?65:95):100}))});
 return {payload:{schemaVersion:1,synthetic:true,instruments:P.PILOT.map(row),references:['SPY','XLK','XLC','XLI','XLF'].map(row)},calendar,now:'2026-10-29T01:00:00Z',grant:{apiQuery:true,store:true,display:true,personalUse:true,authenticationReady:true,provider:'SyntheticTestVendor',termsURL:'https://example.invalid/synthetic-terms',checkedAt:'2026-10-29',expiresOn:'2026-11-29'}};
}
module.exports={fixture};
