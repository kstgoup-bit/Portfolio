/* 14단계 모바일 실험실 자동 시험(합성 데이터 전용, 실제 기기 시험 아님). npm run test:mobile14
 * 환경: BROWSER_EXECUTABLE_PATH(선택). 외부 네트워크 요청이 1건이라도 나오면 실패한다. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]); if (!u.startsWith('/mobile-lab/')) { res.writeHead(404); return res.end('not served'); }
  const f = path.join(ROOT, u === '/mobile-lab/' ? 'mobile-lab/index.html' : u); if (!f.startsWith(path.join(ROOT, 'mobile-lab')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
let passed = 0; const ok = n => { passed++; console.log('PASS ' + n); };
const SIZES = [[360, 740], [390, 844], [430, 932]];
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port + '/mobile-lab/index.html';
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined });
  const open = async (w, h, ctxOpts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, ...ctxOpts }), page = await ctx.newPage(); const external = [], errors = [];
    await ctx.route('**/*', route => { const u = route.request().url(); if (!u.startsWith('http://127.0.0.1:')) { external.push(u); return route.abort(); } return route.continue(); });
    page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base); return { ctx, page, external, errors };
  };
  const noOverflow = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'horizontal overflow');
  const textQuality = async page => {
    const bad = await page.evaluate(() => {
      const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number), f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); };
      const bgOf = el => { for (let e = el; e; e = e.parentElement) { const b = getComputedStyle(e).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; } return 'rgb(255,255,255)'; };
      const out = []; for (const el of document.querySelectorAll('body *')) { if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue; const cs = getComputedStyle(el); if (cs.display === 'none' || el.closest('[hidden]')) continue;
        const px = parseFloat(cs.fontSize), l1 = lum(cs.color), l2 = lum(bgOf(el)), cr = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
        if (px < 12 || cr < 4.5) out.push(el.tagName + ':' + px + 'px cr' + cr.toFixed(1)); } return out; });
    assert.deepEqual(bad, [], '글자 크기(12px↑)/대비 위반');
  };
  const targets = async page => { const small = await page.evaluate(() => [...document.querySelectorAll('button,input:not([type=hidden]),select')].filter(e => !e.closest('[hidden]') && e.getBoundingClientRect().width > 0).map(e => [e.id, Math.round(e.getBoundingClientRect().height)]).filter(([, h]) => h < 44)); assert.deepEqual(small, [], '터치 영역 44px 미만'); };
  const unlockAndPrepare = async (page, scn = 'none') => { await page.click('#btn-unlock'); await page.selectOption('#in-scn', scn); await page.click('#btn-prepare'); };
  const runIt = async page => { await page.check('#chk-ack'); await page.click('#btn-run'); await page.waitForFunction(() => !document.getElementById('step-result').hidden, null, { timeout: 5000 }); };

  for (const [w, h] of SIZES) {
    const c = await open(w, h), p = c.page;
    assert.equal(await p.isVisible('#sec-krx'), false); assert.equal(await p.isVisible('#btn-run'), false); assert.match(await p.textContent('#lock-text'), /잠금 상태/);
    await noOverflow(p); await textQuality(p); await targets(p);
    assert.match(await p.textContent('#counts'), /공식 종목 신원 검증 \(실제\)0종목/); assert.match(await p.textContent('#counts'), /실제 감시 활성 \(한국\/미국\)0 \/ 0/);
    assert.match(await p.textContent('#samples'), /합성 시험/); assert.match(await p.textContent('#banner'), /외부 요청 0회/);
    ok(`locked default OFF, status separation, no overflow, text>=12px & contrast, touch>=44px ${w}px`);
    await unlockAndPrepare(p); assert.equal(await p.isVisible('#step-confirm'), true); await noOverflow(p); await textQuality(p); await targets(p);
    assert.equal(await p.isDisabled('#btn-run'), true); assert.match(await p.textContent('#plan-list'), /최대 호출: 3회 \(자동 재시도 없음\)/); assert.match(await p.textContent('#identity-notice'), /주가 확인이나 매수·매도 신호/);
    await p.check('#chk-ack'); assert.equal(await p.isDisabled('#btn-run'), false); await p.dblclick('#btn-run'); await p.waitForFunction(() => !document.getElementById('step-result').hidden);
    const st = await p.textContent('#result-state'); assert.match(st, /DONE/); assert.match(st, /사용 호출 2\/3/); assert.match(await p.textContent('#result-counts'), /합성 시험/); assert.match(await p.textContent('#result-counts'), /실제 공식 검증0종목/); assert.match(await p.textContent('#result-counts'), /실제 외부 요청0회/);
    await noOverflow(p); await textQuality(p); await targets(p);
    assert.deepEqual(c.external, [], '외부 요청 0'); assert.deepEqual(c.errors, []); ok(`happy path with double-tap protection, synthetic labels, zero external requests ${w}px`);
    await c.ctx.close();
  }
  { // 가로 방향 + 상태 유지
    const c = await open(390, 844), p = c.page; await unlockAndPrepare(p); await p.setViewportSize({ width: 844, height: 390 }); await noOverflow(p); assert.equal(await p.isVisible('#step-confirm'), true); await targets(p);
    await p.setViewportSize({ width: 390, height: 844 }); assert.equal(await p.isVisible('#step-confirm'), true); await c.ctx.close(); ok('rotation keeps step and layout');
  }
  { // 글자 확대 200%
    const c = await open(360, 740), p = c.page; await p.evaluate(() => { document.documentElement.style.fontSize = '200%'; }); await noOverflow(p); await unlockAndPrepare(p); await noOverflow(p);
    assert.equal(await p.isVisible('#btn-prepare') || await p.isVisible('#step-confirm'), true); const sw = await p.evaluate(() => [...document.querySelectorAll('button')].filter(b => !b.closest('[hidden]')).every(b => b.getBoundingClientRect().right <= innerWidth + 1)); assert.ok(sw); await c.ctx.close(); ok('200% text zoom: no overflow, buttons reachable');
  }
  { // 뒤로가기(시스템 뒤로)와 새로고침
    const c = await open(390, 844), p = c.page; await unlockAndPrepare(p); assert.equal(await p.isVisible('#step-confirm'), true);
    await p.goBack(); await p.waitForTimeout(100); assert.equal(await p.isVisible('#step-prepare'), true, '뒤로가기 → 준비 단계'); assert.equal(await p.isVisible('#btn-run'), false);
    await p.reload(); assert.equal(await p.isVisible('#sec-krx'), false, '새로고침 → 잠금'); assert.deepEqual(c.external, []); await c.ctx.close(); ok('system back returns to previous step; reload re-locks');
  }
  { // 오프라인
    const c = await open(390, 844), p = c.page; await c.ctx.setOffline(true); await unlockAndPrepare(p); await runIt(p); assert.match(await p.textContent('#result-state'), /DONE/); await c.ctx.setOffline(false); await c.ctx.close(); ok('works offline after load (no network needed)');
  }
  const SCN = { '429': /PARTIAL/, '401': /BLOCKED|FAILED/, garbage: /PARTIAL/, gateway30: /BLOCKED|FAILED/, timeout: /FAILED|PARTIAL/, network: /FAILED|PARTIAL/, empty: /FAILED|PARTIAL/ };
  for (const [scn, re] of Object.entries(SCN)) {
    const c = await open(390, 844), p = c.page; await unlockAndPrepare(p, scn); await runIt(p); const s = await p.textContent('#result-state');
    assert.match(s, re, scn); assert.match(await p.textContent('#result-counts'), /실제 공식 검증0종목/); assert.doesNotMatch(await p.textContent('#result-counts'), /주식 검증/); assert.doesNotMatch(s, /DONE/);
    const m = s.match(/사용 호출 (\d)\/3/); assert.ok(m && Number(m[1]) <= 2, '자동 재시도 없음: ' + s); await noOverflow(p); assert.deepEqual(c.external, []); await c.ctx.close();
  }
  ok('error scenarios 429/401/garbage/gateway30/timeout/network/empty: no result, no auto-retry, 0 verified');
  { // 중단 후 이어하기
    const c = await open(390, 844), p = c.page; await unlockAndPrepare(p, '429'); await runIt(p); assert.equal(await p.isVisible('#btn-resume'), true); assert.match(await p.textContent('#result-note'), /누락된 쪽: 1/);
    await p.click('#btn-resume'); assert.match(await p.textContent('#result-state'), /PARTIAL/, '전환 직후 0.7초 탭 무시');  await p.waitForTimeout(800); await p.click('#btn-resume'); await p.waitForFunction(() => /DONE/.test(document.getElementById('result-state').textContent)); assert.match(await p.textContent('#result-state'), /사용 호출 3\/3/); assert.equal(await p.isVisible('#btn-resume'), false); await c.ctx.close(); ok('partial → resume completes within approved call budget (3/3)');
  }
  { // 입력 오류와 호출 한도
    const c = await open(390, 844), p = c.page; await p.click('#btn-unlock');
    for (const bad of ['', '2026102', 'abcdefgh', '20261399', '20271028', '20261028 ']) { await p.fill('#in-basdt', bad); await p.click('#btn-prepare'); if (bad === '20261028 ') { assert.equal(await p.isVisible('#step-confirm'), true); await p.goBack(); continue; } assert.equal(await p.isVisible('#step-confirm'), false, 'basDt ' + bad); assert.match(await p.textContent('#input-error'), /입력 오류/); }
    assert.equal(await p.isVisible('#step-confirm'), false); await c.ctx.close(); ok('invalid base dates rejected on phone UI');
  }
  { // CSP: 페이지 스크립트의 fetch/XHR/WebSocket 차단 + 저장소/서비스워커 미사용
    const c = await open(390, 844), p = c.page;
    const r = await p.evaluate(async () => { const o = {}; try { await fetch('/mobile-lab/index.html'); o.fetch = 'allowed'; } catch (e) { o.fetch = 'blocked'; } try { const x = new WebSocket('ws://127.0.0.1:1'); o.ws = 'created'; x.close(); } catch (e) { o.ws = 'blocked'; } o.sw = (await navigator.serviceWorker.getRegistrations()).length; o.ls = localStorage.length; return o; });
    assert.equal(r.fetch, 'blocked'); assert.equal(r.sw, 0); assert.equal(r.ls, 0); assert.deepEqual(c.external, []); await c.ctx.close(); ok('CSP blocks fetch (connect-src none); no service worker; no localStorage use');
  }
  { // 공개 접근 경계: 서버는 /mobile-lab 외 경로를 제공하지 않으며 운영 앱은 실험실을 참조하지 않음
    const port = server.address().port; for (const u of ['/portfolio_v5.html', '/kr-radar/data/universe.json', '/docs/KST-stage13-report.md', '/.env', '/mobile-lab/../package.json']) { const r = await new Promise(res => http.get({ host: '127.0.0.1', port, path: u }, x => { res(x.statusCode); x.resume(); })); assert.notEqual(r, 200, u); }
    ok('lab server exposes only mobile-lab files');
  }
  await browser.close(); server.close(); console.log(`\n${passed} mobile stage-14 groups passed`);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
