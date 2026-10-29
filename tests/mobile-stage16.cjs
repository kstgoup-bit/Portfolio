/* 16단계 모바일 통합 자동 시험(합성 데이터 전용, 실제 갤럭시 기기 시험 아님). npm run test:mobile16
 * 뒤로가기·앱 종료/복귀·임시 저장·저장 실패·손상 복구·오프라인·감시 상태 표시. 외부 네트워크 요청이 1건이라도 나오면 실패한다. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]); if (!u.startsWith('/mobile-lab/')) { res.writeHead(404); return res.end('not served'); } const f = path.join(ROOT, u); if (!f.startsWith(path.join(ROOT, 'mobile-lab')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); });
let passed = 0; const ok = n => { passed++; console.log('PASS ' + n); };
const SIZES = [[360, 740], [390, 844], [430, 932]], KEY = 'kst.lab.s16.draft';
const APP = { v5_gen: '[{"id":1,"ticker":"AAA"}]', v5_dom: '[]', v5_ov: '[]', v5_pen: '[]', v5_userThemeMap: '{"AAA":"x"}', 'kst.portfolio.restoreJournal': '{"a":1}' };
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex'), PROTECTED = ['portfolio_v5.html', 'portfolio.html', 'service-worker.js', 'manifest.json', 'backup/core.js'], before = Object.fromEntries(PROTECTED.map(f => [f, sha(f)]));
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port + '/mobile-lab/invest.html';
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined });
  const open = async (w, h, { seed = true, init = null, url = base, ctx: ctxIn = null } = {}) => {
    const ctx = ctxIn || await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, acceptDownloads: true }), page = await ctx.newPage(); const external = [], errors = [];
    if (!ctxIn) await ctx.route('**/*', route => { const u = route.request().url(); if (!u.startsWith('http://127.0.0.1:')) { external.push(u); return route.abort(); } return route.continue(); });
    if (seed) await page.addInitScript(a => { try { for (const [k, v] of Object.entries(a)) if (localStorage.getItem(k) === null) localStorage.setItem(k, v); } catch (e) {} }, APP);
    if (init) await page.addInitScript(init);
    page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); await page.goto(url); return { ctx, page, external, errors };
  };
  const noOverflow = async (page, why = '') => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'horizontal overflow ' + why);
  const textQuality = async (page, why = '') => { const bad = await page.evaluate(() => { const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number), f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); }; const bgOf = el => { for (let e = el; e; e = e.parentElement) { const b = getComputedStyle(e).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; } return 'rgb(255,255,255)'; }; const out = []; for (const el of document.querySelectorAll('body *')) { if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue; const cs = getComputedStyle(el); if (cs.display === 'none' || el.closest('[hidden]')) continue; const px = parseFloat(cs.fontSize), l1 = lum(cs.color), l2 = lum(bgOf(el)), cr = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); if (px < 12 || cr < 4.5) out.push(el.tagName + '#' + el.id + ':' + px + 'px cr' + cr.toFixed(1)); } return out; }); assert.deepEqual(bad, [], '글자 크기/대비 ' + why); };
  const targets = async (page, why = '') => { const small = await page.evaluate(() => [...document.querySelectorAll('button,select,input:not([type=hidden])')].filter(e => !e.closest('[hidden]') && e.getBoundingClientRect().width > 0 && !e.disabled).map(e => [e.id || e.tagName, Math.round(e.getBoundingClientRect().height)]).filter(([, h]) => h < 44)); assert.deepEqual(small, [], '터치 영역 ' + why); };
  const text = (p, s) => p.textContent(s), tab = (p, t) => p.click('#tab-' + t), selTab = p => p.evaluate(() => [...document.querySelectorAll('[role=tab]')].find(b => b.getAttribute('aria-selected') === 'true').id);
  const ls = p => p.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));
  const fillWork = async p => { await tab(p, 'pnl'); await p.click('#btn-trade-sample'); await tab(p, 'risk'); await p.click('#btn-sample'); await p.fill('#th-ticker', '30'); await p.click('#btn-th'); await p.fill('#tk-ticker', 'MSX'); await p.fill('#tk-reason', '클라우드 성장'); await p.fill('#tk-dis', '성장률 둔화'); await p.fill('#tk-date', '2099-01-01'); await p.click('#btn-tk-add'); };

  // 1. 뒤로가기: 탭 이동 기록
  for (const [w, h] of SIZES) {
    const c = await open(w, h, { seed: false }), p = c.page; assert.equal(await selTab(p), 'tab-risk');
    await tab(p, 'pnl'); await tab(p, 'bt'); await tab(p, 'pilot'); assert.equal(await selTab(p), 'tab-pilot');
    await p.goBack(); assert.equal(await selTab(p), 'tab-bt'); assert.equal(await p.isVisible('#p-bt'), true); await p.goBack(); assert.equal(await selTab(p), 'tab-pnl'); await p.goBack(); assert.equal(await selTab(p), 'tab-risk'); await p.goForward(); assert.equal(await selTab(p), 'tab-pnl');
    assert.equal(new URL(p.url()).pathname, '/mobile-lab/invest.html'); assert.deepEqual(c.errors, []); await c.ctx.close();
  } ok('back/forward button walks tabs in order (360/390/430), stays on the page');
  { const c = await open(390, 844, { seed: false, url: base + '#bt' }), p = c.page; assert.equal(await selTab(p), 'tab-bt'); const c2 = await open(390, 844, { seed: false, url: base + '#zzz' }); assert.equal(await selTab(c2.page), 'tab-risk'); assert.deepEqual([...c.errors, ...c2.errors], []); await c.ctx.close(); await c2.ctx.close(); } ok('deep link #bt opens that tab; unknown hash falls back to risk');

  // 2. 임시 저장 → 앱 종료/복귀(새로고침) → 복원, 앱 투자기록 키 무변경
  for (const [w, h] of SIZES) {
    const c = await open(w, h), p = c.page; assert.match(await text(p, '#draft-status'), /임시 저장이 없습니다/); await fillWork(p); await p.click('#btn-draft-save'); assert.match(await text(p, '#draft-status'), /임시 저장했습니다/);
    const saved = await ls(p); assert.deepEqual(Object.keys(saved).sort(), [...Object.keys(APP), KEY].sort()); for (const [k, v] of Object.entries(APP)) assert.equal(saved[k], v, k + ' 변경됨');
    await p.reload(); assert.match(await text(p, '#draft-status'), /임시 저장 있음/); assert.match(await text(p, '#trade-status'), /거래기록이 없습니다/); assert.equal(await p.inputValue('#th-ticker'), '');
    await p.click('#btn-draft-load'); assert.match(await text(p, '#draft-status'), /복원했습니다/); assert.match(await text(p, '#trade-status'), /거래기록 6건 복원/); assert.equal(await p.inputValue('#th-ticker'), '30'); assert.match(await text(p, '#tk-list'), /MSX/);
    await tab(p, 'pnl'); await p.fill('#px-AAA', '125'); await p.click('#btn-pnl'); assert.match(await text(p, '#pnl-result'), /110원/);
    await p.click('#btn-draft-del'); assert.match(await text(p, '#draft-status'), /삭제했습니다/); const after = await ls(p); assert.deepEqual(after, APP); assert.deepEqual(c.errors, []); assert.deepEqual(c.external, []); await c.ctx.close();
  } ok('draft save → reload (app close/return) → restore works; app keys byte-identical; delete removes only the draft key');

  // 3. 저장 실패(용량) — 복구 안내, 기존 초안 유지, 화면 내용 유지
  {
    const c = await open(390, 844), p = c.page; await fillWork(p); await p.click('#btn-draft-save'); const good = (await ls(p))[KEY];
    await p.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('quota', 'QuotaExceededError'); }; }); await p.fill('#in-themes', 'AAA=변경'); await p.click('#btn-draft-save');
    const st = await text(p, '#draft-status'); assert.match(st, /저장 실패/); assert.match(st, /내보내기/); assert.match(st, /기존 임시 저장은 바뀌지 않았습니다/);
    assert.equal((await ls(p))[KEY], good); assert.match(await text(p, '#tk-list'), /MSX/); assert.equal(await p.inputValue('#in-themes'), 'AAA=변경');
    const exp = await Promise.all([p.waitForEvent('download'), (async () => { await tab(p, 'pnl'); await p.click('#btn-exp-json'); })()]); assert.match(fs.readFileSync(await exp[0].path(), 'utf8'), /kst-trade-log/);   // 저장이 막혀도 파일 내보내기는 가능
    assert.deepEqual(c.errors, []); await c.ctx.close();
  } ok('quota failure: clear recovery message, previous draft intact, on-screen work intact, file export still works');

  // 4. 손상·버전 불일치 초안: 복원 거부, 삭제하지 않음, 화면 정상
  {
    const c = await open(360, 740), p = c.page; for (const [raw, re] of [['{broken', /손상/], [JSON.stringify({ format: 'kst-lab-draft', schemaVersion: 9, savedAt: '2026-10-29', themeText: '', thresholds: {} }), /버전/], [JSON.stringify({ format: 'x' }), /형식/]]) {
      await p.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, raw]); await p.reload(); assert.match(await text(p, '#draft-status'), re); await p.click('#btn-draft-load'); assert.match(await text(p, '#draft-status'), re); assert.equal((await ls(p))[KEY], raw); assert.match(await text(p, '#risk-summary'), /불러오면 비중이 표시됩니다/);
    }
    for (const [k, v] of Object.entries(APP)) assert.equal((await ls(p))[k], v); assert.deepEqual(c.errors, []); await c.ctx.close();
  } ok('corrupt / future-version / wrong-format drafts: not restored, not deleted, user told, app keys untouched');

  // 5. 저장소 접근 자체가 막힌 환경(시크릿 모드·정책): 화면 동작 + 안내
  {
    const c = await open(390, 844, { seed: false, init: () => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } }); } }), p = c.page;
    assert.match(await text(p, '#draft-status'), /쓸 수 없습니다/); await tab(p, 'pnl'); await p.click('#btn-trade-sample'); await p.click('#btn-draft-save'); assert.match(await text(p, '#draft-status'), /저장 실패.*쓸 수 없습니다/); assert.match(await text(p, '#trade-status'), /6건/);
    await tab(p, 'bt'); await p.click('#btn-bt'); assert.match(await text(p, '#bt-result'), /성과 주장 불가/); assert.deepEqual(c.errors, []); await c.ctx.close();
  } ok('storage blocked entirely: page still works, draft save reports it, no uncaught errors');

  // 6. 앱 전환·복귀(visibility/pagehide/pageshow), 화면 회전, 파일 선택 취소
  {
    const c = await open(390, 844), p = c.page; await fillWork(p); const snap = await p.evaluate(() => document.getElementById('p-risk').innerText);
    await p.evaluate(() => { for (const t of ['visibilitychange', 'pagehide', 'pageshow', 'blur', 'focus']) window.dispatchEvent(new Event(t)); Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await p.evaluate(() => document.getElementById('p-risk').innerText), snap); await p.setViewportSize({ width: 844, height: 390 }); await noOverflow(p, 'landscape'); await p.setViewportSize({ width: 390, height: 844 }); await noOverflow(p, 'portrait');
    await p.setInputFiles('#f-trades', []); await p.setInputFiles('#f-backup', []); await p.setInputFiles('#f-thesis', []); assert.match(await text(p, '#trade-status'), /6건/); assert.deepEqual(c.errors, []); await c.ctx.close();
  } ok('app switch/return events and rotation keep state; cancelling file pickers changes nothing');

  // 7. 오프라인 상태에서 가져오기·내보내기·임시 저장 (실험실은 서비스워커가 없어 오프라인 상태의 새로 열기/새로고침은 지원하지 않음 — 보고서에 명시)
  {
    const c = await open(390, 844), p = c.page; await c.ctx.setOffline(true); await fillWork(p); await p.click('#btn-draft-save'); assert.match(await text(p, '#draft-status'), /임시 저장했습니다/);
    await tab(p, 'pnl'); const [d] = await Promise.all([p.waitForEvent('download'), p.click('#btn-exp-csv')]); const csv = fs.readFileSync(await d.path(), 'utf8'); await p.setInputFiles('#f-trades', { name: 't.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }); await p.waitForFunction(() => /6건을 읽었습니다/.test(document.getElementById('trade-status').textContent));
    await c.ctx.setOffline(false); await p.reload(); await p.click('#btn-draft-load'); assert.match(await text(p, '#draft-status'), /복원/); assert.deepEqual(c.external, []); assert.deepEqual(c.errors, []); await c.ctx.close();
  } ok('offline: draft save, file export/import work in an already-open page; restore after reconnect; 0 external requests');

  // 8. 감시 상태 표시: 활성 감시 0, 합성/캐시/미검증 분리, 공급자·기준일·가격 유형·통화·유효기간·오류·검증 상태
  for (const [w, h] of SIZES) {
    const c = await open(w, h), p = c.page; await tab(p, 'pilot'); const cnt = await p.$$eval('#watch-counts dd', e => e.map(x => x.textContent));
    assert.deepEqual(cnt, ['0개', '0건', '1개', '1개', '2개']); const t = await text(p, '#p-pilot');
    for (const k of ['공급자', '기준일', '가격 유형', '통화', '유효기간', '검증 상태', '갱신 오류', '429 요청 제한', '캐시는 실제 감시로 세지 않습니다', '활성 감시 = 실제 조회 + 가격 검증', '투자 판단이 아닙니다', '거래정지', '상장폐지', '실적 악화', '기업행위']) assert.ok(t.includes(k), k);
    assert.doesNotMatch(t, /실시간 감시 중|매수하세요|사세요|보장/); assert.equal(await p.isDisabled('#pilot-on'), true);
    await noOverflow(p, 'pilot ' + w); await textQuality(p, 'pilot ' + w); await targets(p, 'pilot ' + w); assert.deepEqual(c.errors, []); await c.ctx.close();
  } ok('watch-status screen: active real monitoring 0; synthetic/cache/unverified counted separately; provider/as-of/price type/currency/validity/error/verification shown');

  // 9. 임시 저장 섹션 포함 레이아웃(세 화면 크기)
  for (const [w, h] of SIZES) { const c = await open(w, h), p = c.page; await fillWork(p); await p.click('#btn-draft-save'); for (const t of ['risk', 'pnl', 'bt', 'pilot']) { await tab(p, t); await noOverflow(p, t); await textQuality(p, w + ' ' + t); await targets(p, w + ' ' + t); } assert.deepEqual(c.errors, []); await c.ctx.close(); } ok('layout with draft controls at 360/390/430: no overflow, text ≥12px & contrast, targets ≥44px');

  // 10. 네트워크 차단·서비스워커 없음·보호 파일 무변경·묶음 최신
  {
    const c = await open(390, 844), p = c.page; const r = await p.evaluate(async () => { const o = {}; try { await fetch('/mobile-lab/invest.html'); o.fetch = 'allowed'; } catch (e) { o.fetch = 'blocked'; } o.sw = (await navigator.serviceWorker.getRegistrations()).length; return o; }); assert.equal(r.fetch, 'blocked'); assert.equal(r.sw, 0); assert.deepEqual(c.external, []); await c.ctx.close();
    for (const f of PROTECTED) assert.equal(sha(f), before[f], f); const html = fs.readFileSync(path.join(ROOT, 'mobile-lab/invest.html'), 'utf8'); assert.match(html, /connect-src 'none'/); assert.doesNotMatch(html, /<script(?![^>]*src=)/);
    const b1 = require('../tools/build-mobile-lab.cjs').build(), b2 = require('../tools/build-invest-lab.cjs').build(); assert.equal(fs.readFileSync(path.join(ROOT, 'mobile-lab/bundle.js'), 'utf8'), b1); assert.equal(fs.readFileSync(path.join(ROOT, 'mobile-lab/invest-bundle.js'), 'utf8'), b2);
  } ok('CSP blocks network, no service worker, protected app files byte-identical, both bundles up to date');

  await browser.close(); server.close(); console.log(`\n${passed} groups passed`);
})().catch(e => { console.error('FAIL', e && e.stack || e); process.exit(1); });
