'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const current = require('../has/gas-redact.js');
const { fixtures, normalFixtures, runBattery, main } = require('../tools/review-redact-battery.cjs');
const cli = path.resolve(__dirname, '../tools/review-redact-battery.cjs');
const quiet = { log() {}, error() {} };
const leaky = { redact: source => ({ ok: true, text: source }) };

function spawn(args) {
  // The child inherits the repository's no-network guard, not just NODE_OPTIONS.
  return spawnSync(process.execPath, ['--require', path.join(__dirname, 'lib/no-network.cjs'), cli, ...args], { encoding: 'utf8', timeout: 10000 });
}

test('fixtures search the actual embedded sentinel, including numeric 277', () => {
  assert.equal(fixtures.length, 30);
  assert.equal(normalFixtures.length, 5);
  for (const fixture of fixtures) assert.ok(fixture.sentinel && fixture.source.includes(fixture.sentinel), fixture.name);
  const numeric = fixtures.find(f => f.name === '값이 숫자');
  assert.equal(numeric.sentinel, '277');
  assert.match(numeric.source, /secret = 277;/);
  assert.equal(runBattery(leaky).currentLeaks, 30);
});

test('current redactor meets explicit text/refusal fixtures and preserves valid GAS', () => {
  const result = runBattery(current);
  assert.deepEqual(result.failures, []);
  assert.equal(result.passed, true);
  assert.equal(result.currentLeaks, 0);
  assert.equal(result.currentBlocked, 13);
  assert.equal(result.normalUnchanged, 5);
});

test('baseline leaks and errors are diagnostic, never current failures', () => {
  const leaks = runBattery(current, leaky);
  assert.equal(leaks.passed, true);
  assert.equal(leaks.baselineLeaks, 30);
  const errors = runBattery(current, { redact() { throw new Error('synthetic'); } });
  assert.equal(errors.passed, true);
  assert.equal(errors.baselineErrors, 30);
});

test('leakage is a failure even when a fake redactor sets ok=false', () => {
  const result = runBattery({ redact: source => ({ ok: false, text: source }) });
  assert.equal(result.passed, false);
  assert.equal(result.currentLeaks, 30);
});

test('blocking all input is not accepted as successful protection', () => {
  const result = runBattery({ redact: () => ({ ok: false, text: '' }) });
  assert.equal(result.passed, false);
  assert.equal(result.currentLeaks, 0);
  assert.equal(result.normalUnchanged, 0);
  assert.equal(result.failures.length, 22); // 17 redactions and 5 valid GAS samples.
});

test('wrong output, malformed output, and thrown errors fail validation', () => {
  for (const redactor of [
    { redact: source => ({ ...current.redact(source), text: '' }) },
    { redact: () => null },
    { redact: () => ({ ok: 'yes', text: '' }) },
    { redact() { throw new Error('synthetic'); } }
  ]) assert.equal(runBattery(redactor).passed, false);
});

test('valid GAS modifications and false refusals fail even with all secret fixtures correct', () => {
  const normal = new Set(normalFixtures.map(f => f.source));
  for (const change of [source => ({ ok: true, text: `${source} ` }), () => ({ ok: false, text: '' })]) {
    const result = runBattery({ redact: source => normal.has(source) ? change(source) : current.redact(source) });
    assert.equal(result.currentLeaks, 0);
    assert.equal(result.failures.length, 5);
    assert.equal(result.passed, false);
  }
});

test('import does not run CLI or print output', () => {
  const result = spawnSync(process.execPath, ['--require', path.join(__dirname, 'lib/no-network.cjs'), '-e', `require(${JSON.stringify(cli)})`], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('CLI returns 0 for current, 1 for intentionally leaky current, 0 for leaky baseline', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'redact-battery-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'synthetic-leaky.cjs');
  fs.writeFileSync(file, 'module.exports = { redact: text => ({ ok: true, text }) };\n');
  const good = spawn([]);
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /현재 검증 PASS/);
  const bad = spawn(['--current', file]);
  assert.equal(bad.status, 1, bad.stderr);
  assert.match(bad.stdout, /현재 노출 30건/);
  assert.match(bad.stdout, /현재 검증 FAIL/);
  const diagnostic = spawn([file]);
  assert.equal(diagnostic.status, 0, diagnostic.stderr);
  assert.match(diagnostic.stdout, /이전 노출 30건/);
});

test('CLI rejects bad paths, unsupported files, malformed exports and argument mistakes', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'redact-battery-invalid-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bad = path.join(dir, 'bad.cjs');
  fs.writeFileSync(bad, 'module.exports = {};\n');
  for (const args of [ ['--current'], ['--wat'], ['a.js', 'b.js'], ['--current', bad, '--current', bad],
    ['https://example.test/x.js'], [path.join(dir, 'missing.js')], [dir], [bad], ['package.json'] ]) {
    assert.equal(main(args, quiet), 2, JSON.stringify(args));
  }
  assert.equal(spawn(['--current']).status, 2);
  assert.equal(main(['--help'], quiet), 0);
});
