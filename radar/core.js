/* KST radar: deterministic calculations; no portfolio, key or network access. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KSTRadarCore = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const STORE_KEY = 'kst.radar.state';
  const BACKUP_KEY = 'kst.radar.preRestore';
  const DEFAULTS = Object.freeze({drawdowns: [20, 30, 35, 45], marketUnderperformance: 15, sectorUnderperformance: 10});
  const WEIGHTS = Object.freeze({moat: 25, financial: 20, overreaction: 15, valuation: 20, temporary: 10, catalyst: 10});
  const LABELS = Object.freeze({moat: '사업 경쟁력', financial: '성장·재무건전성', overreaction: '낙폭·과잉반응', valuation: '밸류에이션', temporary: '악재 일시성', catalyst: '회복 촉매'});
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const date = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
  const url = s => {try {return ['https:','http:'].includes(new URL(s).protocol);} catch {return false;}};
  const ticker = s => typeof s === 'string' && /^[A-Z][A-Z0-9.-]{0,14}$/.test(s);
  const copy = v => JSON.parse(JSON.stringify(v));
  function thresholds(value) {
    if (!value || !Array.isArray(value.drawdowns) || value.drawdowns.length !== 4 ||
      value.drawdowns.some((v,i,a) => !finite(v) || v <= 0 || v >= 100 || (i && v <= a[i-1])) ||
      !finite(value.marketUnderperformance) || value.marketUnderperformance <= 0 || value.marketUnderperformance > 100 ||
      !finite(value.sectorUnderperformance) || value.sectorUnderperformance <= 0 || value.sectorUnderperformance > 100) throw new Error('임계치는 0~100 사이이며 낙폭 4개는 오름차순이어야 합니다.');
    return {drawdowns: value.drawdowns.slice(), marketUnderperformance: value.marketUnderperformance, sectorUnderperformance: value.sectorUnderperformance};
  }
  function normalizeUniverse(data) {
    if (data?.schemaVersion !== 1 || !Array.isArray(data.securities)) throw new Error('감시 목록 스키마 오류');
    const seen = new Set();
    return data.securities.map(s => {
      if (!ticker(s.ticker) || seen.has(s.ticker)) throw new Error('중복 또는 잘못된 티커');
      seen.add(s.ticker);
      if (![s.company,s.sector,s.exchange,s.selectionReason].every(v=>typeof v==='string' && v.trim()) ||
        !['active','hold','excluded'].includes(s.status) || !['candidate','verified'].includes(s.reviewStatus) ||
        !(s.lastVerified===null || date(s.lastVerified))) throw new Error('감시 종목 필드 오류');
      if (s.status==='active' && (s.reviewStatus!=='verified' || !date(s.lastVerified) || !url(s.evidenceUrl))) throw new Error('활성 종목은 검증일과 근거가 필요합니다.');
      return copy(s);
    });
  }
  function evaluateSignals(q, rawSettings = DEFAULTS) {
    const settings=thresholds(rawSettings), signals=[], missing=[];
    const metaOK = q && ticker(q.ticker) && date(q.asOf) && q.currency==='USD' && finite(q.close) && q.close>0 && q.timezone==='America/New_York' && q.adjustment==='split-adjusted' && typeof q.source?.name==='string' && url(q.source.url);
    const result={drawdown:null,marketExcess:null,sectorExcess:null,band:null,signals,missing};
    if (!metaOK) {missing.push('종가 기준일·USD·뉴욕 시간·분할 조정·출처 확인 필요');return result;}
    const metadata={asOf:q.asOf,close:q.close,currency:q.currency,timezone:q.timezone,adjustment:q.adjustment,source:copy(q.source)};
    const windowDays=(Date.parse(q.asOf)-Date.parse(q.high52wStart))/86400000;
    if (finite(q.close) && q.close>0 && finite(q.high52w) && q.high52w>=q.close && date(q.high52wStart) && q.high52wEnd===q.asOf && windowDays>=360 && windowDays<=370) {
      result.drawdown=(q.close/q.high52w-1)*100;
      result.band=settings.drawdowns.filter(v=>result.drawdown<=-v+1e-9).at(-1) ?? null;
      if (result.band!==null) signals.push({...metadata,type:'drawdown',value:result.drawdown,threshold:-result.band,windowStart:q.high52wStart,windowEnd:q.high52wEnd});
    } else missing.push('52주 고가·종가 또는 동일 조정 기준의 기간 정보 부족');
    const p=q.performance, days=p && (Date.parse(p.end)-Date.parse(p.start))/86400000;
    if (p && date(p.start) && p.end===q.asOf && days>=80 && days<=100 && p.adjustment===q.adjustment && p.currency===q.currency && p.benchmark==='SPY' && ticker(p.sectorETF) && finite(p.stockPct) && p.stockPct>=-100) {
      for (const [field,prop,setting,type] of [['marketExcess','marketPct','marketUnderperformance','market'],['sectorExcess','sectorPct','sectorUnderperformance','sector']]) {
        if (finite(p[prop]) && p[prop]>=-100) {
          result[field]=p.stockPct-p[prop];
          if (result[field]<=-settings[setting]+1e-9) signals.push({...metadata,type,value:result[field],threshold:-settings[setting],windowStart:p.start,windowEnd:p.end,benchmark:type==='market'?'SPY':p.sectorETF});
        } else missing.push(type==='market'?'S&P 500 비교 데이터 부족':'업종 ETF 비교 데이터 부족');
      }
    } else missing.push('동일 3개월·통화·분할 조정 기준의 상대 수익률 부족');
    return result;
  }
  function evaluateQuality(a, mode = 'real') {
    const flags=Array.isArray(a?.riskFlags)?a.riskFlags.filter(v=>typeof v==='string' && v.trim()):[];
    if (flags.length) return {score:null,classification:'위험 우선 · 보류',flags,reason:'위험 플래그는 총점보다 우선합니다.'};
    const verification=mode==='demo'?'demo':'verified';
    const special={financial:['capitalAdequacy','assetQuality','funding'], 'high-growth':['cashRunway','dilution','unitEconomics']};
    if(a && special[a.rule] && !special[a.rule].every(k=>a.ruleChecks?.[k]===true)) return {score:null,classification:'평가 불가 / 데이터 부족',flags,reason:'금융·고성장 별도 평가 항목 확인이 필요합니다.'};
    if (!a || a.financialDataAvailable!==true || (mode==='real' && a.synthetic===true) || !date(a.asOf) || !['standard','financial','high-growth'].includes(a.rule) || a.verification!==verification ||
      !Object.keys(WEIGHTS).every(k=>finite(a.components?.[k]) && a.components[k]>=0 && a.components[k]<=WEIGHTS[k] && a.claims?.some(c=>c.component===k && typeof c.claim==='string' && c.claim.trim() && url(c.url) && date(c.asOf) && c.verification===verification && typeof c.counterScenario==='string' && c.counterScenario.trim()))) {
      return {score:null,classification:'평가 불가 / 데이터 부족',flags,reason:'검증된 재무·정성 근거가 모두 있어야 점수를 계산합니다.'};
    }
    const score=Object.keys(WEIGHTS).reduce((n,k)=>n+a.components[k],0);
    return {score,classification:score>=85?'최우선 분석':score>=70?'심층 분석':score>=55?'관찰':'보류',flags,reason:mode==='demo'?'가상 근거·가상 점수입니다.':'근거 확인 기준의 분석 우선순위입니다.'};
  }
  function validateSnapshot(data, mode) {
    if (!data || data.schemaVersion!==1 || data.mode!==mode || !Array.isArray(data.quotes) || !Array.isArray(data.assessments)) throw new Error('공급자 응답 스키마 오류');
    const seen=new Set();
    data.quotes.forEach(q=>{if(!ticker(q.ticker)||seen.has(q.ticker))throw new Error('중복 또는 잘못된 시세 티커');seen.add(q.ticker);});
    const aseen=new Set();
    data.assessments.forEach(a=>{if(!ticker(a.ticker)||aseen.has(a.ticker))throw new Error('중복 또는 잘못된 평가 티커');aseen.add(a.ticker);});
    return copy(data);
  }
  // Adapter contract: {id,mode,load({signal}): Promise<Snapshot>}.
  // Real adapter is intentionally absent until provider/licensing/proxy review.
  function fixtureProvider(fetcher, path='./radar/data/demo.json') {
    return {id:'kst-fixed-fixture-v1',mode:'demo',async load({signal}={}){
      const r=await fetcher(path,{signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
      if(!r.ok)throw new Error('데모 파일을 불러오지 못했습니다.');
      return validateSnapshot(await r.json(),'demo');
    }};
  }
  async function collect(provider,{timeoutMs=8000}={}) {
    if (!provider || !['demo','real'].includes(provider.mode) || typeof provider.load!=='function') throw new Error('공급자 인터페이스 오류');
    const controller=new AbortController();let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(()=>provider.load({signal:controller.signal})).then(d=>validateSnapshot(d,provider.mode)),
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('데이터 요청 시간 초과'));},timeoutMs);})
      ]);
    } finally {clearTimeout(timer);}
  }
  function newState(){return {schemaVersion:1,settings:copy(DEFAULTS)};}
  function migrateState(raw) {
    if(!raw || typeof raw!=='object' || ![0,1].includes(raw.schemaVersion)) throw new Error('지원하지 않는 저장 스키마입니다. 원본을 보존합니다.');
    return {schemaVersion:1,settings:thresholds(raw.settings)};
  }
  function loadState(storage) {
    try {const raw=storage.getItem(STORE_KEY);return {state:raw===null?newState():migrateState(JSON.parse(raw)),error:null};}
    catch {return {state:newState(),error:'저장 데이터 읽기 실패: 원본을 보존했습니다. 백업 후 확인해 주세요.'};}
  }
  function saveState(storage,state) {const clean=migrateState(state);storage.setItem(STORE_KEY,JSON.stringify(clean));return clean;}
  function restoreState(storage,text) {
    if(typeof text!=='string'||text.length>100000)throw new Error('복원 파일이 너무 크거나 형식이 올바르지 않습니다.');
    const clean=migrateState(JSON.parse(text));
    const previous=storage.getItem(STORE_KEY);
    // Snapshot before replacing. If backup write fails, do not replace state.
    storage.setItem(BACKUP_KEY,JSON.stringify({schemaVersion:1,savedAt:new Date().toISOString(),previous}));
    saveState(storage,clean);return clean;
  }
  function undoRestore(storage) {
    const b=JSON.parse(storage.getItem(BACKUP_KEY)||'null');
    if(!b || b.schemaVersion!==1)throw new Error('복원 전 사본이 없습니다.');
    if(b.previous===null) {storage.removeItem(STORE_KEY);return newState();}
    const clean=migrateState(JSON.parse(b.previous));saveState(storage,clean);return clean;
  }
  return {STORE_KEY,BACKUP_KEY,DEFAULTS,WEIGHTS,LABELS,thresholds,normalizeUniverse,evaluateSignals,evaluateQuality,validateSnapshot,fixtureProvider,collect,newState,migrateState,loadState,saveState,restoreState,undoRestore};
});
