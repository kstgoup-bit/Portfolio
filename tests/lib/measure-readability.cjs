'use strict';
/* 19단계: 실제 렌더링 화면에서 글씨 크기·대비·터치 영역을 측정한다(합성 데이터). node tests/lib/measure-readability.cjs [출력.json] */
const fs = require('fs'), path = require('path'), http = require('http'); const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..');
const mime = p => p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.css') ? 'text/css' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : p.endsWith('.png') ? 'image/png' : 'application/octet-stream';
const server = http.createServer((req, res) => { try { const p = decodeURIComponent(req.url.split('?')[0]), f = path.resolve(ROOT, '.' + (p === '/' ? '/portfolio_v5.html' : p)); if (!f.startsWith(ROOT + path.sep)) throw Error(); res.setHeader('Content-Type', mime(f)); res.end(fs.readFileSync(f)); } catch { res.statusCode = 404; res.end('nf'); } });
const SEED = { v5_gen: [{ id: 1, name: '합성 일반주', ticker: 'AAA', quantity: 2, avgPrice: 40000, currentPrice: 50000 }], v5_dom: [{ id: 2, name: '합성 국내주', ticker: 'BBB', quantity: 3, avgPrice: 10000, currentPrice: 12000 }], v5_ov: [{ id: 3, name: '합성 해외주', ticker: 'CCC', quantity: 1, avgPrice: 90, currentPrice: 99 }], v5_pen: [{ id: 4, name: '합성 연금주', ticker: 'DDD', quantity: 5, avgPrice: 20000, currentPrice: 21000 }] };
const SCREENS = [['lock', null, false], ['dashboard', "switchTab('dashboard')", true], ['general', "switchTab('general')", true], ['overseas', "switchTab('overseas')", true], ['dividend', "switchTab('dividend')", true], ['risk', "switchTab('risk')", true], ['settings', "switchTab('settings')", true], ['ledgerdemo', "switchTab('ledgerdemo')", true]];
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const origin = 'http://127.0.0.1:' + server.address().port, o = { headless: true };
  if (process.env.BROWSER_EXECUTABLE_PATH) { o.executablePath = process.env.BROWSER_EXECUTABLE_PATH; o.args = ['--no-sandbox', '--disable-dev-shm-usage']; }
  const b = await chromium.launch(o), out = {};
  for (const w of [360, 390, 430]) for (const [name, js, auth] of SCREENS) {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' }); await ctx.route('**/*', r => r.request().url().startsWith(origin + '/') ? r.continue() : r.abort());
    await ctx.addInitScript(({ seed, auth }) => { if (auth) sessionStorage.setItem('v5_auth', '1'); if (!localStorage.getItem('__s')) { for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v)); localStorage.setItem('__s', '1'); } document.addEventListener('DOMContentLoaded', () => { for (const f of ['fetchBenchmarkHistory', 'fetchFX', 'fetchKR', 'fetchUS', 'fetchRiskData']) window[f] = () => { }; }); }, { seed: SEED, auth });
    const page = await ctx.newPage(); await page.goto(origin + '/portfolio_v5.html'); await page.waitForTimeout(600); if (js) { await page.evaluate(js); await page.waitForTimeout(300); }
    out[w + ':' + name] = await page.evaluate(() => {
      const lum = c => { const m = c.match(/[\d.]+/g).map(Number), f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return { l: .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]), a: m.length > 3 ? m[3] : 1 }; };
      const bgOf = e => { let n = e; while (n) { const cs0 = getComputedStyle(n), c = cs0.backgroundColor, v = lum(c); if (v.a > 0.9) return v.l; if (cs0.backgroundImage !== 'none') return null; n = n.parentElement; } return 1; };
      const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
      const res = { texts: 0, small: 0, smallMin: 99, low: 0, touchSmall: 0, touch: 0, overflowX: document.documentElement.scrollWidth > innerWidth, smallBy: {}, lowBy: {}, touchBy: {} };
      for (const e of (document.querySelector('#lockScreen') && getComputedStyle(document.querySelector('#lockScreen')).display !== 'none' ? document.querySelector('#lockScreen') : document.body).querySelectorAll('*')) { if (!vis(e)) continue; if ([...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) { const cs = getComputedStyle(e), fs = parseFloat(cs.fontSize); res.texts++;
          if (fs < 12) { res.small++; res.smallMin = Math.min(res.smallMin, fs); const k = e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''); res.smallBy[k] = (res.smallBy[k] || 0) + 1; }
          const c = lum(cs.color), L1 = c.l, L2 = bgOf(e); if (L2 === null) { res.unknownBg = (res.unknownBg || 0) + 1; } else { const ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05); if (ratio < 4.5) { res.low++; const k = e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''); res.lowBy[k] = (res.lowBy[k] || 0) + 1; } } }
        if (e.matches('button,a[href],input:not([type=hidden]),select,textarea,summary,[onclick]')) { res.touch++; const r = e.getBoundingClientRect(); if (r.height < 43.9 || r.width < 43.9) { res.touchSmall++; const k = e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''); res.touchBy[k] = (res.touchBy[k] || 0) + 1; } } }
      return res; });
    await ctx.close();
  }
  await b.close(); server.close(); const file = process.argv[2]; if (file) fs.writeFileSync(file, JSON.stringify(out, null, 1));
  for (const [k, v] of Object.entries(out)) console.log(k.padEnd(16), 'texts', String(v.texts).padStart(4), '12px미만', String(v.small).padStart(3), '(최소', v.smallMin + ')', '저대비', String(v.low).padStart(3), '터치미달', String(v.touchSmall).padStart(3) + '/' + v.touch, v.overflowX ? '가로넘침' : '');
})();
