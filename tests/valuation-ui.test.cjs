'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '../has/', name), 'utf8');
test('valuation workbench is independent and explicitly offline', () => {
  const html = read('valuation-lab.html'), js = read('valuation-lab.js');
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /SYNTHETIC/);
  assert.match(html, /\.\.\/portfolio_v5\.html#has-staff/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]), ['valuation-engine.js', 'valuation-fixtures.js', 'valuation-lab.js']);
  assert.doesNotMatch(js, /\b(fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB)\b/);
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/);
  assert.match(js, /textContent/);
  assert.match(js, /clearResults\(\)/);
});
