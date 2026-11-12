'use strict';
/* 앱 시작~잠금 해제 후 프로파일(합성 자료 41종목·170일, Chromium CPU 감속, 390×844 DPR3 모바일, 외부 주소 DNS 차단).
 * 실행: node tests/startup-profile-browser.cjs [html경로] — 실제 사용자 자료·외부 호출 없음. NODE_PATH 설정 금지. 실제 폰 측정 아님. */
const { chromium } = require('playwright'), fs = require('fs'), http = require('http'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), HTML = process.argv[2] || path.join(ROOT, 'portfolio_v5.html'), CPU = +(process.env.CPU || 6);
const policy = require('../has/snapshot-policy.js'), now = Date.now(), keys = ['all', 'gen', 'dom', 'ov', 'pen'];
const accounts = {}; for (const [k, n] of [['gen', 11], ['dom', 10], ['ov', 10], ['pen', 10]]) accounts[k] = Array.from({ length: n }, (_, i) => ({ id: i, name: '합성 ' + k + i, ticker: 'SYN_' + k + i, quantity: 10 + i, avgPrice: 80 + i, currentPrice: 100 + i }));
function input(key, ts, day) { const copy = JSON.parse(JSON.stringify(accounts)), freshPrice = {}, quoteMeta = { FX: ts }, quoteValues = { FX: 1370 }; for (const [k, rows] of Object.entries(copy)) for (const row of rows) { row.currentPrice += day / 100; const q = (k === 'ov' ? 'US:' : 'KR:') + row.ticker; freshPrice[q] = true; quoteMeta[q] = ts; quoteValues[q] = row.currentPrice; } return { key, now: ts, accounts: copy, fx: 1370, freshPrice, quoteMeta, quoteValues }; }
let snaps = {}; try { for (const key of keys) snaps[key] = Array.from({ length: 170 }, (_, d) => { const r = policy.evaluate(input(key, now - (170 - d) * 86400000, d)); if (!r.ok) throw Error('snap'); return r.snapshot; }); } catch (e) { snaps = { all: [], gen: [], dom: [], ov: [], pen: [] }; }
const SEED = { v5_pw: 'synthetic-pw-1234', v5_gen: JSON.stringify(accounts.gen), v5_dom: JSON.stringify(accounts.dom), v5_ov: JSON.stringify(accounts.ov), v5_pen: JSON.stringify(accounts.pen), v5_snap: JSON.stringify(snaps) };
const html = fs.readFileSync(HTML);
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); if (p === '/portfolio_v5.html') { r.setHeader('Content-Type', 'text/html'); return r.end(html); } const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); } r.setHeader('Content-Type', p.endsWith('.js') ? 'application/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.json') ? 'application/json' : 'application/octet-stream'); r.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch({ args: ['--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.route(u => !/^http:\/\/127\.0\.0\.1:/.test(u.href), r => r.abort()); // 외부 요청 전부 차단(프록시 시도 0)
  await ctx.addInitScript(seed => { if (!sessionStorage.getItem('__s')) { for (const k in seed) localStorage.setItem(k, seed[k]); sessionStorage.setItem('__s', '1'); } window.__lt = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true }); } catch (e) {} }, SEED);
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message)); const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU }); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
  await p.goto(base + '/portfolio_v5.html', { waitUntil: 'commit' });
  await p.waitForFunction(() => window.hasStartApp && hasStartApp.done, null, { polling: 50, timeout: 60000 });
  const ready = await p.evaluate(() => Math.round(performance.now()));
  // 잠금화면에서 첫 탭 반응: 입력칸 탭 → 다음 화면 그리기까지
  await p.waitForTimeout(500);
  const tapLatency = []; for (let i = 0; i < 12; i++) { tapLatency.push(await p.evaluate(() => new Promise(res => { const s = performance.now(); setTimeout(() => requestAnimationFrame(() => res([Math.round(s), Math.round(performance.now() - s)])), 0); }))); await p.waitForTimeout(400); }
  await p.fill('#lockInput', 'synthetic-pw-1234');
  const unlock = await p.evaluate(() => new Promise(res => { const s = performance.now(); document.getElementById('lockBtn').click(); requestAnimationFrame(() => requestAnimationFrame(() => res(Math.round(performance.now() - s)))); }));
  await p.waitForTimeout(9000);
  if (process.env.COUNT) { console.log('COUNT', JSON.stringify(await p.evaluate(() => { const P = HASSnapshotPolicy, A = HASReturnAssessment, c = { v: 0, a: 0, b: 0 }; const v = P.validateRecord, as = A.assess; P.validateRecord = function () { c.v++; return v.apply(this, arguments); }; A.assess = function () { c.a++; return as.apply(this, arguments); }; const out = []; for (const f of ['renderAll', 'renderAllReturnsTables', 'renderDashboard']) { c.v = c.a = 0; const t = performance.now(); window[f](); out.push([f, Math.round(performance.now() - t), c.v, c.a]); } return out; }))); }
  const { profile } = await cdp.send('Profiler.stop');
  const lt = await p.evaluate(() => window.__lt);
  const self = {}, byId = new Map(profile.nodes.map(n => [n.id, n])), dt = profile.timeDeltas; const counts = {};
  profile.samples.forEach((id, i) => { counts[id] = (counts[id] || 0) + (dt[i] || 0); });
  for (const [id, us] of Object.entries(counts)) { const n = byId.get(+id), cf = n.callFrame, k = (cf.functionName || '(anon)') + ' ' + cf.url.split('/').pop() + ':' + cf.lineNumber; self[k] = (self[k] || 0) + us / 1000; }
  // 포함 시간(inclusive) — 앱 함수별
  const parent = new Map(); profile.nodes.forEach(n => (n.children || []).forEach(c => parent.set(c, n.id)));
  const incl = {}; for (const [id, us] of Object.entries(counts)) { const seen = new Set(); let cur = +id; while (cur) { const n = byId.get(cur), cf = n.callFrame, k = (cf.functionName || '(anon)') + ' ' + cf.url.split('/').pop() + ':' + cf.lineNumber; if (cf.url && !seen.has(k)) { incl[k] = (incl[k] || 0) + us / 1000; seen.add(k); } cur = parent.get(cur); } }
  const top = o => Object.entries(o).filter(([k]) => !/^\((idle|program|garbage collector)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => [k, Math.round(v)]);
  console.log(JSON.stringify({ cpu: CPU, readyMs: ready, tapLatency, unlockPaintMs: unlock, longTasks: lt, longTaskTotal: lt.reduce((s, x) => s + x[1], 0), topSelf: top(self), topInclusive: top(incl), errors }, null, 1));
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
