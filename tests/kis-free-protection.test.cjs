'use strict';
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.join(__dirname, '..'), read = p => fs.readFileSync(path.join(root, p), 'utf8');
test('KIS candidate leaves GAS, app, backup, ledger and prior analysis boundaries byte-identical', () => {
  const pins = JSON.parse(read('docs/kis-free-auth/protected-baseline.json'));
  for (const [file, expected] of Object.entries(pins.unchangedFiles)) a.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'), expected, file);
});
test('existing app and service worker never load or cache the isolated KIS candidate', () => {
  for (const file of ['portfolio_v5.html','portfolio.html','service-worker.js','manifest.json']) a.doesNotMatch(read(file), /kis-free-auth|has\.synthetic\.invalid|synthetic-account-pilot-v1/);
});
test('candidate adds no deployment configuration or credential files', () => {
  const files = fs.readdirSync(path.join(root, 'kis-free-auth'));
  a.ok(files.length >= 4);
  for (const f of files) a.ok(/\.(?:mjs|md)$/.test(f), f);
  for (const f of files.filter(x => x.endsWith('.mjs'))) a.doesNotMatch(read('kis-free-auth/' + f).replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, ''), /localStorage|sessionStorage|document\.cookie|console\.|process\.env|KIS_BASE|https:\/\/openapi\.koreainvestment\.com/);
});
test('default entry remains closed for arbitrary environment and credentials', async () => {
  const worker = (await import('../kis-free-auth/worker.mjs')).default;
  const response = await worker.fetch(new Request('https://real.invalid/v1/quote/kr/005930'), { LIVE_ENABLED: true, MODE: 'production' });
  a.equal(response.status, 503); const body = await response.json();
  a.equal(body.liveEnabled, false); a.equal(body.code, 'live-disabled');
});
