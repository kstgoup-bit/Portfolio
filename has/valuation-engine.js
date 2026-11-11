/* HAS value engine. Pure deterministic arithmetic and explicit research hypotheses.
 * No data acquisition, storage, execution or automatic verification. Caller-supplied
 * provenance never becomes proof that this engine independently verified a source. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HASValuationEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 1, DAY = 86400000, MAX_VALUE=1e18, MIN_NONZERO=1e-12;
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const text = x => typeof x === 'string' && x.trim().length > 0;
  const isoDay = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
  const periodOK = p => p && ['instant', 'annual', 'ttm', 'quarter', 'forward12m', 'window'].includes(p.kind) && isoDay(p.end) && (p.kind === 'instant' || isoDay(p.start) && p.start < p.end);
  const duration = p => (Date.parse(p.end) - Date.parse(p.start)) / DAY;
  const annual = p => p && ['annual', 'ttm', 'forward12m'].includes(p.kind) && duration(p) >= 330 && duration(p) <= 380;
  const equalPeriod = (a, b) => a.kind === b.kind && a.start === b.start && a.end === b.end;
  const round = x => { if(!finite(x))return null; const r=Number(x.toFixed(4)); return r===0&&x!==0?x:r; };
  const PROFILES = Object.freeze({
    technology: [['revenueGrowth', 30, 0, 20], ['roic', 25, 5, 20], ['operatingMargin', 20, 0, 30], ['fcfMargin', 15, 0, 20], ['interestCoverage', 10, 1, 10]],
    financial: [['roe', 45, 0, 15], ['revenueGrowth', 20, 0, 10], ['capitalBuffer', 35, 0, 5]],
    semiconductor: [['revenueGrowth', 20, -10, 20], ['roic', 25, 0, 20], ['operatingMargin', 20, 0, 30], ['fcfMargin', 20, -5, 20], ['interestCoverage', 15, 1, 10]],
    industrial: [['revenueGrowth', 20, 0, 15], ['roic', 30, 0, 15], ['operatingMargin', 20, 0, 20], ['fcfMargin', 15, 0, 20], ['interestCoverage', 15, 1, 10]],
    'loss-growth': [['revenueGrowth', 40, 0, 30], ['cashRunway', 40, 6, 36], ['operatingMargin', 20, -50, 0]],
    etf: []
  });
  function analyze(input, nowISO) {
    let d = {};
    try { if(input && typeof input === 'object' && !Array.isArray(input)) d=JSON.parse(JSON.stringify(input)); } catch (_) { d={}; }
    const now = Date.parse(nowISO), validNow = finite(now) && typeof nowISO === 'string' && /T/.test(nowISO);
    const currency = ['USD', 'KRW', 'EUR', 'JPY', 'GBP', 'SYN'].includes(d.currency) ? d.currency : null;
    const sector = Object.prototype.hasOwnProperty.call(PROFILES, d.sector) ? d.sector : 'unknown';
    const obs = d.observations && typeof d.observations === 'object' ? d.observations : {};
    const metrics = {}, checked = {}, warnings = [];
    const syntheticMismatch=d.synthetic!==true && Object.values(obs).some(o=>o&&typeof o.source==='string'&&/^SYNTHETIC(?:\b|:)/i.test(o.source));
    const schemaOK = !syntheticMismatch && d.version === VERSION && text(d.ticker) && currency && sector !== 'unknown' && validNow && ['equity', 'etf'].includes(d.assetType) && (d.assetType === 'etf') === (sector === 'etf');
    if (!schemaOK) warnings.push('입력 버전·종목·업종·자산유형·통화·분석 시각을 확인하세요. 판단을 보류합니다.');
    const moneyFields = new Set(['revenue','revenuePrev','netIncome','operatingIncome','nopat','averageEquity','averageInvestedCapital','operatingCashFlow','capex','operatingCashFlowPrev','capexPrev','liabilities','equity','debt','cash','ebit','interestExpense']);
    const priceFields = new Set(['price','eps','epsPrev','forwardEPS','bookValuePerShare','normalizedEPS','high52w','nav']);
    const pctFields = new Set(['expectedEPSGrowth','capitalRatio','requiredCapitalRatio','stockReturn','benchmarkReturn','expenseRatio']);
    function expectedUnit(field) { return moneyFields.has(field) ? currency : priceFields.has(field) ? currency + '/share' : pctFields.has(field) ? '%' : ['sharesOutstanding','dilutedShares'].includes(field) ? 'shares' : field === 'vix' ? 'index' : 'x'; }
    function inspect(field) {
      if (checked[field]) return checked[field];
      const o = obs[field]; let status = 'ok', reason = '';
      const fail = (s, r) => { status = s; reason = r; };
      if (!o || typeof o !== 'object') fail('missing', '입력 자료 없음');
      else if (!schemaOK) fail('invalid', '문서의 기본 정보가 유효하지 않음');
      else if (!finite(o.value)) fail('invalid', '유한한 숫자만 허용(문자·누락·NaN 제외)');
      else if (Math.abs(o.value)>MAX_VALUE || o.value!==0&&Math.abs(o.value)<MIN_NONZERO) fail('invalid', '지원 숫자 크기 초과: 절댓값 1e-12~1e18 또는 0만 허용');
      else if (['stockReturn','benchmarkReturn'].includes(field) && o.value < -100 || ['capitalRatio','requiredCapitalRatio','expenseRatio'].includes(field) && (o.value<0||o.value>100)) fail('invalid', '백분율의 허용 범위 위반');
      else if (!text(o.source) || !isoDay(o.asOf) || !periodOK(o.period)) fail('invalid', '출처·기준일·회계기간 누락/오류');
      else if (['liabilities','equity','debt','cash','sharesOutstanding','bookValuePerShare','capitalRatio','requiredCapitalRatio','price','high52w','vix','nav','expenseRatio'].includes(field) && o.period.kind!=='instant') fail('invalid', '재무상태/시장 관측값은 시점 자료가 필요');
      else if (['forwardEPS','expectedEPSGrowth'].includes(field) && o.period.kind!=='forward12m') fail('invalid', '향후 12개월 추정 기간이 필요');
      else if ((moneyFields.has(field)&&!['liabilities','equity','debt','cash'].includes(field)||['eps','epsPrev','dilutedShares','normalizedEPS'].includes(field)) && !['annual','ttm','quarter'].includes(o.period.kind)) fail('invalid', '실적 흐름은 연간/TTM/분기 기간이 필요');
      else if (['stockReturn','benchmarkReturn'].includes(field) && !['window','quarter','annual','ttm'].includes(o.period.kind)) fail('invalid', '수익률 비교기간 필요');
      else if (o.unit !== expectedUnit(field)) fail('invalid', '단위/통화 불일치: 필요 단위 ' + expectedUnit(field));
      else if (['price','high52w','stockReturn','benchmarkReturn','vix','nav'].includes(field) && o.basis !== 'reported') fail('invalid', '시장 관측값은 추정값으로 대체할 수 없음');
      else if (!['reported', 'estimate'].includes(o.basis)) fail('invalid', '실적/추정 구분 없음');
      else if (o.verification !== 'independent-verified') fail('unverified', '입력의 출처 대조가 미확인');
      else if (Date.parse(o.asOf) > now || o.period.kind !== 'forward12m' && Date.parse(o.period.end) > now) fail('invalid', '미래 기준일 또는 미래 실적');
      else if (Date.parse(o.asOf) < Date.parse(o.period.end) && o.period.kind !== 'forward12m') fail('invalid', '기준일이 회계기간 종료보다 빠름');
      else if (o.period.kind === 'quarter' && (duration(o.period) < 65 || duration(o.period) > 110) || ['annual','ttm','forward12m'].includes(o.period.kind) && !annual(o.period)) fail('invalid', '회계기간 길이가 종류와 불일치');
      else if (o.period.kind === 'forward12m' && (o.basis !== 'estimate' || Date.parse(o.period.end) <= now || Date.parse(o.period.end) > now + 410 * DAY || Math.abs(Date.parse(o.period.start)-Date.parse(o.asOf))>45*DAY || Date.parse(o.period.start)<now-45*DAY || Date.parse(o.period.start)>now+31*DAY)) fail('invalid', '향후 12개월 추정 기간 오류');
      else {
        const maxAge = ['price','high52w','stockReturn','benchmarkReturn','vix','nav'].includes(field) ? 4 : field === 'forwardEPS' || field === 'expectedEPSGrowth' || field === 'normalizedEPS' ? 90 : 185;
        if ((now - Date.parse(o.asOf)) / DAY > maxAge) fail('stale', '허용 경과일 초과(' + maxAge + '일)');
        else if (!/Prev$/.test(field) && o.period.kind !== 'forward12m' && (now - Date.parse(o.period.end)) / DAY > (moneyFields.has(field) || priceFields.has(field) && !['price','high52w','nav'].includes(field) || ['sharesOutstanding','dilutedShares'].includes(field) ? 185 : maxAge)) fail('stale', '회계기간/관측기간이 오래됨');
        else if (o.basis === 'estimate') status = 'estimated';
      }
      return (checked[field] = { field, value: ['ok','estimated'].includes(status) ? o.value : null, status, reason, source: o && o.source || null, asOf: o && o.asOf || null, period: o && o.period || null, unit: o && o.unit || null, basis: o && o.basis || null, verification: o && o.verification || null });
    }
    function metric(id, label, fields, unit, formula, fn, compatible) {
      const inputs = fields.map(inspect), bad = inputs.find(x => x.value === null);
      let status = bad ? bad.status : inputs.some(x => x.status === 'estimated') ? 'estimated' : 'ok', reason = bad ? bad.field + ': ' + bad.reason : '', value = null;
      if (!bad) {
        const problem = compatible && compatible(inputs);
        if (problem) { status = 'not-applicable'; reason = problem; }
        else { value = fn(...inputs.map(x => x.value)); if (!finite(value)) { value = null; status = 'not-applicable'; reason = '분모가 0/음수이거나 계산 범위가 유효하지 않음'; } }
      }
      metrics[id] = { label, value: value === null ? null : round(value), unit, status, reason, formula, inputs };
      return metrics[id];
    }
    const same = rows => rows.every(x => equalPeriod(rows[0].period, x.period)) ? null : '계산 항목의 회계기간이 서로 다름';
    const longFlow = rows => !rows.every(x => annual(x.period) && x.period.kind !== 'forward12m') ? '연간/TTM 실적이 필요함(분기 ×4로 대체하지 않음)' : same(rows);
    const ratio = (a, b) => b > 0 ? a / b : NaN;
    const growth = (a, b) => b > 0 ? (a / b - 1) * 100 : NaN;
    const growCompatible = rows => {
      const [a,b] = rows;
      if (a.period.kind !== b.period.kind || !['annual','ttm','quarter'].includes(a.period.kind) || Math.abs(duration(a.period)-duration(b.period)) > 16) return '전년 동기와 회계기간 종류/길이가 다름';
      const delta = (Date.parse(a.period.end)-Date.parse(b.period.end))/DAY;
      return delta < 330 || delta > 400 ? '성장률은 전년 동기 비교만 허용' : null;
    };
    const yearlyPrice = rows => !annual(rows[1].period) || rows[1].period.kind === 'forward12m' ? 'PER은 연간/TTM 이익 필요' : null;
    const spot = rows => rows[0].period.kind !== 'instant' ? '현재 가격은 시점 관측값이어야 함' : null;
    metric('price','현재 가격',['price'],currency + '/share','입력 관측값', x => x > 0 ? x : NaN,spot);
    const etf = d.assetType === 'etf';
    metric('per','PER',['price','eps'],'x','현재 주가 / 희석 EPS(연간 또는 TTM)',ratio,rows => etf ? 'ETF에는 개별 기업 PER을 적용하지 않음' : spot(rows) || yearlyPrice(rows));
    metric('forwardPER','Forward PER',['price','forwardEPS'],'x','현재 주가 / 향후 12개월 추정 희석 EPS',ratio, rows => etf ? 'ETF 별도 평가' : spot(rows) || (rows[1].period.kind !== 'forward12m' || rows[1].basis !== 'estimate' ? '향후 12개월 추정 EPS 필요' : null));
    metric('pbr','PBR',['price','bookValuePerShare'],'x','현재 주가 / 주당 순자산',ratio, rows => etf ? 'ETF 별도 평가' : spot(rows) || (rows[1].period.kind !== 'instant' ? '주당 순자산은 시점 값 필요' : null));
    metric('peg','PEG',['price','forwardEPS','expectedEPSGrowth'],'x','Forward PER / 예상 EPS 성장률(퍼센트 포인트)',(p,e,g) => e>0 && g>0 ? p/e/g : NaN, rows => etf ? 'ETF 별도 평가' : spot(rows) || (rows[1].period.kind !== 'forward12m' || rows[2].basis !== 'estimate' || !equalPeriod(rows[1].period,rows[2].period) ? 'Forward EPS와 동일 기간의 성장 가정 필요' : null));
    metric('roe','ROE',['netIncome','averageEquity'],'%','순이익 / 해당 기간 평균 자본 ×100',(n,e)=>ratio(n,e)*100,longFlow);
    metric('roic','ROIC',['nopat','averageInvestedCapital'],'%','세후영업이익(NOPAT) / 해당 기간 평균 투하자본 ×100',(n,c)=>ratio(n,c)*100,rows=>sector==='financial'?'금융기업 ROIC는 이 모델에서 미적용':longFlow(rows));
    metric('operatingMargin','영업이익률',['operatingIncome','revenue'],'%','영업이익 / 동일 기간 매출 ×100',(n,r)=>ratio(n,r)*100,same);
    metric('netMargin','순이익률',['netIncome','revenue'],'%','순이익 / 동일 기간 매출 ×100',(n,r)=>ratio(n,r)*100,same);
    metric('revenueGrowth','매출 성장률',['revenue','revenuePrev'],'%','(당기 매출 / 전년동기 매출 −1) ×100',growth,growCompatible);
    metric('epsGrowth','EPS 성장률',['eps','epsPrev'],'%','(당기 EPS / 전년동기 EPS −1) ×100',growth,growCompatible);
    metric('operatingCashFlow','영업현금흐름',['operatingCashFlow'],currency,'공시/입력 관측값',x=>x);
    metric('fcf','FCF',['operatingCashFlow','capex'],currency,'영업현금흐름 − 설비투자 지출(양수 입력)',(o,c)=>c>=0?o-c:NaN,same);
    metric('fcfMargin','FCF 마진',['operatingCashFlow','capex','revenue'],'%','FCF / 매출 ×100',(o,c,r)=>c>=0?ratio(o-c,r)*100:NaN,rows=>sector==='financial'?'금융업 FCF 마진 미적용':same(rows));
    metric('fcfGrowth','FCF 성장률',['operatingCashFlow','capex','operatingCashFlowPrev','capexPrev'],'%','(당기 FCF / 전년동기 FCF −1) ×100',(o,c,op,cp)=>c>=0&&cp>=0?growth(o-c,op-cp):NaN, rows=>same(rows.slice(0,2))||same(rows.slice(2))||growCompatible([rows[0],rows[2]]));
    metric('fcfYield','FCF 수익률',['operatingCashFlow','capex','price','sharesOutstanding'],'%','FCF / (현재 주가 × 발행주식수) ×100',(o,c,p,s)=>c>=0&&p>0&&s>0?(o-c)/(p*s)*100:NaN, rows=>sector==='financial'?'은행의 예금/운용 현금흐름을 일반기업 FCF로 평가하지 않음':longFlow(rows.slice(0,2))||spot([rows[2]])||(rows[3].period.kind!=='instant'?'발행주식수는 시점 값 필요':null));
    metric('debtRatio','부채비율',['liabilities','equity'],'%','총부채 / 자기자본 ×100',(l,e)=>l>=0?ratio(l,e)*100:NaN,same);
    metric('netDebt','순부채',['debt','cash'],currency,'이자부부채 − 현금 및 현금성자산',(debt,cash)=>debt>=0&&cash>=0?debt-cash:NaN,same);
    metric('interestCoverage','이자보상배율',['ebit','interestExpense'],'x','EBIT / 이자비용',ratio,longFlow);
    metric('capitalBuffer','자본규제 대비 여유',['capitalRatio','requiredCapitalRatio'],'%p','공시 자본비율 − 해당 관할/기관의 입력된 필요 자본비율',(a,b)=>a>=0&&b>=0?a-b:NaN,rows=>sector!=='financial'?'금융업 전용':same(rows));
    metric('cashRunway','현금 소진 여력',['cash','operatingCashFlow','capex'],'개월','현금 / 월평균 음수 FCF(과거 기간 지속 가정)',(cash,o,c)=>cash>=0&&c>=0&&o-c<0?cash/(-(o-c)/12):NaN,rows=>longFlow(rows.slice(1))|| (rows[0].period.kind!=='instant'?'현금은 시점 값 필요':null));
    metric('drawdown','52주 고점 대비 하락률',['price','high52w'],'%','(1 − 현재가격 / 52주 고점) ×100',(p,h)=>p>0&&h>=p?(1-p/h)*100:NaN,rows=>spot(rows)|| (rows[1].period.kind!=='instant'||rows[0].asOf!==rows[1].asOf?'현재가와 같은 관측일의 52주 고점 필요':null));
    metric('relativeStrength','시장 대비 상대 수익률',['stockReturn','benchmarkReturn'],'%p','동일 기간 종목 수익률 − 비교지수 수익률',(s,b)=>s-b,same);
    metric('vix','VIX',['vix'],'index','입력된 시장 변동성 지수',v=>v>=0?v:NaN);
    metric('navPremium','ETF NAV 대비 프리미엄',['price','nav'],'%','(시장가격 / 주당 NAV −1) ×100',(p,n)=>n>0&&p>0?(p/n-1)*100:NaN, rows=>!etf?'ETF 전용':spot(rows)|| (rows[0].asOf!==rows[1].asOf?'NAV와 가격 기준일 불일치':null));
    metric('expenseRatio','ETF 총보수율',['expenseRatio'],'%','입력된 연간 보수율',v=>v>=0?v:NaN,()=>!etf?'ETF 전용':null);
    // No generic PE target: historical/peer comparables are supplied, dated, sourced research.
    function comparison(key, label) {
      const group = d.comparables && d.comparables[key], p = metrics.per;
      const out = {label,value:null,unit:'%',status:'missing',formula:'(현재 PER / 비교 PER 중앙값 −1) ×100',reason:'동일 회계기준의 비교 집합 없음',inputs:[]};
      if (group && Array.isArray(group.values) && group.values.length >= 3 && group.values.every(v=>finite(v)&&v>=MIN_NONZERO&&v<=MAX_VALUE) && group.basis==='ttm' && inspect('eps').period && inspect('eps').period.kind==='ttm' && text(group.source) && text(group.rationale) && isoDay(group.asOf) && validNow && Date.parse(group.asOf)<=now && now-Date.parse(group.asOf)<=90*DAY && group.verification==='independent-verified' && p.value!==null && !etf) {
        const sorted=group.values.slice().sort((a,b)=>a-b), n=sorted.length, med=n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2;
        Object.assign(out,{value:round((p.value/med-1)*100),status:'estimated',reason:'표본 선택·사이클 차이 영향을 받는 상대 비교',median:med,range:[sorted[0],sorted[n-1]],inputs:[{field:key,source:group.source,asOf:group.asOf,period:{kind:'historical-sample'},unit:'x',basis:'estimate',verification:group.verification}]});
      }
      metrics[key]=out;
    }
    comparison('historicalPER','과거 PER 대비'); comparison('peerPER','동종업계 PER 대비');
    if(etf) Object.keys(metrics).filter(k=>!['price','drawdown','relativeStrength','vix','navPremium','expenseRatio'].includes(k)).forEach(k=>{metrics[k]={...metrics[k],value:null,status:'not-applicable',reason:'ETF는 기초자산과 NAV·추적·구조로 평가하며 개별 기업 지표를 적용하지 않음'};});
    const q = d.qualitative && typeof d.qualitative === 'object' ? d.qualitative : {};
    function qualitative(k) {
      const x=q[k];
      const valid=x && text(x.source)&&text(x.note)&&isoDay(x.asOf)&&validNow&&Date.parse(x.asOf)<=now&&now-Date.parse(x.asOf)<=90*DAY&&x.verification==='independent-verified'&&['intact','deteriorated'].includes(x.status);
      return valid ? {status:x.status,note:x.note,source:x.source,asOf:x.asOf} : {status:'unknown',note:k+' 근거/검증/기준일 미확인'};
    }
    const profiles=PROFILES[sector]||[], missing=profiles.filter(row=>metrics[row[0]].value===null||metrics[row[0]].status==='estimated'), qualKeys=etf?['holdings','tracking','structure']:['competitiveAdvantage','management','thesis','cause'];
    if(sector==='semiconductor') qualKeys.push('cycle'); if(sector==='industrial') qualKeys.push('backlog'); if(sector==='loss-growth') qualKeys.push('growthQuality');
    const qrows=qualKeys.map(qualitative), equity=inspect('equity'), cashflow=metrics.fcf, ic=metrics.interestCoverage, capital=metrics.capitalBuffer, runway=metrics.cashRunway;
    const financialRisk=!etf&&(equity.value!==null&&equity.value<=0 || sector==='financial'&&capital.value!==null&&capital.value<0 || sector!=='financial'&&sector!=='loss-growth'&&ic.value!==null&&ic.value<1 || sector==='loss-growth'&&runway.value!==null&&runway.value<12);
    const healthMissing=!etf&&(equity.value===null||equity.status!=='ok'||(sector!=='financial'&&metrics.debtRatio.value===null));
    if(financialRisk) qrows.push({status:'deteriorated',note:'자본잠식·이자보상·규제자본·현금 소진 중 재무 위험 조건 확인'});
    if(healthMissing) qrows.push({status:'unknown',note:'자본 및 재무건전성 자료 부족'});
    const broken=qrows.some(x=>x.status==='deteriorated'), allQual=qrows.every(x=>x.status==='intact');
    const numericScore=profiles.length&&!missing.length?profiles.reduce((sum,[id,w,lo,hi])=>sum+Math.max(0,Math.min(100,(metrics[id].value-lo)/(hi-lo)*100))*w,0)/profiles.reduce((sum,row)=>sum+row[1],0):null;
    const quality={status:broken?'risk':!schemaOK||missing.length||!allQual?'insufficient':etf?'separate-etf':numericScore>=70?'strong':'mixed',score:numericScore===null?null:round(numericScore),coverage:profiles.length?(profiles.length-missing.length)/profiles.length:0,profile:sector,reasons:qrows.map(x=>x.note),weights:profiles.map(([id,weight,low,high])=>({id,weight,low,high})),weightStatus:'초기 가설·예측력 미검증'};
    const a=d.assumptions&&d.assumptions.valuation, valuation={status:'insufficient',fairValue:null,safetyMarginPct:null,stagedPrices:[],reasons:[]};
    const validAssumption=a&&text(a.source)&&text(a.rationale)&&isoDay(a.asOf)&&validNow&&Date.parse(a.asOf)<=now&&now-Date.parse(a.asOf)<=90*DAY&&finite(a.lowMultiple)&&a.lowMultiple>=MIN_NONZERO&&a.lowMultiple<=1e6&&finite(a.highMultiple)&&a.highMultiple>=a.lowMultiple&&a.highMultiple<=1e6&&finite(a.requiredMarginPct)&&a.requiredMarginPct>=0&&a.requiredMarginPct<100;
    const methods={earnings:'eps',forwardEarnings:'forwardEPS',normalizedEarnings:'normalizedEPS',book:'bookValuePerShare',fcf:null};
    let basis=null;
    if(validAssumption&&Object.prototype.hasOwnProperty.call(methods,a.method)&&!etf){
      if(a.method==='fcf') {const f=metrics.fcf,s=inspect('sharesOutstanding'); if(f.value!==null&&s.value>0&&annual(inspect('operatingCashFlow').period))basis=f.value/s.value;}
      else {const o=inspect(methods[a.method]); const correctPeriod=o.period && (a.method==='book'?o.period.kind==='instant':a.method==='forwardEarnings'?o.period.kind==='forward12m'&&o.basis==='estimate':annual(o.period)&&o.period.kind!=='forward12m'&&(a.method!=='earnings'||o.basis==='reported')); if(o.value>0&&correctPeriod)basis=o.value;}
      if(sector==='financial'&&a.method!=='book'){basis=null;valuation.reasons.push('금융업은 이 초기 모델에서 PBR·ROE·자본비율 기반만 허용');}
      if(sector==='semiconductor'&&a.method!=='normalizedEarnings'){basis=null;valuation.reasons.push('반도체는 출처 있는 정상화 이익 가정이 필요');}
      if(sector==='loss-growth'){basis=null;valuation.reasons.push('적자 성장기업의 적정가치는 이 초기 배수 모델로 제시하지 않음');}
      if(d.earningsFlags&&(!Array.isArray(d.earningsFlags)||d.earningsFlags.length)&&a.method!=='normalizedEarnings'){basis=null;valuation.reasons.push('일시 손익/특별손익 조정 근거와 정상화 이익 필요');}
      if(a.method==='normalizedEarnings'&&(!text(a.normalizationReason)||inspect('normalizedEPS').basis!=='estimate')){basis=null;valuation.reasons.push('정상화 이익의 조정 근거 및 추정 표시 필요');}
      if(basis!==null&&basis>0){
        const low=basis*a.lowMultiple,high=basis*a.highMultiple;
        if(finite(low)&&finite(high)&&low>0){valuation.fairValue={low:round(low),high:round(high),currency,method:a.method,assumptions:{...a},basisPerShare:basis};
          const price=metrics.price.value===null?null:inspect('price').value; valuation.safetyMarginPct=price===null?null:round((1-price/low)*100);
          valuation.status=price===null?'insufficient':price<=low*(1-a.requiredMarginPct/100)?'undervalued':price<=high?'fair':'overvalued';
        }
      }
    }
    if(!valuation.fairValue)valuation.reasons.push(etf?'ETF는 NAV·보유자산·추적오차·레버리지 구조를 별도 평가':'보수적 가치 범위에 필요한 자료/가정 부족');
    // Staged prices require three separately justified stress scenarios, not automatic discounts.
    if(valuation.fairValue&&quality.status==='strong'&&Array.isArray(a.stages)&&a.stages.length===3){
      const stages=a.stages;
      const ok=stages.every((s,i)=>s&&finite(s.basisPerShare)&&s.basisPerShare>0&&s.basisPerShare<=basis&&finite(s.multiple)&&s.multiple>0&&s.multiple<=a.lowMultiple&&finite(s.marketRiskPct)&&s.marketRiskPct>=0&&s.marketRiskPct<100&&text(s.operatingScenario)&&text(s.marketRiskRationale)&&text(s.invalidation));
      if(ok){const prices=stages.map(s=>s.basisPerShare*s.multiple*(1-a.requiredMarginPct/100)*(1-s.marketRiskPct/100)); if(prices.every((p,i)=>finite(p)&&p>0&&(!i||p<prices[i-1]))) valuation.stagedPrices=stages.map((s,i)=>({basisPerShare:s.basisPerShare,multiple:s.multiple,marketRiskPct:s.marketRiskPct,operatingScenario:s.operatingScenario,marketRiskRationale:s.marketRiskRationale,invalidation:s.invalidation,stage:i+1,price:round(prices[i]),currency,formula:'상황별 주당 가치기초 × 보수적 배수 × 안전마진 반영 × 시장위험 완충'}));}
    }
    const dd=metrics.drawdown.value,rs=metrics.relativeStrength.value,vix=metrics.vix.value;
    const sentiment={status:dd===null&&rs===null&&vix===null?'insufficient':vix!==null&&vix>=30||dd!==null&&dd>=30?'fear-signal':'observation',drawdownBand:dd===null?null:dd>=35?35:dd>=30?30:dd>=20?20:0,drawdownPct:dd,relativeStrengthPp:rs,vix,reasons:['낙폭·VIX는 매수 근거가 아니며 구조적 악재를 구별하지 못함',qualitative('cause').note]};
    let code='insufficient',label='데이터 부족: 판단 보류';
    if(schemaOK&&quality.status==='risk'){code='risk';label='기업가치 훼손 우려: 위험 경고';}
    else if(schemaOK&&quality.status==='strong'&&valuation.status==='undervalued'){code='review-buy';label='우량기업·저평가: 분할매수 검토';}
    else if(schemaOK&&quality.status==='strong'&&valuation.status==='fair'){code='observe';label='우량기업·적정가격: 보유 또는 관찰';}
    else if(schemaOK&&quality.status==='strong'&&valuation.status==='overvalued'){code='caution';label='우량기업·고평가: 신규매수 신중';}
    if(schemaOK&&quality.status==='mixed'){code='review-quality';label='기업 품질 추가 검토: 판단 보류';}
    if(d.synthetic===true)warnings.push('모든 수치·기업·평가가 가상 시험입니다. 실제 종목 분석/매매 판단에 사용하지 마세요.');
    const accepted=Object.values(checked).filter(x=>x.value!==null&&(!etf||['price','high52w','stockReturn','benchmarkReturn','vix','nav','expenseRatio'].includes(x.field))), facts=accepted.filter(x=>x.basis==='reported').map(x=>`${x.field}: ${x.value} ${x.unit} | ${x.source} | ${x.asOf} | ${x.period.kind} ${x.period.start||''}~${x.period.end}`);
    const qualityText='품질 해석: '+sector+' 업종의 필수 정량 항목 '+Math.round(quality.coverage*100)+'% 확인, 초기 가설 점수 '+(quality.score===null?'산출 보류':quality.score)+'. 정성·재무 위험을 함께 보며 점수만으로 우량기업을 확정하지 않습니다.';
    const valueText=valuation.fairValue?'입력 가격 '+metrics.price.value+' '+currency+'/share, 추정 가치 '+valuation.fairValue.low+'~'+valuation.fairValue.high+' '+currency+'/share. 하단 대비 안전마진 '+valuation.safetyMarginPct+'%. 배수와 실적 가정이 달라지면 결과도 바뀝니다.':'적정가치 비교에 필요한 자료 또는 업종에 맞는 방법이 없어 가격 매력도를 보류합니다.';
    const calculated=Object.values(metrics).filter(m=>m.value!==null).map(m=>`${m.label}: ${m.value} ${m.unit} (${m.formula}; ${m.status})`);
    const uncertainties=Object.values(metrics).filter(m=>m.value===null).map(m=>m.label+': '+m.reason);
    uncertainties.push('품질 가중치·임계값은 초기 연구 가설이며 수익성 또는 투자성과 검증이 아님','이익 감소·희석·경쟁 격화·금리 상승은 추정 가치를 낮출 수 있음','특별손익 존재 여부·기업행사/분할 조정·주당 지표의 원문 대조는 입력 준비 단계에서 별도 확인 필요','자료의 검증 표시는 입력자가 제공한 계약이며 이 엔진이 원문을 독립 확인했다는 뜻이 아님');
    if(etf)uncertainties.push('ETF 분배금·추적오차·기초자산 가치·세금·환율 및 레버리지의 일간 재설정/경로 의존성을 별도 확인');
    if(!valuation.stagedPrices.length)uncertainties.push('독립된 실적 스트레스와 시장위험 가정 3개가 없어 분할매수 가격을 만들지 않음');
    return {version:VERSION,ticker:text(d.ticker)?d.ticker:null,sector,synthetic:d.synthetic===true,asOf:validNow?nowISO:null,metrics,quality,valuation,sentiment,decision:{code,label},narrative:{facts,calculated,interpretation:[label,qualityText,valueText,'기업 품질과 가격 매력도, 시장 심리는 독립적으로 계산됩니다.',valuation.fairValue?'적정가치는 가정에 따른 추정 범위이며 미래 주가를 보장하지 않습니다.':'가격 하락만으로 적정가치를 추정하지 않습니다.'],uncertainties,investorChecks:['출처 원문·발표일·기간·통화·단위와 특별손익을 직접 확인','반대 시나리오·투자논리 무효화 조건·세금·수수료·환율·자금 여력 검토','최종 투자 결정과 주문은 투자자가 별도로 수행']},warnings,notice:'규칙 기반 의사결정 지원. 외부 AI·시세 API 호출·주문·저장 없음. 입력 출처 표시와 계산 결과를 실제 검증 사실로 혼동하지 마세요.'};
  }
  return Object.freeze({VERSION,PROFILES,analyze});
});
