'use strict';
// Offline DOM/history regression only. No Chromium, network, storage or mobile-layout claim.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..', 'has');
test('actual adviser scripts: repeated detail, Back/Forward and tabs await route completion', async () => {
  for (let i = 0; i < 20; i++) {
    const html = fs.readFileSync(path.join(root, 'advisor-app.html'), 'utf8');
    const dom = new JSDOM(html, { url: 'https://example.test/advisor-app.html', runScripts: 'outside-only' });
    const w = dom.window, q = id => w.document.querySelector('[data-testid="' + id + '"]');
    w.scrollTo = () => {};
    try {
      for (const [, file] of html.matchAll(/<script src="([^"]+)"/g)) w.eval(fs.readFileSync(path.join(root, file), 'utf8'));
      const change = (hash, visible, action) => new Promise((resolve, reject) => {
        const good = () => w.location.hash === hash && ['view-staff', 'view-alerts', 'view-detail'].every(id => q(id).hidden === (id !== visible));
        const timer = setTimeout(() => { w.removeEventListener('hashchange', handler); reject(new Error('Route did not settle: ' + hash)); }, 1000);
        const handler = () => { if (good()) { clearTimeout(timer); w.removeEventListener('hashchange', handler); resolve(); } };
        w.addEventListener('hashchange', handler); action(); handler();
      });
      assert.match(q('sec-summary').textContent, /판단 보류 3/);
      assert.match(q('sec-summary').textContent, /매수 검토 1/);
      await change('#staff', 'view-staff', () => q('tab-staff').click());
      await change('#stock-SYN-KR1', 'view-detail', () => q('open-SYN-KR1').click());
      await change('#staff', 'view-staff', () => q('btn-back').click());
      await change('#alerts', 'view-alerts', () => q('tab-alerts').click());
      await change('#staff', 'view-staff', () => w.history.back());
      await change('#alerts', 'view-alerts', () => w.history.forward());
      assert.equal(w.__advResult.writes, 'none');
    } finally { w.close(); }
  }
});
