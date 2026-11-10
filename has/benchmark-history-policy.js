/* Benchmark boundary only. No network, keys, storage, timers, official calendar or final-close claim. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./quote-model.js'));else root.HASBenchmarkHistory=factory(root.HASQuoteModel);})(typeof globalThis!=='undefined'?globalThis:this,function(Q){
  'use strict';
  var IDS=['KS200','QQQ','SPY'], MAX_BARS=2000, MIN_TS=946684800000;
  var specs={KS200:{symbol:'069500.KS',ticker:'069500',market:'KR',currency:'KRW',timezone:'Asia/Seoul',name:'KODEX 200 ETF (069500)'},QQQ:{symbol:'QQQ',ticker:'QQQ',market:'US',currency:'USD',timezone:'America/New_York',name:'QQQ ETF'},SPY:{symbol:'SPY',ticker:'SPY',market:'US',currency:'USD',timezone:'America/New_York',name:'SPY ETF'}};
  IDS.forEach(function(k){Object.freeze(specs[k]);});Object.freeze(specs);
  var obj=function(x){return x!==null&&typeof x==='object'&&!Array.isArray(x);};
  var own=function(x,k){return Object.prototype.hasOwnProperty.call(x,k);};
  var price=function(x){return typeof x==='number'&&isFinite(x)&&x>=1e-8&&x<=1e12;};
  var instant=function(x){return !!Q&&Q.isValidTimestamp(x);};
  var fail=function(reason){return {ok:false,reason:reason};};
  function received(iso){return instant(iso)&&Date.parse(iso)>=MIN_TS;}
  function series(rows,id,now){
    if(!specs[id]||!Array.isArray(rows)||rows.length>MAX_BARS||typeof now!=='number'||!isFinite(now))return fail('cache-shape');
    var prev=0,days=Object.create(null),dates=[];
    for(var i=0;i<rows.length;i++){
      var p=rows[i];
      if(!obj(p)||typeof p.ts!=='number'||!Number.isInteger(p.ts)||p.ts<MIN_TS||p.ts>now||p.ts<=prev||!price(p.close))return fail('cache-point');
      var d=Q.marketDate(new Date(p.ts).toISOString(),specs[id].market);
      if(!Q.isValidDate(d)||own(days,d))return fail('cache-date-conflict');
      days[d]=p;dates.push(d);prev=p.ts;
    }
    return {ok:true,points:rows,dates:dates,byDate:days,latestDate:dates.length?dates[dates.length-1]:null};
  }
  function readCache(raw,now){
    if(!obj(raw)||Object.keys(raw).some(function(k){return IDS.indexOf(k)<0&&k!=='fetchedAt'&&k!=='fetchedAtISO';}))return fail('cache-shape');
    if(own(raw,'fetchedAt')&&(typeof raw.fetchedAt!=='string'||raw.fetchedAt.length>100)||own(raw,'fetchedAtISO')&&raw.fetchedAtISO!==null&&!instant(raw.fetchedAtISO))return fail('cache-receipt');
    var result={ok:true,cache:raw,series:{}};
    for(var i=0;i<IDS.length;i++){var id=IDS[i],r=series(own(raw,id)?raw[id]:[],id,now);if(!r.ok)return r;result.series[id]=r;}
    return result;
  }
  function barsValid(bars,id,receipt,max){
    if(!specs[id]||!received(receipt)||!Array.isArray(bars)||bars.length<2||bars.length>(max||MAX_BARS))return false;
    var today=Q.marketDate(receipt,specs[id].market),previous='';
    for(var i=0;i<bars.length;i++){var b=bars[i];if(!obj(b)||!Q.isValidDate(b.d)||b.d<'2000-01-01'||b.d>today||b.d<=previous||[0,6].indexOf(new Date(b.d+'T00:00:00Z').getUTCDay())>=0||!price(b.c))return false;previous=b.d;}
    return true;
  }
  function candidate(id,bars,receipt,source,points,synthetic){
    var s=specs[id];return {ok:true,id:id,symbol:s.symbol,market:s.market,currency:s.currency,timezone:s.timezone,source:source,receivedAt:receipt,bars:bars,points:points||null,dateKind:'exchange-date-only',barTimestampKind:points?'provider-bar-time-not-confirmed-close':'absent',adjustment:'unverified',finality:'unverified',latestness:'unconfirmed',synthetic:synthetic===true};
  }
  function exchange(code,full,id){
    var names={NMS:['NasdaqGS','Nasdaq'],NGM:['NasdaqGM','Nasdaq'],NCM:['NasdaqCM','Nasdaq'],NYQ:['NYSE'],ASE:['NYSE American','AMEX'],PCX:['NYSEArca','NYSE Arca'],BATS:['BATS','Cboe US'],KSC:['KSE']};
    return own(names,code)&&(id==='KS200'?code==='KSC':code!=='KSC')&&(full===undefined||full===null||names[code].indexOf(full)>=0);
  }
  function parseYahoo(data,id,receipt){
    var s=specs[id];if(!s||!received(receipt)||!obj(data)||!obj(data.chart)||data.chart.error!=null||!Array.isArray(data.chart.result)||data.chart.result.length!==1)return fail('yahoo-envelope');
    var r=data.chart.result[0];if(!obj(r)||!obj(r.meta)||!obj(r.indicators)||!Array.isArray(r.indicators.quote)||r.indicators.quote.length!==1||!obj(r.indicators.quote[0]))return fail('yahoo-envelope');
    var m=r.meta;if(m.symbol!==s.symbol||m.currency!==s.currency||m.exchangeTimezoneName!==s.timezone||m.instrumentType!=='ETF'||m.dataGranularity!=='1d'||!exchange(m.exchangeName,m.fullExchangeName,id))return fail('yahoo-identity');
    var ts=r.timestamp,cl=r.indicators.quote[0].close;if(!Array.isArray(ts)||!Array.isArray(cl)||ts.length!==cl.length||ts.length<2||ts.length>MAX_BARS)return fail('yahoo-bars');
    var bars=[],points=[],prior=0,now=Date.parse(receipt);
    for(var i=0;i<ts.length;i++){
      var t=ts[i];if(typeof t!=='number'||!Number.isInteger(t)||t*1000<MIN_TS||t*1000>now||t<=prior||!price(cl[i]))return fail('yahoo-bar');
      bars.push({d:Q.marketDate(new Date(t*1000).toISOString(),s.market),c:cl[i]});points.push({ts:t*1000,close:cl[i]});prior=t;
    }
    if(!barsValid(bars,id,receipt)||Date.parse(bars[bars.length-1].d)-Date.parse(bars[0].d)>5*366*86400000)return fail('yahoo-dates');
    // regularMarketTime is the latest quote timestamp, never a per-bar close/finality proof.
    if(m.regularMarketTime!=null&&(typeof m.regularMarketTime!=='number'||!Number.isInteger(m.regularMarketTime)||m.regularMarketTime*1000<points[points.length-1].ts||m.regularMarketTime*1000>now))return fail('yahoo-quote-time');
    return candidate(id,bars,receipt,'yahoo-chart-v8',points,false);
  }
  function parseGasHistory(payload,id,receipt,options){
    // Preparation only: no live mode, URL builder or activation setting is provided.
    if(!options||options.mode!=='synthetic')return fail('live-gas-disabled');
    var s=specs[id];if(!s||!obj(payload)||!own(payload,s.ticker))return fail('gas-envelope');
    var r=payload[s.ticker];if(!obj(r)||r.source!=='yahoo-chart-v8'||r.symbol!==s.symbol||r.currency!==s.currency||r.timezone!==s.timezone||r.instrumentType!=='ETF'||r.adjustment!=='unverified'||!barsValid(r.bars,id,receipt,400)||r.barCount!==r.bars.length)return fail('gas-contract');
    if(Date.parse(r.bars[r.bars.length-1].d)-Date.parse(r.bars[0].d)>370*86400000||r.bars.some(function(b){return Object.keys(b).sort().join(',')!=='c,d';}))return fail('gas-date-contract');
    var allowed=id==='KS200'?['KSE','KSC']:['NasdaqGS','NasdaqGM','NasdaqCM','Nasdaq','NMS','NGM','NCM','NYSE','NYQ','NYSE American','AMEX','ASE','NYSEArca','NYSE Arca','PCX','BATS','Cboe US'];
    if(allowed.indexOf(r.exchange)<0)return fail('gas-exchange');
    if(r.regularMarketTime!=null&&(!instant(r.regularMarketTime)||Date.parse(r.regularMarketTime)>Date.parse(receipt)||Q.marketDate(r.regularMarketTime,s.market)<r.bars[r.bars.length-1].d))return fail('gas-quote-time');
    for(var i=0;i<2;i++){var k=['regularMarketPrice','fiftyTwoWeekHigh'][i];if(r[k]!=null&&!price(r[k]))return fail('gas-price-meta');}
    return candidate(id,r.bars.map(function(b){return {d:b.d,c:b.c};}),receipt,'yahoo-chart-v8-via-gas (synthetic preview)',null,true);
  }
  function mergeSeries(existing,incoming,id,now){
    var old=series(existing,id,now);if(!old.ok)return fail('existing-cache-invalid');
    if(!incoming||incoming.ok!==true||incoming.id!==id||incoming.synthetic!==false||!incoming.points||incoming.symbol!==specs[id].symbol||incoming.currency!==specs[id].currency||incoming.source!=='yahoo-chart-v8'||!barsValid(incoming.bars,id,incoming.receivedAt)||Date.parse(incoming.receivedAt)>now)return fail('candidate-not-persistable');
    var fresh=series(incoming.points,id,now);if(!fresh.ok||fresh.dates.length!==incoming.bars.length||fresh.dates.some(function(d,i){return d!==incoming.bars[i].d||incoming.points[i].close!==incoming.bars[i].c;}))return fail('candidate-points');
    if(old.latestDate&&fresh.latestDate<old.latestDate)return fail('older-response');
    for(var i=0;i<incoming.bars.length;i++){var b=incoming.bars[i];if(own(old.byDate,b.d)&&old.byDate[b.d].close!==b.c)return fail('historical-correction-needs-review');}
    var add=incoming.points.filter(function(p,i){return !old.latestDate||fresh.dates[i]>old.latestDate;});
    if(!add.length)return {ok:true,changed:false,reason:'no-new-observation',points:existing,latestDate:old.latestDate};
    if(existing.length&&add[0].ts<=existing[existing.length-1].ts||existing.length+add.length>MAX_BARS)return fail('append-range');
    return {ok:true,changed:true,points:existing.concat(add),latestDate:fresh.latestDate};
  }
  function idsFor(key){return key==='dom'||key==='gen'?['KS200']:key==='pen'?['QQQ']:key==='ov'?['QQQ','SPY']:['KS200','QQQ'];}
  function describe(raw,key,receipts,now){
    var c=readCache(raw,now),ids=idsFor(key);
    return {latestness:'unconfirmed',finality:'unverified',rows:ids.map(function(id){var s=specs[id],r=c.ok?c.series[id]:null,m=receipts&&receipts[id],same=!!r&&!!m&&m.latestDate===r.latestDate&&r.points.length===m.pointCount&&r.points.length>0&&r.points[r.points.length-1].close===m.lastClose&&m.pointsJSON===JSON.stringify(r.points);return {id:id,name:s.name,symbol:s.symbol,currency:s.currency,latestDate:r&&r.latestDate||null,receivedAt:same?m.receivedAt:null,source:same?m.source:'캐시 출처 미확인'};})};
  }
  return Object.freeze({specs:specs,readCache:readCache,parseYahoo:parseYahoo,parseGasHistory:parseGasHistory,mergeSeries:mergeSeries,describe:describe,liveGasEnabled:false});
});
