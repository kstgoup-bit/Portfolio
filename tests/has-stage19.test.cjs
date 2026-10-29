'use strict';
/* 19단계: 원장 시범 모델·가격 신뢰도 규칙·앱 수정 범위 시험. 합성 데이터만. */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const L = require('../invest/ledger.js'), M = require('../has/ledger-demo-model.js'), T = require('../has/price-trust.js'), H = require('./lib/has-rename.cjs');
const ROOT = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const STAGE18_HTML_SHA = '8c56ec6bbd78304e7530f52141f3a3184b3b8bee502383203ac861aa35826597';

test('시범 원장: 엔진 결과가 손으로 검산한 독립 기대값과 일치(원화/해외·분할·배당·수수료·세금)', () => {
  // 일반(KRW): 매수 10×10,000+수수료100 / 10×12,000+100 → 원가 220,200, 20주, 평균 11,010. 5주 매도 13,000, 수수료50·세금20 → 대금 64,930, 제거원가 55,050, 실현 9,880. 배당 3,000−462=2,538.
  // 해외(USD): 매수 4×50+1=201 USD ×1300=261,300원. 분할 ×2 → 8주(총원가 불변). 3주 매도 @30, 수수료1 → 89 USD ×1400=124,600원, 제거원가 261,300/8×3=97,987.5, 실현 26,612.5. 배당(2−0.3)×1400=2,380.
  const m = M.buildModel(M.SAMPLE_TRADES, L), g = m.accounts.find(x => x.account === 'gen'), o = m.accounts.find(x => x.account === 'ov'); a.equal(m.ok, true);
  const eq = (x, y) => a.ok(Math.abs(x - y) < 1e-6, x + ' ≠ ' + y);
  eq(g.sum.costKRW, 165150); eq(g.sum.realizedKRW, 9880); eq(g.sum.dividendsKRW, 2538); eq(g.sum.feesKRW, 250); eq(g.sum.taxesKRW, 20); a.equal(g.rows[0].qty, 15); eq(g.rows[0].avgKRW, 11010);
  eq(o.sum.costKRW, 163312.5); eq(o.sum.realizedKRW, 26612.5); eq(o.sum.dividendsKRW, 2380); eq(o.sum.feesKRW, 2700); a.equal(o.rows[0].qty, 5); eq(o.rows[0].avgKRW, 32662.5);
  const r = L.compute(M.SAMPLE_TRADES.map(t => ({ ...t })), {}); a.deepEqual(r.positions.map(p => [p.account, p.ticker, p.qty, p.realizedKRW]), [['gen', 'SYN-A', 15, 9880], ['ov', 'SYN-B', 5, 26612.5]]);
});
test('시범 원장: 화면 표시 반올림(원 단위, 0.5 올림)·합계는 반올림 전 합산', () => {
  a.equal(M.won(26612.5), 26613); a.equal(M.won(32662.5), 32663); a.equal(M.won(9880), 9880); a.equal(M.won(NaN), null); a.equal(M.won(undefined), null);
});
test('시범 원장: 입력(SAMPLE_TRADES)은 계산 중 변경되지 않고 동결되어 있다', () => {
  const before = JSON.stringify(M.SAMPLE_TRADES); M.buildModel(M.SAMPLE_TRADES, L); a.equal(JSON.stringify(M.SAMPLE_TRADES), before); a.ok(Object.isFrozen(M.SAMPLE_TRADES) && Object.isFrozen(M.SUPPORT));
});
test('시범 원장: 오류 입력(초과 매도·환율 없음·중복 id)은 값을 만들지 않고 오류로 보고', () => {
  const over = M.SAMPLE_TRADES.concat([{ id: 'z', type: 'sell', date: '2026-04-01', account: 'gen', ticker: 'SYN-A', currency: 'KRW', qty: 999, price: 1 }]); a.equal(M.buildModel(over, L).ok, false);
  const nofx = M.SAMPLE_TRADES.concat([{ id: 'y', type: 'buy', date: '2026-04-01', account: 'ov', ticker: 'SYN-B', currency: 'USD', qty: 1, price: 1 }]); a.equal(M.buildModel(nofx, L).ok, false);
  a.equal(M.buildModel(M.SAMPLE_TRADES.concat([{ ...M.SAMPLE_TRADES[0] }]), L).ok, false);
});
test('지원 현황: 미지원 항목은 미지원으로, 분할은 엔진 지원으로 정직하게 표시(과장·과소 표기 금지)', () => {
  const s = Object.fromEntries(M.SUPPORT.map(x => [x.item, x.status])); a.equal(s['환전 거래'], '미지원'); a.equal(s['계좌 간 이전(TRANSFER)'], '미지원'); a.equal(s['거래 정정 이력'], '미지원'); a.equal(s['세금 계산'], '미지원');
  a.match(s['주식분할(SPLIT)'], /지원/); a.match(s['현금 입출금'], /부분/); a.match(s['환율'], /부분/);
  a.equal(L.compute([{ id: 's', type: 'buy', date: '2026-01-01', account: 'gen', ticker: 'T', qty: 2, price: 1, currency: 'KRW' }, { id: 't', type: 'split', date: '2026-01-02', account: 'gen', ticker: 'T', ratio: 2 }]).positions[0].qty, 4, '분할이 실제로 동작하므로 미지원이라 쓰면 안 됨');
});
test('정적 보호: 시범 화면 파일은 저장소·IndexedDB·캐시·네트워크·타이머를 쓰지 않는다', () => {
  for (const f of ['has/ledger-demo.js', 'has/ledger-demo-model.js', 'has/price-trust.js', 'has/price-trust-ui.js']) {
    const src = rd(f).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    for (const bad of [/localStorage/, /sessionStorage/, /indexedDB/, /\bcaches\b/, /document\.cookie/, /\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /setInterval|setTimeout/, /\.setItem\s*\(|\.removeItem\s*\(/]) a.ok(!bad.test(src), f + ' ' + bad);
    a.ok(!/has_ledger_v1/.test(src), f + ' 새 저장 키 금지');
  }
});
test('앱 수정 범위 증명: 지금 portfolio_v5.html에서 19단계 연결(13곳)을 되돌리면 18단계 파일과 SHA256 일치', () => {
  a.equal(H.stage18Sha('portfolio_v5.html'), STAGE18_HTML_SHA); a.equal(H.STAGE19.length, 13);
  const now = rd('portfolio_v5.html'), old = H.stage18Text('portfolio_v5.html'); a.ok(now.length > old.length);
});
test('앱 수정 범위: 새 외부 주소·새 저장 키·키 사용 코드를 앱에 추가하지 않았다', () => {
  const now = rd('portfolio_v5.html'), old = H.stage18Text('portfolio_v5.html'), urls = s => (s.match(/https?:\/\/[^\s"'<>)]+/g) || []).sort().join('\n'), keys = s => (s.match(/\b(v5_[A-Za-z0-9_]+|has_[a-z_0-9]+|kst\.[a-z.A-Z0-9_]+)/g) || []).sort().join('\n');
  a.equal(urls(now), urls(old)); a.equal(keys(now), keys(old));
});
test('보호 파일: 서비스워커·매니페스트·백업 모듈·구 화면은 17단계와 바이트 동일', () => {
  const pins = { 'portfolio.html': '97235e2a02feeec84511d9b4caf4c548e47ba37eb229625438acbc15427bfa2d', 'service-worker.js': '77d553efcfc3eb93f65a1f2901de1cf3b6b61b36febd9605053e66db6724dcd8', 'backup/core.js': '8a455cdc0606cce844fbb8d40551c9435d42c49b5d1bceafc8455c11a6e0eb3f', 'backup/ui.js': '88eda5884de2aa42416f4d1eaee4ba32301d6128d9ec9d6f252be408b9b8da24', 'invest/ledger.js': null };
  for (const [f, h] of Object.entries(pins)) if (h) a.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex'), h, f);
});
// ---- 가격 신뢰도 ----
const NOW = '2026-10-29T03:00:00Z';
test('가격 신뢰도: 메타가 없거나 미검증이면 "미검증 가격 · 출처·기준시각 확인 필요", 신호 보류', () => {
  for (const meta of [null, {}, { provider: 'x' }, { verification: 'unverified' }]) { const d = T.describe(meta, NOW); a.match(d.label, /미검증 가격/); a.equal(d.signalHold, true); a.equal(d.severity, 'warn'); }
  a.equal(T.describe({}, NOW).provider, '미확인');
});
test('가격 신뢰도: 오래됨·조회 실패·기업행위 의심·기준일 불일치는 최신처럼 보이지 않고 신호 보류', () => {
  const base = { provider: 'P', marketDate: '2026-10-28', currency: 'USD', priceKind: 'regular-close', verification: 'independent-verified' };
  a.match(T.describe({ ...base, marketDate: '2026-10-01' }, NOW).label, /오래된 가격/); a.match(T.describe({ ...base, status: 'error' }, NOW).label, /조회 실패/); a.match(T.describe({ ...base, status: 'corporate-action-suspected' }, NOW).label, /기업행위/); a.match(T.describe({ ...base, status: 'date-mismatch' }, NOW).label, /기준일 불일치/);
  for (const st of ['error', 'corporate-action-suspected', 'date-mismatch']) a.equal(T.describe({ ...base, status: st }, NOW).signalHold, true);
  a.equal(T.describe({ ...base, marketDate: '2026-10-01' }, NOW).signalHold, true);
});
test('가격 신뢰도: 독립 대조 완료는 공급자·기준일·종류·통화가 모두 있고 최신일 때만, 그래도 "실시간·공식·검증 완료" 문구는 쓰지 않는다', () => {
  const ok = { provider: 'P', marketDate: '2026-10-28', currency: 'USD', priceKind: 'regular-close', verification: 'independent-verified', status: 'ok' };
  const d = T.describe(ok, NOW); a.equal(d.severity, 'ok'); a.equal(d.signalHold, false);
  for (const drop of ['provider', 'marketDate', 'currency', 'priceKind']) a.notEqual(T.describe({ ...ok, [drop]: null }, NOW).severity, 'ok', drop + ' 없으면 ok 불가');
  a.notEqual(T.describe({ ...ok, priceKind: 'unknown' }, NOW).severity, 'ok');
  const all = [null, {}, ok, { ...ok, status: 'error' }, { ...ok, verification: 'manual' }, { ...ok, verification: 'synthetic' }, { ...ok, marketDate: '2026-01-01' }].map(m => T.describe(m, NOW)).map(x => x.label + x.signalNote).join('|');
  a.ok(!/실시간|공식|검증 완료/.test(all), all);
  a.equal(T.describe({ verification: 'manual' }, NOW).signalHold, false); a.match(T.describe({ verification: 'synthetic' }, NOW).label, /실제 가격 아님/);
});
test('가격 신뢰도: 이번 접속 갱신 집계(현금성 DEP_ 제외), 알려진 출처는 미검증으로 표시, 표시는 가격을 바꾸지 않는다', () => {
  const stocks = [{ ticker: 'A', market: 'US' }, { ticker: 'B', market: 'KR' }, { ticker: 'DEP_X', market: 'KR' }], c = T.sessionCounts(stocks, { 'US:A': true }); a.deepEqual(c, { total: 2, refreshed: 1, notRefreshed: 1 });
  const n = T.sourceNotice('gas-jsonp', c, NOW); a.match(n.label, /미검증/); a.ok(n.lines.some(l => /미확인|기록하지 않음/.test(l))); a.ok(n.lines.some(l => /바꾸지 않습니다/.test(l)));
  const frozen = Object.freeze(stocks.map(s => Object.freeze({ ...s }))); T.sessionCounts(frozen, Object.freeze({})); a.deepEqual(Object.keys(T.SCHEMA), ['provider', 'fetchedAt', 'marketDate', 'timezone', 'currency', 'priceKind', 'adjusted', 'verification', 'status', 'errorMessage']);
});
