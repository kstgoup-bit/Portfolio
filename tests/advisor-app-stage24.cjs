'use strict';
/* 24단계 제5과제: AI 투자참모·알림 시험 화면 브라우저 시험(합성). 360/390/430px, 화면 전환·뒤로가기·가로 넘침·터치 크기·글자 크기/대비·오프라인.
   브라우저 에뮬레이션이며 갤럭시 실기기 시험이 아니다. 사용법: node tests/advisor-app-stage24.cjs [결과.json]   (SHOT_DIR=캡처 폴더) */
const fs = require('fs'), path = require('path'), http = require('http'), { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), SHOT = process.env.SHOT_DIR; if (SHOT) fs.mkdirSync(SHOT, { recursive: true });
const server = http.createServer((q, r) => { const f = path.join(ROOT, 'has', path.basename(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8' }); r.end(d); }); });
const results = [], blocked = new Set(), ok = (c, m) => { if (!c) throw new Error(m); };
async function step(tag, name, fn) { try { await fn(); results.push({ tag, name, ok: true }); } catch (e) { results.push({ tag, name, ok: false, error: e.message }); console.log('FAIL', tag, name, '-', e.message); } }
const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
async function textAudit(p) { return p.evaluate(() => { const bad = [], parse = s => (s.match(/[\d.]+/g) || []).map(Number);
  const bg = e => { for (; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c.length < 4 || c[3] > 0)) return c.slice(0, 3); } return [255, 255, 255]; };
  document.querySelectorAll('main *').forEach(e => { if (!e.offsetParent && e.tagName !== 'MAIN') return; const t = [...e.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(''); if (!t) return;
    const cs = getComputedStyle(e), fs = parseFloat(cs.fontSize), c = parse(cs.color).slice(0, 3); bad.push({ t: t.slice(0, 20), fs, c, b: bg(e) }); }); return bad; }); }
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const origin = 'http://127.0.0.1:' + server.address().port, o = { headless: true };
  if (process.env.BROWSER_EXECUTABLE_PATH) { o.executablePath = process.env.BROWSER_EXECUTABLE_PATH; o.args = ['--no-sandbox', '--disable-dev-shm-usage']; }
  const browser = await chromium.launch(o);
  for (const w of [360, 390, 430]) {
    const tag = w + 'px', ctx = await browser.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true });
    await ctx.route('**/*', r => { const u = r.request().url(); if (u.startsWith(origin) || u.startsWith('file://')) return r.continue(); blocked.add(u); return r.abort(); });
    const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); await p.goto(origin + '/advisor-app.html'); await p.waitForFunction(() => !!window.__advResult && !document.querySelector('[data-testid=view-staff]').hidden);
    const t = id => p.locator('[data-testid=' + id + ']');
    // History/hash navigation is asynchronous. Wait for the expected route and every view invariant.
    const waitRoute = (hash, visible) => p.waitForFunction(({ hash, visible }) => location.hash === hash &&
      ['view-staff', 'view-alerts', 'view-detail'].every(id => document.querySelector('[data-testid=' + id + ']').hidden === (id !== visible)), { hash, visible });
    const tab = async name => { await t('tab-' + name).click(); await waitRoute('#' + name, 'view-' + name); };
    const openDetail = async ticker => { await t('open-' + ticker).click(); await waitRoute('#stock-' + ticker, 'view-detail'); };
    const backToStaff = async () => { await t('btn-back').click(); await waitRoute('#staff', 'view-staff'); };
    await step(tag, '첫 화면: 합성 배너·요약 6개 구역·페이지 오류 0', async () => { ok(/합성 데이터/.test(await t('app-banner').innerText()), '배너'); for (const s of ['sec-summary', 'sec-risk', 'sec-buy', 'sec-cash', 'sec-fresh']) ok(await t(s).isVisible(), s + ' 안 보임'); ok(errs.length === 0, errs.join(';'));
      ok(/판단 보류 3/.test(await t('sec-summary').innerText()) && /매수 검토 1/.test(await t('sec-summary').innerText()), '요약 수치'); if (SHOT) await p.screenshot({ path: path.join(SHOT, 'advisor-staff-' + w + '.png'), fullPage: true }); });
    await step(tag, '가로 넘침 없음(참모·알림·상세)', async () => { const ov = () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); ok(await ov() <= 0, '참모 ' + await ov()); await tab('alerts'); ok(await ov() <= 0, '알림 ' + await ov()); await tab('staff'); await openDetail('SYN-KR2'); ok(await ov() <= 0, '상세 ' + await ov()); await backToStaff(); });
    await step(tag, '터치 영역: 보이는 모든 버튼이 44×44px 이상', async () => { for (const v of ['tab-staff', 'tab-alerts']) { await tab(v.slice(4)); const small = await p.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.offsetParent).map(b => { const r = b.getBoundingClientRect(); return [b.textContent.trim().slice(0, 14), Math.round(r.width), Math.round(r.height)]; }).filter(x => x[1] < 44 || x[2] < 44)); ok(!small.length, JSON.stringify(small)); } });
    await step(tag, '글자 12px 이상, 글자색 대비 7:1 이상(어두운 글자)', async () => { const out = []; for (const v of ['tab-staff', 'tab-alerts']) { await tab(v.slice(4)); for (const x of await textAudit(p)) { const l1 = lum(x.c), l2 = lum(x.b), cr = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); if (x.fs < 12 || cr < 7) out.push([x.t, x.fs, Math.round(cr * 10) / 10]); } } await tab('staff'); ok(!out.length, JSON.stringify(out.slice(0, 5))); });
    await step(tag, '화면 전환·뒤로가기: 상세 → 돌아가기, 브라우저 뒤로/앞으로, 알림 탭 해시', async () => { await openDetail('SYN-KR1'); ok(await p.evaluate(() => location.hash) === '#stock-SYN-KR1', '해시'); const d = await t('detail-card').innerText(); for (const k of ['확인된 사실', '반대 근거', '주요 위험', '검토할 매도 조건', '추가 확인이 필요한 사항', '같은 분석 엔진']) ok(d.includes(k), '상세에 없음: ' + k);
      await backToStaff(); ok(await t('view-staff').isVisible() && !await t('view-detail').isVisible(), '돌아가기'); await tab('alerts'); ok(await t('view-alerts').isVisible(), '알림 탭'); await p.goBack(); await waitRoute('#staff', 'view-staff'); ok(await t('view-staff').isVisible(), '브라우저 뒤로'); await p.goForward(); await waitRoute('#alerts', 'view-alerts'); ok(await t('view-alerts').isVisible(), '앞으로'); });
    await step(tag, '알림: 중요도순, 확인 완료 이동, 같은 신호 반복 억제, 8일 뒤 재알림, 악화 시 변화 표시', async () => { await tab('alerts'); const pr = async () => (await p.locator('[data-testid=alert]').evaluateAll(a => a.map(x => Number(x.dataset.priority))));
      let a0 = await pr(); ok(a0.length >= 3, '알림 수 ' + a0.length); ok(a0.every((v, i) => !i || a0[i - 1] <= v), '중요도 정렬 아님 ' + a0); const n0 = a0.length;
      await t('btn-again').click(); ok((await pr()).length === n0, '같은 신호 반복 알림이 늘어남'); ok(/억제 [1-9]/.test(await t('alert-log').innerText()), '억제 기록 ' + await t('alert-log').innerText());
      await t('btn-ack').first().click(); ok((await pr()).length === n0 - 1, '확인 완료가 안 빠짐'); ok(/✔/.test(await t('alerts-done').innerText()), '확인 완료 목록');
      await t('btn-later').click(); ok(/새로 표시 [1-9]/.test(await t('alert-log').innerText()), '8일 뒤 재알림 없음'); await t('btn-worse').click(); ok(/변화\(악화\)/.test(await t('alerts-open').innerText()), '변화 표시 없음'); ok((await pr()).every((v, i, a) => !i || a[i - 1] <= v), '정렬'); if (SHOT) await p.screenshot({ path: path.join(SHOT, 'advisor-alerts-' + w + '.png'), fullPage: true }); });
    await step(tag, '시세 조회 실패 시뮬레이션: 모든 의견이 판단 보류, 매수 후보 0, 재조회 복구', async () => { await tab('staff'); await t('btn-fail').click(); const s = await t('sec-summary').innerText(); ok(/판단 보류 4/.test(s) && !/매수 검토 [1-9]/.test(s), s); ok(/지금 매수 검토 후보 없음/.test(await t('sec-buy').innerText()), '후보'); await t('btn-retry').click(); ok(/매수 검토 1/.test(await t('sec-summary').innerText()), '복구'); });
    await step(tag, '오프라인: 연결을 끊고 새로고침해도 화면 정상(외부 자원 없음)', async () => { await ctx.setOffline(true); const q = await ctx.newPage(), e2 = []; q.on('pageerror', e => e2.push(e.message)); await q.goto('file://' + path.join(ROOT, 'has', 'advisor-app.html')); await q.waitForFunction(() => !!window.__advResult && !document.querySelector('[data-testid=view-staff]').hidden); ok(await q.locator('[data-testid=sec-summary]').isVisible(), '오프라인 화면'); await q.locator('[data-testid=tab-alerts]').click(); await q.waitForFunction(() => location.hash === '#alerts' && !document.querySelector('[data-testid=view-alerts]').hidden); await q.locator('[data-testid=btn-again]').click(); ok(await q.locator('[data-testid=alert-log]').isVisible(), '오프라인 조작'); ok(!e2.length, e2.join()); await q.close(); await ctx.setOffline(false); });
    await step(tag, '페이지 오류 0, 외부 요청 시도 0', async () => { ok(errs.length === 0, errs.join(';')); ok(blocked.size === 0, [...blocked].join(',')); });
    await ctx.close();
  }
  await browser.close(); server.close(); const f = results.filter(r => !r.ok); console.log(`${results.length - f.length}/${results.length} 통과 (폭 3종 × 9 상황) · 외부 요청 시도 ${blocked.size}건 · 브라우저 에뮬레이션(갤럭시 실기기 아님)`);
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(results, null, 2)); process.exit(f.length ? 1 : 0);
})();
