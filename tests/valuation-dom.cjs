'use strict';
/* DOM behavior checks; supplements, never substitutes for, real mobile layout QA. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '../has');
const dom = new JSDOM(fs.readFileSync(path.join(root, 'valuation-lab.html'), 'utf8'), { runScripts: 'outside-only', url: 'https://offline.invalid/has/valuation-lab.html' });
const w = dom.window, d = w.document, $ = id => d.getElementById(id);
for (const file of ['valuation-engine.js', 'valuation-fixtures.js', 'valuation-lab.js']) w.eval(fs.readFileSync(path.join(root, file), 'utf8'));
w.localStorage.setItem('record-sentinel', 'unchanged');
const click = id => $(id).click();
const input = text => { $('document-input').value = text; $('document-input').dispatchEvent(new w.Event('input')); };
assert.equal($('document-input').value, ''); assert.equal(d.querySelectorAll('[data-signal]').length, 0);
click('analyze'); assert.match($('status').textContent, /입력하세요/);
for (const sector of ['technology', 'financial', 'semiconductor', 'industrial', 'loss-growth', 'etf']) {
  $('sample').value = sector; click('load-sample'); assert.match($('status').textContent, /SYNTHETIC/);
  click('analyze'); assert.match($('status').textContent, /분석 완료/);
  assert.equal(d.querySelectorAll('[data-signal]').length, 3);
  assert.equal(d.querySelectorAll('[data-evidence]').length, 5);
  assert.ok(d.querySelectorAll('[data-metric]').length > 0);
  assert.match($('result-body').textContent, /SYNTHETIC/);
  click('analyze'); assert.equal(d.querySelectorAll('[data-evidence]').length, 5);
  input('{broken'); assert.equal(d.querySelectorAll('[data-signal]').length, 0);
  click('analyze'); assert.match($('status').textContent, /JSON/);
}
for (const text of ['null', '[]', '1']) { input(text); click('analyze'); assert.match($('status').textContent, /JSON 객체/); }
const fixture = w.HASValuationFixtures.create('technology'); fixture.ticker = '<img src=x onerror=alert(1)>';
input(JSON.stringify(fixture)); click('analyze'); assert.equal(d.querySelectorAll('#result-body img').length, 0); assert.match($('result-body').textContent, /<img/);
click('reset'); click('reset'); assert.equal($('document-input').value, ''); assert.equal(d.querySelectorAll('[data-signal]').length, 0);
assert.equal(w.localStorage.getItem('record-sentinel'), 'unchanged'); assert.equal(w.localStorage.length, 1); assert.equal(w.sessionStorage.length, 0);
console.log('PASS DOM: six synthetic sectors; three signals; five evidence sections; metric provenance; repeated/reset/invalid/XSS flows; storage sentinel intact');
w.close();
