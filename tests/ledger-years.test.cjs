'use strict';
const test = require('node:test'), a = require('node:assert/strict'), fs = require('fs'), path = require('path');
const Y = require('../has/ledger-years.js');
const D = {
  '2025-11': { income: [{ amount: 3000000 }], expense: [{ amount: 1000000 }, { amount: 500 }], invest: [{ amount: 200000 }] },
  '2025-12': { income: [{ amount: 3000000 }], expense: [], invest: [] },
  '2026-10': { income: [{ amount: 8711612 }], expense: [{ amount: 4582004 }], invest: [{ amount: 500000 }] },
  'bad': { income: [{ amount: 99 }] }, '2026-1': { income: [{ amount: 99 }] }, '2026-02': null, '2024-03': { income: [{ amount: 'x' }, null, { amount: 5 }], expense: 7 }
};
test('연도별 합계·잔액·정렬(최신 먼저)', () => {
  const r = Y.summarize(D);
  a.deepEqual(r.map(x => x.year), ['2026', '2025', '2024']);
  a.equal(r[1].income, 6000000); a.equal(r[1].expense, 1000500); a.equal(r[1].invest, 200000); a.equal(r[1].balance, 4799500); a.equal(r[1].months, 2);
  a.equal(r[0].income, 8711612); a.equal(r[0].balance, 8711612 - 4582004 - 500000); a.equal(r[0].months, 1);
  a.equal(r[2].income, 5); a.equal(r[2].expense, 0);
});
test('입력을 바꾸지 않고, 비정상 입력은 빈 결과', () => {
  const s = JSON.stringify(D); Y.summarize(D); a.equal(JSON.stringify(D), s);
  [null, undefined, 5, 'x', [], {}].forEach(v => a.deepEqual(Y.summarize(v), []));
});
test('표시: 올해 펼침·잔액 부호·빈 상태', () => {
  const h = Y.html(Y.summarize(D), '2026');
  a.match(h, /data-year="2026" open/); a.doesNotMatch(h, /data-year="2025" open/); a.match(h, /\+3,629,608원/);
  a.match(Y.html([], '2026'), /기록이 없습니다/);
});
test('저장소·네트워크 쓰기 없음(정적 검사)', () => {
  const s = fs.readFileSync(path.join(__dirname, '../has/ledger-years.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  a.ok(!/setItem|removeItem|clear\(|fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(s));
});
