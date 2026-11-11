'use strict';
/* 앱의 calcModifiedDietz(portfolio_v5.html)를 코드 그대로 꺼내 실행하고, 손계산 사례 및 독립 기준 구현과 대조한다. 앱 코드는 수정하지 않는다. */
const test = require('node:test'), a = require('node:assert/strict'), fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../portfolio_v5.html'), 'utf8');
const m = /function calcModifiedDietz\(key,\s*startTs,\s*endTs,\s*startVal,\s*endVal\) \{[\s\S]*?\n\}\n/.exec(html); a.ok(m, 'calcModifiedDietz 원문을 찾지 못함');
const R = require('../has/return-assessment.js');
const make = (flows) => new Function('getReturnActivity', 'window', 'HASReturnAssessment', m[0] + '\nreturn calcModifiedDietz;')(() => ({flows,flowAccounts:flows.map(() => 'gen')}), { HASReturnAssessment: R }, R);
const DAY = 86400000, T0 = Date.UTC(2026, 0, 1), T1 = T0 + 100 * DAY;
const close = (x, y, e = 1e-9) => a.ok(Math.abs(x - y) <= e, x + ' vs ' + y);
test('사례1 흐름 없음: 1000→1100 = 10%', () => close(make([])('gen', T0, T1, 1000, 1100), 10));
test('사례2 기간 중간 입금 500: (1600-1000-500)/(1000+500*0.5)=8%', () => close(make([{ ts: T0 + 50 * DAY, amount: 500 }])('gen', T0, T1, 1000, 1600), 8));
test('사례3 4분의 1 지점 출금 -200: (900-1000+200)/(1000-200*0.75)=100/850', () => close(make([{ ts: T0 + 25 * DAY, amount: -200 }])('gen', T0, T1, 1000, 900), 100 / 850 * 100));
test('사례4 마지막 날 입금은 가중치 0: (1500-1000-400)/1000=10%', () => close(make([{ ts: T1, amount: 400 }])('gen', T0, T1, 1000, 1500), 10));
test('사례5 시작 시각 입금은 기간 밖(제외), 종료 이후 입금도 제외', () => { close(make([{ ts: T0, amount: 999 }, { ts: T1 + DAY, amount: 999 }])('gen', T0, T1, 1000, 1100), 10); });
test('사례6 입금만 있고 운용손익 0이면 수익률 0% (입금이 수익으로 잡히지 않음)', () => close(make([{ ts: T0 + 40 * DAY, amount: 300 }])('gen', T0, T1, 1000, 1300), 0));
test('사례7 내부 매수·매도(현금↔주식 전환)는 총자산을 바꾸지 않아 수익률 영향 0', () => close(make([])('gen', T0, T1, 5000, 5000), 0));
test('사례8 환율만 변동: 미국주식 1000달러×1300→1400원, 달러 수익 0% 이어도 원화 수익률 7.6923%', () => close(make([])('gen', T0, T1, 1000 * 1300, 1000 * 1400), (1400 / 1300 - 1) * 100, 1e-9));
test('사례9 환율+주가: 달러 +10%, 환율 +5% → 원화 +15.5%(복리)', () => close(make([])('gen', T0, T1, 1000 * 1000, 1100 * 1050), (1.1 * 1.05 - 1) * 100, 1e-9));
test('경계: 시작 0·음수 종료·기간 역전·분모 0 이하는 null, 확인된 종료 0은 -100%', () => {
  const f = make([]); a.equal(f('gen', T0, T1, 0, 100), null); a.equal(f('gen', T0, T1, 100, 0), -100); a.equal(f('gen', T0, T1, 100, -1), null); a.equal(f('gen', T1, T0, 100, 110), null);
  a.equal(make([{ ts: T0 + DAY, amount: -2000 }])('gen', T0, T1, 1000, 100), null);
});
test('독립 기준 구현과 무작위 대조(고정 시드 300건, 오차 1e-9)', () => {
  let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const ref = (sv, ev, flows, t0, t1) => { let net = 0, wsum = 0; for (const f of flows) { if (f.ts > t0 && f.ts <= t1) { net += f.amount; wsum += f.amount * ((t1 - f.ts) / (t1 - t0)); } } const den = sv + wsum; return den <= 0 ? null : (ev - sv - net) / den * 100; };
  for (let i = 0; i < 300; i++) { const sv = 1000 + Math.floor(rnd() * 9000), ev = 500 + Math.floor(rnd() * 12000), n = Math.floor(rnd() * 4), fl = []; for (let k = 0; k < n; k++) fl.push({ ts: T0 + Math.floor(rnd() * 100) * DAY, amount: Math.floor(rnd() * 2000) - 800 });
    const got = make(fl)('gen', T0, T1, sv, ev), exp = ref(sv, ev, fl, T0, T1); if (exp === null) a.equal(got, null); else close(got, exp, 1e-9); }
});
