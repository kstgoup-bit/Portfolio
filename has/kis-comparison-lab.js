/* Key-free offline UI. Deliberately no transport, persistence, clipboard or exports. */
(function () {
  'use strict';
  var input = document.getElementById('comparison-input');
  var result = document.getElementById('result');
  var status = document.getElementById('status');
  var statusLabels = {
    agree: '허용 차이 이내: 가격 비교만 일치',
    conflict: '가격 불일치: 확인 필요',
    incomparable: '비교 보류: 조건 또는 정보 확인 필요',
    invalid: '입력 거부: 허용된 합성 JSON만 사용하세요'
  };
  var reasons = {
    'invalid-input': 'JSON 형식, 허용 필드 또는 크기 제한(8 KiB)을 확인하세요.',
    'missing-source': 'GAS와 KIS 두 가격이 모두 필요합니다.',
    'within-tolerance': '가격 차이가 실험용 기준 0.5% 이내입니다. 정확성 인증이 아닙니다.',
    'price-disagreement': '가격 차이가 실험용 기준 0.5%를 넘습니다.',
    'inconsistent-market': '시장·거래소·통화 조합이 맞지 않습니다.',
    'inconsistent-delaySeconds': '가격 종류와 지연 시간이 맞지 않습니다.'
  };
  var fields = {
    ticker: '종목', market: '시장', exchange: '거래소', currency: '통화', priceKind: '가격 종류',
    adjustment: '가격 조정 기준', exchangeTimestamp: '가격 시각', price: '가격', delaySeconds: '지연 시간'
  };
  Object.keys(fields).forEach(function (key) {
    reasons['missing-' + key] = fields[key] + ' 정보가 필요합니다.';
    reasons['different-' + key] = fields[key] + ' 정보가 서로 다릅니다.';
  });
  var origins = {
    unknown: '출처 관계: 알 수 없음',
    shared: '출처 관계: 동일 원천으로 표기됨. 독립 검증이 아닙니다.',
    'distinct-declared': '출처 관계: 다른 원천으로 표기됨. 독립성은 검증되지 않았습니다.'
  };
  function clear(message) { result.replaceChildren(); status.textContent = message; }
  function reset() { input.value = ''; clear('입력과 결과를 지웠습니다. 실연결은 없습니다.'); }
  function item(list, text) {
    var li = document.createElement('li'); li.textContent = text; list.appendChild(li);
  }
  input.addEventListener('input', function () { clear('입력이 바뀌어 이전 결과를 지웠습니다. 다시 분석하세요.'); });
  input.addEventListener('change', function () { clear('입력이 바뀌어 이전 결과를 지웠습니다. 다시 분석하세요.'); });
  document.getElementById('reset').addEventListener('click', reset);
  document.getElementById('example').addEventListener('click', function () {
    clear('합성 예제를 넣었습니다. 실제 시세가 아닙니다.');
    try { input.value = JSON.stringify(window.HASKISComparisonFixtures.create('agree'), null, 2); }
    catch (_) { input.value = ''; clear('합성 예제를 불러오지 못했습니다. 입력은 비워 두었습니다.'); }
  });
  document.getElementById('analyze').addEventListener('click', function () {
    clear('');
    try {
      var data = window.HASKISComparison.compareJSON(input.value);
      if (!data || !Object.prototype.hasOwnProperty.call(statusLabels, data.status)) throw new Error('contract');
      var list = document.createElement('ul');
      item(list, statusLabels[data.status]);
      item(list, Object.prototype.hasOwnProperty.call(reasons, data.reason) ? reasons[data.reason] : '비교 조건을 확인하세요.');
      if (typeof data.spreadPct === 'number' && Number.isFinite(data.spreadPct) && data.spreadPct >= 0) {
        item(list, '가격 차이: ' + String(data.spreadPct) + '% (낮은 가격 기준)');
      }
      item(list, Object.prototype.hasOwnProperty.call(origins, data.originRelationship) ? origins[data.originRelationship] : origins.unknown);
      item(list, '출처 독립성·최신성·정확성: 미검증 / 투자 신호 사용: 불가');
      result.appendChild(list);
      status.textContent = '오프라인 분석 완료. GAS는 유지하며 KIS는 추가 비교만 합니다.';
    } catch (_) { clear('분석할 수 없습니다. 비교 모듈과 합성 입력 형식을 확인하세요.'); }
  });
  // Back/forward cache restoration must not revive pasted inputs or stale claims.
  window.addEventListener('pageshow', reset);
  window.addEventListener('pagehide', reset);
})();
