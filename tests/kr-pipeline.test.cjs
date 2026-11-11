'use strict';
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const PL = require('../kr-radar/pipeline.js'), SG = require('../kr-radar/signals.js'), CO = require('../kr-radar/cost.js'), IN = require('../kr-radar/integrity.js'), PK = require('../kr-radar/pack.js'), R = require('../kr-radar/rights.js');
const T = '2026-10-29', ok = { value: '시험', status: 'confirmed', source: 'https://example.com/d', checkedAt: T };
const KEYS = ['coverage', 'dailyRegularClose', 'updateTimingDelay', 'adjustmentBasis52w', 'holidayCalendarTimezone', 'sessionSplit', 'corrections', 'benchmarks', 'personalDisplay', 'internalProcessing', 'localCacheRights', 'derivedRetention', 'redistribution', 'cost', 'rateLimit', 'keyHandling'];
const provider = (o = {}) => ({ id: 'syn', role: 'price', markets: ['US'], fields: { ...Object.fromEntries(KEYS.map(k => [k, ok])), ...o } });
const win = (o = {}) => ({ start: '2026-07-29', end: '2026-10-28', returnPct: -22, adjustment: 'adjusted-consistent', currency: 'USD', ...o });
const EV = {
  '권리 확인': () => ({ provider: provider() }),
  '원본 무결성': () => ({ sha256Matches: true, rowCount: 10, expectedRowCount: 10, official: true }),
  '날짜/시장/시간대': () => ({ asOf: '2026-10-28', isTradingDay: true, session: 'regular', timezoneMatches: true }),
  '수정주가 일관성': () => ({ closeBasis: 'adjusted-consistent', highBasis: 'adjusted-consistent', splitInWindow: false }),
  '벤치마크 대조': () => ({ stockWindow: win(), benchWindow: win({ returnPct: -5 }) }),
  '2차 출처 검증': () => ({ independent: true, closeDiffPct: 0.1 }),
  '수동 승인': () => ({ approvedBy: 'user', approvedAt: T, scope: '읽기 전용 파일럿 5+5' }),
  '읽기 전용 활성화': () => ({})
};
const walk = (upto, over = {}) => { let rec = PL.newRecord('MSFT', 'US'); for (const s of PL.STATES.slice(1, PL.STATES.indexOf(upto) + 1)) { const r = PL.advance(rec, over[s] ? over[s]() : EV[s](), { today: T }); if (!r.ok) return { rec: r.record, last: r }; rec = r.record; } return { rec }; };
test('a record walks 8 steps in order with synthetic evidence, then the final activation step is blocked by policy', () => {
  const w = walk('수동 승인'); a.equal(w.rec.state, '수동 승인'); a.equal(w.rec.history.length, 7);
  const f = PL.advance(w.rec, {}, { today: T }); a.equal(f.ok, false); a.match(f.reason, /별도 명시 승인/); a.equal(f.record.state, '수동 승인'); a.equal(PL.isEvaluable(f.record), false);
  a.equal(PL.POLICY.realActivationAllowed, false); a.ok(w.rec.history.every(h => h.realPrice === false)); a.equal(w.rec.actualActiveCount, 0); a.equal(w.rec.realApiRequests, 0);
});
test('steps cannot be skipped and records are immutable', () => {
  const r0 = PL.newRecord('MSFT', 'US'); const r = PL.advance(r0, EV['수동 승인'](), { today: T }); a.equal(r.ok, false); a.equal(r.record.state, '미연결'); a.ok(Object.isFrozen(r0)); a.throws(() => { 'use strict'; r0.state = 'x'; });
  a.equal(r0.history.length, 0);
});
test('each step holds on its own failure condition and records the reason', () => {
  const cases = {
    '권리 확인': { provider: provider({ cost: { ...ok, status: 'unconfirmed', source: null } }) },
    '원본 무결성': { sha256Matches: false, rowCount: 10, expectedRowCount: 10, official: true },
    '날짜/시장/시간대': { ...EV['날짜/시장/시간대'](), isTradingDay: false },
    '수정주가 일관성': { ...EV['수정주가 일관성'](), highBasis: 'unadjusted' },
    '벤치마크 대조': { stockWindow: win(), benchWindow: win({ start: '2026-07-30' }) },
    '2차 출처 검증': { independent: true, closeDiffPct: 2 },
    '수동 승인': { approvedBy: 'claude', approvedAt: T, scope: 'x' }
  };
  for (const [step, ev] of Object.entries(cases)) { const w = walk(step, { [step]: () => ev }); a.equal(w.last.ok, false, step); a.equal(w.rec.state, PL.STATES[PL.STATES.indexOf(step) - 1], step); a.ok(w.rec.hold, step); }
});
test('stale, future, extended-hours, timezone mismatch, split-with-unadjusted and tampered-count all hold', () => {
  const day = o => walk('날짜/시장/시간대', { '날짜/시장/시간대': () => ({ ...EV['날짜/시장/시간대'](), ...o }) }).last;
  a.equal(day({ asOf: '2026-10-20' }).ok, false); a.equal(day({ asOf: '2026-10-30' }).ok, false); a.equal(day({ session: 'after-hours' }).ok, false); a.equal(day({ timezoneMatches: false }).ok, false);
  a.equal(walk('수정주가 일관성', { '수정주가 일관성': () => ({ closeBasis: 'unadjusted', highBasis: 'unadjusted', splitInWindow: true }) }).last.ok, false);
  a.equal(walk('원본 무결성', { '원본 무결성': () => ({ sha256Matches: true, rowCount: 9, expectedRowCount: 10, official: true }) }).last.ok, false);
  a.equal(walk('원본 무결성', { '원본 무결성': () => ({ sha256Matches: true, rowCount: 10, expectedRowCount: 10, official: false }) }).last.ok, false);
});
test('invalidate drops an instrument back to 미연결 (source conflict / correction / terms change)', () => {
  const w = walk('2차 출처 검증'); const r = PL.invalidate(w.rec, '정정공시 발생', T); a.equal(r.state, '미연결'); a.equal(r.history.at(-1).result, '무효화'); a.equal(PL.isEvaluable(r), false);
});
test('drawdown, same-window relative return and drawdown gap stay separate and are never merged', () => {
  const dd = SG.drawdown52w({ close: 70, high52w: 100, highDate: '2026-02-10', asOf: '2026-10-28' }); a.equal(dd.ok, true); a.equal(dd.band, 30); a.ok(Math.abs(dd.pct + 30) < 1e-9);
  const bdd = SG.drawdown52w({ close: 95, high52w: 100, highDate: '2026-09-01', asOf: '2026-10-28' });
  const rep = SG.report({ stock: { close: 70, high52w: 100, highDate: '2026-02-10', asOf: '2026-10-28' }, bench: { close: 95, high52w: 100, highDate: '2026-09-01', asOf: '2026-10-28' }, stockWindow: win(), benchWindow: win({ returnPct: -5 }) });
  a.equal(rep.relative.relativePp, -17); a.equal(rep.drawdownGap.isRelativeReturn, false); a.equal(rep.drawdownGap.peakDatesDiffer, true); a.ok(Math.abs(rep.drawdownGap.gapPp + 25) < 1e-9); a.equal(rep.combinedScore, null);
  a.notEqual(rep.relative.relativePp, rep.drawdownGap.gapPp); a.equal(bdd.band, null);
});
test('relative return is refused for different windows, adjustments, currencies; drawdown refuses bad highs', () => {
  a.equal(SG.relativeReturn(win(), win({ end: '2026-10-27' })).ok, false); a.equal(SG.relativeReturn(win(), win({ adjustment: 'unadjusted' })).ok, false); a.equal(SG.relativeReturn(win(), win({ currency: 'KRW' })).ok, false); a.equal(SG.relativeReturn(win(), null).ok, false);
  a.equal(SG.drawdown52w({ close: 100, high52w: 90, highDate: '2026-02-10', asOf: '2026-10-28' }).ok, false); a.equal(SG.drawdown52w({ close: 80, high52w: 100, highDate: '2025-01-01', asOf: '2026-10-28' }).ok, false);
  a.equal(SG.drawdown52w({ close: 80, high52w: 100, highDate: '2026-02-10', asOf: '2026-10-28' }).band, 20);
});
test('cost scenarios: documented limits, per-provider share, uncertain billing units are flagged', () => {
  const t = CO.scenarioTable(); a.equal(t.length, 8);
  const us200 = t.find(r => r.market === 'US' && r.symbols === 200); a.equal(us200.requestsPerDay, 406); a.equal(us200.requestsPerMonth, 406 * 22); a.equal(us200.fits['twelve-data-basic'].requestsPerDay, 203); a.equal(us200.fits['twelve-data-basic'].fitsDaily, true); a.equal(us200.fits['twelve-data-basic'].minutesAtPerMinuteLimit, 26);
  const kr100 = t.find(r => r.market === 'KR' && r.symbols === 100); a.equal(kr100.fits['fsc-stock-price'].uncertainUnit, true); a.equal(kr100.fits['krx-open-api'].fitsDaily, true);
  a.throws(() => CO.estimate({ symbols: 0 })); a.throws(() => CO.estimate({ symbols: 5, providers: ['nope'] }));
  a.ok(CO.PRICE_POINTS.every(p => /^https:/.test(p.source) && p.unknown.length));
});
test('integrity: a package matches only its own CSV; edited rows, edited hash and example markers are caught', () => {
  const csv = '기준일자,단축코드,ISIN코드,시장구분,종목명\n20261028,ZZ0001,I1,KOSPI,가상A\n20261028,ZZ0002,I2,KOSDAQ,가상B\n', SHA = 'd'.repeat(64);
  const meta = { provider: '금융위원회', datasetName: 'KRX상장종목정보', sourceUrl: 'https://www.data.go.kr/data/15094775/openapi.do', queriedAt: T, licenseNote: '공공누리 4유형' };
  const pkg = PK.buildPackage(csv, meta, { fileSha256: SHA }).pkg;
  const good = IN.verifyPackageAgainstCsv(csv, pkg, SHA); a.equal(good.ok, true); a.equal(good.official, true);
  const rows = JSON.parse(JSON.stringify(pkg)); rows.rows[0].name = '변조'; a.equal(IN.verifyPackageAgainstCsv(csv, rows, SHA).ok, false);
  const hash = JSON.parse(JSON.stringify(pkg)); hash.provenance.sha256 = 'e'.repeat(64); a.equal(IN.verifyPackageAgainstCsv(csv, hash, SHA).ok, false);
  a.equal(IN.verifyPackageAgainstCsv(csv + '20261028,ZZ0003,I3,KOSPI,가상C\n', pkg, SHA).ok, false);
  const fake = PK.buildPackage(csv, { ...meta, provider: '예시(공식 아님)' }, { fileSha256: SHA }).pkg; a.equal(IN.verifyPackageAgainstCsv(csv, fake, SHA).official, false);
  const other = PK.buildPackage(csv, { ...meta, sourceUrl: 'https://example.com/x' }, { fileSha256: SHA }).pkg; a.equal(IN.verifyPackageAgainstCsv(csv, other, SHA).official, false);
  a.equal(IN.verifyPackageAgainstCsv(csv, null, SHA).ok, false);
});
test('stage10 catalog: valid, still zero 후보 적격, new KRX Open API entry, stage9 file untouched', () => {
  const c10 = JSON.parse(fs.readFileSync(path.join(__dirname, '../kr-radar/data/providers-stage10.json'), 'utf8')), c9 = JSON.parse(fs.readFileSync(path.join(__dirname, '../kr-radar/data/providers-stage9.json'), 'utf8'));
  a.deepEqual(R.validate(c10).errors, []); const s = R.summarize(c10, { today: T }); a.deepEqual(s.counts, { '후보 적격': 0, '미확정': 10, '부적격': 2 }); a.equal(c9.providers.length, 11); a.equal(c10.providers.length, 12);
  const ko = c10.providers.find(p => p.id === 'krx-open-api'); a.equal(ko.fields.rateLimit.status, 'confirmed'); a.match(ko.fields.redistribution.value, /비상업/);
  const td = c10.providers.find(p => p.id === 'twelve-data-personal'); a.match(td.fields.adjustmentBasis52w.value, /기본값은 splits/);
  const ms = c10.providers.find(p => p.id === 'massive-individual'); a.equal(ms.fields.internalProcessing.status, 'unconfirmed'); a.match(ms.fields.internalProcessing.value, /표시 용도 전용/);
});
test('new modules have no network, storage, env, timer, order or filesystem access', () => {
  for (const f of ['pipeline.js', 'signals.js', 'cost.js', 'integrity.js']) { const s = fs.readFileSync(path.join(__dirname, '../kr-radar', f), 'utf8'); a.doesNotMatch(s, /\bfetch\s*\(|XMLHttpRequest|WebSocket|require\(['"](node:)?(http|https|net|child_process|fs|crypto)['"]\)|localStorage|sessionStorage|indexedDB|process\.env|setTimeout|setInterval|\/orders?\b/i, f); }
});
