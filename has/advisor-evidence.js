/* Offline evidence boundary: JSON text only, no transport/storage/credentials/orders.
 * Input declarations never establish real-world source trust. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./quote-model.js'),require('./watch-engine.js'),require('./advisor-core.js'));else root.HASAdvisorEvidence=factory(root.HASQuoteModel,root.HASWatchEngine,root.HASAdvisorCore);})(typeof globalThis!=='undefined'?globalThis:this,function(Q,W,A){
  'use strict';
  const MAX_BYTES=200000, DAY=86400000;
  const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
  const text=x=>typeof x==='string'&&x.trim().length>0&&x.length<=300;
  const number=x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=1e15;
  const positive=x=>number(x)&&x>=1e-8&&x<=1e12;
  const day=Q.isValidDate, span=(a,b)=>(Date.parse(b)-Date.parse(a))/DAY;
  function keys(x,allowed){if(!obj(x)||Object.keys(x).some(k=>!allowed.includes(k)))throw validationError('Unexpected object fields');}
  function validationError(message){const error=Error(message);error.safeValidation=true;return error;}
  function safeMessage(error){return error&&error.safeValidation===true?error.message:'Invalid evidence input';}
  function requireThat(ok,message){if(!ok)throw validationError(message);}
  function identity(x){keys(x,['ticker','market','currency','venue','adjustment']);requireThat(typeof x.ticker==='string'&&/^[A-Z0-9][A-Z0-9.^-]{0,31}$/.test(x.ticker)&&((x.market==='US'&&['NASDAQ','NYSE','AMEX'].includes(x.venue))||(x.market==='KR'&&x.venue==='KRX'))&&['US','KR'].includes(x.market)&&x.currency===(x.market==='US'?'USD':'KRW')&&['split-adjusted','total-return'].includes(x.adjustment),'Invalid identity');}
  const same=(a,b)=>['ticker','market','currency','venue','adjustment'].every(k=>a[k]===b[k]);
  function provenance(x,asOf){keys(x,['source','reference','asOfDate']);requireThat(text(x.source)&&text(x.reference)&&day(x.asOfDate)&&x.asOfDate<=asOf,'Invalid provenance');}
  function record(x,id,asOf){identity(x.identity);requireThat(same(x.identity,id),'Evidence identity mismatch');provenance(x.provenance,asOf);}
  function rejectDuplicateKeys(json){
    const tokens=/"(?:[^"\\]|\\[\s\S])*"|[{}\[\]]/g, stack=[];let m;
    while((m=tokens.exec(json))){const token=m[0];if(token==='{'||token==='['){stack.push(token==='{'?new Set():null);requireThat(stack.length<=20,'JSON nesting limit');}else if(token==='}'||token===']'){stack.pop();}else if(/^\s*:/.test(json.slice(tokens.lastIndex))){const set=stack[stack.length-1];if(set){const key=JSON.parse(token);requireThat(!set.has(key),'Duplicate JSON key');set.add(key);}}}
  }
  function freezeDeep(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.keys(value).forEach(key=>freezeDeep(value[key]));Object.freeze(value);}return value;}
  function run(json,nowISO){
    const out={status:'invalid',basis:null,trust:'unverified',usableForSignals:false,realActiveCount:0,writes:'none',network:'none',issues:[],analysis:null,notice:'Offline declarations only. Synthetic analysis is not real verified evidence. No production activation.'};
    try{
      requireThat(typeof json==='string'&&json.length<=MAX_BYTES&&new TextEncoder().encode(json).length<=MAX_BYTES,'Bounded JSON text required');
      rejectDuplicateKeys(json);const x=JSON.parse(json);keys(x,['version','mode','identity','quote','high52w','returns','financials','holding','thesis','sellReviewEvidence','settings']);
      requireThat(x.version===1&&['synthetic','real'].includes(x.mode)&&Q.isValidTimestamp(nowISO),'Invalid version/mode/clock');out.basis=x.mode;
      identity(x.identity);const id=x.identity,synthetic=x.mode==='synthetic',verification=synthetic?'independent-verified':'unverified';
      const q=x.quote;keys(q,['identity','provenance','price','asOfTime']);record(q,id,Q.marketDate(nowISO,id.market));
      requireThat(positive(q.price)&&Q.isValidTimestamp(q.asOfTime)&&Q.marketDate(q.asOfTime,id.market)===q.provenance.asOfDate&&Date.parse(q.asOfTime)<=Date.parse(nowISO),'Invalid quote');
      const asOf=q.provenance.asOfDate,stock={ticker:id.ticker,market:id.market,quote:Q.normalize(Object.assign({},id,{price:q.price,kind:'close',asOfDate:asOf,asOfTime:q.asOfTime,source:synthetic?'SYNTHETIC: '+q.provenance.source:q.provenance.source,synthetic,verification})).quote};
      stock.quote=Object.assign({},stock.quote,{venue:id.venue,adjustment:id.adjustment});
      const ctx={weightPct:null,cashPct:null,weightBasis:'unverified'};
      // Each optional evidence group fails closed, but independent valid groups remain inspectable.
      function optional(name,fn){if(x[name]===undefined){out.issues.push(name+': missing');return;}try{fn(x[name]);}catch(e){out.issues.push(name+': '+safeMessage(e));}}
      optional('high52w',h=>{
        keys(h,['identity','provenance','startDate','endDate','days']);record(h,id,asOf);
        requireThat(day(h.startDate)&&h.endDate===asOf&&h.provenance.asOfDate===asOf&&span(h.startDate,h.endDate)===364&&Array.isArray(h.days)&&h.days.length===365,'52-week calendar coverage required');
        let high=0,sessions=0;
        h.days.forEach((p,i)=>{keys(p,['date','high','close','closed']);requireThat(p.date===new Date(Date.parse(h.startDate)+i*DAY).toISOString().slice(0,10),'Missing/duplicate/unsorted window day');if(p.closed===true){requireThat(p.high===undefined&&p.close===undefined,'Closed day has price');}else{requireThat(p.closed===false&&positive(p.high)&&positive(p.close)&&p.high>=p.close,'Invalid daily high/close');sessions++;high=Math.max(high,p.high);}});
        requireThat(sessions>=200&&h.days[364].close===q.price,'Incomplete sessions or latest close mismatch');
        stock.high52w={ticker:id.ticker,venue:id.venue,price:high,asOfDate:asOf,source:h.provenance.source,verification,market:id.market,currency:id.currency,adjustment:id.adjustment};
      });
      optional('returns',r=>{
        keys(r,['identity','provenance','startDate','endDate','startPrice','endPrice','benchmark']);record(r,id,asOf);
        const b=r.benchmark;keys(b,['identity','provenance','startDate','endDate','startPrice','endPrice']);identity(b.identity);provenance(b.provenance,asOf);
        requireThat(day(r.startDate)&&r.endDate===asOf&&r.provenance.asOfDate===asOf&&b.provenance.asOfDate===asOf&&span(r.startDate,r.endDate)>=1&&span(r.startDate,r.endDate)<=3660&&r.startDate===b.startDate&&r.endDate===b.endDate,'Return period mismatch');
        requireThat(b.identity.ticker!==id.ticker&&b.identity.venue===id.venue&&b.identity.market===id.market&&b.identity.currency===id.currency&&b.identity.adjustment===id.adjustment,'Benchmark identity/market/currency/adjustment mismatch');
        requireThat([r.startPrice,r.endPrice,b.startPrice,b.endPrice].every(positive)&&r.endPrice===q.price,'Return price mismatch');
        requireThat(Math.abs((r.endPrice/r.startPrice-1)*100)<=1e6&&Math.abs((b.endPrice/b.startPrice-1)*100)<=1e6,'Return magnitude out of bounds');
        stock.returns={ticker:id.ticker,venue:id.venue,benchVenue:b.identity.venue,stockPct:(r.endPrice/r.startPrice-1)*100,benchPct:(b.endPrice/b.startPrice-1)*100,periodDays:span(r.startDate,r.endDate),periodUnit:'calendar-days',startDate:r.startDate,asOfDate:asOf,benchStartDate:b.startDate,benchAsOfDate:b.endDate,source:r.provenance.source,benchSource:b.provenance.source,benchmark:b.identity.ticker,market:id.market,benchMarket:b.identity.market,currency:id.currency,benchCurrency:b.identity.currency,adjustment:id.adjustment,benchAdjustment:b.identity.adjustment,verification};
      });
      optional('financials',f=>{
        keys(f,['identity','provenance','currency','unit','current','previous']);record(f,id,asOf);
        requireThat(f.currency===id.currency&&f.unit==='currency-units','Financial currency/unit mismatch');
        [f.current,f.previous].forEach(p=>{keys(p,['startDate','endDate','revenue','freeCashFlow','debtToEquity']);requireThat(day(p.startDate)&&day(p.endDate)&&span(p.startDate,p.endDate)>=80&&span(p.startDate,p.endDate)<=370&&p.endDate<=f.provenance.asOfDate&&positive(p.revenue)&&number(p.freeCashFlow)&&number(p.debtToEquity)&&p.debtToEquity>=0,'Invalid financial period/metrics');});
        requireThat(f.previous.endDate<f.current.startDate&&Math.abs(span(f.current.startDate,f.current.endDate)-span(f.previous.startDate,f.previous.endDate))<=7&&Math.abs(span(f.previous.startDate,f.current.startDate)-365)<=7,'Financial periods must be comparable year-over-year');
        requireThat(Math.abs((f.current.revenue/f.previous.revenue-1)*100)<=1e6,'Financial growth out of bounds');
        // Never substitute publication date for financial freshness.
        stock.fundamentals={ticker:id.ticker,market:id.market,currency:id.currency,venue:id.venue,adjustment:id.adjustment,synthetic,periodStartDate:f.current.startDate,periodEndDate:f.current.endDate,asOfDate:f.current.endDate,source:f.provenance.source,verification,revenueGrowthPct:(f.current.revenue/f.previous.revenue-1)*100,freeCashFlow:f.current.freeCashFlow,freeCashFlowPrev:f.previous.freeCashFlow,debtToEquity:f.current.debtToEquity,debtToEquityPrev:f.previous.debtToEquity};
      });
      optional('holding',h=>{keys(h,['quantity','avgPrice','weightPct','cashPct']);requireThat(positive(h.quantity)&&positive(h.avgPrice)&&number(h.weightPct)&&h.weightPct>=0&&h.weightPct<=100&&number(h.cashPct)&&h.cashPct>=0&&h.cashPct<=100&&h.weightPct+h.cashPct<=100,'Invalid holding');stock.held={quantity:h.quantity,avgPrice:h.avgPrice};ctx.weightPct=h.weightPct;ctx.cashPct=h.cashPct;ctx.weightBasis=synthetic?'verified':'unverified';});
      optional('thesis',t=>{keys(t,['intact','note']);requireThat(typeof t.intact==='boolean'&&text(t.note),'Invalid thesis');if(synthetic)stock.thesis=t;});
      optional('sellReviewEvidence',s=>{keys(s,['identity','periodStartDate','periodEndDate','provenance','valuation','competitiveThesis','costs','holdAndReentryRisk']);record(s,id,asOf);requireThat(stock.fundamentals&&s.periodStartDate===stock.fundamentals.periodStartDate&&s.periodEndDate===stock.fundamentals.periodEndDate,'Review financial period mismatch');keys(s.valuation,['overvalued','note']);keys(s.competitiveThesis,['intact','note']);keys(s.costs,['considered','trimJustified','note']);keys(s.holdAndReentryRisk,['considered','trimJustified','note']);requireThat(typeof s.valuation.overvalued==='boolean'&&typeof s.competitiveThesis.intact==='boolean'&&s.costs.considered===true&&typeof s.costs.trimJustified==='boolean'&&s.holdAndReentryRisk.considered===true&&typeof s.holdAndReentryRisk.trimJustified==='boolean'&&[s.valuation,s.competitiveThesis,s.costs,s.holdAndReentryRisk].every(v=>text(v.note)),'Incomplete sell review');if(synthetic)stock.sellReviewEvidence=Object.assign({},s,{ticker:id.ticker,market:id.market,currency:id.currency,venue:id.venue,adjustment:id.adjustment,synthetic,asOfDate:s.provenance.asOfDate,source:s.provenance.source,verification});});
      let settings={};if(x.settings!==undefined){keys(x.settings,['reviewWeightPct']);requireThat(number(x.settings.reviewWeightPct)&&x.settings.reviewWeightPct>0&&x.settings.reviewWeightPct<=100,'Invalid review weight');settings=x.settings;}
      const watch=W.evaluateStock(stock,ctx,nowISO),advice=A.analyze(stock,watch,ctx,nowISO,settings);
      advice.basis=x.mode;advice.synthetic=synthetic;
      out.analysis={watch,advice};out.status=synthetic?'synthetic-only':'withheld';
      if(!synthetic)out.issues.push('Real source trust is not established by JSON declarations. Real activation withheld.');
      return freezeDeep(out);
    }catch(e){out.issues.push(safeMessage(e));return freezeDeep(out);}
  }
  return Object.freeze({run,MAX_BYTES});
});
