'use strict';
// Approved recording/backup edits have their own explicit pins. Earlier stage
// projections must still reconstruct the exact remote-baseline HTML.
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.join(__dirname, '..'), pins = require('./lib/recording-review-pins.json');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
test('reviewed backup files match explicit recording-stage pins', () => {
  for (const [file, hash] of Object.entries(pins.reviewedFiles)) a.equal(sha(fs.readFileSync(path.join(root, file))), hash, file);
});
test('legacy portfolio, PWA, ledger and investment-analysis modules remain unchanged', () => {
  for (const [file, hash] of Object.entries(pins.unchangedFiles)) a.equal(sha(fs.readFileSync(path.join(root, file))), hash, file);
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
test('recording changes add no external URL or new storage key', () => {
  const now = fs.readFileSync(path.join(root, 'portfolio_v5.html'), 'utf8');
  const old = require('./lib/has-rename.cjs').beforeRecordingText('portfolio_v5.html');
  const urls = s => (s.match(/https?:\/\/[^\s"'<>)]+/g) || []).sort();
  const keys = s => new Set(s.match(/\b(v5_[A-Za-z0-9_]+|has_[a-z_0-9]+|kst\.[a-z.A-Z0-9_]+)/g) || []);
  a.deepEqual(urls(now), urls(old));
  const existing = keys(old); existing.add(require('../backup/core.js').JOURNAL);
  for (const key of keys(now)) a.ok(existing.has(key), key);
});
