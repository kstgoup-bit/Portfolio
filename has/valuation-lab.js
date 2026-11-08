/* Independent offline workbench. Deliberately no network, storage, or portfolio imports. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const sectors = { technology: '기술·소프트웨어', financial: '금융', semiconductor: '반도체', industrial: '산업재', 'loss-growth': '적자 성장기업', etf: 'ETF' };
  const empty = { 'result-body': '아직 분석한 문서가 없습니다. 기업의 질, 가치평가, 심리는 서로 다른 판단입니다.', 'evidence-body': '자료를 분석하면 지지 근거와 반대 근거를 함께 표시합니다.', 'metric-body': '표시할 지표가 없습니다.' };
  const statuses = { ok: '계산 가능', estimated: '추정 포함', missing: '자료 없음', invalid: '입력 오류', unverified: '미검증', stale: '오래된 자료', insufficient: '자료 부족 · 판단 보류', risk: '기업가치 훼손 위험', strong: '우량 조건 충족', mixed: '혼재', 'separate-etf': 'ETF 별도 평가', undervalued: '가정 대비 저평가', fair: '가정 범위 내', overvalued: '가정 대비 고평가', 'fear-signal': '공포 신호 · 매수 신호 아님', observation: '관찰', 'not-applicable': '적용 제외' };
  const printable = value => value == null ? '자료 없음' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  function el(tag, text, cls) { const node = document.createElement(tag); if (text !== undefined) node.textContent = printable(text); if (cls) node.className = cls; return node; }
  function list(parent, values) { const ul = el('ul'); (Array.isArray(values) && values.length ? values : values && typeof values === 'object' && Object.keys(values).length ? Object.entries(values).map(([key, value]) => key + ': ' + printable(value)) : ['제공된 근거 없음']).forEach(v => ul.append(el('li', v))); parent.append(ul); }
  function note(message, error) { $('status').textContent = message; $('status').className = error ? 'error' : ''; }
  function clearResults() { Object.entries(empty).forEach(([id, text]) => $(id).replaceChildren(el('p', text, 'empty'))); }
  function pair(dl, label, value) { dl.append(el('dt', label), el('dd', value)); }
  function render(result) {
    const body = $('result-body'); body.replaceChildren();
    body.append(el('p', (result.synthetic ? 'SYNTHETIC · 합성 시험' : '사용자 입력 문서 · 검증 범위 확인 필요') + ' / ' + printable(result.ticker) + ' / ' + printable(result.sector), 'result-meta'));
    body.append(el('p', '분석 기준: ' + printable(result.asOf) + (result.synthetic ? ' (합성 예시의 고정 시험 시각)' : ''), 'muted'));
    if (result.decision) body.append(el('p', result.decision.label, 'warning'));
    const grid = el('div', undefined, 'summary-grid');
    [['quality', '기업의 질'], ['valuation', '가치평가'], ['sentiment', '시장 심리']].forEach(([key, label]) => {
      const data = result[key] || {}; const card = el('article', undefined, 'signal'); card.dataset.signal = key;
      card.append(el('h3', label), el('p', statuses[data.status] || data.status || '판단 보류', 'value'));
      if (key === 'quality') { card.append(el('p', '정량 가설 점수: ' + printable(data.score) + (data.score == null ? '' : ' / 100')), el('p', '자료 충족도: ' + (typeof data.coverage === 'number' ? Math.round(data.coverage * 100) + '%' : printable(data.coverage))), el('p', '업종 기준: ' + (sectors[data.profile] || printable(data.profile)))); }
      if (key === 'quality' && data.weightStatus) card.append(el('p', data.weightStatus, 'warning'));
      if (key === 'valuation') {
        const fair = data.fairValue;
        card.append(el('p', fair ? '가치 범위: ' + printable(fair.low) + ' ~ ' + printable(fair.high) + ' ' + printable(fair.currency) : '가치 범위: 산출 보류'));
        if (fair) { card.append(el('p', '평가 방법: ' + printable(fair.method))); list(card, fair.assumptions); }
        card.append(el('p', '안전마진: ' + printable(data.safetyMarginPct) + (data.safetyMarginPct == null ? '' : '%')));
        if (Array.isArray(data.stagedPrices) && data.stagedPrices.length) { card.append(el('p', '분할 검토 가격 (주문 아님)')); data.stagedPrices.forEach(stage => { const detail = el('details'); detail.append(el('summary', printable(stage.stage) + '단계: ' + printable(stage.price) + ' ' + printable(stage.currency))); const dl = el('dl'); [['basisPerShare', '주당 가치기초'], ['multiple', '보수적 배수'], ['marketRiskPct', '시장위험 완충 (%)'], ['operatingScenario', '실적 시나리오'], ['marketRiskRationale', '시장위험 근거'], ['invalidation', '무효화 조건'], ['formula', '계산식']].forEach(([key, label]) => pair(dl, label, stage[key])); detail.append(dl); card.append(detail); }); }
      }
      if (key === 'sentiment') { card.append(el('p', '낙폭 구간: ' + (data.drawdownBand == null ? '자료 없음' : data.drawdownBand === 0 ? '20% 미만' : printable(data.drawdownBand) + '% 이상')), el('p', '낙폭: ' + printable(data.drawdownPct) + (data.drawdownPct == null ? '' : '%')), el('p', '상대강도: ' + printable(data.relativeStrengthPp) + (data.relativeStrengthPp == null ? '' : '%p')), el('p', 'VIX: ' + printable(data.vix))); }
      list(card, data.reasons); grid.append(card);
    }); body.append(grid);
    if (result.warnings && result.warnings.length) { const warning = el('div', undefined, 'warning'); warning.append(el('strong', '자료·판단 주의사항')); list(warning, result.warnings); body.append(warning); }
    if (result.notice) body.append(el('p', result.notice, 'muted'));
    const evidence = $('evidence-body'); evidence.replaceChildren();
    [['facts', '입력된 공시 사실 (원문 대조 필요)'], ['calculated', '계산된 수치'], ['interpretation', '해석과 판단'], ['uncertainties', '불확실성과 반대 근거'], ['investorChecks', '투자자 추가 확인사항']].forEach(([key, title], index) => {
      const detail = el('details'); detail.dataset.evidence = key; detail.open = index === 0; detail.append(el('summary', (index + 1) + '. ' + title)); list(detail, (result.narrative || {})[key]); evidence.append(detail);
    });
    const metrics = $('metric-body'); metrics.replaceChildren();
    Object.entries(result.metrics || {}).forEach(([id, metric]) => {
      const card = el('article', undefined, 'metric'); card.dataset.metric = id;
      const head = el('div', undefined, 'metric-head'); head.append(el('strong', metric.label || id), el('span', statuses[metric.status] || metric.status, 'tag')); card.append(head);
      const dl = el('dl'); pair(dl, '값', printable(metric.value) + (metric.value == null ? '' : ' ' + printable(metric.unit))); pair(dl, '계산식', metric.formula); pair(dl, '판정 이유', metric.reason); card.append(dl);
      const details = el('details'); details.append(el('summary', '입력값 출처·기준일'));
      if (!metric.inputs || !metric.inputs.length) details.append(el('p', '출처 입력 없음', 'muted'));
      (metric.inputs || []).forEach(input => { const source = el('dl'); [['field', '입력 항목'], ['source', '출처'], ['asOf', '기준일'], ['period', '대상 기간'], ['unit', '단위'], ['basis', '회계 기준'], ['verification', '검증 상태']].forEach(([key, label]) => pair(source, label, input[key])); details.append(source); });
      card.append(details); metrics.append(card);
    });
    if (!metrics.children.length) metrics.append(el('p', '계산 가능한 지표가 없습니다.', 'empty'));
  }
  Object.entries(sectors).forEach(([value, label]) => { const option = el('option', 'SYNTHETIC · ' + label); option.value = value; $('sample').append(option); });
  $('load-sample').addEventListener('click', () => {
    if (!$('sample').value) { note('먼저 SYNTHETIC 업종 예시를 선택하세요.', true); return; }
    clearResults();
    try { $('document-input').value = JSON.stringify(window.HASValuationFixtures.create($('sample').value), null, 2); note('SYNTHETIC 합성 예시를 불러왔습니다. 문서 분석을 누르세요.'); }
    catch (_) { note('합성 예시를 불러오지 못했습니다. 예시 모듈을 확인하세요.', true); }
  });
  $('document-input').addEventListener('input', () => { clearResults(); note('입력이 바뀌었습니다. 문서 분석을 다시 실행하세요.'); });
  $('analyze').addEventListener('click', () => {
    clearResults();
    try {
      const text = $('document-input').value.trim(); if (!text) throw new Error('분석할 문서를 입력하세요.');
      if (text.length > 1000000) throw new Error('문서는 1,000,000자 이내로 입력하세요.');
      let doc; try { doc = JSON.parse(text); } catch (_) { throw new Error('JSON 형식이 올바르지 않습니다. 따옴표와 쉼표를 확인하세요.'); }
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('문서는 JSON 객체여야 합니다.');
      if (!window.HASValuationEngine) throw new Error('분석 엔진을 불러오지 못했습니다.');
      const now = doc.synthetic === true && window.HASValuationFixtures ? window.HASValuationFixtures.NOW : new Date().toISOString();
      render(window.HASValuationEngine.analyze(doc, now)); note('분석 완료 · 입력 자료만 사용 · 저장 및 외부 전송 없음');
    } catch (error) { clearResults(); note('분석하지 못했습니다: ' + error.message, true); }
  });
  $('reset').addEventListener('click', () => { $('document-input').value = ''; $('sample').value = ''; clearResults(); note('화면 입력·결과를 비웠습니다. 기존 앱 기록은 변경하지 않았습니다.'); });
})();
