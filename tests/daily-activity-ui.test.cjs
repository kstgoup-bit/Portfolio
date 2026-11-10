'use strict';
// Synthetic JSDOM only: no network, user storage, actual browser or trading operations.
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), { JSDOM } = require('jsdom');
const B = require('../backup/core.js'), R = require('../has/return-assessment.js');
const html = fs.readFileSync(path.join(__dirname, '../portfolio_v5.html'), 'utf8');
const source = html.slice(html.indexOf('function activityAccountLabel('), html.indexOf('function getDepositsForKey('));
const NOW = Date.parse('2026-11-10T12:00:00Z'), clone = x => JSON.parse(JSON.stringify(x));
function fixture(groups = {}, options = {}) {
  const dom = new JSDOM('<!doctype html><button id="opener">Open</button>', { url: 'https://synthetic.invalid', runScripts: 'outside-only' }), w = dom.window;
  const values = new Map(options.raw === null ? [] : [['v5_deposits', options.raw === undefined ? JSON.stringify(groups) : options.raw]]);
  const state = { writes: [], reads: 0, confirms: [], toasts: [], renders: 0, saveCalls: 0, values };
  const storage = {
    getItem(key) { state.reads++; if (state.onRead) state.onRead(key, state.reads); return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { if (state.quota) throw Error('quota'); state.writes.push([key, value]); values.set(key, String(value)); if (state.afterWrite) state.afterWrite(key, value); }
  };
  Object.defineProperty(w, 'localStorage', { value: storage });
  const NativeDate = w.Date;
  w.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [NOW])); } static now() { return NOW; } };
  w.KSTPortfolioBackup = B; w.HASReturnAssessment = R;
  w.deposits = clone(options.memory || groups);
  w.safeSet = (k, v) => { if (state.blocked) return false; try { storage.setItem(k, v); return true; } catch { return false; } };
  w.save = () => { state.saveCalls++; throw Error('global save forbidden'); };
  w.showToast = (message, bad) => state.toasts.push({ message, bad });
  w.renderAllReturnsTables = () => { state.renders++; };
  w.confirm = message => { state.confirms.push(message); if (state.onConfirm) return state.onConfirm(message); return true; };
  w.eval(source);
  const get = id => w.document.getElementById(id);
  function fill(extra = {}) {
    const data = { kind: 'external-in', mode: 'instant', value: '2026-11-09T14:30:15', amount: '1,250', ...extra };
    get('depositKindInput').value = data.kind; get('depositTimeMode').value = data.mode;
    get('depositTimeMode').dispatchEvent(new w.Event('change'));
    get(data.mode === 'date-only' ? 'depositDateInput' : 'depositDateTimeInput').value = data.value;
    get('depositAmtInput').value = data.amount;
  }
  return { dom, w, state, get, fill, submit: () => get('depositConfirmBtn').click(), read: () => JSON.parse(values.get('v5_deposits') || '{}'), close: () => w.close() };
}
function withFixture(t, groups, options) { const f = fixture(groups, options); t.after(f.close); return f; }

test('all four account entry points describe classified activity rather than deposits alone', t => {
  const dom = new JSDOM(html); t.after(() => dom.window.close());
  const buttons = Array.from(dom.window.document.querySelectorAll('button[onclick]'));
  for (const key of ['dom', 'gen', 'ov', 'pen']) {
    a.equal(buttons.find(el => el.getAttribute('onclick') === "addDeposit('" + key + "')").textContent, '💰 입출금·매매 기록');
    a.equal(buttons.find(el => el.getAttribute('onclick') === "manageDeposits('" + key + "')").textContent, '📝 기록 내역');
  }
});
test('entry requires explicit classification and timing with no guessed defaults', t => {
  const f = withFixture(t, {}); f.w.addDeposit('gen');
  for (const id of ['depositKindInput', 'depositTimeMode', 'depositDateInput', 'depositDateTimeInput', 'depositAmtInput']) a.equal(f.get(id).value, '');
  f.submit(); a.equal(f.state.writes.length, 0); a.match(f.get('depositEntryStatus').textContent, /유형/);
  f.fill({ mode: '', value: '' }); f.submit(); a.equal(f.state.writes.length, 0); a.match(f.get('depositEntryStatus').textContent, /시각 입력 방법/);
  a.match(f.get('depositTimeNote').textContent, /계산을 보류/);
});
test('unknown and inherited-property account names fail closed before reading or opening', t => {
  const f = withFixture(t, {});
  for (const key of ['all', 'constructor', '__proto__', 'toString', '', null, undefined]) {
    a.equal(f.w.activityAccountLabel(key), null); f.w.addDeposit(key); f.w.manageDeposits(key);
  }
  a.equal(f.state.reads, 0); a.equal(f.state.writes.length, 0); a.equal(f.get('depositManageBox'), null); a.equal(f.get('depositInputBox'), null);
});
for (const kind of ['external-in', 'external-out', 'internal-buy', 'internal-sell']) test('explicit ' + kind + ' saves classified positive KRW activity only', t => {
  const old = { ts: 123, amount: 2, kind: 'internal-buy', id: 'old-inert', arbitrary: { keep: true } };
  const f = withFixture(t, { gen: [old], dom: [{ ts: 1, amount: 3 }] }); f.w.addDeposit('gen'); f.fill({ kind }); f.submit();
  const stored = f.read(), row = stored.gen[1]; a.deepEqual(stored.gen[0], old); a.deepEqual(stored.dom, [{ ts: 1, amount: 3 }]);
  a.equal(row.activityVersion, 1); a.equal(row.kind, kind); a.equal(row.amount, 1250); a.equal(row.currency, 'KRW'); a.equal(row.account, 'gen');
  a.equal(row.ts, new Date('2026-11-09T14:30:15').getTime()); a.equal(row.recordedAt, new Date(NOW).toISOString()); a.equal(row.timeCertainty, 'instant');
  a.equal(Object.hasOwn(row, 'effectiveDate'), false); a.equal(R.validateFlows([row], 'gen').ok, true);
  a.deepEqual(f.state.writes.map(v => v[0]), ['v5_deposits']); a.equal(f.state.saveCalls, 0); a.equal(f.state.renders, 1); a.equal(f.get('depositInputBox'), null);
  const parsed = R.validateFlows([row], 'gen').flows[0]; a.equal(parsed.signedAmount, kind.startsWith('internal-') ? 0 : kind === 'external-out' ? -1250 : 1250);
});
test('date-only stores an explicit local day boundary and holds external-flow Dietz', t => {
  const f = withFixture(t, {}); f.w.addDeposit('ov'); f.fill({ mode: 'date-only', value: '2026-11-09' }); f.submit();
  const row = f.read().ov[0], midnight = new Date('2026-11-09T00:00:00');
  const nextMidnight = new Date('2026-11-10T00:00:00');
  a.equal(row.ts, midnight.getTime()); a.equal(row.utcOffsetMinutes, midnight.getTimezoneOffset()); a.equal(row.effectiveDate, '2026-11-09'); a.equal(row.timeCertainty, 'date-only');
  a.equal(row.dateEndTs, nextMidnight.getTime()); a.equal(row.endUtcOffsetMinutes, nextMidnight.getTimezoneOffset());
  a.equal(R.modifiedDietz({ key: 'ov', startTs: row.ts - 1000, endTs: row.ts + 80000000, startVal: 5000, endVal: 6250, flows: [row] }).status, 'hold');
  f.w.manageDeposits('ov'); a.match(f.get('depositManageList').textContent, /2026-11-09 · 시각 미확인/);
});
test('new backdated row appends without sorting or reclassifying old rows, and ignores stale memory', t => {
  const old = [{ ts: NOW - 100, amount: 3 }, { ts: 1, amount: -2, id: 'historical', kind: 'external-in' }];
  const f = withFixture(t, { gen: old, pen: [{ ts: 2, amount: 7 }] }, { memory: { gen: [{ ts: 9, amount: 99999 }] } });
  f.w.addDeposit('gen'); f.fill(); f.submit(); a.deepEqual(f.read().gen.slice(0, 2), old); a.equal(f.read().gen.length, 3);
  a.deepEqual(clone(f.w.deposits), f.read()); a.deepEqual(f.read().pen, [{ ts: 2, amount: 7 }]);
});
test('missing stored group bootstraps only requested account', t => {
  const f = withFixture(t, {}, { raw: null, memory: { gen: [{ ts: 9, amount: 99 }] } }); f.w.addDeposit('dom'); f.fill(); f.submit();
  a.deepEqual(Object.keys(f.read()), ['dom']); a.equal(f.read().dom.length, 1);
});
for (const amount of ['0', '-1', '1e3', '1,23', 'NaN', 'Infinity', '12abc', '9007199254740992', '.5']) test('rejects invalid or unsafe amount ' + amount, t => {
  const f = withFixture(t, {}); f.w.addDeposit('gen'); f.fill({ amount }); f.submit(); a.equal(f.state.writes.length, 0); a.match(f.get('depositEntryStatus').textContent, /금액/);
});
test('accepts an explicit positive fractional KRW amount without silent rounding', t => {
  const f = withFixture(t, {}); f.w.addDeposit('gen'); f.fill({ amount: '1,234.5' }); f.submit(); a.equal(f.read().gen[0].amount, 1234.5);
});
test('invalid dates and future timestamps do not save', t => {
  const f = withFixture(t, {}); f.w.addDeposit('gen'); f.fill({ value: '2099-01-01T12:00:00' }); f.submit(); a.equal(f.state.writes.length, 0);
  a.throws(() => f.w.activityParseTime('date-only', '2026-02-30', NOW), /유효한/);
  a.throws(() => f.w.activityParseTime('instant', '2026-13-01T12:00', NOW), /유효한/);
  a.throws(() => f.w.activityParseTime('instant', '2026-01-01T25:00', NOW), /유효한/);
});
test('New York DST nonexistent and repeated local times are rejected instead of invented', t => {
  if (Intl.DateTimeFormat().resolvedOptions().timeZone !== 'America/New_York') return t.skip('run with TZ=America/New_York');
  const f = withFixture(t, {});
  a.throws(() => f.w.activityParseTime('instant', '2026-03-08T02:30:00', NOW), /존재하지/);
  a.throws(() => f.w.activityParseTime('instant', '2026-11-01T01:30:00', NOW), /두 번/);
});
test('date-only captures actual 23/25-hour DST day boundaries rather than a fixed 24 hours', t => {
  if (Intl.DateTimeFormat().resolvedOptions().timeZone !== 'America/New_York') return t.skip('run with TZ=America/New_York');
  for (const [date, hours, startOffset, endOffset] of [['2026-03-08', 23, 300, 240], ['2026-11-01', 25, 240, 300]]) {
    const f = withFixture(t, {}); f.w.addDeposit('gen'); f.fill({ mode: 'date-only', value: date }); f.submit();
    const row = f.read().gen[0]; a.equal(row.dateEndTs - row.ts, hours * 3600000); a.equal(row.utcOffsetMinutes, startOffset); a.equal(row.endUtcOffsetMinutes, endOffset);
    a.equal(R.validateFlows([row], 'gen').ok, true);
    const result = R.modifiedDietz({ key: 'gen', startTs: row.dateEndTs - 1800000, endTs: row.dateEndTs + 3600000, startVal: 1000, endVal: 2250, flows: [row] });
    a.equal(result.status, 'hold'); a.ok(result.reasons.includes('flow-time-uncertain'));
  }
});
test('repeated button or captured submit handler saves just once', t => {
  const f = withFixture(t, {}); f.w.addDeposit('gen'); f.fill(); const button = f.get('depositConfirmBtn'), submit = button.form.onsubmit;
  button.click(); button.click(); submit({ preventDefault() {} }); a.equal(f.state.writes.length, 1); a.equal(f.read().gen.length, 1);
});
test('cancel nulls old handlers; captured submit remains harmless', t => {
  const f = withFixture(t, {}); f.w.addDeposit('gen'); f.fill(); const form = f.get('depositConfirmBtn').form, submit = form.onsubmit;
  f.get('depositCancelBtn').click(); a.equal(form.onsubmit, null); submit({ preventDefault() {} }); a.equal(f.state.writes.length, 0);
});
test('opening newer dialog, removing old dialog, backdrop and Escape all invalidate stale handlers', t => {
  const f = withFixture(t, {}); f.w.addDeposit('gen'); f.fill(); const old = f.get('depositConfirmBtn').form.onsubmit;
  f.w.addDeposit('dom'); old({ preventDefault() {} }); a.equal(f.state.writes.length, 0); a.match(f.get('depositInputBoxTitle').textContent, /ISA/);
  f.fill(); const removed = f.get('depositConfirmBtn').form.onsubmit; f.get('depositInputBox').remove(); removed({ preventDefault() {} }); a.equal(f.state.writes.length, 0);
  f.w.addDeposit('gen'); f.get('depositInputBox').click(); a.equal(f.get('depositInputBox'), null);
  f.w.addDeposit('gen'); f.w.document.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'Escape' })); a.equal(f.get('depositInputBox'), null);
});
test('concurrent edit before submit is preserved without changing memory', t => {
  const f = withFixture(t, {}); f.w.addDeposit('gen'); f.fill(); const later = JSON.stringify({ gen: [{ ts: 7, amount: 700 }] });
  f.state.values.set('v5_deposits', later); f.submit(); a.equal(f.state.writes.length, 0); a.equal(f.state.values.get('v5_deposits'), later); a.deepEqual(clone(f.w.deposits), {});
  a.match(f.get('depositEntryStatus').textContent, /다른 창/);
});
test('immediate prewrite check catches a change after parsing latest persisted rows', t => {
  const f = withFixture(t, {}); f.w.addDeposit('gen'); f.fill(); const later = JSON.stringify({ dom: [{ ts: 3, amount: 30 }] });
  f.state.onRead = (key, count) => { if (count === 3) f.state.values.set(key, later); }; f.submit();
  a.equal(f.state.writes.length, 0); a.equal(f.state.values.get('v5_deposits'), later); a.deepEqual(clone(f.w.deposits), {});
});
test('postwrite mismatch is uncertain, preserves later storage and does not claim success', t => {
  const f = withFixture(t, {}); f.w.addDeposit('gen'); f.fill(); const later = JSON.stringify({ pen: [{ ts: 4, amount: 40 }] });
  f.state.afterWrite = key => f.state.values.set(key, later); f.submit();
  a.equal(f.state.writes.length, 1); a.equal(f.state.values.get('v5_deposits'), later); a.deepEqual(clone(f.w.deposits), {});
  a.match(f.get('depositEntryStatus').textContent, /완료 여부/); a.equal(f.state.toasts.some(v => /✅/.test(v.message)), false); a.equal(f.get('depositConfirmBtn').disabled, true);
  f.submit(); a.equal(f.state.writes.length, 1);
});
test('postwrite read exception also blocks retry while preserving the successfully written bytes', t => {
  const f = withFixture(t, {}); f.w.addDeposit('gen'); f.fill(); f.state.onRead = (key, count) => { if (count === 4) throw Error('read unavailable'); }; f.submit();
  a.equal(f.state.writes.length, 1); a.equal(f.read().gen.length, 1); a.deepEqual(clone(f.w.deposits), {}); a.equal(f.get('depositConfirmBtn').disabled, true);
  a.match(f.get('depositEntryStatus').textContent, /불확실/);
});
test('quota and restore-protection failures leave persisted and in-memory rows unchanged', t => {
  for (const failure of ['quota', 'blocked']) {
    const f = withFixture(t, { gen: [{ ts: 1, amount: 2 }] }); const bytes = f.state.values.get('v5_deposits');
    f.w.addDeposit('gen'); f.fill(); f.state[failure] = true; f.submit();
    a.equal(f.state.values.get('v5_deposits'), bytes); a.deepEqual(clone(f.w.deposits), { gen: [{ ts: 1, amount: 2 }] }); a.equal(f.get('depositConfirmBtn').disabled, false);
    a.match(f.get('depositEntryStatus').textContent, /저장하지 못했습니다/);
  }
});
test('crypto randomUUID fallback works and unsupported crypto fails closed', t => {
  const f = withFixture(t, {}); Object.defineProperty(f.w, 'crypto', { value: { getRandomValues(values) { values.fill(7); return values; } } });
  f.w.addDeposit('gen'); f.fill(); f.submit(); a.equal(f.read().gen[0].id, 'activity-' + '07'.repeat(16));
  const g = withFixture(t, {}); Object.defineProperty(g.w, 'crypto', { value: {} }); g.w.addDeposit('gen'); g.fill(); g.submit();
  a.equal(g.state.writes.length, 0); a.match(g.get('depositEntryStatus').textContent, /안전한 기록 번호/);
});
test('ID collision retries are bounded and do not overwrite an old row', t => {
  const row = { activityVersion: 1, id: 'activity-fixed', account: 'gen', kind: 'internal-sell', ts: 4, amount: 5, currency: 'KRW', recordedAt: new Date(NOW).toISOString(), timeCertainty: 'instant' };
  const f = withFixture(t, { gen: [row] }); let calls = 0; Object.defineProperty(f.w, 'crypto', { value: { randomUUID() { calls++; return 'fixed'; } } });
  f.w.addDeposit('dom'); f.fill(); f.submit(); a.equal(f.state.writes.length, 0); a.equal(calls, 8); a.deepEqual(f.read().gen[0], row);
});
test('duplicate typed event is rejected even on reopening a completed dialog', t => {
  const f = withFixture(t, {}); f.w.addDeposit('gen'); f.fill(); f.submit(); f.w.addDeposit('gen'); f.fill(); f.submit();
  a.equal(f.state.writes.length, 1); a.equal(f.read().gen.length, 1); a.match(f.get('depositEntryStatus').textContent, /이미 있습니다/);
});
for (const raw of ['{"gen":[],"gen":[]}', '{"gen":[{"ts":1,"amount":1,"amount":2}]}', '{"gen":[{"activityVersion":1,"ts":1,"amount":1}]}', 'null', '{']) test('raw stored data must pass backup validation before any append: ' + raw, t => {
  const f = withFixture(t, {}, { raw }); f.w.addDeposit('gen'); a.equal(f.get('depositInputBox'), null); a.equal(f.state.writes.length, 0); a.equal(f.state.values.get('v5_deposits'), raw);
});
test('missing validator and unavailable storage fail without a dialog or write', t => {
  const f = withFixture(t, {}); f.w.KSTPortfolioBackup = {}; f.w.addDeposit('gen'); a.equal(f.get('depositInputBox'), null);
  f.w.KSTPortfolioBackup = B; f.state.onRead = () => { throw Error('storage unavailable'); }; f.w.manageDeposits('gen'); a.equal(f.get('depositManageBox'), null); a.equal(f.state.writes.length, 0);
});
test('management lists inert fields as legacy, then removes only selected identical same-ts row', t => {
  const old = { ts: 123, amount: 2, id: 'inert', kind: 'internal-buy' }, groups = { gen: [old, clone(old), { ts: 123, amount: 8 }], pen: [{ ts: 4, amount: 5 }] };
  const f = withFixture(t, groups, { memory: { gen: [] } }); f.w.manageDeposits('gen'); a.match(f.get('depositManageList').textContent, /기존 기록 · 유형 미확인/); a.match(f.get('depositManageList').textContent, /실제 시각 미확인/);
  f.get('depositDeleteBtn-1').click(); a.deepEqual(f.read().gen, [old, { ts: 123, amount: 8 }]); a.deepEqual(f.read().pen, groups.pen); a.equal(f.state.confirms.length, 1); a.equal(f.state.saveCalls, 0);
});
test('typed selection removes just its unique ID with same-ts sibling preserved', t => {
  const base = { activityVersion: 1, account: 'gen', ts: 123, amount: 2, currency: 'KRW', recordedAt: new Date(NOW).toISOString(), timeCertainty: 'instant' };
  const first = { ...base, id: 'one', kind: 'internal-buy' }, second = { ...base, id: 'two', kind: 'internal-sell' };
  const f = withFixture(t, { gen: [first, second] }); f.w.manageDeposits('gen'); f.get('depositDeleteBtn-0').click(); a.deepEqual(f.read().gen, [second]);
});
test('cancelled delete keeps storage and stale delete callback cannot affect newer dialog', t => {
  const f = withFixture(t, { gen: [{ ts: 1, amount: 2 }] }); f.w.manageDeposits('gen'); const button = f.get('depositDeleteBtn-0'), action = button.onclick;
  f.state.onConfirm = () => false; button.click(); a.equal(f.state.writes.length, 0); a.equal(button.disabled, false);
  f.get('depositManageCloseBtn').click(); a.equal(button.onclick, null); f.w.addDeposit('gen'); f.state.onConfirm = () => true; action(); a.equal(f.state.writes.length, 0); a.ok(f.get('depositInputBox'));
});
test('concurrent change during delete confirmation blocks deletion and preserves edited storage', t => {
  const f = withFixture(t, { gen: [{ ts: 1, amount: 2 }] }); f.w.manageDeposits('gen'); const later = JSON.stringify({ gen: [{ ts: 1, amount: 8 }, { ts: 2, amount: 9 }] });
  f.state.onConfirm = () => { f.state.values.set('v5_deposits', later); return true; }; f.get('depositDeleteBtn-0').click();
  a.equal(f.state.writes.length, 0); a.equal(f.state.values.get('v5_deposits'), later); a.match(f.get('depositManageStatus').textContent, /다른 창/);
});
test('entry and management controls declare 44px targets with at least 12px text and focus cleanup', t => {
  const f = withFixture(t, { gen: [{ ts: 1, amount: 2 }] }); f.get('opener').focus(); f.w.addDeposit('gen');
  for (const el of f.get('depositInputBox').querySelectorAll('input,select,button')) { a.ok(parseFloat(el.style.minHeight) >= 44); a.ok(parseFloat(el.style.fontSize) >= 12); }
  for (const el of f.get('depositInputBox').querySelectorAll('[style]')) if (el.style.fontSize) a.ok(parseFloat(el.style.fontSize) >= 12);
  a.equal(f.get('depositInputBox').querySelector('[role=dialog]').getAttribute('aria-modal'), 'true');
  f.get('depositCancelBtn').click(); a.equal(f.w.document.activeElement.id, 'opener'); f.w.manageDeposits('gen');
  for (const el of f.get('depositManageBox').querySelectorAll('button')) { a.ok(parseFloat(el.style.minHeight) >= 44); a.ok(parseFloat(el.style.fontSize) >= 12); }
});
