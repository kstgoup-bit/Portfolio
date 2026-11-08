/* Optional bridge into existing HAS watch/decision code. Does not replace historical
 * journals or the later evidence-assessment contract. No persistence or live calls. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./valuation-engine.js'),require('./watch-engine.js'));else root.HASValuationIntegration=factory(root.HASValuationEngine,root.HASWatchEngine);})(typeof globalThis!=='undefined'?globalThis:this,function(V,W){
  'use strict';
  function evaluateWatchedStock(stock, document, ctx, nowISO){
    const result=V.analyze(document,nowISO), issues=[];
    if(!stock||stock.ticker!==result.ticker)issues.push('감시 종목과 재무 문서 종목 불일치');
    const p=result.metrics.price, q=stock&&stock.quote;
    if(!document || !q || q.ticker!==result.ticker || !stock || !['US','KR'].includes(stock.market) || q.market!==stock.market || document.market!==stock.market || (q.market==='US'?q.currency!=='USD':q.currency!=='KRW'))issues.push('종목코드·거래시장·시장 통화의 일치 확인 필요');
    if(!q||typeof q.source!=='string'||!q.source.trim()||p.value===null||q.price!==p.inputs[0].value||q.currency!==document.currency||q.asOfDate!==p.inputs[0].asOf||q.verification!=='independent-verified'||q.synthetic!==result.synthetic)issues.push('시세·재무 문서의 가격/통화/기준일/검증/합성 여부 불일치');
    const safeStock=stock?{...stock}:null;
    let watch=null;
    if(!issues.length){
      const o=document.observations||{};
      safeStock.high52w=result.metrics.drawdown.value!==null?{price:o.high52w.value,asOfDate:o.high52w.asOf,source:o.high52w.source}:null;
      safeStock.returns=result.metrics.relativeStrength.value!==null?{stockPct:o.stockReturn.value,benchPct:o.benchmarkReturn.value,periodDays:(Date.parse(o.stockReturn.period.end)-Date.parse(o.stockReturn.period.start))/86400000,asOfDate:o.stockReturn.asOf,source:o.stockReturn.source}:null;
      safeStock.fundamentals=null; safeStock.thesis=null; // Older loose summary gate must not create a substitute quality verdict.
      watch=W.evaluateStock(safeStock,ctx||{},nowISO);
      if(!watch.dataGate.ok)issues.push(...watch.dataGate.why);
    }
    const decision=issues.length?{code:'insufficient',label:'데이터 부족: 판단 보류'}:result.decision;
    return {analysis:result,watch,decision,issues,execution:'none',notice:'기존 곡소리 감시의 낙폭 신호와 새 재무 분석을 연결합니다. 기존 요약 재무의 ok 판정은 우량기업 판정으로 사용하지 않습니다.'};
  }
  // Review packet for the existing six-topic evidence editor, not an accepted evidence record.
  // It cannot make a plan executable or overwrite referenceValue with a market closing mark.
  function evidenceReviewPacket(analysis){
    const raw=analysis&&analysis.valuation&&analysis.valuation.fairValue;
    const f=raw&&Number.isFinite(raw.low)&&Number.isFinite(raw.high)&&raw.low>0&&raw.high>=raw.low?JSON.parse(JSON.stringify(raw)):null;
    return {kind:'review-required',schemaTarget:'HAS six-topic evidence editor (source unavailable; manual mapping only)',topics:['quality','cashflowDebt','valuation','competitiveThesis','sentiment','contraryCase'],valuation:f?{rangeLow:f.low,rangeHigh:f.high,unit:f.currency+'/share',method:f.method,assumptions:f.assumptions,referenceValue:null}:null,qualityConclusion:null,sourceVerified:false,synthetic:analysis&&analysis.synthetic===true,notice:'계산 범위는 검토용 초안입니다. 기존 근거 평가기에 자동 승인·저장하지 않으며 별도 가치 기준값은 사용자가 확인해야 합니다.'};
  }
  // Bounded input for an existing share-recovery simulator. Do not implement a second simulator.
  function shareRecoveryScenarios(analysis){
    const raw=analysis&&analysis.valuation&&analysis.valuation.fairValue;
    const f=raw&&Number.isFinite(raw.low)&&Number.isFinite(raw.high)&&raw.low>0&&raw.high>=raw.low?JSON.parse(JSON.stringify(raw)):null;
    if(!f)return {status:'unavailable',scenarios:[],reason:'적정가치 범위가 없어 복귀 가격을 만들지 않음'};
    return {status:'manual-transfer-only',scenarios:[{label:'추정 가치 하한',rebuyPrice:f.low,currency:f.currency},{label:'추정 가치 상한',rebuyPrice:f.high,currency:f.currency}],requiredInputs:['최초 우량주 수량','실제 매도 대금','전술적 투자 순수익/손실','세금·수수료','환율','미투자 현금','동기간 계속 보유했을 때 수량·배당·기회비용'],notice:'가치 범위는 미래 재매수가격 예측이 아닙니다. 기존 최신 복귀 시뮬레이터 소스가 없어 자동 연결은 보류합니다. 레버리지 ETF는 일간 재설정·복리·변동성 경로에 따라 손실이 커질 수 있습니다.'};
  }
  return Object.freeze({evaluateWatchedStock,evidenceReviewPacket,shareRecoveryScenarios});
});
