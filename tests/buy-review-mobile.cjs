'use strict';
/* GPT-20261121-0911 실험실 모바일 확인 — 합성 자료, 외부 요청 차단, 저장소 쓰기 감시. 산출물(스크린샷)은 인자로 받은 폴더에만. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const url = 'file://' + path.join(__dirname, '../has/buy-review-lab.html');
const shotDir = process.argv[2] || null;
(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [360, 390, 430]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
      const external = [], errors = [], writes = [];
      await context.route(u => !u.href.startsWith('file:'), route => { external.push(route.request().url()); return route.abort(); });
      await context.exposeBinding('__w', (_, k) => writes.push(k));
      await context.addInitScript(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { window.__w(k); return o.call(this, k, v); }; });
      const page = await context.newPage(); page.on('pageerror', e => errors.push(String(e)));
      await page.goto(url);
      await page.waitForFunction(() => document.querySelectorAll('#list-body article').length === 7);
      const today = await page.locator('#today-body article').count();
      assert.ok(today >= 1 && today <= 5, 'today ' + today);
      const states = await page.locator('#today-body .state').allInnerTexts();
      assert.ok(states.every(s => /분할매수 검토/.test(s)), states.join());
      assert.match(await page.locator('[data-testid=deps]').innerText(), /실제 데이터 미연결/);
      await page.locator('#today-body details summary').first().click();
      const m = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth, sw = document.documentElement.scrollWidth;
        let minFont = 99, bad = [];
        for (const el of document.querySelectorAll('body *')) {
          if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
          const cs = getComputedStyle(el); if (cs.display === 'none' || el.closest('details:not([open])') && el.tagName !== 'SUMMARY') continue;
          const f = parseFloat(cs.fontSize); minFont = Math.min(minFont, f);
          const c = cs.color.match(/\d+/g).map(Number); const lum = (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000;
          if (lum > 0x33 && !el.closest('header') && !el.closest('.state')) bad.push(el.tagName + ':' + cs.color);
        }
        return { vw, sw, minFont, bad: bad.slice(0, 5) };
      });
      assert.ok(m.sw <= m.vw, 'horizontal scroll ' + m.sw + '>' + m.vw);
      assert.ok(m.minFont >= 12, 'font ' + m.minFont);
      assert.deepEqual(m.bad, []);
      assert.deepEqual(external, []); assert.deepEqual(errors, []); assert.deepEqual(writes, []);
      if (shotDir) await page.screenshot({ path: path.join(shotDir, 'buy-review-lab-' + width + '.png'), fullPage: false });
      console.log('ok', width, 'today', today, 'minFont', m.minFont, 'sw', m.sw, '/', m.vw);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
