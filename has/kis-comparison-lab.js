/* Key-free offline UI. Deliberately no transport, persistence, clipboard or exports. */
(function () {
  'use strict';
  var input = document.getElementById('comparison-input');
  var mode = document.getElementById('comparison-mode');
  function closeMode() { return mode.value === 'officialclose'; }
  function engine() {
    if (mode.value === 'exacttime') return window.HASKISComparison;
    if (closeMode()) return window.HASCloseComparison;
    throw new Error('mode');
  }
  var result = document.getElementById('result');
  var status = document.getElementById('status');
  var statusLabels = {
    agree: '허용 차이 이내: 가격 비교만 일치',
    conflict: '가격 불일치: 확인 필요',
    incomparable: '비교 보류: 조건 또는 정보 확인 필요',
    invalid: '입력 거부: 허용된 합성 JSON만 사용하세요'
  };
  var reasons = {
    'invalid-input': 'JSON 형식, 허용 필드 또는 선택한 모드의 크기 제한을 확인하세요.',
    'missing-source': 'GAS와 KIS 두 가격이 모두 필요합니다.',
    'within-tolerance': '가격 차이가 실험용 기준 0.5% 이내입니다. 정확성 인증이 아닙니다.',
    'price-disagreement': '가격 차이가 실험용 기준 0.5%를 넘습니다.',
    'inconsistent-market': '시장·거래소·통화 조합이 맞지 않습니다.',
    'inconsistent-delaySeconds': '가격 종류와 지연 시간이 맞지 않습니다.',
    'adjusted-close-withheld': '조정 종가는 이 비교에서 보류합니다.',
    'session-not-completed': '거래 세션이 종료되었다는 조건을 충족하지 못했습니다.',
    'calendar-closed': '거래 달력에서 휴장으로 표기된 세션입니다.',
    'calendar-mismatch': '거래 세션과 달력 정보가 맞지 않습니다.',
    'inconsistent-evidence-time': '근거 시각과 거래 세션 조건이 맞지 않습니다.',
    'not-official-close': '공식 종가로 표기되지 않은 가격입니다.',
    'not-regular-session': '정규 거래 세션의 종가가 아닙니다.',
    'not-final': '확정 종가로 표기되지 않은 가격입니다.',
    'unsupported-close-venue': '이 거래소의 종가 비교는 지원하지 않습니다.',
    'unsupported-calendar-session': '이 거래 달력의 세션 유형은 지원하지 않습니다.',
    'calendar-schedule-mismatch': '거래 달력의 종료 시각이 세션 조건과 맞지 않습니다.',
    'missing-close-evidence': '공식·확정 종가라는 근거 표기가 필요합니다. 표기의 진위는 검증하지 않습니다.',
    'close-evidence-mismatch': '종가 근거 표기와 자료 구분이 맞지 않습니다. 근거의 진위는 검증하지 않습니다.',
    'calendar-timezone-mismatch': '거래 달력의 시간대 표기가 거래소와 맞지 않습니다.',
    'calendar-reference-mismatch': '거래 달력의 참조 표기가 자료 구분과 맞지 않습니다. 참조 자료의 진위는 검증하지 않습니다.',
    'calendar-timezone-unavailable': '거래 달력의 시간대를 이 환경에서 확인할 수 없습니다.'
  };
  var fields = {
    ticker: '종목', market: '시장', exchange: '거래소', currency: '통화', priceKind: '가격 종류',
    adjustment: '가격 조정 기준', exchangeTimestamp: '가격 시각', price: '가격', delaySeconds: '지연 시간',
    tradingDate: '거래일', source: '출처', definition: '종가 정의', session: '거래 세션', completion: '종가 확정 상태',
    closeEvidence: '공식·확정 종가 근거 표기', provenance: '근거 구분', upstreamOrigin: '원천', publishedAt: '게시 시각', retrievedAt: '조회 시각', analysisAt: '분석 기준 시각', calendar: '거래 달력',
    'calendar-timeZone': '달력 시간대 표기', 'calendar-reference': '달력 참조 표기', 'calendar-market': '달력 시장', 'calendar-exchange': '달력 거래소', 'calendar-tradingDate': '달력 거래일',
    'calendar-sessionType': '달력 세션 유형', 'calendar-scheduledCloseAt': '달력 종료 시각', 'calendar-provenance': '달력 근거 구분'
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
  mode.addEventListener('change', function () {
    reset();
    document.getElementById('input-label').textContent = closeMode() ? '동일 거래 세션 종가 비교 JSON' : 'GAS + KIS 비교 JSON';
    document.getElementById('mode-help').textContent = closeMode()
      ? '공식 종가로 표기된 같은 거래 세션의 숫자만 비교합니다. 공식성 인증·실시간 확인·출처 독립성·최신성 검증·투자 조언이 아닙니다.'
      : '동일 시각 모드: 가격 시각이 정확히 같아야 합니다. 시각 오차는 허용하지 않습니다.';
    document.getElementById('input-help').textContent = closeMode()
      ? '동일 종목·시장·거래소·통화·가격 조정 기준·거래 세션과 공식 종가 표기가 필요합니다. 조회 시각은 거래 세션을 대신하지 않습니다.'
      : '동일 종목·거래소·통화·가격 종류와 각 가격의 시각이 필요합니다. 같은 값이어도 독립적인 출처라는 뜻은 아닙니다.';
    document.getElementById('result-context').textContent = closeMode()
      ? '동일 거래 세션으로 선언된 종가의 숫자 비교 / 공식성 인증: 없음 / 실연결: 없음'
      : 'GAS: 기존 경로 유지 / KIS: 추가 확인 경로 / 실연결: 없음';
    status.textContent = '모드를 바꾸어 입력과 결과를 지웠습니다. 선택한 모드의 합성 예제를 넣으세요.';
  });
  function item(list, text) {
    var li = document.createElement('li'); li.textContent = text; list.appendChild(li);
  }
  input.addEventListener('input', function () { clear('입력이 바뀌어 이전 결과를 지웠습니다. 다시 분석하세요.'); });
  input.addEventListener('change', function () { clear('입력이 바뀌어 이전 결과를 지웠습니다. 다시 분석하세요.'); });
  document.getElementById('reset').addEventListener('click', reset);
  document.getElementById('example').addEventListener('click', function () {
    clear('합성 예제를 넣었습니다. 실제 시세가 아닙니다.');
    try { var fixtures = closeMode() ? window.HASCloseComparisonFixtures : window.HASKISComparisonFixtures;
      engine();
      input.value = JSON.stringify(fixtures.create('agree'), null, 2); }
    catch (_) { input.value = ''; clear('합성 예제를 불러오지 못했습니다. 입력은 비워 두었습니다.'); }
  });
  document.getElementById('analyze').addEventListener('click', function () {
    clear('');
    try {
      var data = engine().compareJSON(input.value);
      if (!data || !Object.prototype.hasOwnProperty.call(statusLabels, data.status)) throw new Error('contract');
      var list = document.createElement('ul');
      item(list, closeMode() && data.status === 'agree' ? '허용 차이 이내: 선언된 동일 세션 종가의 숫자만 일치' : statusLabels[data.status]);
      item(list, Object.prototype.hasOwnProperty.call(reasons, data.reason) ? reasons[data.reason] : '비교 조건을 확인하세요.');
      if (typeof data.spreadPct === 'number' && Number.isFinite(data.spreadPct) && data.spreadPct >= 0) {
        item(list, '가격 차이: ' + String(data.spreadPct) + '% (낮은 가격 기준)');
      }
      item(list, Object.prototype.hasOwnProperty.call(origins, data.originRelationship) ? origins[data.originRelationship] : origins.unknown);
      item(list, '출처 독립성·최신성·정확성: 미검증 / 투자 신호 사용: 불가');
      result.appendChild(list);
      status.textContent = closeMode() ? '오프라인 종가 숫자 비교 완료. 공식성·독립성·최신성은 인증하지 않습니다.' : '오프라인 분석 완료. GAS는 유지하며 KIS는 추가 비교만 합니다.';
    } catch (_) { clear('분석할 수 없습니다. 비교 모듈과 합성 입력 형식을 확인하세요.'); }
  });
  // Back/forward cache restoration must not revive pasted inputs or stale claims.
  window.addEventListener('pageshow', reset);
  window.addEventListener('pagehide', reset);
})();
