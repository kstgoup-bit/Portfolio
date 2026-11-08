'use strict';
/* Standalone synthetic workbench: no server, external traffic, or real records. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const url = 'file://' + path.join(__dirname, '../has/valuation-lab.html');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH, args: ['--no-sandbox'] });
  try {
    for (const width of [360, 390, 430, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 500, hasTouch: width < 500, serviceWorkers: 'block' });
      const external = [], errors = [], storageWrites = [];
      await context.route(u => !u.href.startsWith('file:'), route => { external.push(route.request().url()); return route.abort(); });
      await context.exposeBinding('__storageWrite', (_, detail) => storageWrites.push(detail));
      await context.addInitScript(() => {
        localStorage.setItem('HAS_PROTECTED_RECORD', 'unchanged-synthetic-sentinel');
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) { window.__storageWrite(['setItem', key]); return original.call(this, key, value); };
        ['clear', 'removeItem'].forEach(name => { const fn = Storage.prototype[name]; Storage.prototype[name] = function (...args) { window.__storageWrite([name, ...args]); return fn.apply(this, args); }; });
      });
      const page = await context.newPage(); page.on('pageerror', e => errors.push(String(e)));
      await page.goto(url);
      assert.equal(await page.locator('#document-input').inputValue(), '');
      assert.equal(await page.locator('[data-signal]').count(), 0);
      assert.match(await page.locator('#status').innerText(), /분석 대기/);
      await page.locator('#analyze').click(); assert.match(await page.locator('#status').innerText(), /입력하세요/);
      await page.locator('#load-sample').click(); assert.match(await page.locator('#status').innerText(), /먼저/);
      for (const sector of ['technology', 'financial', 'semiconductor', 'industrial', 'loss-growth', 'etf']) {
        await page.selectOption('#sample', sector); await page.locator('#load-sample').click();
        assert.equal(await page.locator('[data-signal]').count(), 0);
        assert.match(await page.locator('#status').innerText(), /SYNTHETIC/);
        await page.locator('#analyze').click();
        assert.match(await page.locator('#status').innerText(), /분석 완료/);
        assert.equal(await page.locator('[data-signal]').count(), 3);
        assert.equal(await page.locator('[data-evidence]').count(), 5);
        assert.match(await page.locator('#result-body').innerText(), /SYNTHETIC/);
        const metrics = page.locator('[data-metric]'); assert.ok(await metrics.count() > 0);
        await metrics.first().locator('summary').click(); assert.match(await metrics.first().innerText(), /출처/);
        await page.locator('#analyze').click(); assert.equal(await page.locator('[data-evidence]').count(), 5);
      }
      await page.locator('nav a[href="#evidence"]').click(); assert.equal(new URL(page.url()).hash, '#evidence');
      await page.locator('nav a[href="#metrics"]').click(); assert.equal(new URL(page.url()).hash, '#metrics');
      await page.goBack(); assert.equal(new URL(page.url()).hash, '#evidence');
      await page.goForward(); assert.equal(new URL(page.url()).hash, '#metrics');
      await page.locator('#document-input').fill('{broken'); assert.equal(await page.locator('[data-signal]').count(), 0);
      await page.locator('#analyze').click(); assert.match(await page.locator('#status').innerText(), /JSON/);
      for (const input of ['null', '[]', '1']) { await page.locator('#document-input').fill(input); await page.locator('#analyze').click(); assert.match(await page.locator('#status').innerText(), /JSON 객체/); }
      await page.selectOption('#sample', 'technology'); await page.locator('#load-sample').click();
      const doc = JSON.parse(await page.locator('#document-input').inputValue()); doc.ticker = '<img src=x onerror=alert(1)>';
      await page.locator('#document-input').fill(JSON.stringify(doc)); await page.locator('#analyze').click();
      assert.equal(await page.locator('#result-body img').count(), 0);
      const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, small: [...document.querySelectorAll('button,summary,nav a')].filter(e => { const r = e.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).length, record: localStorage.getItem('HAS_PROTECTED_RECORD') }));
      assert.ok(layout.overflow <= 0, JSON.stringify(layout)); assert.equal(layout.small, 0); assert.equal(layout.record, 'unchanged-synthetic-sentinel');
      await page.locator('#reset').click(); await page.locator('#reset').click();
      assert.equal(await page.locator('#document-input').inputValue(), ''); assert.equal(await page.locator('[data-signal]').count(), 0); assert.equal(await page.locator('[data-evidence]').count(), 0);
      await page.reload(); assert.equal(await page.locator('#document-input').inputValue(), '');
      assert.equal(await page.locator('.back').getAttribute('href'), '../portfolio_v5.html#has-staff');
      assert.deepEqual(external, []); assert.deepEqual(errors, []); assert.deepEqual(storageWrites, []);
      console.log('PASS ' + width + 'px: six sectors, independent evidence, repeated/reset/error flows, history, record preservation, no network');
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
