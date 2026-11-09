/* Read-only market data contract. No transport, keys, storage or investment records. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./quote-model.js'),require('./valuation-engine.js'),require('./sec-facts-adapter.js'));else root.HASMarketData=factory(root.HASQuoteModel,root.HASValuationEngine,root.HASSECFacts);})(typeof globalThis!=='undefined'?globalThis:this,function(Q,V,S){
  'use strict';
  const VERSION=1, NOTICE='입력 자료 검사만 수행합니다. 실시간 연결·출처 원문·이용 권리·독립 검증을 확인하지 않았습니다. 주문·저장·기존 투자기록 변경 없음.';
  const obj=x=>x&&typeof x==='object'&&!Array.isArray(x), txt=x=>typeof x==='string'&&x.trim().length>0&&x.length<=500;
  const num=x=>typeof x==='number'&&Number.isFinite(x), pos=x=>num(x)&&x>=1e-9&&x<=1e12;
  const ts=x=>Q&&Q.isValidTimestamp(x), day=x=>Q&&Q.isValidDate(x), before=(x,n)=>ts(x)&&Date.parse(x)<=Date.parse(n);
  const id=x=>obj(x)&&txt(x.ticker)&&['US','KR'].includes(x.market)&&x.currency===(x.market==='US'?'USD':'KRW');
  const same=(x,y)=>x&&y&&x.ticker===y.ticker&&x.market===y.market&&x.currency===y.currency;
  const label={realtime:'입력상 실시간 유형 (연결 미확인)',delayed:'입력상 지연 유형',close:'입력상 종가 유형'};
  const nullMetrics=()=>({returnPct:null,maxDrawdownPct:null,annualizedVolatilityPct:null,rsi14:null});
  function rights(r,mode,now){
    if(!obj(r)||!txt(r.reference)||!before(r.checkedAt,now)||r.personalDisplay!==true||r.derivedAnalytics!==true)return false;
    return mode==='synthetic'?r.synthetic===true:r.synthetic!==true&&/^https:\/\//.test(r.reference);
  }
  function quote(raw,instrument,mode,now){
    const issues=[];
    if(!obj(raw))return {valid:false,issues:['시세 객체 없음'],quote:null};
    if(!same(raw,instrument))issues.push('종목·시장·통화 불일치');
    if(!pos(raw.price))issues.push('가격은 1e-9~1e12 범위의 양수 숫자여야 함');
    if(!txt(raw.source)||!txt(raw.originId)||!txt(raw.reference))issues.push('출처·원천 식별자·원문 참조 없음');
    if(raw.synthetic!==(mode==='synthetic')||mode==='imported'&&/SYNTHETIC|가상|발명/i.test(raw.source||''))issues.push('합성/실제 자료 선언 불일치');
    if(!['realtime','delayed','close'].includes(raw.priceKind))issues.push('가격 유형 미확인');
    if(!['raw','split-adjusted','total-return'].includes(raw.adjustment))issues.push('가격 조정 방식 미확인');
    if(!day(raw.asOfDate)||!before(raw.asOfTime,now)||!before(raw.receivedAt,now))issues.push('기준일·거래소 시각·수신 시각 누락/오류/미래');
    else if(Q.marketDate(raw.asOfTime,instrument.market)!==raw.asOfDate||Date.parse(raw.receivedAt)<Date.parse(raw.asOfTime))issues.push('거래소 기준일 불일치 또는 거래 전 수신');
    if(!rights(raw.rights,mode,now))issues.push('개인 표시·파생 분석 이용 권리의 확인 근거 입력 필요');
    if(raw.priceKind==='realtime'&&raw.rights&&raw.rights.realtime!==true)issues.push('실시간 이용 권한 근거 입력 필요');
    const classification=Q&&Q.classify({kind:raw.priceKind,price:raw.price,market:instrument.market,asOfDate:raw.asOfDate,asOfTime:raw.asOfTime,source:raw.source},now);
    if(classification&&classification.stale)issues.push('시세 기준일이 오래되었거나 유효하지 않음');
    if(raw.priceKind==='realtime'&&classification&&classification.kind!=='realtime')issues.push('실시간 유형이나 거래소 시각이 5분을 초과');
    if(raw.priceKind==='delayed'&&(!num(raw.delayMinutes)||raw.delayMinutes<0||raw.delayMinutes>1440||classification&&classification.ageMinutes<raw.delayMinutes))issues.push('지연 시간 선언 누락/모순');
    if(raw.priceKind==='delayed'&&classification&&classification.kind==='unknown')issues.push('지연 시세 기준시각이 하루 초과');
    const selected={ticker:raw.ticker,market:raw.market,currency:raw.currency,price:raw.price,source:raw.source,originId:raw.originId,reference:raw.reference,asOfDate:raw.asOfDate,asOfTime:raw.asOfTime,receivedAt:raw.receivedAt,priceKind:raw.priceKind,delayMinutes:raw.delayMinutes??null,adjustment:raw.adjustment,synthetic:raw.synthetic,rights:raw.rights,verification:'unverified',classification};
    return {valid:issues.length===0,issues,quote:selected};
  }
  function analyzeQuotes(raw,instrument,mode,now){
    const out={status:'invalid',label:'시세 판단 보류',selected:null,comparison:null,issues:[]};
    if(!Array.isArray(raw)||!raw.length||raw.length>8){out.issues.push('시세 표본은 1~8개 필요');return out;}
    const rows=raw.map(x=>quote(x,instrument,mode,now));
    rows.forEach((r,i)=>r.issues.forEach(s=>out.issues.push('시세 '+(i+1)+': '+s)));
    // Malformed evidence cannot be silently dropped from a comparison.
    if(rows.some(r=>!r.valid))return out;
    const sorted=rows.map(r=>r.quote).sort((a,b)=>Date.parse(b.asOfTime)-Date.parse(a.asOfTime));out.selected=sorted[0];
    out.label=label[out.selected.priceKind]+' · 미검증';out.status='single-source';
    if(sorted.length<2){out.issues.push('단일 원천: 독립 대조 자료 없음');return out;}
    const kinds=new Set(sorted.map(x=>x.priceKind)),adjustments=new Set(sorted.map(x=>x.adjustment)),dates=new Set(sorted.map(x=>x.asOfDate));
    const origins=new Set(sorted.map(x=>x.originId.trim().toLowerCase())),distinctOrigins=origins.size===sorted.length;
    const maxSkewSeconds=(Date.parse(sorted[0].asOfTime)-Date.parse(sorted[sorted.length-1].asOfTime))/1000;
    const lo=Math.min(...sorted.map(x=>x.price)),hi=Math.max(...sorted.map(x=>x.price)),differencePct=(hi/lo-1)*100;
    const comparable=kinds.size===1&&adjustments.size===1&&dates.size===1&&maxSkewSeconds<=(sorted[0].priceKind==='close'?60:30);
    out.comparison={samples:sorted,distinctDeclaredOrigins:distinctOrigins,comparable,maxSkewSeconds,differencePct,tolerancePct:0.5,independenceVerified:false};
    if(!distinctOrigins){out.status='shared-origin';out.issues.push('원천 식별자가 같은 경로는 독립 출처로 세지 않음');}
    else if(!comparable){out.status='incomparable';out.issues.push('시각·가격 유형·조정 방식·기준일이 달라 대조 불가');}
    else if(differencePct>0.5){out.status='conflict';out.issues.push('가격 차이가 허용치 0.5% 초과');}
    else {out.status='consistent-unverified';out.issues.push('선언된 원천 사이 수치 일치만 확인. 독립성·원문·이용권 확인은 별도 필요');}
    return out;
  }
  function analyzeHistory(h,instrument,mode,now){
    const out={status:'missing',points:[],metrics:nullMetrics(),issues:[],warnings:[],provenance:null};
    if(h==null){out.issues.push('OHLCV 자료 없음');return out;}
    out.status='invalid';
    if(!obj(h)){out.issues.push('OHLCV 형식 오류');return out;}
    if(!same(h,instrument)||h.synthetic!==(mode==='synthetic'))out.issues.push('차트 종목·시장·통화·합성 여부 불일치');
    if(h.interval!=='1d'||!['raw','split-adjusted','total-return'].includes(h.adjustment))out.issues.push('일봉 간격과 가격 조정 방식 필요');
    if(mode==='imported'&&[h.source,h.reference,h.calendarSource].some(v=>typeof v==='string'&&/SYNTHETIC|가상|발명|invented/i.test(v)))out.issues.push('합성 OHLCV 출처를 수입 실제 자료로 변경할 수 없음');
    if(!txt(h.source)||!txt(h.reference)||!txt(h.calendarSource))out.issues.push('OHLCV 원천·참조·거래일 달력 출처 필요');
    if(!rights(h.rights,mode,now))out.issues.push('OHLCV 표시·파생 분석 이용 권리 근거 필요');
    if(!before(h.receivedAt,now))out.issues.push('OHLCV 수신 시각 누락/미래');
    if(!Array.isArray(h.bars)||h.bars.length<2||h.bars.length>2000){out.issues.push('일봉은 2~2000개 필요');return out;}
    if(!Array.isArray(h.sessionDates)||h.sessionDates.length!==h.bars.length||h.sessionDates.some((x,i)=>!day(x)||i&&x<=h.sessionDates[i-1]))out.issues.push('명시한 거래일 달력과 봉 개수/순서 불일치');
    h.bars.forEach((b,i)=>{
      const prefix='봉 '+(i+1)+': ';
      if(!obj(b)){out.issues.push(prefix+'객체 아님');return;}
      if(day(b.date)&&[0,6].includes(new Date(b.date).getUTCDay()))out.issues.push(prefix+'주말은 지원하는 KR/US 주식 일봉 거래일이 아님');
      if(!day(b.date)||i&&b.date<=h.bars[i-1]?.date||b.date!==h.sessionDates?.[i])out.issues.push(prefix+'중복·역순·거래일 누락/불일치');
      if(!['open','high','low','close'].every(k=>pos(b[k]))||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||b.low>b.high)out.issues.push(prefix+'OHLC 가격 범위 불일치');
      if(b.volume!==null&&(!num(b.volume)||b.volume<0||b.volume>1e18))out.issues.push(prefix+'거래량 미상은 null, 알려진 거래량은 0~1e18 필요');
      if(b.closed!==true||!before(b.closeAt,now)||!before(b.availableAt,now)||Date.parse(b.availableAt)<Date.parse(b.closeAt)||Date.parse(h.receivedAt)<Date.parse(b.availableAt))out.issues.push(prefix+'미완성·미래 봉 또는 공표/수신 순서 오류');
      if(ts(b.closeAt)&&Q.marketDate(b.closeAt,instrument.market)!==b.date)out.issues.push(prefix+'거래소 날짜와 마감 시각 불일치');
      if(b.adjustment!==undefined&&b.adjustment!==h.adjustment||b.currency!==undefined&&b.currency!==instrument.currency)out.issues.push(prefix+'조정 방식·통화 혼합');
    });
    if(out.issues.length)return out;
    out.status='valid-input';out.provenance={source:h.source,reference:h.reference,receivedAt:h.receivedAt,adjustment:h.adjustment,calendarSource:h.calendarSource,rights:h.rights,verification:'unverified'};
    out.warnings.push('거래일 달력·기업행사 조정·원천과 권리는 입력 선언이며 독립 확인 아님','가격 수익률은 배당·수수료·세금·환율을 별도로 반영하지 않음','이동평균·RSI·변동성은 관측 설명이며 기업가치·매수 신호가 아님');
    if(h.adjustment==='raw')out.warnings.push('무조정 가격: 분할·병합·배당락은 가격 움직임과 수익률을 왜곡할 수 있음');
    if(h.bars.some(b=>b.volume===null))out.warnings.push('거래량 미상인 관측값이 있음');
    const closes=h.bars.map(b=>b.close),n=closes.length;
    const observedDates=new Set(h.sessionDates);let omittedWeekday=false;
    for(let t=Date.parse(h.sessionDates[0]);t<=Date.parse(h.sessionDates[h.sessionDates.length-1]);t+=86400000){const dt=new Date(t);if(![0,6].includes(dt.getUTCDay())&&!observedDates.has(dt.toISOString().slice(0,10))){omittedWeekday=true;break;}}
    if(omittedWeekday)out.warnings.push('평일 누락: 공식 휴장일 확인 전 연환산 변동성을 보류. 이동평균·RSI는 남은 관측 순서 기준');
    const sma=(i,k)=>i+1<k?null:closes.slice(i+1-k,i+1).reduce((s,x)=>s+x,0)/k;
    out.points=h.bars.map((b,i)=>({date:b.date,close:b.close,volume:b.volume,sma20:sma(i,20),sma50:sma(i,50)}));
    let peak=closes[0],mdd=0;closes.forEach(x=>{peak=Math.max(peak,x);mdd=Math.max(mdd,(1-x/peak)*100);});
    const returns=closes.slice(1).map((x,i)=>Math.log(x/closes[i]));let vol=null;
    if(returns.length>=20&&!omittedWeekday){const mean=returns.reduce((s,x)=>s+x,0)/returns.length;vol=Math.sqrt(returns.reduce((s,x)=>s+(x-mean)**2,0)/(returns.length-1))*Math.sqrt(252)*100;}
    let rsi=null;
    if(n>=15){let gain=0,loss=0;for(let i=1;i<=14;i++){const delta=closes[i]-closes[i-1];gain+=Math.max(0,delta)/14;loss+=Math.max(0,-delta)/14;}for(let i=15;i<n;i++){const delta=closes[i]-closes[i-1];gain=(gain*13+Math.max(0,delta))/14;loss=(loss*13+Math.max(0,-delta))/14;}rsi=gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss);}
    out.metrics={returnPct:(closes[n-1]/closes[0]-1)*100,maxDrawdownPct:mdd,annualizedVolatilityPct:vol,rsi14:rsi};
    out.metricMethod={return:'첫 종가 대비 마지막 종가',maxDrawdown:'입력 종가 표본 내 최고점 대비 하락률',volatility:'일별 로그수익률 표본 표준편차 × sqrt(252), 최소 20 수익률, 평일 누락 시 보류' ,rsi:'Wilder 14, 최소 15 종가; 완전 횡보 50'};
    return out;
  }
  function analyzePack(input,now){
    const out={version:VERSION,status:'invalid',mode:null,instrument:null,quote:{status:'invalid',label:'판단 보류',selected:null,comparison:null,issues:[]},chart:{status:'missing',points:[],metrics:nullMetrics(),issues:[],warnings:[]},valuation:null,issues:[],notice:NOTICE};
    let p;try{const serialized=JSON.stringify(input);if(!serialized||serialized.length>1000000)throw Error();p=JSON.parse(serialized);}catch(_){out.issues.push('1 MB 이내 직렬화 가능한 JSON 객체 필요');return out;}
    if(!Q||!V||!obj(p)||p.version!==1||!['synthetic','imported'].includes(p.mode)||!id(p.instrument)||!ts(now)){out.issues.push('버전·모드·종목·시장·통화·분석시각 또는 모듈 오류');return out;}
    out.mode=p.mode;out.instrument={ticker:p.instrument.ticker,market:p.instrument.market,currency:p.instrument.currency};
    out.quote=analyzeQuotes(p.quotes,p.instrument,p.mode,now);out.chart=analyzeHistory(p.history,p.instrument,p.mode,now);
    if(p.valuationDocument!=null){
      const d=p.valuationDocument,q=out.quote.selected,price=obj(d)&&d.observations&&d.observations.price;
      if(!obj(d)||!same(d,p.instrument)||d.synthetic!==(p.mode==='synthetic')||!q||!price||price.value!==q.price||price.unit!==q.currency+'/share'||price.asOf!==q.asOfDate||price.period?.kind!=='instant'||price.period?.end!==q.asOfDate||!['consistent-unverified','single-source'].includes(out.quote.status))out.issues.push('재무 문서와 선택 시세의 종목·통화·가격·기준일·합성 여부 불일치 또는 시세 대조 충돌: 가치 분석 보류');
      else {
        // Imported quote claims never become verified simply because JSON says so.
        if(p.mode==='imported')price.verification='unverified';
        out.valuation=V.analyze(d,now);
        if(p.mode==='imported')out.issues.push('수입 자료 시세의 독립 검증 전이므로 가격 가치 비교·매수 판단은 보류. 재무 검증 표시는 입력자 선언임');
      }
    }
    if(p.secFacts!=null){
      if(!S||!same(p.secFacts.instrument,p.instrument)||p.secFacts.mode!==p.mode)out.issues.push('SEC 자료와 작업대 종목·모드 불일치: 공시 초안 선택 보류');
      else out.secFacts=S.select(p.secFacts,new Date(now).toISOString());
    }
    out.status=out.quote.status==='invalid'&&out.chart.status!=='valid-input'?'invalid':'preview';
    if(p.mode==='synthetic')out.issues.push('발명된 합성 자료: 실제 기업·시세 또는 투자 판단 아님');
    return out;
  }
  return Object.freeze({VERSION,analyzePack});
});
