'use strict';
/* 로그인(앱 열기) 속도: 운영 서비스워커(기준 main) vs 개선 서비스워커 비교 — Chromium, 합성 자료 전용.
 * GitHub Pages 흉내 서버(ETag·max-age=600·304), 요청당 지연 RTT_MS + 대역폭 BW 바이트/초, CPU 4배 감속.
 * 외부(글꼴 등) 주소는 브라우저 DNS 단계에서 차단(실제 외부 호출 0). 실행: node tests/sw-login-speed-browser.cjs [기준SW파일]
 * 기준SW파일 생략 시 git show origin/main:service-worker.js. 산출물은 OS 임시 폴더. NODE_PATH 설정 금지. */
const { chromium } = require('playwright'), fs = require('fs'), http = require('http'), os = require('os'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..'), RTT_MS = +(process.env.RTT_MS || 120), BW = +(process.env.BW || 1500000), RUNS = +(process.env.RUNS || 3);
const baseSw = process.argv[2] ? fs.readFileSync(process.argv[2]) : cp.execSync('git show origin/main:service-worker.js', { cwd: ROOT });
const variants = { before: baseSw, after: fs.readFileSync(path.join(ROOT, 'service-worker.js')) };
const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png' };
function serve(sw, log) {
  return http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]); let body;
    if (p === '/service-worker.js') body = sw; else { const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); } body = fs.readFileSync(f); }
    const etag = '"' + crypto.createHash('sha1').update(body).digest('hex') + '"', hit = req.headers['if-none-match'] === etag, bytes = hit ? 0 : body.length;
    log.push({ p, status: hit ? 304 : 200, bytes });
    setTimeout(() => { res.setHeader('ETag', etag); res.setHeader('Cache-Control', 'max-age=600'); res.setHeader('Content-Type', types[path.extname(p)] || 'application/octet-stream'); if (hit) { res.statusCode = 304; return res.end(); } res.end(body); }, RTT_MS + bytes / BW * 1000);
  });
}
const SEED = { v5_pw: 'synthetic-pw-1234', v5_gen: JSON.stringify([{ id: 1, name: '합성 A', ticker: 'S1', quantity: 10, avgPrice: 100, currentPrice: 120 }]) };
(async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'has-sw-speed-')), browser = await chromium.launch({ args: ['--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] }), report = {};
  try {
    for (const [name, sw] of Object.entries(variants)) {
      const log = [], server = serve(sw, log); await new Promise(r => server.listen(0, '127.0.0.1', r));
      const base = 'http://127.0.0.1:' + server.address().port, ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
      let external = 0; // 라우팅을 쓰면 Chromium HTTP 캐시가 꺼지므로 외부 주소는 DNS 단계에서 차단(--host-resolver-rules), 요청 수만 기록
      ctx.on('request', r => { if (!r.url().startsWith(base)) external++; });
      await ctx.addInitScript(seed => { if (!sessionStorage.getItem('__seeded')) { for (const k in seed) localStorage.setItem(k, seed[k]); sessionStorage.setItem('__seeded', '1'); } }, SEED);
      // 1회차: 설치
      let page = await ctx.newPage(); await page.goto(base + '/portfolio_v5.html'); await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(1500); await page.close();
      const runs = [];
      for (let i = 0; i < RUNS; i++) {
        log.length = 0; page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        const t0 = Date.now(); await page.goto(base + '/portfolio_v5.html', { waitUntil: 'commit' });
        await page.waitForFunction(() => window.hasStartApp && hasStartApp.done === true, null, { timeout: 120000, polling: 50 });
        const ready = Date.now() - t0, controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
        await page.fill('#lockInput', 'synthetic-pw-1234'); const c0 = Date.now(); await page.click('#lockBtn');
        await page.waitForFunction(() => getComputedStyle(document.getElementById('lockScreen')).display === 'none', null, { polling: 50 });
        const unlock = Date.now() - c0; await page.waitForLoadState('load'); const load = Date.now() - t0;
        runs.push({ readyMs: ready, unlockMs: unlock, loadMs: load, controlled, requests: log.length, full200: log.filter(x => x.status === 200).length, notModified304: log.filter(x => x.status === 304).length, bytes: log.reduce((s, x) => s + x.bytes, 0) });
        await page.close();
      }
      report[name] = { runs, externalBlocked: external };
      await ctx.close(); server.close();
    }
  } finally { await browser.close(); }
  const res = { settings: { RTT_MS, BW, cpu: 4, RUNS, synthetic: true, liveCalls: 0 }, report };
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(res, null, 2)); console.log(JSON.stringify(res, null, 1)); console.log(out);
})().catch(e => { console.error(e); process.exitCode = 1; });
