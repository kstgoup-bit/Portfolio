'use strict';
/* 20단계: 사용자 여정 전체를 실제 portfolio_v5.html에서 브라우저 자동화로 직접 검증한다(합성 데이터·복제 저장소만).
   방식 2가지: http(로컬 127.0.0.1 시험 서버) / file(사용자가 PC에서 파일을 직접 여는 방식). 폭: 360·390·430·1280.
   HAS에는 사용자 권한·관리자 역할이 없다(단일 사용자 + 비밀번호 1개). '창/방패' 역할은 종목 분류일 뿐이라 권한 시나리오는 만들지 않는다.
   실패는 중단하지 않고 모아서 재현 방법·캡처와 함께 보고한다. 사용법: node tests/e2e-journey-stage20.cjs [결과.json]  (SHOT_DIR=캡처 폴더) */
const fs = require('fs'), path = require('path'), http = require('http'), { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), HTML = fs.readFileSync(path.join(ROOT, 'portfolio_v5.html'), 'utf8');
const PWD = (HTML.match(/const PW_DEFAULT\s*=\s*"([^"]+)"/) || [])[1];        // 값은 출력하지 않는다
const mime = f => f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : f.endsWith('.png') ? 'image/png' : f.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
const server = http.createServer((req, res) => { try { const p = decodeURIComponent(req.url.split('?')[0]), f = path.resolve(ROOT, '.' + (p === '/' ? '/portfolio_v5.html' : p)); if (!f.startsWith(ROOT + path.sep)) throw Error(); res.setHeader('Content-Type', mime(f)); res.end(fs.readFileSync(f)); } catch { res.statusCode = 404; res.end('nf'); } });
const SEED = { v5_gen: [{ id: 1, name: '합성 일반주', ticker: 'AAA', quantity: 2, avgPrice: 40000, currentPrice: 50000 }], v5_dom: [{ id: 2, name: '합성 국내주', ticker: 'BBB', quantity: 3, avgPrice: 10000, currentPrice: 12000 }], v5_ov: [{ id: 3, name: '합성 해외주', ticker: 'CCC', quantity: 1, avgPrice: 90, currentPrice: 99 }], v5_pen: [{ id: 4, name: '합성 연금주', ticker: 'DDD', quantity: 5, avgPrice: 20000, currentPrice: 21000 }] };
const results = [], blocked = new Set(); let SHOT = process.env.SHOT_DIR; if (SHOT) fs.mkdirSync(SHOT, { recursive: true });
const FAILDIR = process.env.FAIL_DIR || path.join(require('os').tmpdir(), 'has-e2e-fail'); fs.mkdirSync(FAILDIR, { recursive: true });

async function newCtx(browser, w, mode, origin, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w >= 1000 ? 800 : 844 }, isMobile: w < 1000, hasTouch: w < 1000, serviceWorkers: opts.sw ? 'allow' : 'block' });
  await ctx.route('**/*', r => { const u = r.request().url(); if (u.startsWith(origin) || u.startsWith('file://') || u.startsWith('data:') || u.startsWith('blob:')) return r.continue(); blocked.add(new URL(u).host); return r.abort(); });
  await ctx.addInitScript(({ seed, custom }) => { if (!localStorage.getItem('__seeded')) { for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v)); if (custom) localStorage.setItem('v5_pw', custom); localStorage.setItem('__seeded', '1'); } document.addEventListener('DOMContentLoaded', () => { for (const f of ['fetchBenchmarkHistory', 'fetchFX', 'fetchKR', 'fetchUS', 'fetchRiskData']) window[f] = () => { }; }); }, { seed: SEED, custom: opts.customPw || null });
  return ctx;
}
const storeSnap = page => page.evaluate(() => JSON.stringify(Object.keys(localStorage).filter(k => k.startsWith('v5_') || k.startsWith('kst')).sort().map(k => [k, localStorage.getItem(k)])));
async function shot(page, name) { if (SHOT) await page.screenshot({ path: path.join(SHOT, name + '.png') }); }

async function run() {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const origin = 'http://127.0.0.1:' + server.address().port, o = { headless: true };
  if (process.env.BROWSER_EXECUTABLE_PATH) { o.executablePath = process.env.BROWSER_EXECUTABLE_PATH; o.args = ['--no-sandbox', '--disable-dev-shm-usage']; }
  const browser = await chromium.launch(o);
  for (const mode of ['http', 'file']) for (const w of [360, 390, 430, 1280]) {
    if (process.env.ONLY && process.env.ONLY !== mode + '@' + w) continue;
    const tag = mode + '@' + w, url = mode === 'http' ? origin + '/portfolio_v5.html' : 'file://' + path.join(ROOT, 'portfolio_v5.html');
    const ctx = await newCtx(browser, w, mode, origin, { sw: false }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push(e.message));
    const step = async (name, fn) => { const t0 = Date.now(); try { await fn(); results.push({ tag, name, ok: true }); if (process.env.VERBOSE) console.log('ok', tag, name, Date.now() - t0, 'ms'); } catch (e) { const f = path.join(FAILDIR, (tag + '-' + name).replace(/[^\w가-힣@-]+/g, '_') + '.png'); try { await page.screenshot({ path: f }); } catch { } results.push({ tag, name, ok: false, error: String(e.message).split('\n')[0].slice(0, 300), capture: f }); } };
    const ok = (c, m) => { if (!c) throw new Error(m); };
    await page.goto(url); await page.waitForTimeout(500);
    await step('잠금 화면 표시', async () => { ok(await page.locator('#lockScreen').isVisible(), '잠금 화면이 안 보임'); await shot(page, 'e2e-lock-' + tag); });
    await step('틀린 비밀번호는 거부하고 안내', async () => { await page.fill('#lockInput', 'wrong-pass-xyz'); await page.click('#lockBtn'); await page.waitForTimeout(200); ok(await page.locator('#lockScreen').isVisible(), '틀렸는데 열림'); ok(/틀렸/.test(await page.locator('#lockErr').innerText()), '오류 문구 없음'); });
    await step('기본 비밀번호(파일을 직접 연 경우의 비밀번호)로 입장', async () => { await page.fill('#lockInput', PWD); await page.click('#lockBtn'); await page.waitForTimeout(400); ok(!(await page.locator('#lockScreen').isVisible()), '잠금이 안 풀림'); ok(await page.locator('#panel-dashboard').isVisible(), '현황 화면이 안 보임'); });
    const before = await storeSnap(page);
    await step('일반 사용자: 투자 → 일반 탭의 가격 신뢰도 띠와 자세히 보기', async () => { await page.locator('#subtabs-invest button').filter({ hasText: '일반' }).click(); await page.waitForTimeout(200); const s = page.locator('#hasPriceTrust'); ok(await s.isVisible(), '신뢰도 띠 없음'); ok(/미검증/.test(await s.innerText()), '미검증 문구 없음'); await s.locator('summary').click(); const t = await s.innerText(); ok(/출처/.test(t) && /새로 받은 종목 0개/.test(t), '자세히 보기 내용 부족: ' + t.slice(0, 80)); ok(!/실시간|(?<!비)공식|검증 완료/.test(t), '금지 표현'); await shot(page, 'e2e-trust-general-' + tag); });
    await step('해외 투자 사용자: 해외 탭의 가격 신뢰도 띠', async () => { await page.locator('#subtabs-invest button').filter({ hasText: '해외' }).click(); await page.waitForTimeout(200); const s = page.locator('#hasPriceTrust'); ok(await s.isVisible(), '신뢰도 띠 없음'); ok(/미검증/.test(await s.innerText()), '미검증 문구 없음'); });
    await step('위험관리 → 탭 줄에 원장 시범이 있고 옆으로 더 있음을 알 수 있음', async () => {
      await page.click('#gtab-risk'); await page.waitForTimeout(200); const row = page.locator('#subtabs-risk'), btn = row.locator('button').filter({ hasText: '원장 시범' });
      const info = await row.evaluate((e, bt) => { const r = bt.getBoundingClientRect(), cr = e.getBoundingClientRect(); return { scroll: e.scrollWidth > e.clientWidth + 2, visible: r.right <= cr.right + 1 && r.left >= cr.left - 1, bg: getComputedStyle(e).backgroundImage.includes('gradient') }; }, await btn.elementHandle());
      if (!info.visible) ok(info.scroll && info.bg, '버튼이 가려졌는데 스크롤 단서(그림자)가 없음');
      let guard = 0; while (guard++ < 12) { const vis = await btn.evaluate((b, e) => { const r = b.getBoundingClientRect(), cr = e.getBoundingClientRect(); return r.right <= cr.right + 1 && r.left >= cr.left - 1; }, await row.elementHandle()); if (vis) break; const bb = await row.boundingBox(); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.wheel(220, 0); await page.waitForTimeout(120); }
      ok(guard < 12, '휠로 옆으로 밀어도 원장 시범 버튼에 도달하지 못함'); await shot(page, 'e2e-risk-tabs-' + tag); await btn.click(); await page.locator('[data-testid=hld-banner]').waitFor({ timeout: 3000 });
      ok(/시범 화면/.test(await page.locator('[data-testid=hld-banner]').innerText()), '배너 문구'); ok(await page.evaluate(() => location.hash) === '#has-ledger-demo', '주소 해시');
    });
    await step('원장 시범 첫 화면: 합계·이전 미리보기·지원 현황', async () => { const t = await page.locator('#panel-ledgerdemo').innerText(); for (const x of ['165,150원', '9,880원', '2,538원', '163,313원', '26,613원', '합성 보유 · 저장 안 함', '이력 미확인', '미지원']) ok(t.includes(x), '없음: ' + x); ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), '가로 넘침'); await shot(page, 'e2e-demo-' + tag); });
    await step('일반 계좌 시험 거래 추가 → 안내·숫자 변화·바뀐 숫자 이동', async () => {
      const gen = () => page.locator('[data-testid=hld-account-gen]').innerText(); ok(/15주/.test(await gen()), '시작 15주 아님'); const add = page.locator('[data-testid=hld-add]'); await add.scrollIntoViewIfNeeded(); await add.click(); await page.waitForTimeout(200);
      const n = await page.locator('[data-testid=hld-notice]').innerText(); ok(n.includes('추가했습니다') && n.includes('맨 위'), '안내 문구'); ok(/16주/.test(await gen()), '숫자가 안 바뀜');
      await page.locator('[data-testid=hld-jump]').click(); await page.waitForTimeout(300); ok(await page.locator('[data-testid=hld-account-gen]').evaluate(e => { const r = e.getBoundingClientRect(); return r.top >= -2 && r.top < innerHeight; }), '바뀐 카드로 이동 안 됨'); await shot(page, 'e2e-demo-after-add-' + tag); });
    await step('해외 계좌 시험 거래(환율 포함) 추가', async () => { const f = page.locator('[data-testid=hld-form]'); await f.scrollIntoViewIfNeeded(); await f.locator('select[name=account]').selectOption('ov'); await f.locator('input[name=qty]').fill('1'); await f.locator('input[name=price]').fill('50'); await f.locator('input[name=fx]').fill('1300'); await page.locator('[data-testid=hld-add]').click(); await page.waitForTimeout(200); ok(/6주/.test(await page.locator('[data-testid=hld-account-ov]').innerText()), '해외 5주→6주 아님'); });
    await step('잘못된 입력(수량 0)은 거부하고 숫자 불변', async () => { const f = page.locator('[data-testid=hld-form]'); await f.scrollIntoViewIfNeeded(); const t0 = await page.locator('[data-testid=hld-account-ov]').innerText(); await f.locator('input[name=qty]').fill('0'); await page.locator('[data-testid=hld-add]').click(); await page.waitForTimeout(200); ok(await page.locator('#panel-ledgerdemo [role=alert]').count() > 0, '오류 안내 없음'); ok((await page.locator('[data-testid=hld-account-ov]').innerText()) === t0, '숫자가 바뀜'); });
    await step('돌아가기 버튼 → 들어오기 직전 화면(위험관리 첫 화면)', async () => { const b = page.locator('[data-testid=hld-back]'); await b.scrollIntoViewIfNeeded(); await b.click(); await page.waitForTimeout(300); ok(!(await page.locator('#panel-ledgerdemo').isVisible()), '시범 화면이 안 닫힘'); ok(await page.locator('#panel-principledash').isVisible(), '이전 화면이 아님'); ok((await page.evaluate(() => location.hash)) === '', '해시 남음'); });
    await step('브라우저 뒤로/앞으로: 오류 없이 시범 화면 출입', async () => { await page.locator('#subtabs-risk button').filter({ hasText: '원장 시범' }).evaluate(b => b.click()); await page.waitForTimeout(300); ok(await page.locator('#panel-ledgerdemo').isVisible(), '진입'); await page.goBack(); await page.waitForTimeout(400); ok(!(await page.locator('#panel-ledgerdemo').isVisible()), '뒤로가기 후에도 시범 화면'); await page.goForward(); await page.waitForTimeout(400); ok(await page.locator('#panel-ledgerdemo').isVisible(), '앞으로가기 후 시범 화면 아님'); });
    await step('새로고침(F5)해도 시범 화면이 열리고 시험 거래는 사라짐', async () => { await page.reload(); await page.waitForTimeout(600); ok(await page.locator('#panel-ledgerdemo').isVisible(), '새로고침 후 시범 화면 아님'); ok(/15주/.test(await page.locator('[data-testid=hld-account-gen]').innerText()), '시험 거래가 남아 있음'); });
    await step('저장소 불변: 일반 사용자·해외 사용자 여정 전후 v5_*·kst* 키와 값 동일', async () => { ok((await storeSnap(page)) === before, '저장소가 바뀜'); const keys = await page.evaluate(() => Object.keys(localStorage)); ok(!keys.some(k => /has_ledger|kst\.lab/.test(k)), '원장 키 생성됨'); });
    await step('화면 오류(pageerror) 0', async () => { ok(errs.length === 0, errs.slice(0, 2).join(' | ')); });
    await ctx.close();
    if (w !== 1280 || mode === 'file') { /* 아래 시나리오는 http에서만 */ }
    if (mode === 'http' && w !== 1280) {
      // 사용자 지정 비밀번호가 저장된 경우(홈 화면 앱처럼): 기본 비밀번호는 거부, 지정 비밀번호는 허용
      const c2 = await newCtx(browser, w, mode, origin, { customPw: 'custom-test-pw-1' }), p2 = await c2.newPage(); await p2.goto(url); await p2.waitForTimeout(400);
      const step2 = async (name, fn) => { try { await fn(); results.push({ tag, name, ok: true }); } catch (e) { results.push({ tag, name, ok: false, error: String(e.message).split('\n')[0].slice(0, 300) }); } };
      await step2('지정 비밀번호 사용 시 기본 비밀번호는 거부', async () => { await p2.fill('#lockInput', PWD); await p2.click('#lockBtn'); await p2.waitForTimeout(200); ok(await p2.locator('#lockScreen').isVisible(), '기본 비밀번호로 열림'); });
      await step2('지정 비밀번호로 입장', async () => { await p2.fill('#lockInput', 'custom-test-pw-1'); await p2.click('#lockBtn'); await p2.waitForTimeout(300); ok(!(await p2.locator('#lockScreen').isVisible()), '안 열림'); });
      await c2.close();
      // 오프라인(서비스 워커가 먼저 캐시한 뒤 네트워크 차단)
      const c3 = await newCtx(browser, w, mode, origin, { sw: true }), p3 = await c3.newPage(); await p3.addInitScript(() => sessionStorage.setItem('v5_auth', '1'));
      await p3.goto(url); await p3.evaluate(async () => { if ('serviceWorker' in navigator) await navigator.serviceWorker.ready; }); await p3.waitForTimeout(1200); await p3.reload(); await p3.waitForTimeout(800);
      await step2('오프라인에서 앱 열기와 원장 시범 진입', async () => { await c3.setOffline(true); await p3.reload(); await p3.waitForTimeout(800); await p3.evaluate("switchTab('ledgerdemo')"); await p3.waitForTimeout(300); ok(/시범 화면/.test(await p3.locator('[data-testid=hld-banner]').innerText()), '오프라인 시범 화면'); await p3.locator('[data-testid=hld-add]').scrollIntoViewIfNeeded(); await p3.locator('[data-testid=hld-add]').click(); await p3.waitForTimeout(200); ok(await p3.locator('[data-testid=hld-notice]').count() === 1, '오프라인 추가'); });
      await c3.close();
    }
  }
  await browser.close(); server.close();
  const fails = results.filter(r => !r.ok);
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ total: results.length, passed: results.length - fails.length, failed: fails.length, blockedHosts: [...blocked].sort(), results }, null, 1));
  const byTag = {}; for (const r of results) { (byTag[r.tag] = byTag[r.tag] || { p: 0, f: 0 })[r.ok ? 'p' : 'f']++; }
  for (const [k, v] of Object.entries(byTag)) console.log(k.padEnd(12), '통과', v.p, '실패', v.f);
  for (const f of fails) console.log('FAIL', f.tag, f.name, '→', f.error);
  console.log('총', results.length, '통과', results.length - fails.length, '실패', fails.length, '| 차단된 외부 호스트 종류', blocked.size);
  process.exit(fails.length ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(2); });
