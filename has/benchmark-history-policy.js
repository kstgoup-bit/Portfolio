/* Benchmark boundary only. No network, keys, storage, timers, official calendar or final-close claim. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./quote-model.js'));else root.HASBenchmarkHistory=factory(root.HASQuoteModel);})(typeof globalThis!=='undefined'?globalThis:this,function(Q){
  'use strict';
  var IDS=['KS200','QQQ','SPY'], MAX_BARS=2000, MAX_CONFLICTS=256, MAX_BYTES=2000000, MIN_TS=946684800000;
  var admitted=new WeakSet();
  var specs={KS200:{symbol:'069500.KS',ticker:'069500',market:'KR',currency:'KRW',timezone:'Asia/Seoul',name:'KODEX 200 ETF (069500)'},QQQ:{symbol:'QQQ',ticker:'QQQ',market:'US',currency:'USD',timezone:'America/New_York',name:'QQQ ETF'},SPY:{symbol:'SPY',ticker:'SPY',market:'US',currency:'USD',timezone:'America/New_York',name:'SPY ETF'}};
  IDS.forEach(function(k){Object.freeze(specs[k]);});Object.freeze(specs);
  function specFor(id){return typeof id==='string'&&own(specs,id)?specs[id]:null;}
  var obj=function(x){return x!==null&&typeof x==='object'&&!Array.isArray(x);};
  var own=function(x,k){return Object.prototype.hasOwnProperty.call(x,k);};
  var price=function(x){return typeof x==='number'&&isFinite(x)&&x>=1e-8&&x<=1e12;};
  var instant=function(x){if(!Q||!Q.isValidTimestamp(x))return false;var z=/([+-])(\d{2}):(\d{2})$/.exec(x);return !z||(+z[2]<=14&&+z[3]<60&&(+z[2]!==14||+z[3]===0));};
  var fail=function(reason){return {ok:false,reason:reason};};
  function received(iso){return instant(iso)&&Date.parse(iso)>=MIN_TS;}
  function observedDate(p,id){
    if(!specFor(id)||!obj(p))return null;
    if(own(p,'d'))return Q.isValidDate(p.d)?p.d:null;
    return typeof p.ts==='number'&&Number.isSafeInteger(p.ts)&&p.ts>=MIN_TS&&p.ts<=8640000000000000?Q.marketDate(new Date(p.ts).toISOString(),specFor(id).market):null;
  }
  function validatePoint(p,id,now){
    if(!specFor(id)||typeof now!=='number'||!isFinite(now)||!obj(p)||!price(p.close))return fail('cache-point');
    if(own(p,'d'))return validateObservation(p,id,now);
    if(typeof p.ts!=='number'||!Number.isSafeInteger(p.ts)||p.ts<MIN_TS||p.ts>now)return fail('cache-point');
    var d=observedDate(p,id);return d?{ok:true,point:p,date:d,legacy:true}:fail('cache-date');
  }
  function series(rows,id,now,options){
    if(!specFor(id)||!Array.isArray(rows)||rows.length>MAX_BARS||typeof now!=='number'||!isFinite(now))return fail('cache-shape');
    var prev='',prevTs=0,days=Object.create(null),dates=[],duplicates=[];
    for(var i=0;i<rows.length;i++){
      var p=rows[i],v=validatePoint(p,id,now);if(!v.ok)return v;if(options&&options.legacyOnly===true&&!v.legacy)return fail('legacy-point-required');
      if(v.date<prev||v.legacy&&p.ts<=prevTs)return fail('cache-order');
      if(own(days,v.date)){duplicates.push(v.date);if(!options||options.allowDuplicateDates!==true)return fail('cache-date-conflict');}
      else{days[v.date]=p;dates.push(v.date);}
      prev=v.date;if(v.legacy)prevTs=p.ts;
    }
    return {ok:true,points:rows,dates:dates,byDate:days,latestDate:dates.length?dates[dates.length-1]:null,readOnly:duplicates.length>0,quarantined:duplicates.length>0,duplicateDates:duplicates};
  }
  function readCache(raw,now){
    if(typeof now!=='number'||!Number.isFinite(now)||!obj(raw)||Object.keys(raw).some(function(k){return IDS.indexOf(k)<0&&k!=='fetchedAt'&&k!=='fetchedAtISO';}))return fail('cache-shape');
    if(own(raw,'fetchedAt')&&(typeof raw.fetchedAt!=='string'||raw.fetchedAt.length>100)||own(raw,'fetchedAtISO')&&raw.fetchedAtISO!==null&&!instant(raw.fetchedAtISO))return fail('cache-receipt');
    var result={ok:true,cache:raw,series:{},diagnostics:[],allValid:true};
    IDS.forEach(function(id){
      var rows=own(raw,id)?raw[id]:[],r=series(rows,id,now,{legacyOnly:true});
      if(!r.ok){var compatible=series(rows,id,now,{allowDuplicateDates:true,legacyOnly:true});
        r={ok:false,reason:r.reason,points:rows,readOnly:true,quarantined:true,compatible:compatible.ok?compatible:null};
        result.allValid=false;result.diagnostics.push({id:id,reason:r.reason});
      }
      result.series[id]=r;
    });
    return result;
  }
  function freeze(x){if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.keys(x).forEach(function(k){freeze(x[k]);});Object.freeze(x);}return x;}
  function barsValid(bars,id,receipt,max){
    if(!specFor(id)||!received(receipt)||!Array.isArray(bars)||bars.length<2||bars.length>(max||MAX_BARS))return false;
    var today=Q.marketDate(receipt,specFor(id).market),previous='';
    for(var i=0;i<bars.length;i++){var b=bars[i];if(!obj(b)||!Q.isValidDate(b.d)||b.d<'2000-01-01'||b.d>today||b.d<=previous||[0,6].indexOf(new Date(b.d+'T00:00:00Z').getUTCDay())>=0||!price(b.c))return false;previous=b.d;}
    return true;
  }
  function candidate(id,bars,receipt,source,points,synthetic){
    var s=specFor(id),out={ok:true,id:id,symbol:s.symbol,market:s.market,currency:s.currency,timezone:s.timezone,source:source,receivedAt:receipt,bars:bars,points:points||null,dateKind:'exchange-date-only',barTimestampKind:points?'provider-bar-time-not-confirmed-close':'absent',adjustment:'unverified',finality:'unverified',latestness:'unconfirmed',synthetic:synthetic===true,signalHold:true,quality:'unconfirmed'};freeze(out);if(!synthetic)admitted.add(out);return out;
  }
  function exchange(code,full,id){
    var names={NMS:['NasdaqGS','Nasdaq'],NGM:['NasdaqGM','Nasdaq'],NCM:['NasdaqCM','Nasdaq'],NYQ:['NYSE'],ASE:['NYSE American','AMEX'],PCX:['NYSEArca','NYSE Arca'],BATS:['BATS','Cboe US'],KSC:['KSE']};
    return own(names,code)&&(id==='KS200'?code==='KSC':code!=='KSC')&&(full===undefined||full===null||names[code].indexOf(full)>=0);
  }
  function parseYahoo(data,id,receipt){
    var s=specFor(id);if(!s||!received(receipt)||!obj(data)||!obj(data.chart)||data.chart.error!=null||!Array.isArray(data.chart.result)||data.chart.result.length!==1)return fail('yahoo-envelope');
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
    var s=specFor(id);if(!s||!obj(payload)||!own(payload,s.ticker))return fail('gas-envelope');
    var r=payload[s.ticker];if(!obj(r)||r.source!=='yahoo-chart-v8'||r.symbol!==s.symbol||r.currency!==s.currency||r.timezone!==s.timezone||r.instrumentType!=='ETF'||r.adjustment!=='unverified'||!barsValid(r.bars,id,receipt,400)||r.barCount!==r.bars.length)return fail('gas-contract');
    if(Date.parse(r.bars[r.bars.length-1].d)-Date.parse(r.bars[0].d)>370*86400000||r.bars.some(function(b){return Object.keys(b).sort().join(',')!=='c,d';}))return fail('gas-date-contract');
    var allowed=id==='KS200'?['KSE','KSC']:['NasdaqGS','NasdaqGM','NasdaqCM','Nasdaq','NMS','NGM','NCM','NYSE','NYQ','NYSE American','AMEX','ASE','NYSEArca','NYSE Arca','PCX','BATS','Cboe US'];
    if(allowed.indexOf(r.exchange)<0)return fail('gas-exchange');
    if(r.regularMarketTime!=null&&(!instant(r.regularMarketTime)||Date.parse(r.regularMarketTime)>Date.parse(receipt)||Q.marketDate(r.regularMarketTime,s.market)<r.bars[r.bars.length-1].d))return fail('gas-quote-time');
    for(var i=0;i<2;i++){var k=['regularMarketPrice','fiftyTwoWeekHigh'][i];if(r[k]!=null&&!price(r[k]))return fail('gas-price-meta');}
    return candidate(id,r.bars.map(function(b){return {d:b.d,c:b.c};}),receipt,'yahoo-chart-v8-via-gas (synthetic preview)',null,true);
  }
  // Admission is deliberately process-local. Persisted data is validated, not promoted
  // back into a freshly authenticated transport candidate by copying public flags.
  function admitCandidate(c,id,now){
    var s=specFor(id);if(!s||!obj(c)||!admitted.has(c)||c.id!==id||c.synthetic!==false||c.symbol!==s.symbol||c.market!==s.market||c.currency!==s.currency||c.timezone!==s.timezone||!received(c.receivedAt)||Date.parse(c.receivedAt)>now||!barsValid(c.bars,id,c.receivedAt)||['yahoo-chart-v8','alpha-vantage-daily'].indexOf(c.source)<0)return fail('candidate-not-persistable');
    return {ok:true,candidate:c};
  }
  function parseAlphaVantage(data,id,receipt){
    var s=specFor(id);
    if(!s||s.market!=='US'||!received(receipt)||!obj(data)||own(data,'Note')||own(data,'Information')||own(data,'Error Message')||!obj(data['Meta Data'])||!obj(data['Time Series (Daily)']))return fail('av-envelope');
    var m=data['Meta Data'],rows=data['Time Series (Daily)'],dates=Object.keys(rows).sort(),today=Q.marketDate(receipt,s.market);
    if(m['2. Symbol']!==s.symbol||['US/Eastern','America/New_York'].indexOf(m['5. Time Zone'])<0||typeof m['1. Information']!=='string'||!/^Daily Prices \(open, high, low, close\) and Volumes$/.test(m['1. Information'])||['Compact','Full size'].indexOf(m['4. Output Size'])<0)return fail('av-identity');
    // Last Refreshed is a source date/clock label, never a per-bar availability instant.
    var refresh=m['3. Last Refreshed'];
    if(typeof refresh!=='string'||!/^\d{4}-\d{2}-\d{2}(?: (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)?$/.test(refresh)||!Q.isValidDate(refresh.slice(0,10))||refresh.slice(0,10)>today||dates.length<2||dates.length>MAX_BARS||dates[dates.length-1]!==refresh.slice(0,10))return fail('av-refresh');
    function decimal(v){return typeof v==='string'&&/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v)&&price(Number(v));}
    var bars=[];
    for(var i=0;i<dates.length;i++){
      var r=rows[dates[i]];
      if(!obj(r)||Object.keys(r).sort().join(',')!=='1. open,2. high,3. low,4. close,5. volume'||!['1. open','2. high','3. low','4. close'].every(function(k){return decimal(r[k]);})||typeof r['5. volume']!=='string'||!/^\d+$/.test(r['5. volume'])||!Number.isSafeInteger(Number(r['5. volume']))||Number(r['3. low'])>Math.min(Number(r['1. open']),Number(r['4. close']))||Number(r['2. high'])<Math.max(Number(r['1. open']),Number(r['4. close']))||Number(r['3. low'])>Number(r['2. high']))return fail('av-bar');
      bars.push({d:dates[i],c:Number(r['4. close'])});
    }
    if(!barsValid(bars,id,receipt))return fail('av-dates');
    return candidate(id,bars,receipt,'alpha-vantage-daily',null,false);
  }
  function mergeSeries(existing,incoming,id,now){
    var old=series(existing,id,now);if(!old.ok)return fail('existing-cache-invalid');
    var admission=admitCandidate(incoming,id,now);if(!admission.ok||!incoming.points)return fail('candidate-not-persistable');
    var fresh=series(incoming.points,id,now);if(!fresh.ok)return fail('candidate-points');
    if(old.latestDate&&fresh.latestDate<old.latestDate)return fail('older-response');
    var add=[],conflicts=[],unchanged=[],skipped=[];
    incoming.bars.forEach(function(b,i){
      if(own(old.byDate,b.d)){if(old.byDate[b.d].close!==b.c)conflicts.push({d:b.d,existing:old.byDate[b.d],incoming:incoming.points[i],source:incoming.source,receivedAt:incoming.receivedAt});else unchanged.push(b.d);}
      else if(!old.latestDate||b.d>old.latestDate)add.push(incoming.points[i]);else skipped.push(b.d);
    });
    if(existing.length+add.length>MAX_BARS)return fail('append-range');
    return {ok:true,changed:add.length>0,reason:add.length?'new-observation':conflicts.length?'historical-correction-needs-review':'no-new-observation',points:add.length?existing.concat(add):existing,latestDate:add.length?observedDate(add[add.length-1],id):old.latestDate,acceptedDates:add.map(function(p){return observedDate(p,id);}),unchangedDates:unchanged,pendingConflicts:conflicts,failures:skipped.map(function(d){return {d:d,reason:'gap-backfill-disabled'};})};
  }
  // Exact UTF-16 code-unit encoding, SHA-256. This fingerprints raw storage bytes
  // (including whitespace/key order), not provenance. Committers still compare raw
  // strings immediately before writing; localStorage has no transactional CAS.
  function fingerprint(raw){
    if(raw!==null&&typeof raw!=='string')return null;
    var text=raw===null?'N':'S'+raw,bytes=[];
    for(var i=0;i<text.length;i++){var c=text.charCodeAt(i);bytes.push(c>>>8,c&255);}
    var bits=bytes.length*8;bytes.push(128);while(bytes.length%64!==56)bytes.push(0);
    var hi=Math.floor(bits/4294967296),lo=bits>>>0;for(i=3;i>=0;i--)bytes.push((hi>>>(i*8))&255);for(i=3;i>=0;i--)bytes.push((lo>>>(i*8))&255);
    var h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var k=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    function rr(x,n){return (x>>>n)|(x<<(32-n));}
    for(var off=0;off<bytes.length;off+=64){var w=[];for(i=0;i<16;i++)w[i]=(bytes[off+i*4]<<24)|(bytes[off+i*4+1]<<16)|(bytes[off+i*4+2]<<8)|bytes[off+i*4+3];
      for(i=16;i<64;i++){var x=w[i-15],y=w[i-2];w[i]=(w[i-16]+(rr(x,7)^rr(x,18)^(x>>>3))+w[i-7]+(rr(y,17)^rr(y,19)^(y>>>10)))|0;}
      var a=h[0],b=h[1],c0=h[2],d=h[3],e=h[4],f=h[5],g=h[6],j=h[7];
      for(i=0;i<64;i++){var t1=(j+(rr(e,6)^rr(e,11)^rr(e,25))+((e&f)^(~e&g))+k[i]+w[i])|0,t2=((rr(a,2)^rr(a,13)^rr(a,22))+((a&b)^(a&c0)^(b&c0)))|0;j=g;g=f;f=e;e=(d+t1)|0;d=c0;c0=b;b=a;a=(t1+t2)|0;}
      [a,b,c0,d,e,f,g,j].forEach(function(v,n){h[n]=(h[n]+v)|0;});
    }
    return 'sha256-utf16be-v1:'+h.map(function(n){return ('00000000'+(n>>>0).toString(16)).slice(-8);}).join('');
  }
  function exactKeys(o,keys){return obj(o)&&Object.keys(o).sort().join(',')===keys.slice().sort().join(',');}
  function observationId(p){return 'o:'+fingerprint(JSON.stringify([p.d,p.close,p.source,p.receivedAt,p.providerBarTs]));}
  function validateObservation(p,id,now){
    var s=specFor(id);if(!s||!exactKeys(p,['id','d','close','source','receivedAt','providerBarTs','dateKind','adjustment','finality'])||!Q.isValidDate(p.d)||p.d<'2000-01-01'||!price(p.close)||!received(p.receivedAt)||Date.parse(p.receivedAt)>now||p.d>Q.marketDate(p.receivedAt,s.market)||[0,6].indexOf(new Date(p.d+'T00:00:00Z').getUTCDay())>=0||p.dateKind!=='exchange-date-only'||p.adjustment!=='unverified'||['unverified','provisional'].indexOf(p.finality)<0||p.id!==observationId(p))return fail('observation-contract');
    if(p.d===Q.marketDate(p.receivedAt,s.market)&&p.finality!=='provisional'||p.d<Q.marketDate(p.receivedAt,s.market)&&p.finality!=='unverified')return fail('observation-finality');
    if(p.source==='alpha-vantage-daily'){if(s.market!=='US'||p.providerBarTs!==null)return fail('observation-source');}
    else if(p.source==='yahoo-chart-v8'){if(!Number.isSafeInteger(p.providerBarTs)||p.providerBarTs<MIN_TS||p.providerBarTs>Date.parse(p.receivedAt)||observedDate({ts:p.providerBarTs},id)!==p.d)return fail('observation-source');}
    else return fail('observation-source');
    return {ok:true,point:p,date:p.d,legacy:false};
  }
  function makeObservation(c,i){var b=c.bars[i],p={d:b.d,close:b.c,source:c.source,receivedAt:c.receivedAt,providerBarTs:c.points?c.points[i].ts:null,dateKind:'exchange-date-only',adjustment:'unverified',finality:b.d===Q.marketDate(c.receivedAt,c.market)?'provisional':'unverified'};p.id=observationId(p);return freeze(p);}
  function emptyGroup(id){var s=specFor(id);return {symbol:s.symbol,currency:s.currency,market:s.market,timezone:s.timezone,observations:[],conflicts:[]};}
  function provisionalSuccessor(old,p,id){return own(old,'finality')&&old.finality==='provisional'&&old.source===p.source&&Date.parse(p.receivedAt)>Date.parse(old.receivedAt)&&Q.marketDate(p.receivedAt,specFor(id).market)>old.d;}
  function validateGroup(g,id,now){
    var s=specFor(id);if(!s||!exactKeys(g,['symbol','currency','market','timezone','observations','conflicts'])||g.symbol!==s.symbol||g.currency!==s.currency||g.market!==s.market||g.timezone!==s.timezone||!Array.isArray(g.observations)||g.observations.length>MAX_BARS||!Array.isArray(g.conflicts)||g.conflicts.length>MAX_CONFLICTS)return fail('store-series');
    var r=series(g.observations,id,now);if(!r.ok)return r;
    var seen=Object.create(null);
    for(var i=0;i<g.conflicts.length;i++){var c=g.conflicts[i];
      if(!exactKeys(c,['d','existing','alternative','status'])||!Q.isValidDate(c.d)||['pending-review','provisional-successor'].indexOf(c.status)<0||!validatePoint(c.existing,id,now).ok||!validateObservation(c.alternative,id,now).ok||observedDate(c.existing,id)!==c.d||c.alternative.d!==c.d||own(seen,c.alternative.id))return fail('store-conflict');
      if(c.status==='pending-review'&&c.existing.close===c.alternative.close||c.status==='provisional-successor'&&!provisionalSuccessor(c.existing,c.alternative,id))return fail('store-conflict-status');
      seen[c.alternative.id]=true;
    }
    return {ok:true,group:g,points:g.observations,conflicts:g.conflicts};
  }
  function parseRawJSON(raw){
    var at=0,count=0;
    function ws(){while(/[\x20\x09\x0a\x0d]/.test(raw.charAt(at))&&at<raw.length)at++;}
    function string(){var start=at++;while(at<raw.length){var c=raw.charAt(at++);if(c==='"')return JSON.parse(raw.slice(start,at));if(c==='\\')at++;}throw Error('string');}
    function value(depth){
      if(depth>32||++count>100000)throw Error('bound');ws();var c=raw.charAt(at);
      if(c==='"'){string();return;}
      if(c==='{'||c==='['){var object=c==='{',end=object?'}':']',keys=Object.create(null);at++;ws();if(raw.charAt(at)===end){at++;return;}
        while(at<raw.length){ws();if(object){if(raw.charAt(at)!=='"')throw Error('key');var k=string();if(own(keys,k)||['__proto__','prototype','constructor'].indexOf(k)>=0)throw Error('duplicate-key');keys[k]=true;ws();if(raw.charAt(at++)!==':')throw Error('colon');}value(depth+1);ws();if(raw.charAt(at)===end){at++;return;}if(raw.charAt(at++)!==',')throw Error('comma');}throw Error('end');
      }
      var match=/^(?:null|true|false|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(raw.slice(at));if(!match)throw Error('value');at+=match[0].length;
    }
    value(0);ws();if(at!==raw.length)throw Error('trailing');return JSON.parse(raw);
  }
  function parseTransportJSON(raw){
    if(typeof raw!=='string'||raw.length>MAX_BYTES)return fail('transport-raw');
    try{var data=parseRawJSON(raw);return plainData(data)?{ok:true,data:data}:fail('transport-non-data');}catch(e){return fail('transport-json');}
  }
  function legacyFromRaw(raw,now){if(raw!==null&&(typeof raw!=='string'||raw.length>MAX_BYTES))return fail('legacy-raw');try{var parsed=raw===null?{}:parseRawJSON(raw);return plainData(parsed)?readCache(parsed,now):fail('legacy-non-data');}catch(e){return fail('legacy-json');}}
  function readStore(store,legacyRaw,now){
    var legacy=legacyFromRaw(legacyRaw,now);if(!legacy.ok)return legacy;
    if(store===null||store===undefined)store={version:2,legacyFingerprint:fingerprint(legacyRaw),series:{}};
    if(!exactKeys(store,['version','legacyFingerprint','series'])||store.version!==2||!obj(store.series)||Object.keys(store.series).some(function(id){return IDS.indexOf(id)<0;})||store.legacyFingerprint!==fingerprint(legacyRaw))return fail('store-envelope-or-legacy-changed');
    if(JSON.stringify(store).length>MAX_BYTES)return fail('store-bound');
    var out={ok:true,store:store,series:{},legacy:legacy,diagnostics:[],allValid:true};
    IDS.forEach(function(id){var old=legacy.series[id],g=own(store.series,id)?store.series[id]:emptyGroup(id),v=validateGroup(g,id,now),r;
      if(!old.ok||!v.ok){r={ok:false,reason:!old.ok?old.reason:v.reason,points:old.points,readOnly:true,quarantined:true};}
      else{
        var union=old.points.concat(g.observations).sort(function(a,b){return observedDate(a,id).localeCompare(observedDate(b,id));}),checked=series(union,id,now);
        if(!checked.ok)r={ok:false,reason:'store-legacy-overlap',points:union,readOnly:true,quarantined:true};
        else{
          var active=Object.assign(Object.create(null),checked.byDate),bad=false,pending=[];
          g.conflicts.forEach(function(c){
            var p=active[c.d];if(!p||JSON.stringify(p)!==JSON.stringify(c.existing)){bad=true;return;}
            if(c.status==='provisional-successor')active[c.d]=c.alternative;else pending.push(c);
          });
          var selected=checked.dates.map(function(d){return active[d];});
          r=bad?{ok:false,reason:'store-conflict-target',points:union,readOnly:true,quarantined:true}:Object.assign({},checked,{points:selected,byDate:active,conflicts:g.conflicts,pendingConflicts:pending,group:g});
        }
      }
      out.series[id]=r;if(!r.ok){out.allValid=false;out.diagnostics.push({id:id,reason:r.reason});}
    });
    return out;
  }
  function validateStore(store,legacyRaw,now){
    // Offline structural validation for backup. Supplying legacyRaw additionally
    // validates exact binding and active conflict targets against that baseline.
    var ceiling=now===undefined?8640000000000000:now;
    if(!exactKeys(store,['version','legacyFingerprint','series'])||store.version!==2||typeof store.legacyFingerprint!=='string'||!/^sha256-utf16be-v1:[0-9a-f]{64}$/.test(store.legacyFingerprint)||!obj(store.series)||Object.keys(store.series).some(function(id){return IDS.indexOf(id)<0;})||JSON.stringify(store).length>MAX_BYTES)return fail('store-envelope');
    for(var i=0;i<IDS.length;i++){var id=IDS[i];if(own(store.series,id)){var v=validateGroup(store.series[id],id,ceiling);if(!v.ok)return v;}}
    if(arguments.length<2)return {ok:true,store:store,bindingChecked:false};
    var r=readStore(store,legacyRaw,ceiling);return r.ok&&!r.allValid?fail('store-series-invalid'):r;
  }
  function mergeHistoryStore(store,legacyRaw,c,id,now){
    var gate=admitCandidate(c,id,now);if(!gate.ok)return gate;
    var read=readStore(store,legacyRaw,now);if(!read.ok)return read;
    var current=read.series[id];if(!current||!current.ok)return fail('existing-series-quarantined');
    var g=current.group,adds=[],alternatives=[],accepted=[],unchanged=[],pending=[],failures=[];
    c.bars.forEach(function(b,i){var old=current.byDate[b.d],p=makeObservation(c,i);
      if(old){
        var successor=provisionalSuccessor(old,p,id)&&!current.pendingConflicts.some(function(x){return x.d===b.d;});
        if(old.close===b.c&&!successor)unchanged.push(b.d);
        else{
          var known=g.conflicts.concat(alternatives).find(function(x){return x.d===b.d&&x.alternative.source===p.source&&x.alternative.close===p.close&&x.alternative.providerBarTs===p.providerBarTs&&x.status===(successor?'provisional-successor':'pending-review');});
          var conflict=known||{d:b.d,existing:old,alternative:p,status:successor?'provisional-successor':'pending-review'};
          if(!successor)pending.push(conflict);if(!known)alternatives.push(conflict);
        }
      }else if(!current.latestDate||b.d>current.latestDate){adds.push(p);accepted.push(b.d);}else failures.push({d:b.d,reason:'gap-backfill-disabled'});
    });
    if(current.points.length+adds.length>MAX_BARS||g.conflicts.length+alternatives.length>MAX_CONFLICTS)return fail('store-bound');
    if(!adds.length&&!alternatives.length)return {ok:true,changed:false,store:read.store,acceptedDates:accepted,unchangedDates:unchanged,pendingConflicts:pending,failures:failures};
    var nextGroup=Object.assign({},g,{observations:g.observations.concat(adds),conflicts:g.conflicts.concat(alternatives)}),next=Object.assign({},read.store,{series:Object.assign({},read.store.series)});next.series[id]=nextGroup;
    if(JSON.stringify(next).length>MAX_BYTES)return fail('store-bound');
    return {ok:true,changed:true,store:next,acceptedDates:accepted,unchangedDates:unchanged,pendingConflicts:pending,failures:failures};
  }
  function selectPointAtOrBefore(rows,id,targetTs,options){
    options=options||{};var now=options.now===undefined?targetTs:options.now;
    if(typeof targetTs!=='number'||!Number.isSafeInteger(targetTs)||targetTs<MIN_TS||targetTs>now)return fail('selection-bound');
    var r=series(rows,id,now);if(!r.ok)return r;
    var day=Q.marketDate(new Date(targetTs).toISOString(),specFor(id).market),selected=null,selectedDate=null,excluded=false;
    for(var i=0;i<r.points.length;i++){var p=r.points[i],d=observedDate(p,id);
      // Neither a provider bar start nor a legacy timestamp proves that the daily
      // value was available intraday. A prior-date retrospective view is explicit.
      if(d===day)excluded=true;if(d>=day)continue;
      if(p.ts!==undefined&&p.ts>targetTs)continue;
      selected=p;selectedDate=d;
    }
    if(!selected)return fail(excluded?'same-day-provisional':'no-prior-observation');
    var disputes=options.conflicts||[];
    if(!Array.isArray(disputes)||!validateGroup(Object.assign(emptyGroup(id),{conflicts:disputes}),id,now).ok)return fail('selection-conflicts');
    if(disputes.some(function(c){var point=r.byDate[c.d];return !point||JSON.stringify(point)!==JSON.stringify(c.existing)&&(c.status!=='provisional-successor'||JSON.stringify(point)!==JSON.stringify(c.alternative));}))return fail('selection-conflict-target');
    if(disputes.some(function(c){return c&&c.d===selectedDate&&c.status!=='provisional-successor';}))return fail('benchmark-date-conflict');
    return {ok:true,point:selected,date:selectedDate,lagged:true,excludedSameDay:excluded,quality:'unconfirmed',signalHold:true,finality:own(selected,'d')?selected.finality:'unverified',latestness:'unconfirmed',availability:'retrospective-prior-exchange-date',source:own(selected,'d')?selected.source:'legacy-unknown',receivedAt:own(selected,'d')?selected.receivedAt:null};
  }
  function idsFor(key){return key==='dom'||key==='gen'?['KS200']:key==='pen'?['QQQ']:key==='ov'?['QQQ','SPY']:['KS200','QQQ'];}
  function describe(raw,key,receipts,now){
    var c=readCache(raw,now),ids=idsFor(key);
    return {latestness:'unconfirmed',finality:'unverified',rows:ids.map(function(id){var s=specFor(id),r=c.ok&&c.series[id].ok?c.series[id]:null,m=receipts&&receipts[id],same=!!r&&!!m&&m.latestDate===r.latestDate&&r.points.length===m.pointCount&&r.points.length>0&&r.points[r.points.length-1].close===m.lastClose&&m.pointsJSON===JSON.stringify(r.points);return {id:id,name:s.name,symbol:s.symbol,currency:s.currency,latestDate:r&&r.latestDate||null,receivedAt:same?m.receivedAt:null,source:same?m.source:'캐시 출처 미확인'};})};
  }
  // Public boundaries accept data, never executable getters, custom prototypes,
  // sparse arrays or cycles. Descriptor inspection does not invoke getters.
  function plainData(value){
    var seen=new WeakSet(),count=0,characters=0,standard=Object.getOwnPropertyNames(Object.prototype).sort().join(',');
    function walk(v,depth){
      if(++count>100000||depth>32)return false;
      if(v===null||typeof v==='boolean')return true;if(typeof v==='string'){characters+=v.length;return characters<=MAX_BYTES;}if(typeof v==='number')return Number.isFinite(v)&&Math.abs(v)<=Number.MAX_SAFE_INTEGER;if(v===undefined)return depth===0;
      if(typeof v!=='object'||seen.has(v)||Object.getOwnPropertySymbols(v).length)return false;
      var proto=Object.getPrototypeOf(v);
      if(Array.isArray(v)){if(proto!==Array.prototype&&(!proto||Object.getPrototypeOf(Object.getPrototypeOf(proto))!==null))return false;}
      else if(proto!==null&&proto!==Object.prototype&&(Object.getPrototypeOf(proto)!==null||Object.getOwnPropertyNames(proto).sort().join(',')!==standard))return false;
      var descriptors=Object.getOwnPropertyDescriptors(v),names=Object.keys(descriptors);seen.add(v);
      if(Array.isArray(v)&&names.length!==v.length+1)return false;
      for(var i=0;i<names.length;i++){var name=names[i],d=descriptors[name];if(!own(d,'value')||!d.enumerable&&!(Array.isArray(v)&&name==='length')||name==='__proto__'||name==='prototype'||name==='constructor'||!walk(d.value,depth+1))return false;}
      seen.delete(v);return true;
    }
    try{return walk(value,0);}catch(e){return false;}
  }
  function boundary(fn){return function(){for(var i=0;i<arguments.length;i++)if(!plainData(arguments[i]))return fail('non-data-input');try{return fn.apply(null,arguments);}catch(e){return fail('invalid-input');}};}
  return Object.freeze({specs:specs,limits:Object.freeze({bars:MAX_BARS,conflicts:MAX_CONFLICTS,bytes:MAX_BYTES}),readCache:boundary(readCache),parseTransportJSON:boundary(parseTransportJSON),validatePoint:boundary(validatePoint),validateSeries:boundary(series),observedDate:function(p,id){return plainData(p)?observedDate(p,id):null;},fingerprint:fingerprint,readStore:boundary(readStore),validateStore:boundary(validateStore),validateObservation:boundary(validateObservation),mergeHistoryStore:boundary(mergeHistoryStore),selectPointAtOrBefore:boundary(selectPointAtOrBefore),admitCandidate:boundary(admitCandidate),parseYahoo:boundary(parseYahoo),parseAlphaVantage:boundary(parseAlphaVantage),parseGasHistory:boundary(parseGasHistory),mergeSeries:boundary(mergeSeries),describe:boundary(describe),liveGasEnabled:false});
});
