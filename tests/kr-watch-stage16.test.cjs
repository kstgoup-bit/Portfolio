'use strict';
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const W = require('../kr-radar/watch-display.js'), TODAY = '2026-10-29';
const ev = (o = {}) => ({ origin: 'real-provider', source: '허가된 공급자(시험)', baseDate: '2026-10-28', queriedAt: '2026-10-29', priceType: 'close', currency: 'USD', delayMinutes: 0, ...o });
const mon = (o = {}) => ({ active: true, approvedBy: 'user', source: '사용자 승인', baseDate: '2026-10-28', queriedAt: '2026-10-29', ...o });
const us = (o = {}) => ({ id: 'MSFT', market: 'US', kind: 'stock', price: ev(), monitoring: mon(), signal: { score: 40, decision: 'HOLD' }, ...o });
test('실제 조회·가격 검증·유효 감시를 모두 만족해야 활성 감시로 센다(기준선 확인)', () => { const r = W.describe(us(), TODAY); a.equal(r.activeMonitoring, true); a.equal(r.verification, 'real-verified'); a.equal(r.priceType, 'close'); a.equal(r.provider, '허가된 공급자(시험)'); a.equal(r.validUntil, '2026-11-01'); a.equal(r.expired, false); a.equal(r.currency, 'USD'); });
test('합성·캐시·미검증·감시 미승인·유효기간 지남·갱신 오류는 활성 감시에 포함되지 않고 따로 센다', () => {
  const items = [us(), us({ id: 'S', price: ev({ isSynthetic: true }) }), us({ id: 'C', price: ev({ origin: 'cache' }) }), us({ id: 'U', price: null, monitoring: null }), us({ id: 'N', monitoring: mon({ approvedBy: 'system' }) }), us({ id: 'E', price: ev({ baseDate: '2026-10-20' }) }), us({ id: 'F', price: ev({ failureReason: '429 요청 제한' }) })];
  const s = W.summarize(items, TODAY); a.equal(s.counts.activeMonitoring, 1); a.equal(s.counts.synthetic, 1); a.equal(s.counts.cache, 1); a.equal(s.counts.unverified >= 2, true); a.equal(s.counts.total, 7);
  const by = id => s.rows.find(r => r.id === id); a.equal(by('C').activeMonitoring, false); a.ok(by('C').reasons.some(x => /캐시/.test(x))); a.equal(by('F').activeMonitoring, false); a.match(by('F').lastError, /429/); a.equal(by('N').activeMonitoring, false); a.equal(by('S').verification, 'synthetic');
});
test('한국 종목은 공식 신원 검증 없이는 활성 감시가 될 수 없음, 미국/한국 따로 집계', () => {
  const kr = { id: '005930', market: 'KR', kind: 'stock', price: ev({ currency: 'KRW' }), monitoring: mon() }; a.equal(W.describe(kr, TODAY).activeMonitoring, false);
  const ok = { ...kr, identity: { origin: 'user-supplied-official', state: 'VERIFIED', source: 'KRX 공식', baseDate: '2026-10-28', queriedAt: '2026-10-29' } }; const s = W.summarize([ok, us()], TODAY); a.equal(s.counts.activeMonitoringKR, 1); a.equal(s.counts.activeMonitoringUS, 1);
});
test('가격 유형: 실시간은 공급자가 밝히고 지연 0분일 때만, 지연이 있으면 지연 시세로 낮춤, 모르면 미확인', () => {
  a.equal(W.describe(us({ price: ev({ priceType: 'realtime', delayMinutes: 0 }) }), TODAY).priceType, 'realtime'); a.equal(W.describe(us({ price: ev({ priceType: 'realtime', delayMinutes: 15 }) }), TODAY).priceType, 'delayed');
  a.equal(W.describe(us({ price: ev({ priceType: undefined }) }), TODAY).priceType, 'unknown'); a.equal(W.describe(us({ price: ev({ priceType: 'delayed' }) }), TODAY).priceTypeLabel, '지연 시세'); a.equal(W.describe(us({ price: null }), TODAY).priceType, 'unknown');
});
test('자료가 없으면 출처·통화를 만들어 내지 않음("출처 없음", "(추정)" 표시)', () => { const r = W.describe({ id: 'X', market: 'US', kind: 'stock' }, TODAY); a.equal(r.provider, '출처 없음'); a.equal(r.currency, 'USD(추정)'); a.equal(r.asOf, null); a.equal(r.validUntil, null); a.equal(r.activeMonitoring, false); a.match(r.signalNote, /신호 표시 없음/); });
test('신호 문구는 투자 판단이 아님을 밝히고 오탐 위험(정지·상폐·실적·기업행위)을 명시, 추천 표현 없음', () => {
  const s = W.summarize([us()], TODAY), txt = s.caveats.join(' '); for (const k of ['투자 판단이 아닙니다', '거래정지', '상장폐지', '실적 악화', '기업행위', '수정주가']) a.ok(txt.includes(k), k); a.doesNotMatch(txt + JSON.stringify(s.rows), /매수하세요|사세요|추천합니다|보장/);
  a.equal(W.describe(us(), TODAY).signalNote, '백테스트 미검증 가설');
});
test('입력은 변경되지 않음, 정적 검사: 네트워크·저장소·시간 접근 없음', () => {
  const it = JSON.parse(JSON.stringify(us())); const before = JSON.stringify(it); W.describe(it, TODAY); a.equal(JSON.stringify(it), before);
  const s = fs.readFileSync(path.join(__dirname, '../kr-radar/watch-display.js'), 'utf8'); for (const w of ['fetch(', 'localStorage', 'setTimeout', 'Date.now', 'new Date()', 'process.']) a.ok(!s.includes(w), w);
});
