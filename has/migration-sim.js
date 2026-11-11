/* HAS 20단계 A: 기존 보유 → 투자원장 이전 "미리보기" 시뮬레이터. 순수 함수 — 저장소·네트워크·타이머·앱 연결 없음.
   원칙: 보유 잔고(수량·평균단가)만으로 과거 매매·수수료·환율·세금을 역산해 거래 이력을 만들지 않는다.
   결과는 '기초잔액(이력 미확인)' 기록의 미리보기일 뿐이며 어디에도 저장하지 않는다. 입력은 변경하지 않는다. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASMigrationSim = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var ACCOUNTS = Object.freeze(['gen', 'dom', 'ov', 'pen']);
  var LABEL = Object.freeze({ gen: '일반', dom: '국내', ov: '해외', pen: '연금' });
  var fin = function (x) { return typeof x === 'number' && isFinite(x); };

  /* 앱 보유 필드 → 원장 필드 대응표. status: 직접 / 근사 / 없음 */
  var FIELD_MAP = Object.freeze([
    { app: 'ticker', ledger: 'ticker', status: '직접', note: '종목코드는 그대로. 코드 변경 이력은 앱에 없음(rename 기록 필요).' },
    { app: 'name', ledger: 'name', status: '직접', note: '표시용 이름.' },
    { app: 'quantity', ledger: '기초 수량(opening.qty)', status: '직접', note: '보유 수량만 알 수 있음. 매수·매도 횟수는 모름.' },
    { app: 'avgPrice', ledger: '기초 평균단가(opening.avgLocal)', status: '근사', note: '해당 통화 기준 평균. 수수료 포함 여부는 앱이 기록하지 않아 확인 불가.' },
    { app: '(없음)', ledger: '원화 취득원가', status: '근사', note: '원화 계좌는 수량×평균단가. 해외는 매수 시점 환율이 없어 현재 환율 근사 — 실제 원가와 다를 수 있음.' },
    { app: '(없음)', ledger: '매수일·거래 이력', status: '없음', note: '이력 미확인. 만들어 채우지 않음.' },
    { app: '(없음)', ledger: '수수료·세금·환율(매수 시점)', status: '없음', note: '이력 미확인.' },
    { app: '(없음)', ledger: '실현손익·배당 누계', status: '없음', note: '앱 보유 정보에 없음. 0으로 표시하지 않고 "이력 미확인".' },
    { app: 'currentPrice', ledger: '(원장 필드 아님)', status: '없음', note: '가격은 미검증 표시 대상이며 원장 기록에 넣지 않음.' }
  ]);

  /* 원장 영구 저장 키 설계(설계만 — 이번 단계에서 어디에도 쓰지 않음) */
  var DESIGN = Object.freeze({ proposedKey: 'has_ledger_v1', writtenInThisStage: false, note: '승인 A 전에는 저장하지 않음' });

  function preview(holdings, opts) {
    opts = opts || {};
    var fx = fin(opts.fxUsd) && opts.fxUsd > 0 ? opts.fxUsd : null;
    var out = { ok: true, writes: 0, design: DESIGN, rows: [], excluded: [], warnings: [], accounts: {} };
    if (!holdings || typeof holdings !== 'object') { out.ok = false; out.warnings.push('입력 오류'); return out; }
    var seenId = Object.create(null);
    ACCOUNTS.forEach(function (acc) {
      var list = holdings[acc]; if (list === undefined) return;
      if (!Array.isArray(list)) { out.warnings.push(LABEL[acc] + ' 계좌 형식 오류 — 건너뜀'); return; }
      var seenTicker = Object.create(null), cur = acc === 'ov' ? 'USD' : 'KRW', n = 0;
      list.forEach(function (s, i) {
        var where = LABEL[acc] + '#' + (i + 1);
        if (!s || typeof s !== 'object') { out.excluded.push({ where: where, reason: '형식 오류' }); return; }
        if (!fin(s.quantity) || s.quantity <= 0) { out.excluded.push({ where: where, ticker: String(s.ticker), reason: '수량이 0 이하이거나 없음 — 이전 대상 아님' }); return; }
        var ticker = typeof s.ticker === 'string' ? s.ticker.trim() : '';
        if (!ticker) { out.excluded.push({ where: where, reason: '종목코드 없음' }); return; }
        var notes = [], status = '이력 미확인';
        if (seenTicker[ticker]) { notes.push('같은 계좌에 같은 종목코드가 중복 — 자동 합치지 않음(사용자 확인 필요)'); out.warnings.push(where + ' ' + ticker + ' 중복'); }
        seenTicker[ticker] = true;
        if (s.id !== undefined) { var idk = acc + ':' + String(s.id); if (seenId[idk]) { notes.push('보유 id 중복'); out.warnings.push(where + ' id 중복'); } seenId[idk] = true; }
        var avgOk = fin(s.avgPrice) && s.avgPrice > 0;
        if (!avgOk) notes.push('평균단가 없음 — 원가 계산 불가');
        var costKRWApprox = null;
        if (avgOk) { if (cur === 'KRW') costKRWApprox = s.quantity * s.avgPrice; else if (fx) { costKRWApprox = s.quantity * s.avgPrice * fx; notes.push('원화 원가는 현재 환율 근사(매수 시점 환율 미보관)'); } else notes.push('USD 환율 없음 — 원화 원가 계산 불가'); }
        out.rows.push({ kind: 'opening-balance', account: acc, accountLabel: LABEL[acc], ticker: ticker, name: s.name == null ? '' : String(s.name), qty: s.quantity, currency: cur, avgLocal: avgOk ? s.avgPrice : null, costKRWApprox: costKRWApprox === null ? null : Math.round(costKRWApprox), realizedKRW: null, realizedNote: '이력 미확인', historyStatus: status, notes: notes });
        n++;
      });
      out.accounts[acc] = n;
    });
    return out;
  }
  return Object.freeze({ ACCOUNTS: ACCOUNTS, FIELD_MAP: FIELD_MAP, DESIGN: DESIGN, preview: preview });
});
