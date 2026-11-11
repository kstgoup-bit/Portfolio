'use strict';
// Approved recording/backup edits have their own explicit pins. Earlier stage
// projections must still reconstruct the exact remote-baseline HTML.
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.join(__dirname, '..'), pins = require('./lib/recording-review-pins.json');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
test('reviewed backup files match explicit recording-stage pins', () => {
  for (const [file, hash] of Object.entries(pins.reviewedFiles)) a.equal(sha(require('./lib/daily-repair-projection.cjs').beforeDailyRepairBytes(file)), hash, file);
});
test('legacy portfolio, PWA, ledger and investment-analysis modules remain unchanged', () => {
  for (const [file, hash] of Object.entries(pins.unchangedFiles)) a.equal(sha(require('./lib/daily-repair-projection.cjs').beforeDailyRepairBytes(file)), hash, file);
});
test('recording HTML patch reverses exactly to verified remote baseline', () => {
  const projected = require('./lib/has-rename.cjs').beforeRecordingText('portfolio_v5.html');
  a.equal(sha(projected), pins.baselineHTMLSha256);
  a.notEqual(sha(fs.readFileSync(path.join(root, 'portfolio_v5.html'))), pins.baselineHTMLSha256);
});
test('new policy keeps network and storage access in the existing application boundary', () => {
  const src = fs.readFileSync(path.join(root, 'has/snapshot-policy.js'), 'utf8');
  a.doesNotMatch(src, /\b(?:localStorage|sessionStorage|fetch|XMLHttpRequest|WebSocket|eval)\b/);
  const html = fs.readFileSync(path.join(root, 'portfolio_v5.html'), 'utf8');
  a.equal(html.split('src="has/snapshot-policy.js"').length - 1, 1);
});
test('prior recording changes retain the reviewed endpoint inventory and no new storage key after explicit daily repair reversal', () => {
  const now = require('./lib/daily-repair-projection.cjs').beforeDailyRepairText('portfolio_v5.html');
  const old = require('./lib/has-rename.cjs').beforeRecordingText('portfolio_v5.html');
  const urls = s => (s.match(/https?:\/\/[^\s"'<>)]+/g) || []).sort();
  const keys = s => new Set(s.match(/\b(v5_[A-Za-z0-9_]+|has_[a-z_0-9]+|kst\.[a-z.A-Z0-9_]+)/g) || []);
  const daily = require('./lib/daily-review-pins.json');
  const expected = urls(old).slice();
  for (const removed of daily.removedExternalURLOccurrences) { const i = expected.indexOf(removed); a.ok(i >= 0, removed); expected.splice(i, 1); }
  expected.push(...daily.addedExternalURLOccurrences);
  a.deepEqual(urls(now), expected.sort());
  const existing = keys(old); existing.add(require('../backup/core.js').JOURNAL);
  for (const key of keys(now)) a.ok(existing.has(key), key);
});
