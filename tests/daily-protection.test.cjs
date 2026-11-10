'use strict';
// Static/DOM declarations only. Not a mobile-browser or production acceptance test.
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.join(__dirname, '..'), read = p => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('portfolio_v5.html'), pins = require('./lib/daily-review-pins.json');
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
function fn(name) { const start = html.indexOf('function ' + name + '('); a.ok(start >= 0, name); const end = html.indexOf('\n}', start); return html.slice(start, end + 2); }
test('daily changes reverse exactly to reviewed Claude baseline; earlier projections still verify', () => {
  const projection = require('./lib/has-rename.cjs');
  a.equal(sha(projection.beforeDailyText('portfolio_v5.html')), pins.baselineHTMLSha256);
  a.equal(sha(projection.beforeRecordingText('portfolio_v5.html')), require('./lib/recording-review-pins.json').baselineHTMLSha256);
  a.equal(require('./lib/has-daily-edits.json').length, pins.htmlHunks);
});
test('six prior new 11px labels are at least 12px; revision disclosure has a 44px target', () => {
  const { JSDOM } = require('jsdom'), dom = new JSDOM(html);
  for (const key of ['all', 'dom', 'ov', 'pen', 'gen']) {
    const status = dom.window.document.getElementById('snapshotStatus-' + key);
    a.ok(parseFloat(status.style.fontSize) >= 12); a.equal(status.getAttribute('role'), 'status');
    a.ok(dom.window.document.getElementById('snapshotHistory-' + key));
  }
  a.match(fn('renderManualPriceForm'), /font-size:12px;margin-top:6px/);
  a.match(fn('renderSnapshotStatuses'), /<summary style="min-height:44px/);
  dom.window.close();
});
test('dependency order makes revision validator available before browser backup captures it', () => {
  const scripts = [...html.matchAll(/<script defer src="([^"]+)"/g)].map(m => m[1]);
  for (const file of ['has/snapshot-policy.js', 'backup/core.js', 'has/quote-model.js', 'has/benchmark-history-policy.js']) a.equal(scripts.filter(x => x === file).length, 1);
  a.ok(scripts.indexOf('has/snapshot-policy.js') < scripts.indexOf('backup/core.js'));
  a.ok(scripts.indexOf('has/quote-model.js') < scripts.indexOf('has/benchmark-history-policy.js'));
});
test('saved chart path has no live-price or historical-cost fabrication', () => {
  const chart = fn('renderLineChart');
  a.doesNotMatch(chart, /getCurrentTotalByKey|liveNow|1370|\.cost\s*\|\|/);
  a.match(chart, /snapshotComparisonStatus/);
  a.match(chart, /chartComparison\.hold\?null:getBenchmarkSeriesForChart/);
  a.match(fn('returnRowHtml'), /snapshotComparisonStatus\(key,snap\.ts,now,true\)\.hold/);
  a.match(fn('renderReturnsTable'), /currentEvaluation=snapshotEvaluation\(key\)/);
});
test('receipt-only repeated snapshots do not write or announce a new saved version', () => {
  a.match(fn('recordSnap'), /appended\.changed===false/);
  a.match(fn('autoSnapshot'), /!appended\.ok \|\| appended\.changed===false/);
});
test('GAS history remains synthetic-only and storage key inventory is unchanged', () => {
  const H = require('../has/benchmark-history-policy.js'); a.equal(H.liveGasEnabled, false);
  a.equal(H.parseGasHistory({}, 'KS200', '2026-11-10T00:00:00Z', { mode: 'live' }).ok, false);
  a.doesNotMatch(html, /[?&]type=history/);
  const keys = s => [...new Set(s.match(/\b(v5_[A-Za-z0-9_]+|has_[a-z_0-9]+|kst\.[a-z.A-Z0-9_]+)/g) || [])].sort();
  a.deepEqual(keys(html), keys(require('./lib/has-rename.cjs').beforeDailyText('portfolio_v5.html')));
});
