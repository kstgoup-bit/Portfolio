#!/usr/bin/env node
/* KST (stage15): 합성 자료로 투자관리 실험실 화면을 캡처한다(자동화 브라우저, 실제 갤럭시 기기 화면 아님). 사용: node tools/capture-stage15-screens.cjs */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright'); const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'docs', 'stage15-screens');
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]), f = path.join(ROOT, u); if (!u.startsWith('/mobile-lab/') || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port + '/mobile-lab/invest.html', br = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined });
  fs.mkdirSync(OUT, { recursive: true });
  for (const [w, h] of [[360, 740], [390, 844], [430, 932]]) {
    const ctx = await br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }), p = await ctx.newPage(); await p.goto(base); await p.click('#btn-sample');
    await p.fill('#th-ticker', '30'); await p.fill('#th-theme', '60'); await p.click('#btn-th'); await p.selectOption('#st-kind', 'ticker'); await p.selectOption('#st-key', 'AAA'); await p.fill('#st-drop', '50'); await p.click('#btn-st-add');
    await p.screenshot({ path: path.join(OUT, `risk-${w}.png`), fullPage: true });
    if (w === 390) {
      await p.click('#tab-pnl'); await p.click('#btn-trade-sample'); await p.fill('#px-AAA', '125'); await p.fill('#px-USX', '130'); await p.fill('#in-fx', '1350'); await p.click('#btn-pnl'); await p.screenshot({ path: path.join(OUT, 'pnl-390.png'), fullPage: true });
      await p.click('#tab-bt'); await p.click('#btn-bt'); await p.screenshot({ path: path.join(OUT, 'backtest-390.png'), fullPage: true });
      await p.click('#tab-pilot'); await p.screenshot({ path: path.join(OUT, 'pilot-390.png'), fullPage: true });
    } await ctx.close();
  }
  await br.close(); server.close(); console.log('screens:', fs.readdirSync(OUT).join(', '));
})();
