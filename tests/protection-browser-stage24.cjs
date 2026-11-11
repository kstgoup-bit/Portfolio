'use strict';
/* 24단계 제2·3과제 브라우저 시험(합성 데이터, 외부 네트워크 차단): ① 앱 업데이트 전후(main vs 24단계) 같은 합성 기록으로 열어 기록 불변·동일 비교
   ② 실제 앱 화면의 백업→손상 복원 거절→복원 취소→복원 적용→되돌리기 ③ AI 읽기 연결 모듈을 실제 앱에 붙여 오류를 일으켜도 기록·화면 정상.
   사용법: node tests/protection-browser-stage24.cjs [결과.json] */
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), { execSync } = require('child_process'), { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), sha = s => crypto.createHash('sha256').update(s).digest('hex');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'has24-')); fs.writeFileSync(path.join(tmp, 'main.html'), execSync('git show origin/main:portfolio_v5.html', { cwd: ROOT, maxBuffer: 1e9 }));
const html = fs.readFileSync(path.join(ROOT, 'portfolio_v5.html'), 'utf8'), PWD = (html.match(/const PW_DEFAULT\s*=\s*"([^"]+)"/) || [])[1];
const SEED = { v5_gen: [{ id: 1, name: '합성 일반주', ticker: 'AAA', quantity: 2, avgPrice: 40000, currentPrice: 50000 }, { id: 11, name: '예수금', ticker: 'DEP_GEN', quantity: 1, avgPrice: 1, currentPrice: 300000 }],
  v5_dom: [{ id: 2, name: '합성 국내주', ticker: 'BBB', quantity: 3, avgPrice: 10000, currentPrice: 12000 }], v5_ov: [{ id: 3, name: '합성 해외주', ticker: 'CCC', quantity: 1, avgPrice: 90, currentPrice: 99 }], v5_pen: [{ id: 4, name: '합성 연금주', ticker: 'DDD', quantity: 5, avgPrice: 20000, currentPrice: 21000 }],
  v5_div: [{ date: '2026-10-01', amount: 1000, name: '합성' }], v5_ledger: { '2026-10': { income: [{ name: '합성 급여', amount: 1000, date: '2026-10-01', cat: '급여' }], expense: [], invest: [] } } };
const USER_KEYS = ['v5_gen', 'v5_dom', 'v5_ov', 'v5_pen', 'v5_div', 'v5_ledger'], results = [], blocked = new Set();
const ok = (c, m) => { if (!c) throw new Error(m); };
async function ctxFor(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', acceptDownloads: true });
  await ctx.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file://') || u.startsWith('data:') || u.startsWith('blob:')) return r.continue(); blocked.add(new URL(u).host); return r.abort(); });
  await ctx.addInitScript(seed => { if (!localStorage.getItem('__seeded')) { for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v)); localStorage.setItem('v5_fx', '1370'); localStorage.setItem('__seeded', '1'); } }, SEED);
  return ctx;
}
async function open(ctx, file) { const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); await p.goto('file://' + file); await p.waitForTimeout(400); await p.fill('#lockInput', PWD); await p.click('#lockBtn'); await p.waitForTimeout(1500); p.errs = errs; return p; }
const userState = p => p.evaluate(keys => JSON.stringify(keys.map(k => [k, localStorage.getItem(k)])), USER_KEYS);
const tot = p => p.evaluate(() => [genStocks, domStocks, ovStocks, penStocks].map(a => a.reduce((s, x) => s + x.quantity * x.currentPrice, 0)));
async function step(name, fn) { try { await fn(); results.push({ name, ok: true }); console.log('ok  ', name); } catch (e) { results.push({ name, ok: false, error: e.message }); console.log('FAIL', name, '-', e.message); } }

(async () => {
  const o = { headless: true }; if (process.env.BROWSER_EXECUTABLE_PATH) { o.executablePath = process.env.BROWSER_EXECUTABLE_PATH; o.args = ['--no-sandbox', '--disable-dev-shm-usage']; }
  const browser = await chromium.launch(o), seedStr = JSON.stringify(USER_KEYS.map(k => [k, JSON.stringify(SEED[k])]));
  const view = {};
  for (const [tag, file] of [['main(기존 운영)', path.join(tmp, 'main.html')], ['24단계 브랜치', path.join(ROOT, 'portfolio_v5.html')]]) {
    const ctx = await ctxFor(browser), p = await open(ctx, file);
    await step(tag + ': 합성 기록으로 열기 — 사용자 기록 6종이 열기 전과 동일, 페이지 오류 0', async () => { ok(await userState(p) === seedStr, '열기만 했는데 기록이 바뀜'); ok(p.errs.length === 0, '페이지 오류: ' + p.errs.join(';')); view[tag] = { t: await tot(p), s: await userState(p) }; });
    await ctx.close();
  }
  await step('앱 업데이트 전후: 계정별 평가 합계·사용자 기록 동일', async () => { const [a, b] = Object.values(view); ok(JSON.stringify(a.t) === JSON.stringify(b.t), '합계 다름 ' + JSON.stringify([a.t, b.t])); ok(a.s === b.s, '기록 다름'); });

  const ctx = await ctxFor(browser), p = await open(ctx, path.join(ROOT, 'portfolio_v5.html')), before = await userState(p);
  let backupText = null, backupPath = path.join(tmp, 'backup.json');
  await step('백업 내보내기 → 파일 해시 기록, 내용이 6종 기록을 포함', async () => { const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => exportData())]); await dl.saveAs(backupPath); backupText = fs.readFileSync(backupPath, 'utf8'); const j = JSON.parse(backupText);
    ok(j.format === 'kst-portfolio-backup' && j.schemaVersion === 6, '형식'); ok(/^[0-9a-f]{64}$/.test(sha(backupText)), '해시'); ok(!/v5_pw|apiKey|gasUrl|GEMINI/i.test(backupText), '비밀 키가 백업에 포함됨'); ok(JSON.parse(j.storage.v5_gen)[0].ticker === 'AAA', '내용'); console.log('     backup sha256', sha(backupText).slice(0, 16)); });
  await p.click('#gtab-settings'); await p.waitForTimeout(300);
  const choose = async f => { await p.setInputFiles('#restoreFile', f); await p.waitForTimeout(500); };
  await step('손상 백업(잘림/악성/미래 버전) 선택 → 거절 안내, 기록 불변', async () => { const cases = { cut: backupText.slice(0, 300), evil: backupText.replace('합성 일반주', '<img src=x onerror=alert(1)>'), future: backupText.replace('"schemaVersion": 6', '"schemaVersion": 7') };
    for (const [n, t] of Object.entries(cases)) { const f = path.join(tmp, n + '.json'); fs.writeFileSync(f, t); await choose(f); ok(/거절|변경하지 않았/.test(await p.locator('#backupMsg').innerText()), n + ' 거절 안내 없음'); ok(await p.locator('#portfolioRestorePreview').count() === 0, n + ' 미리보기가 열림'); ok(await userState(p) === before, n + ' 기록이 바뀜'); } });
  await step('사용자 기록 일부 삭제(국내 계좌 비움) 후 백업 선택 → 미리보기만, 아직 적용 전(복원 취소=적용 안 함)', async () => { await p.evaluate(() => { localStorage.setItem('v5_dom', '[]'); }); const cur = await userState(p); await choose(backupPath);
    ok(await p.locator('#portfolioRestorePreview').count() === 1, '미리보기 없음'); ok(/아직 적용하지 않았/.test(await p.locator('#portfolioRestorePreview').innerText()), '문구'); ok(await userState(p) === cur, '미리보기 중 기록이 바뀜'); await p.evaluate(() => document.getElementById('portfolioRestorePreview').remove()); ok(await userState(p) === cur, '취소 후 기록이 바뀜'); });
  await step('복원 적용 → 원래 6종 기록과 동일, 같은 백업 반복 적용해도 동일', async () => { await choose(backupPath); await p.locator('#portfolioRestorePreview button', { hasText: '복원 적용' }).click(); await p.waitForTimeout(500); const a = await userState(p); ok(a === before, '복원 결과가 원본과 다름');
    await choose(backupPath); await p.locator('#portfolioRestorePreview button', { hasText: '복원 적용' }).click(); await p.waitForTimeout(500); ok(await userState(p) === before, '반복 복원 결과가 다름'); });
  await step('복원 되돌리기 → 직전 상태로 복귀(오류 없음)', async () => { await p.evaluate(() => { localStorage.setItem('v5_dom', '[]'); }); const cur = await userState(p); await choose(backupPath); await p.locator('#portfolioRestorePreview button', { hasText: '복원 적용' }).click(); await p.waitForTimeout(400); ok(await userState(p) !== cur, '적용 안 됨');
    await p.locator('#portfolioBackupTools button', { hasText: '되돌리기' }).click(); await p.waitForTimeout(500); ok(await userState(p) === cur, '되돌리기 결과가 직전과 다름'); await p.evaluate(s => { for (const [k, v] of JSON.parse(s)) localStorage.setItem(k, v); }, before); });
  await step('저장공간 부족 모사: 사본 저장 실패 → 복원 거부, 기록 불변', async () => { await p.evaluate(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'kst.portfolio.restoreJournal') throw new DOMException('quota', 'QuotaExceededError'); return set.call(this, k, v); }; localStorage.setItem('v5_dom', '[]'); });
    const cur = await userState(p); await choose(backupPath); await p.locator('#portfolioRestorePreview button', { hasText: '복원 적용' }).click(); await p.waitForTimeout(400); ok(await userState(p) === cur, '실패했는데 기록이 바뀜'); ok(/저장하지 못했|변경하지 않았/.test(await p.locator('#backupMsg').innerText()), '안내 문구'); await p.reload(); });
  await ctx.close();

  // AI 연결 모듈을 실제 앱에 붙여서 오류를 일으켜도 기존 기록·화면이 정상인지
  const c2 = await ctxFor(browser), q = await open(c2, path.join(ROOT, 'portfolio_v5.html')), b2 = await userState(q);
  for (const f of ['quote-model', 'watch-engine', 'advisor-core', 'quote-crosscheck', 'advice-guard', 'portfolio-reader', 'advisor-bridge']) await q.addScriptTag({ path: path.join(ROOT, 'has', f + '.js') });
  await step('AI 읽기 연결을 실제 앱에서 실행 — 쓰기 0, 보유종목은 시세 없으면 판단 보류, 기록 해시 불변', async () => { const r = await q.evaluate(() => { const o = HASAdvisorBridge.run(k => localStorage.getItem(k), {}, new Date().toISOString(), { basis: 'synthetic' }); return { s: o.status, n: o.advices.length, ops: o.advices.map(a => a.opinion), w: o.writes }; });
    ok(r.n === 4 && r.ops.every(x => x === '판단 보류') && r.w === 'none', JSON.stringify(r)); ok(await userState(q) === b2, '기록이 바뀜'); });
  await step('분석 모듈이 예외를 던져도(주입) 앱 화면·기록 정상, 결과는 partial/error 로 표시', async () => { const r = await q.evaluate(() => { HASWatchEngine.evaluateStock; const orig = HASAdvisorBridge.run; const wrapped = Object.assign({}, HASWatchEngine); const q1 = { ticker: 'AAA', market: 'KR', price: 1, currency: 'KRW', kind: 'close', source: 'S', asOfDate: '2026-11-05', verification: 'independent-verified', get x() { return 1; } };
      Object.defineProperty(q1, 'verification', { get() { throw new Error('주입된 오류'); } }); const o = HASAdvisorBridge.run(k => localStorage.getItem(k), { quotes: { AAA: q1 } }, new Date().toISOString(), { basis: 'synthetic' }); renderAll(); return { s: o.status, e: o.errors.length }; });
    ok(r.s === 'partial' && r.e === 1, JSON.stringify(r)); ok(await userState(q) === b2, '기록이 바뀜'); ok(q.errs.length === 0, '페이지 오류 ' + q.errs.join(';')); ok(await q.locator('#lockScreen').isHidden(), '앱 화면 이상'); });
  await browser.close();
  ok(true); const failed = results.filter(r => !r.ok), ext = [...blocked]; console.log(`\n${results.length - failed.length}/${results.length} 통과 · 외부 호스트 차단 시도 ${ext.length}건(${ext.join(',') || '없음'}) · 실제 외부 호출 0`);
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ results, blockedHosts: ext }, null, 2)); process.exit(failed.length ? 1 : 0);
})();
