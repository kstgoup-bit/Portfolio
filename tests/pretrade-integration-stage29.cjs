'use strict';
/* 29단계 통합 브라우저 시험(합성 데이터·외부 네트워크 차단): 실제 portfolio_v5.html 의 '매매 점검' 탭.
   확인: 원장(v5_*) 바이트 불변, 저장 키는 has_pretrade_log_v1 하나, 네트워크 0, 글자 12px 이상·#333 이하, 가로 넘침 없음, 새로고침 후 유지, 모듈 미로드 시 앱 정상.
   브라우저 에뮬레이션이며 갤럭시 실기기 시험이 아니다. 사용법: BROWSER_EXECUTABLE_PATH=... node tests/pretrade-integration-stage29.cjs */
const fs = require('fs'), path = require('path'), { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), APP = 'file://' + path.join(ROOT, 'portfolio_v5.html');
const html = fs.readFileSync(path.join(ROOT, 'portfolio_v5.html'), 'utf8'), PWD = (html.match(/const PW_DEFAULT\s*=\s*"([^"]+)"/) || [])[1];
const S = (id, name, ticker, quantity, avgPrice, currentPrice, role) => ({ id, name, ticker, quantity, avgPrice, currentPrice, role });
const SEED = { v5_gen: [S(1, '합성 일반주', 'AAA', 200, 40000, 50000, 'spear'), S(9, '예수금', 'DEP_GEN', 1, 1, 1000000, 'shield')], v5_dom: [S(2, '합성 국내주', 'BBB', 30, 10000, 12000)], v5_ov: [S(3, '합성 해외주', 'CCC', 5, 90, 99)], v5_pen: [S(4, '합성 연금주', 'DDD', 50, 20000, 21000)], v5_fx: '1370', v5_geminiKey: 'AIzaSySECRETSECRETSECRET123456' };
const results = [], ok = (c, m) => { if (!c) throw new Error(m); };
async function step(name, fn) { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: String(e.message).split('\n')[0] }); console.log('FAIL', name, '-', String(e.message).split('\n')[0].slice(0, 240)); } }
const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
async function newCtx(browser, w, block) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' }); const reqs = [];
  await ctx.route('**/*', r => { const u = r.request().url(); if (block && u.endsWith(block)) return r.abort(); if (u.startsWith('file://') || u.startsWith('data:') || u.startsWith('blob:')) return r.continue(); reqs.push(u); return r.abort(); });
  await ctx.addInitScript(sd => { if (!localStorage.getItem('__seeded')) { for (const [k, v] of Object.entries(sd)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); localStorage.setItem('__seeded', '1'); } }, SEED);
  await ctx.addInitScript(() => { window.__net = []; const f = window.fetch; const st = () => { try { return new Error().stack || ''; } catch (e) { return ''; } }; window.fetch = function (u) { window.__net.push({ u: String(u && u.url || u), s: st() }); return f.apply(this, arguments); }; const o = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (m, u) { window.__net.push({ u: String(u), s: st() }); return o.apply(this, arguments); }; if (navigator.sendBeacon) { const b = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = function (u) { window.__net.push({ u: String(u), s: st() }); return b.apply(null, arguments); }; } });
  ctx.reqs = reqs; return ctx;
}
async function login(ctx) { const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); await p.goto(APP); await p.waitForTimeout(400); await p.fill('#lockInput', PWD); await p.click('#lockBtn'); await p.waitForTimeout(1500); p.errs = errs; return p; }
const ledger = p => p.evaluate(() => JSON.stringify(Object.keys(localStorage).filter(k => k.startsWith('v5_') && !['v5_lastAutoSnap', 'v5_snap', 'v5_fxHistory', 'v5_riskData'].includes(k)).sort().map(k => [k, localStorage.getItem(k)])));
const keys = p => p.evaluate(() => Object.keys(localStorage).sort());
const T = (p, id) => p.locator('[data-testid=' + id + ']');
const open = async p => { await p.click('#gtab-risk'); await p.waitForTimeout(150); await p.evaluate(() => switchTab('pretrade')); await p.waitForTimeout(300); };
(async () => {
  const o = { headless: true }; if (process.env.BROWSER_EXECUTABLE_PATH) { o.executablePath = process.env.BROWSER_EXECUTABLE_PATH; o.args = ['--no-sandbox', '--disable-dev-shm-usage']; }
  const browser = await chromium.launch(o);
  for (const w of [360, 390]) {
    const ctx = await newCtx(browser, w), p = await login(ctx), tag = '[' + w + '] ';
    const before = await ledger(p), keysBefore = await keys(p);
    await step(tag + '탭이 열리고 점검표·안내가 보인다', async () => { await open(p); ok(await T(p, 'pt-form').isVisible(), '폼'); ok((await p.locator('#panel-pretrade').innerText()).includes('매수·매도를 하거나 권하지 않습니다'), '안내'); ok(await T(p, 'pt-check-news').count() === 1, '뉴스 항목'); ok(await T(p, 'pt-check-moat').count() === 1, '매수 전용 항목'); });
    await step(tag + '매도로 바꾸면 매도 전용 항목으로 바뀐다', async () => { await T(p, 'pt-side').selectOption('sell'); await p.waitForTimeout(150); ok(await T(p, 'pt-check-greatCompany').count() === 1 && await T(p, 'pt-check-moat').count() === 0, '항목 전환'); await T(p, 'pt-side').selectOption('buy'); await p.waitForTimeout(150); });
    await step(tag + '점검을 채우고 기록하면 저장되고 요약에 반영된다', async () => {
      await T(p, 'pt-name').fill('합성 우량주');
      for (const k of ['news', 'earnings', 'consensus', 'community']) { await T(p, 'pt-check-' + k).check(); await T(p, 'pt-note-' + k).fill('확인 ' + k); }
      for (const k of ['weightCash', 'moat', 'temporary', 'split']) await T(p, 'pt-check-' + k).check();
      await T(p, 'pt-for').fill('일시적 과잉 하락'); await T(p, 'pt-against').fill('구조적 약화 가능성'); await T(p, 'pt-decision').selectOption('proceed'); await T(p, 'pt-save').click(); await p.waitForTimeout(250);
      ok((await T(p, 'pt-msg').innerText()).includes('모두 끝났습니다'), '완료 메시지'); ok((await T(p, 'pt-summary').innerText()).includes('점검 완료 1'), '요약'); ok(await T(p, 'pt-entry').count() === 1, '기록 1건');
    });
    await step(tag + '점검 없이 진행으로 기록하면 미완료 경고가 뜬다', async () => { await T(p, 'pt-name').fill('급한 종목'); await T(p, 'pt-emotion').selectOption('greed'); await T(p, 'pt-decision').selectOption('proceed'); await T(p, 'pt-save').click(); await p.waitForTimeout(250);
      const t = await p.locator('#panel-pretrade').innerText(); ok(t.includes('점검이 끝나지 않은 채'), '미완료 경고'); ok(t.includes('하루 뒤'), '감정 경고'); ok((await T(p, 'pt-summary').innerText()).includes('점검 미완료 1'), '집계'); });
    await step(tag + '사후 메모를 저장한다', async () => { await T(p, 'pt-review-input').first().fill('결과 확인 필요'); await T(p, 'pt-review-save').first().click(); await p.waitForTimeout(250); ok((await p.locator('#panel-pretrade').innerText()).includes('사후 메모('), '메모'); });
    await step(tag + '원장(v5_*)은 바이트 단위로 그대로이고 새 키는 has_pretrade_log_v1 하나뿐이다', async () => { ok(await ledger(p) === before, '원장 변경됨'); const added = (await keys(p)).filter(k => !keysBefore.includes(k)); ok(JSON.stringify(added.filter(k => k !== 'v5_lastAutoSnap' && k !== 'v5_snap')) === JSON.stringify(['has_pretrade_log_v1']), '새 키: ' + added); });
    await step(tag + '다른 탭에 갔다 오면 저장소에서 다시 읽어 같은 기록 2건이 보이고 원장은 그대로다', async () => { await p.evaluate(() => switchTab('staff')); await p.waitForTimeout(300); await open(p); const n = await T(p, 'pt-entry').count(); ok(n === 2, '기록 2건 기대, 실제 ' + n); ok(await ledger(p) === before, '원장'); });
    await step(tag + '글자 12px 이상·#333 이하·가로 넘침 없음', async () => {
      const r = await p.evaluate(() => { const parse = x => (x.match(/[\d.]+/g) || []).map(Number), bad = []; document.querySelectorAll('#panel-pretrade *').forEach(e => { if (!e.offsetParent) return; const t = [...e.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(''); if (!t) return; const cs = getComputedStyle(e); bad.push({ t: t.slice(0, 14), fs: parseFloat(cs.fontSize), c: parse(cs.color), b: (() => { for (let x = e; x; x = x.parentElement) { const c = parse(getComputedStyle(x).backgroundColor); if (c.length >= 3 && (c.length < 4 || c[3] > 0)) return c.slice(0, 3); } return [255, 255, 255]; })() }); }); return { items: bad, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; });
      ok(r.items.length > 10, '글자 요소 수집'); const small = r.items.filter(x => x.fs < 12); ok(!small.length, '12px 미만: ' + JSON.stringify(small.slice(0, 3)));
      const white = r.items.filter(x => lum(x.c) > lum([51, 51, 51]) + 1e-9 && lum(x.b) > 0.18); ok(!white.length, '밝은 글자: ' + JSON.stringify(white.slice(0, 3))); ok(r.sw <= r.cw + 1, '가로 넘침 ' + r.sw + '>' + r.cw); });
    await step(tag + '다른 탭으로 가면 이 화면은 비워지고 AI 참모 탭은 정상이다', async () => { await p.evaluate(() => switchTab('staff')); await p.waitForTimeout(400); ok((await p.locator('#panel-pretrade').innerHTML()).trim() === '', '비워짐'); ok((await p.locator('#panel-staff').innerText()).includes('AI 투자참모'), '참모 화면'); });
    await step(tag + '매매 점검 코드의 네트워크 요청 0건·페이지 오류 0건', async () => { const net = await p.evaluate(() => window.__net); const mine = net.filter(x => /has\/pretrade-/.test(x.s)); ok(mine.length === 0, '점검 화면 코드의 요청: ' + JSON.stringify(mine.slice(0, 2))); ok(p.errs.length === 0, '오류: ' + p.errs.slice(0, 2)); });
    await ctx.close();
  }
  { const ctx = await newCtx(browser, 390, 'pretrade-log.js'), p = await login(ctx);
    await step('[모듈 미로드] 탭은 사용 불가 안내만 보이고 앱은 정상이다', async () => { await open(p); ok(await T(p, 'pt-unavailable').isVisible(), '안내'); await p.evaluate(() => switchTab('dashboard')); await p.waitForTimeout(200); ok((await p.locator('#panel-dashboard').innerText()).length > 20, '현황 탭'); });
    await ctx.close(); }
  { const ctx = await newCtx(browser, 390), p = await login(ctx); await open(p); await p.evaluate(() => localStorage.setItem('has_pretrade_log_v1', '{broken')); await open(p); await p.evaluate(() => switchTab('staff')); await open(p);
    await step('[손상 저장값] 경고만 표시하고 덮어쓰지 않는다', async () => { ok(await T(p, 'pt-storage-warn').isVisible(), '경고'); await T(p, 'pt-name').fill('x'); await T(p, 'pt-save').click(); await p.waitForTimeout(200); ok(await p.evaluate(() => localStorage.getItem('has_pretrade_log_v1')) === '{broken', '덮어씀'); });
    await ctx.close(); }
  { /* 폰 재시작과 가장 가까운 시험: 디스크 프로필을 쓰는 브라우저를 닫았다 다시 열어도 기록이 남는다(시험 하네스의 일회용 컨텍스트는 새로고침 때 런타임 저장을 잃을 수 있어 쓰지 않는다). */
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'has-pt-')); const launch = () => chromium.launchPersistentContext(dir, Object.assign({ headless: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' }, process.env.BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {}));
    let c1 = await launch(); await c1.route('**/*', r => { const u = r.request().url(); return (u.startsWith('file://') || u.startsWith('data:')) ? r.continue() : r.abort(); });
    let p1 = c1.pages()[0] || await c1.newPage(); p1.on('dialog', d => d.accept()); await p1.goto(APP); await p1.evaluate(sd => { for (const [k, v] of Object.entries(sd)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, SEED); await p1.reload(); await p1.waitForTimeout(400); await p1.fill('#lockInput', PWD); await p1.click('#lockBtn'); await p1.waitForTimeout(1500);
    const before = await ledger(p1); await open(p1); await T(p1, 'pt-name').fill('재시작 시험'); await T(p1, 'pt-for').fill('이유'); await T(p1, 'pt-save').click(); await p1.waitForTimeout(300); await c1.close();
    const c2 = await launch(); await c2.route('**/*', r => { const u = r.request().url(); return (u.startsWith('file://') || u.startsWith('data:')) ? r.continue() : r.abort(); }); const p2 = c2.pages()[0] || await c2.newPage(); p2.on('dialog', d => d.accept()); await p2.goto(APP); await p2.waitForTimeout(500);
    if (await p2.locator('#lockInput').isVisible().catch(() => false)) { await p2.fill('#lockInput', PWD); await p2.click('#lockBtn'); await p2.waitForTimeout(1500); }
    await step('[브라우저 재시작] 디스크 프로필을 닫았다 다시 열어도 기록이 남고 원장은 그대로다', async () => { await open(p2); ok(await T(p2, 'pt-entry').count() === 1, '기록 1건'); ok((await p2.locator('#panel-pretrade').innerText()).includes('재시작 시험'), '이름'); ok(await ledger(p2) === before, '원장'); });
    await c2.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  await browser.close();
  const f = results.filter(r => !r.ok); console.log(results.length + '개 중 ' + (results.length - f.length) + '개 통과'); f.forEach(x => console.log(' ✗', x.name, x.error)); process.exit(f.length ? 1 : 0);
})();
