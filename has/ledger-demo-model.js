(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASLedgerDemoModel = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
/* HAS (stage19): 실제 앱 안의 "원장 시범 화면"이 쓰는 순수 모델. 합성 거래 → invest/ledger.js(KSTLedger) 계산 → 화면용 행.
   저장소·네트워크·타이머·DOM 접근 없음. 입력은 변경하지 않는다. 실제 보유·수익과 무관한 합성 데이터만 쓴다. */
'use strict';
const BANNER = '시범 화면 · 합성 데이터 · 실제 보유·수익 아님';
const RULES = Object.freeze({
  method: '이동평균법(원화 기준 취득원가)',
  fee: '매수 수수료는 취득원가에 포함, 매도 수수료·세금은 매도대금에서 차감(기록된 금액만 사용, 추정 안 함)',
  currency: 'KRW 또는 USD. USD는 거래마다 입력한 환율(fx)로 그 거래 시점에 원화 환산',
  rounding: '계산은 반올림하지 않음. 화면 표시만 원 단위로 반올림(0.5는 올림). 합계는 반올림 전 값을 더한 뒤 한 번만 반올림'
});
/* 합성 예시 거래. 숫자는 손으로 검산하기 쉽게 골랐다(검산식은 tests/has-ledger-demo.test.cjs). */
const SAMPLE_TRADES = Object.freeze([
  { id: 'g1', type: 'buy', date: '2026-01-05', account: 'gen', ticker: 'SYN-A', name: '합성일반A', currency: 'KRW', qty: 10, price: 10000, fee: 100 },
  { id: 'g2', type: 'buy', date: '2026-02-03', account: 'gen', ticker: 'SYN-A', name: '합성일반A', currency: 'KRW', qty: 10, price: 12000, fee: 100 },
  { id: 'g3', type: 'sell', date: '2026-03-02', account: 'gen', ticker: 'SYN-A', name: '합성일반A', currency: 'KRW', qty: 5, price: 13000, fee: 50, tax: 20 },
  { id: 'g4', type: 'dividend', date: '2026-03-20', account: 'gen', ticker: 'SYN-A', name: '합성일반A', currency: 'KRW', amount: 3000, withholding: 462 },
  { id: 'o1', type: 'buy', date: '2026-01-10', account: 'ov', ticker: 'SYN-B', name: '합성해외B', currency: 'USD', qty: 4, price: 50, fee: 1, fx: 1300 },
  { id: 'o2', type: 'split', date: '2026-02-10', account: 'ov', ticker: 'SYN-B', name: '합성해외B', currency: 'USD', ratio: 2 },
  { id: 'o3', type: 'sell', date: '2026-03-12', account: 'ov', ticker: 'SYN-B', name: '합성해외B', currency: 'USD', qty: 3, price: 30, fee: 1, fx: 1400 },
  { id: 'o4', type: 'dividend', date: '2026-03-25', account: 'ov', ticker: 'SYN-B', name: '합성해외B', currency: 'USD', amount: 2, withholding: 0.3, fx: 1400 }
]);
/* 지원 현황: 거짓으로 "지원"이라 쓰지 않는다. 판정 근거는 invest/ledger.js와 tests/ledger-stage15.test.cjs. */
const SUPPORT = Object.freeze([
  { item: '매수·매도·배당', status: '지원', note: '합성 시험 통과' },
  { item: '주식분할(SPLIT)', status: '지원(엔진)', note: '수량만 비율 곱, 총원가 불변. 보유 없는 종목의 분할은 무시하고 경고. 이 화면 예시 포함' },
  { item: '현금 입출금', status: '부분 지원', note: '수익률 계산용 현금흐름 기록만 처리. 계좌 현금 잔액 원장은 없음 — 이 화면에서 계산하지 않음' },
  { item: '환율', status: '부분 지원', note: '거래마다 입력한 환율만 사용. 환율 기준일 정책·공식 환율 조회는 없음' },
  { item: '환전 거래', status: '미지원', note: '원화↔외화 환전 기록을 처리하지 않음' },
  { item: '계좌 간 이전(TRANSFER)', status: '미지원', note: '원가·취득일 승계를 처리하지 않음' },
  { item: '거래 정정 이력', status: '미지원', note: '중복 id는 병합 또는 충돌 표시만 하고 정정 이력은 남기지 않음' },
  { item: '세금 계산', status: '미지원', note: '기록된 세금만 사용. 해외 양도세는 별도 추정 함수가 있으나 이 화면은 표시하지 않음' }
]);
const won = n => (typeof n === 'number' && isFinite(n) ? Math.round(n) : null);   // Math.round: 0.5는 올림(양수)
function buildModel(trades, L) {
  const res = L.compute(trades.map(t => Object.assign({}, t)), {}), by = {};
  const names = {}; trades.forEach(t => { if (t.name) names[t.account + '|' + t.ticker] = t.name; });
  for (const p of res.positions) {
    const a = by[p.account] || (by[p.account] = { account: p.account, label: L.ACCOUNT_LABEL[p.account], rows: [], sum: { qtyOpenCount: 0, costKRW: 0, realizedKRW: 0, dividendsKRW: 0, feesKRW: 0, taxesKRW: 0 } });
    const row = { ticker: p.ticker, name: names[p.account + '|' + p.ticker] || p.ticker, currency: p.currency, qty: p.qty, avgKRW: p.avgKRW, costKRW: p.costKRW, realizedKRW: p.realizedKRW, dividendsKRW: p.dividendsKRW, feesKRW: p.feesKRW, taxesKRW: p.taxesKRW, calculable: p.calculable, issues: p.issues.slice(),
      basis: [] };
    a.rows.push(row); a.sum.costKRW += p.costKRW; a.sum.realizedKRW += p.realizedKRW; a.sum.dividendsKRW += p.dividendsKRW; a.sum.feesKRW += p.feesKRW; a.sum.taxesKRW += p.taxesKRW; if (p.open) a.sum.qtyOpenCount++;
  }
  // 계산 근거(사람이 읽는 식): 거래마다 한 줄
  const sorted = trades.slice().sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  for (const t of sorted) {
    const a = by[t.account]; if (!a) continue; const row = a.rows.find(r => r.ticker === t.ticker); if (!row) continue; const fx = t.currency === 'USD' ? t.fx : 1, cu = t.currency === 'USD' ? 'USD' : '원';
    if (t.type === 'buy') row.basis.push(t.date + ' 매수 ' + t.qty + '주 × ' + t.price + cu + ' + 수수료 ' + (t.fee || 0) + cu + (fx !== 1 ? ' × 환율 ' + fx : '') + ' → 취득원가에 더함');
    else if (t.type === 'sell') row.basis.push(t.date + ' 매도 ' + t.qty + '주: 매도대금 = ' + t.qty + '×' + t.price + ' − 수수료 ' + (t.fee || 0) + ' − 세금 ' + (t.tax || 0) + cu + (fx !== 1 ? ' × 환율 ' + fx : '') + ', 제거 원가 = 직전 평균단가 × ' + t.qty + ', 실현손익 = 매도대금 − 제거 원가');
    else if (t.type === 'split') row.basis.push(t.date + ' 분할 ×' + t.ratio + ': 수량에 ' + t.ratio + '배, 총원가는 그대로(평균단가 ÷' + t.ratio + ')');
    else if (t.type === 'dividend') row.basis.push(t.date + ' 배당 ' + t.amount + cu + ' − 원천징수 ' + (t.withholding || 0) + cu + (fx !== 1 ? ' × 환율 ' + fx : '') + ' → 세후 배당');
  }
  const accounts = Object.values(by).sort((x, y) => (x.account < y.account ? -1 : 1));
  return { ok: res.ok, errors: res.errors, warnings: res.warnings, accounts, rules: RULES, banner: BANNER, support: SUPPORT, shown: (n) => won(n) };
}
return { BANNER, RULES, SAMPLE_TRADES, SUPPORT, buildModel, won };
});
