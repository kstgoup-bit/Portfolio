/* 19단계: 실제 portfolio_v5.html 안의 "위험관리 > 원장 시범" 화면 시험. 합성 데이터만, 외부 요청 전부 차단(시도 기록).
 * 자동 브라우저 시험이며 실제 갤럭시 기기 시험이 아님. SHOT_DIR 환경변수가 있으면 캡처(합성 데이터)를 저장. */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto'), assert = require('assert/strict');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), SIZES = [360, 390, 430], SHOT = process.env.SHOT_DIR || '';
const mime = p => p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.css') ? 'text/css' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : p.endsWith('.png') ? 'image/png' : 'application/octet-stream';
const server = http.createServer((req, res) => { try { const p = decodeURIComponent(req.url.split('?')[0]), f = path.resolve(ROOT, '.' + (p === '/' ? '/portfolio_v5.html' : p)); if (!f.startsWith(ROOT + path.sep)) throw Error(); res.setHeader('Content-Type', mime(f)); res.setHeader('Cache-Control', 'no-store'); res.end(fs.readFileSync(f)); } catch { res.statusCode = 404; res.end('nf'); } });
const SEED = { v5_gen: [{ id: 1, name: '합성 일반주', ticker: 'AAA', quantity: 2, avgPrice: 40, currentPrice: 50 }], v5_dom: [{ id: 2, name: '합성 국내주', ticker: 'BBB', quantity: 3, avgPrice: 10, currentPrice: 12 }], v5_ov: [{ id: 3, name: '합성 해외주', ticker: 'CCC', quantity: 1, avgPrice: 90, currentPrice: 99 }], v5_pen: [{ id: 4, name: '합성 연금주', ticker: 'DDD', quantity: 5, avgPrice: 20, currentPrice: 21 }], v5_ledger: { '2026-10': { items: [{ t: '합성 가계부', a: 1000 }] } }, v5_memos: [{ text: '합성 메모', ts: 1790812800000 }] };
let browser, origin; const results = [], external = [];
async function check(name, fn) { try { await fn(); results.push([name, 'pass']); console.log('PASS', name); } catch (e) { results.push([name, 'fail']); console.error('FAIL', name, e.message); process.exitCode = 1; } }
async function ctxFor(width, { sw = false, height = 844 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 700, hasTouch: width < 700, serviceWorkers: sw ? 'allow' : 'block' });
  await ctx.route('**/*', r => { const u = r.request().url(); if (u.startsWith(origin + '/')) return r.continue(); external.push(u.replace(/[?#].*$/, '')); return r.abort(); });
  await ctx.addInitScript(({ seed }) => {
    sessionStorage.setItem('v5_auth', '1');
    if (!localStorage.getItem('__seeded')) { for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v)); localStorage.setItem('unrelated-key', 'KEEP'); localStorage.setItem('__seeded', '1'); }
    window.__writes = []; const S = Storage.prototype, wrap = n => { const o = S[n]; S[n] = function () { window.__writes.push(n + ':' + (arguments[0] || '')); return o.apply(this, arguments); }; }; ['setItem', 'removeItem', 'clear'].forEach(wrap);
    const idb = indexedDB.open.bind(indexedDB); indexedDB.open = function () { window.__writes.push('indexedDB.open'); return idb.apply(null, arguments); };
    document.addEventListener('DOMContentLoaded', () => { for (const f of ['fetchBenchmarkHistory', 'fetchFX', 'fetchKR', 'fetchUS', 'fetchRiskData']) window[f] = () => { }; });
  }, { seed: SEED });
  return ctx;
}
const snap = page => page.evaluate(async () => { const o = {}; const enc = new TextEncoder(); for (const k of Object.keys(localStorage).sort()) { const h = await crypto.subtle.digest('SHA-256', enc.encode(localStorage.getItem(k))); o[k] = Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join(''); } return o; });
async function open(width, opts = {}) { const ctx = await ctxFor(width, opts), page = await ctx.newPage(); await page.goto(origin + '/portfolio_v5.html'); await page.waitForTimeout(700); return { ctx, page }; }
async function enter(page) { await page.locator('#gtab-risk').click(); await page.locator('#subtabs-risk button').filter({ hasText: '원장 시범' }).click(); await page.locator('[data-testid=hld-banner]').waitFor(); }
const txt = (page, sel) => page.locator(sel).innerText();
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); origin = 'http://127.0.0.1:' + server.address().port;
  const o = { headless: true }; if (process.env.BROWSER_EXECUTABLE_PATH) { o.executablePath = process.env.BROWSER_EXECUTABLE_PATH; o.args = ['--no-sandbox', '--disable-dev-shm-usage']; }
  browser = await chromium.launch(o);
  for (const w of SIZES) await check('실제 앱 메뉴(위험관리 > 원장 시범) 진입, 배너·합계·미지원 표시, 가로 넘침/글씨/버튼/대비 ' + w + 'px', async () => {
    const { ctx, page } = await open(w); await enter(page);
    const banner = await txt(page, '[data-testid=hld-banner]'); assert.equal(banner, '시범 화면 · 합성 데이터 · 실제 보유·수익 아님');
    assert.equal((await page.locator('.hld-badge').count()), 2, '계좌 카드마다 합성 배지');
    const gen = await txt(page, '[data-testid=hld-sum-gen]'), ov = await txt(page, '[data-testid=hld-sum-ov]');
    for (const s of ['165,150원', '9,880원', '2,538원']) assert.ok(gen.includes(s), 'gen ' + s + ' / ' + gen.replace(/\n/g, ' '));
    for (const s of ['163,313원', '26,613원', '2,380원']) assert.ok(ov.includes(s), 'ov ' + s + ' / ' + ov.replace(/\n/g, ' '));
    const row = await txt(page, '[data-testid=hld-row-SYN-A]'); assert.ok(row.includes('15주') && row.includes('11,010원'));
    const sup = await txt(page, '[data-testid=hld-support]'); for (const s of ['환전 거래\n미지원', '계좌 간 이전(TRANSFER)\n미지원', '거래 정정 이력\n미지원']) assert.ok(sup.replace(/\t/g, '\n').includes(s) || sup.replace(/\s+/g, ' ').includes(s.replace('\n', ' ')), s);
    const geo = await page.evaluate(() => { const r = document.getElementById('panel-ledgerdemo'), out = { sw: document.documentElement.scrollWidth, iw: innerWidth, small: [], btn: [], over: [], light: [] };
      const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number), f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); };
      for (const e of r.querySelectorAll('*')) { if (!e.getClientRects().length) continue; const own = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()); if (own) { const cs = getComputedStyle(e); if (parseFloat(cs.fontSize) < 12) out.small.push(e.tagName + ':' + e.textContent.slice(0, 20) + ':' + cs.fontSize); let bgc = null, n = e; while (n && !bgc) { const c = getComputedStyle(n).backgroundColor, m = c.match(/[\d.]+/g).map(Number); if (m.length === 3 || m[3] > 0.9) bgc = c; n = n.parentElement; } bgc = bgc || 'rgb(255,255,255)';
          const L1 = lum(cs.color), L2 = lum(bgc), ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05); if (ratio < 4.5) out.light.push(e.tagName + ':' + e.textContent.slice(0, 20) + ':' + cs.color + ' on ' + bgc + ' ' + ratio.toFixed(2)); }
        if (e.getBoundingClientRect().right > innerWidth + .5) out.over.push(e.tagName + ':' + e.textContent.slice(0, 20)); }
      for (const b of r.querySelectorAll('button,input,select,summary')) if (b.getClientRects().length && b.getBoundingClientRect().height < 43.9) out.btn.push(b.tagName + ':' + (b.textContent || b.name).slice(0, 20) + ':' + b.getBoundingClientRect().height); return out; });
    assert.equal(geo.sw, geo.iw, '가로 스크롤'); assert.deepEqual(geo.small, [], '12px 미만'); assert.deepEqual(geo.btn, [], '44px 미만'); assert.deepEqual(geo.over, [], '화면 밖'); assert.deepEqual(geo.light, [], '옅은 글자색');
    if (SHOT) { fs.mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: path.join(SHOT, 'ledger-demo-' + w + '.png'), fullPage: true }); }
    await ctx.close();
  });
  for (const w of SIZES) await check('가격 신뢰도 띠: 모든 주요 탭에서 보이고 "미검증"을 명시, 근거 없는 표현 없음, 글씨·대비·가로 넘침 ' + w + 'px', async () => {
    const { ctx, page } = await open(w); const strip = page.locator('#hasPriceTrust'); await page.evaluate(() => { window.__writes.length = 0; });
    const tabs = [['#gtab-invest', null], ['#gtab-risk', null], ['#gtab-asset', null], ['#gtab-settings', null]];
    for (const [sel] of tabs) { await page.locator(sel).click(); await page.waitForTimeout(150); assert.ok(await strip.isVisible(), sel + ' 에서 띠 안 보임'); const t = await strip.innerText(); assert.match(t, /미검증 가격 · 출처·기준시각 확인 필요/); assert.ok(!/실시간|공식|검증 완료/.test(t), t); }
    await page.locator('#gtab-invest').click(); await page.locator('#subtabs-invest button').filter({ hasText: '해외' }).click(); assert.ok(await strip.isVisible());
    await strip.locator('summary').click(); const full = await strip.innerText(); for (const k of ['출처', '미확인', '저장된 이전 값', '바꾸지 않습니다', '판단 보류']) assert.ok(full.includes(k), k + ' / ' + full);
    const geo = await page.evaluate(() => { const r = document.getElementById('hasPriceTrust'), out = { sw: document.documentElement.scrollWidth, iw: innerWidth, small: [], over: [], low: [] };
      const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number), f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); };
      const bg = lum(getComputedStyle(r).backgroundColor);
      for (const e of [r, ...r.querySelectorAll('*')]) { if (!e.getClientRects().length) continue; const cs = getComputedStyle(e); if (parseFloat(cs.fontSize) < 12) out.small.push(e.tagName + cs.fontSize); const L1 = lum(cs.color), ratio = (Math.max(L1, bg) + .05) / (Math.min(L1, bg) + .05); if (ratio < 4.5) out.low.push(e.tagName + ratio.toFixed(2)); if (e.getBoundingClientRect().right > innerWidth + .5) out.over.push(e.tagName); }
      const sm = r.querySelector('summary'); out.sumH = sm.getBoundingClientRect().height; return out; });
    assert.equal(geo.sw, geo.iw); assert.deepEqual(geo.small, []); assert.deepEqual(geo.over, []); assert.deepEqual(geo.low, []); assert.ok(geo.sumH >= 43.9, '터치 영역 ' + geo.sumH);
    assert.deepEqual(await page.evaluate(() => window.__writes.slice()), [], '띠 표시·탭 이동 중 저장 API 호출');
    if (SHOT) { fs.mkdirSync(SHOT, { recursive: true }); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(SHOT, 'price-trust-overseas-' + w + '.png'), clip: { x: 0, y: 0, width: w, height: 760 } }); }
    await ctx.close();
  });
  await check('가격 신뢰도 띠: 이번 접속에서 갱신된 종목 수가 바뀌어도 가격·저장 데이터는 그대로', async () => {
    const { ctx, page } = await open(390); await page.waitForTimeout(400); const before = await snap(page); const t0 = await page.locator('#hasPriceTrust').innerText(); await page.locator('#hasPriceTrust summary').click();
    assert.match(await page.locator('#hasPriceTrust').innerText(), /이번 접속에서 새로 받은 종목 0개/); await page.evaluate(() => { window.__writes.length = 0; freshPrice['US:CCC'] = true; HASPriceTrustUI.refresh(); });
    await page.locator('#hasPriceTrust summary').click(); assert.match(await page.locator('#hasPriceTrust').innerText(), /이번 접속에서 새로 받은 종목 1개/);
    assert.deepEqual(await page.evaluate(() => window.__writes.slice()), []); assert.deepEqual(await snap(page), before); assert.match(await page.locator('#hasPriceTrust').innerText(), /미검증 가격/, '일부 갱신돼도 미검증 표시 유지'); await ctx.close();
  });
  await check('위험 지수 버튼 문구에서 근거 없는 "실시간" 제거', async () => { const { ctx, page } = await open(390); await page.locator('#gtab-risk').click(); await page.locator('#subtabs-risk button').filter({ hasText: '위험계' }).click(); const t = await page.locator('#rkFetchBtn').innerText(); assert.match(t, /미검증 출처/); assert.ok(!/실시간/.test(t)); await ctx.close(); });
  await check('데스크톱 1280px 진입·캡처', async () => { const { ctx, page } = await open(1280); await enter(page); assert.ok((await txt(page, '[data-testid=hld-banner]')).includes('합성 데이터')); if (SHOT) await page.screenshot({ path: path.join(SHOT, 'ledger-demo-desktop-1280.png'), fullPage: true }); await ctx.close(); });
  await check('저장 데이터 불변: 진입·입력·초기화·이탈 전후 키 목록·값 해시 동일, 저장 API 호출 0', async () => {
    const { ctx, page } = await open(390); await page.waitForTimeout(500); const before = await snap(page); await page.evaluate(() => { window.__writes.length = 0; });
    await enter(page); await page.locator('[name=qty]').first().fill('2'); await page.locator('[data-testid=hld-add]').click(); await page.locator('[data-testid=hld-reset]').click();
    await page.locator('[data-testid=hld-back]').click(); await page.waitForTimeout(400);
    const writes = await page.evaluate(() => window.__writes.slice()); assert.deepEqual(writes, [], '저장 API 호출: ' + writes.join()); assert.deepEqual(await snap(page), before);
    assert.ok(!(await page.evaluate(() => Object.keys(localStorage).some(k => /has_ledger|kst\.lab/.test(k)))), '새 키 생성 금지'); await ctx.close();
  });
  await check('기존 화면 보존: 시범 화면 다녀온 뒤 보유 종목·가계부·메모가 그대로 보임', async () => {
    const { ctx, page } = await open(390); const t0 = await page.locator('#panel-dashboard').innerText(); await enter(page); await page.locator('[data-testid=hld-back]').click(); await page.waitForTimeout(300);
    assert.ok(await page.locator('#panel-dashboard').isVisible()); assert.equal(await page.locator('#panel-dashboard').innerText(), t0);
    await page.locator('#gtab-asset').click(); await page.locator('#subtabs-asset button').filter({ hasText: '가계부' }).click(); assert.ok(await page.locator('#panel-ledger').isVisible()); await ctx.close();
  });
  await check('합성 시험 거래: 정상 추가는 합계 반영, 초과 매도·음수·0은 거부(오류 표시, 합계 불변)', async () => {
    const { ctx, page } = await open(390); await enter(page); const sum0 = await txt(page, '[data-testid=hld-sum-gen]');
    await page.locator('[name=qty]').first().fill('999'); await page.locator('[name=type]').first().selectOption('sell'); await page.locator('[data-testid=hld-add]').click();
    assert.ok((await page.locator('.hld-err').first().innerText()).includes('추가하지 않았습니다')); assert.equal(await txt(page, '[data-testid=hld-sum-gen]'), sum0);
    for (const bad of ['0', '-5', 'abc']) { await page.locator('[name=qty]').first().fill(bad); await page.locator('[data-testid=hld-add]').click(); assert.ok(await page.locator('.hld-err').count() >= 1); assert.equal(await txt(page, '[data-testid=hld-sum-gen]'), sum0); }
    await page.locator('[name=type]').first().selectOption('buy'); await page.locator('[name=qty]').first().fill('5'); await page.locator('[name=price]').first().fill('10000'); await page.locator('[data-testid=hld-add]').click();
    assert.ok((await txt(page, '[data-testid=hld-row-SYN-A]')).includes('20주')); await page.locator('[data-testid=hld-reset]').click(); assert.ok((await txt(page, '[data-testid=hld-row-SYN-A]')).includes('15주')); await ctx.close();
  });
  await check('뒤로가기/앞으로가기/새로고침/직접 주소: 추가 거래는 새로고침 시 소멸, 뒤로가기는 앱 안에서 이동', async () => {
    const { ctx, page } = await open(390); await enter(page); assert.ok(page.url().endsWith('#has-ledger-demo'));
    await page.locator('[name=qty]').first().fill('5'); await page.locator('[data-testid=hld-add]').click(); assert.ok((await txt(page, '[data-testid=hld-row-SYN-A]')).includes('20주'));
    await page.reload(); await page.waitForTimeout(700); await page.locator('[data-testid=hld-banner]').waitFor(); assert.ok((await txt(page, '[data-testid=hld-row-SYN-A]')).includes('15주'), '새로고침 후 추가 거래 소멸');
    await page.goBack(); await page.waitForTimeout(500); assert.ok(page.url().startsWith(origin), '앱 밖으로 나가면 안 됨'); assert.ok(!(await page.locator('#panel-ledgerdemo').isVisible()));
    await page.goForward(); await page.waitForTimeout(500); assert.ok(await page.locator('#panel-ledgerdemo').isVisible());
    await page.locator('#gtab-invest').click(); await page.waitForTimeout(200); assert.ok(!page.url().includes('has-ledger-demo'), '다른 탭으로 가면 주소 표시 제거'); await ctx.close();
    const d = await open(390); await d.page.goto(origin + '/portfolio_v5.html#has-ledger-demo'); await d.page.reload(); await d.page.waitForTimeout(800); await d.page.locator('[data-testid=hld-banner]').waitFor();
    await d.page.locator('[data-testid=hld-back]').click(); await d.page.waitForTimeout(400); assert.ok(d.page.url().startsWith(origin)); assert.ok(await d.page.locator('#panel-dashboard').isVisible(), '직접 주소로 연 뒤 돌아가기'); await d.ctx.close();
  });
  await check('오프라인: 한 번 열어 둔 뒤 오프라인에서 새로고침해도 시범 화면과 합성 계산 동작', async () => {
    const { ctx, page } = await open(390, { sw: true }); await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForTimeout(900); await enter(page); await page.waitForTimeout(300);
    await ctx.setOffline(true); await page.reload(); await page.waitForTimeout(900); await page.locator('[data-testid=hld-banner]').waitFor();
    assert.ok((await txt(page, '[data-testid=hld-sum-gen]')).includes('9,880원')); await ctx.close();
  });
  await check('시범 화면은 외부 주소를 요청하지 않음(진입·조작 중 외부 요청 기록 0)', async () => {
    const { ctx, page } = await open(390); await page.waitForTimeout(500); const n0 = external.length; await enter(page); await page.locator('[data-testid=hld-add]').click(); await page.waitForTimeout(500);
    assert.equal(external.length, n0, '시범 화면 조작 중 새 외부 요청: ' + external.slice(n0).join()); await ctx.close();
  });
  await browser.close(); server.close();
  console.log('앱이 시작 때 시도한 외부 요청(차단됨, 시험 환경에서만):', [...new Set(external)].length, '종류');
  const f = results.filter(r => r[1] === 'fail').length; console.log(f ? f + ' failed' : results.length + ' groups passed');
})();
