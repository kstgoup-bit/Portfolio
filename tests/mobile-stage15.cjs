/* 15단계 투자관리 실험실 자동 시험(합성 데이터 전용, 실제 갤럭시 기기 시험 아님). npm run test:mobile15
 * 환경: BROWSER_EXECUTABLE_PATH(선택). 외부 네트워크 요청이 1건이라도 나오면 실패한다. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]); if (!u.startsWith('/mobile-lab/')) { res.writeHead(404); return res.end('not served'); }
  const f = path.join(ROOT, u); if (!f.startsWith(path.join(ROOT, 'mobile-lab')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
let passed = 0; const ok = n => { passed++; console.log('PASS ' + n); };
const SIZES = [[360, 740], [390, 844], [430, 932]];
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port + '/mobile-lab/invest.html';
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined });
  const open = async (w, h, ctxOpts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, acceptDownloads: true, ...ctxOpts }), page = await ctx.newPage(); const external = [], errors = [];
    await ctx.route('**/*', route => { const u = route.request().url(); if (!u.startsWith('http://127.0.0.1:')) { external.push(u); return route.abort(); } return route.continue(); });
    page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base); return { ctx, page, external, errors };
  };
  const noOverflow = async (page, why = '') => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'horizontal overflow ' + why);
  const textQuality = async (page, why = '') => {
    const bad = await page.evaluate(() => {
      const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number), f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); };
      const bgOf = el => { for (let e = el; e; e = e.parentElement) { const b = getComputedStyle(e).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; } return 'rgb(255,255,255)'; };
      const out = []; for (const el of document.querySelectorAll('body *')) { if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue; const cs = getComputedStyle(el); if (cs.display === 'none' || el.closest('[hidden]')) continue;
        const px = parseFloat(cs.fontSize), l1 = lum(cs.color), l2 = lum(bgOf(el)), cr = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); if (px < 12 || cr < 4.5) out.push(el.tagName + '#' + el.id + ':' + px + 'px cr' + cr.toFixed(1)); } return out; });
    assert.deepEqual(bad, [], '글자 크기(12px↑)/대비 위반 ' + why);
  };
  const targets = async (page, why = '') => { const small = await page.evaluate(() => [...document.querySelectorAll('button,select,input:not([type=hidden])')].filter(e => !e.closest('[hidden]') && e.getBoundingClientRect().width > 0 && !e.disabled).map(e => [e.id || e.tagName, Math.round(e.getBoundingClientRect().height)]).filter(([, h]) => h < 44)); assert.deepEqual(small, [], '터치 영역 44px 미만 ' + why); };
  const tab = async (page, t) => { await page.click('#tab-' + t); };
  const text = (page, sel) => page.textContent(sel);
  const sample = async page => { await page.click('#btn-sample'); };
  const dl = async (page, sel) => { const [d] = await Promise.all([page.waitForEvent('download'), page.click(sel)]); return fs.readFileSync(await d.path(), 'utf8'); };
  const PROTECTED = ['portfolio_v5.html', 'portfolio.html', 'service-worker.js', 'manifest.json', 'backup/core.js'], before = Object.fromEntries(PROTECTED.map(f => [f, sha(f)]));

  // 1. 세 화면 크기: 각 탭 레이아웃(가로 넘침·글자·터치 영역)
  for (const [w, h] of SIZES) {
    const c = await open(w, h), p = c.page; await sample(p);
    for (const t of ['risk', 'pnl', 'bt', 'pilot']) { await tab(p, t); await noOverflow(p, `${w} ${t}`); await textQuality(p, `${w} ${t}`); await targets(p, `${w} ${t}`); }
    assert.deepEqual(c.external, []); assert.deepEqual(c.errors, []); await c.ctx.close();
  } ok('layout 360/390/430 × 4 tabs: no overflow, text ≥12px & contrast, targets ≥44px');

  // 2. 위험 화면 금액·단위·기준 경고 문구
  for (const [w, h] of SIZES) {
    const c = await open(w, h), p = c.page; await sample(p);
    assert.match(await text(p, '#risk-summary'), /1억 3,500만원/); assert.match(await text(p, '#risk-summary'), /135,000,000원/); assert.match(await text(p, '#risk-summary'), /37\.8%/);
    assert.match(await text(p, '#risk-alerts'), /기준이 설정되지 않아 경고하지 않습니다/);
    await p.fill('#th-ticker', '30'); await p.click('#btn-th');
    const al = await text(p, '#risk-alerts'); assert.match(al, /합성전자/); assert.match(al, /37\.8%/); assert.match(al, /점검 참고용이며 매도 지시가 아닙니다/); assert.doesNotMatch(al, /매도하세요|팔아|매수하세요/);
    assert.match(await text(p, '#risk-themes'), /미분류|빅테크/); assert.match(await text(p, '#risk-themes'), /간접 노출.*미확인/);
    await noOverflow(p); await textQuality(p); assert.deepEqual(c.errors, []); await c.ctx.close();
  } ok('risk screen: amounts/units, no-threshold notice, user-set threshold alert wording (not an order)');

  // 3. 기준 입력 검증 + 하락 시나리오 계산식
  {
    const c = await open(390, 844), p = c.page; await sample(p);
    for (const bad of ['0', '101', 'abc', '-5']) { await p.fill('#th-ticker', bad); await p.click('#btn-th'); assert.equal(await p.isVisible('#th-error'), true, bad); }
    await p.fill('#th-ticker', ''); await p.click('#btn-th'); assert.equal(await p.isVisible('#th-error'), false);
    await p.selectOption('#st-kind', 'ticker'); await p.selectOption('#st-key', 'AAA'); for (const bad of ['0', '101', 'x', '']) { await p.fill('#st-drop', bad); await p.click('#btn-st-add'); assert.equal(await p.isVisible('#st-error'), true, bad); }
    await p.fill('#st-drop', '50'); await p.click('#btn-st-add'); const r = await text(p, '#st-result'); assert.match(r, /2,550만원/); assert.match(r, /25,500,000원/); assert.match(r, /18\.9%/); assert.match(r, /하락률 50%/); assert.match(r, /상관관계 미반영/);
    await p.selectOption('#st-kind', 'theme'); await p.selectOption('#st-key', '빅테크'); await p.fill('#st-drop', '20'); await p.click('#btn-st-add'); assert.match(await text(p, '#st-result'), /1,020만원/); assert.match(await text(p, '#st-result'), /합산하지 않음/);
    await p.selectOption('#st-kind', 'all'); await p.fill('#st-drop', '10'); await p.click('#btn-st-add'); assert.match(await text(p, '#st-result'), /1,350만원/);
    await p.click('#st-list .btn >> nth=0'); assert.doesNotMatch(await text(p, '#st-list'), /합성전자.*50%/); await noOverflow(p); await textQuality(p); await targets(p); assert.deepEqual(c.errors, []); await c.ctx.close();
  } ok('stress: input validation, loss amount/ratio/formula/assumptions, overlap not summed, delete');

  // 4. 투자 판단 기록
  {
    const c = await open(360, 740), p = c.page; await sample(p);
    assert.match(await text(p, '#th-missing'), /판단 기록이 없는 보유 종목/);
    await p.click('#btn-tk-add'); assert.equal(await p.isVisible('#tk-error'), true);
    await p.fill('#tk-ticker', 'MSX'); await p.fill('#tk-reason', '클라우드 성장'); await p.fill('#tk-dis', '성장률 10% 미만 2분기 연속'); await p.fill('#tk-date', '2020-01-01'); await p.click('#btn-tk-add'); assert.equal(await p.isVisible('#tk-error'), true);
    await p.fill('#tk-date', '2099-01-01'); await p.click('#btn-tk-add'); assert.equal(await p.isVisible('#tk-error'), false); assert.match(await text(p, '#tk-list'), /MSX/); assert.match(await text(p, '#tk-list'), /변경 이력.*1건/);
    await p.click('#tk-list .btn'); assert.equal(await p.isVisible('#tk-list .warn'), true);   // 사유 없이 변경 불가
    await p.selectOption('#tk-list select', 'buyReason'); await p.fill('#tk-list input[placeholder="새 값"]', '클라우드 + AI'); await p.fill('#tk-list input[placeholder^="변경 사유"]', '실적 발표 후 보강'); await p.click('#tk-list .btn');
    assert.match(await text(p, '#tk-list'), /변경 이력.*2건/); assert.match(await text(p, '#tk-list'), /클라우드 \+ AI/); assert.match(await text(p, '#tk-list'), /실적 발표 후 보강/);
    const exp = await dl(p, '#btn-tk-export'); const j = JSON.parse(exp); assert.equal(j.theses.length, 1); assert.equal(j.theses[0].history.length, 2);
    const c2 = await open(360, 740), p2 = c2.page; await p2.setInputFiles('#f-thesis', { name: 't.json', mimeType: 'application/json', buffer: Buffer.from(exp) }); await p2.waitForSelector('#tk-list .row'); assert.match(await text(p2, '#tk-list'), /MSX/); assert.match(await text(p2, '#tk-list'), /변경 이력.*2건/);
    const bad = JSON.parse(exp); bad.theses[0].history = []; await p2.setInputFiles('#f-thesis', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) }); await p2.waitForFunction(() => /가져오기 실패/.test(document.getElementById('tk-error').textContent)); assert.equal((await p2.$$('#tk-list .row')).length, 1);
    await noOverflow(p); await textQuality(p); await targets(p); assert.deepEqual([...c.errors, ...c2.errors], []); await c.ctx.close(); await c2.ctx.close();
  } ok('thesis log: validation, append-only history, export/import round trip, tampered import rejected');

  // 5. 백업 파일 불러오기: 읽기 전용(원본 파일·저장소 무변경), 환율 없으면 해외는 자료 부족
  {
    const backup = JSON.stringify({ version: 5, domStocks: [{ id: 1, ticker: 'AAA', name: '합성전자', quantity: 10, avgPrice: 100, currentPrice: 150 }], ovStocks: [{ id: 2, ticker: 'USX', name: '합성미국', quantity: 2, avgPrice: 90, currentPrice: 100 }], penStocks: [], genStocks: [] });
    const c = await open(390, 844), p = c.page; await p.setInputFiles('#f-backup', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
    await p.waitForFunction(() => /보유 2건/.test(document.getElementById('load-status').textContent)); assert.match(await text(p, '#risk-summary'), /평가에서 제외된 보유 1건/); assert.match(await text(p, '#risk-summary'), /USD 환율 없음/);
    await p.fill('#in-fx', '1400'); await p.dispatchEvent('#in-fx', 'change'); await p.waitForFunction(() => !/평가에서 제외/.test(document.getElementById('risk-summary').textContent)); assert.match(await text(p, '#risk-summary'), /281,500원/);
    await p.setInputFiles('#f-backup', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{not json') }); await p.waitForFunction(() => /읽지 못했습니다/.test(document.getElementById('load-status').textContent));
    assert.equal(await p.evaluate(() => localStorage.length + sessionStorage.length), 0); assert.deepEqual(c.external, []); assert.deepEqual(c.errors, []); await c.ctx.close();
  } ok('backup file load: read-only, FX missing → 자료 부족, broken file reported, storage untouched');

  // 6. 손익 화면: 손계산 기대값
  {
    const c = await open(390, 844), p = c.page; assert.match(await text(p, '#pnl-result'), /계산 불가/); await tab(p, 'pnl'); assert.match(await text(p, '#pnl-result'), /계산 불가\/자료 부족/);
    await p.click('#btn-trade-sample'); await p.fill('#px-AAA', '125'); await p.fill('#px-USX', '130'); await p.fill('#in-fx', '1350'); await p.click('#btn-pnl');
    const r = await text(p, '#pnl-result'); assert.match(r, /110원/); assert.match(r, /1,875원/); assert.match(r, /1,755,000원/); assert.match(r, /465,918원/); assert.match(r, /11,900원/); assert.match(r, /현금흐름·보유기간 반영 전/); assert.match(r, /XIRR/);
    assert.match(await text(p, '#tax-result'), /추정/); await p.fill('#px-USX', ''); await p.click('#btn-pnl'); const r2 = await text(p, '#pnl-result'); assert.match(r2, /자료 부족\(현재가 없음\)/); assert.match(r2, /합계 보류/); assert.match(r2, /총손익자료 부족/);
    await noOverflow(p); await textQuality(p); await targets(p); assert.deepEqual(c.errors, []); await c.ctx.close();
  } ok('P&L screen: hand-computed totals, 자료 부족 handling, estimate label, simple-return caveat');

  // 7. 거래기록 가져오기/내보내기: 왕복 무손실, 잘못된 파일은 기존 상태 유지
  {
    const c = await open(360, 740), p = c.page; await tab(p, 'pnl'); await p.click('#btn-trade-sample'); const csv = await dl(p, '#btn-exp-csv'), json = await dl(p, '#btn-exp-json');
    const c2 = await open(360, 740), p2 = c2.page; await tab(p2, 'pnl'); await p2.setInputFiles('#f-trades', { name: 't.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }); await p2.waitForFunction(() => /6건을 읽었습니다/.test(document.getElementById('trade-status').textContent));
    assert.equal(await dl(p2, '#btn-exp-csv'), csv); assert.equal(await dl(p2, '#btn-exp-json'), json);
    await p2.setInputFiles('#f-trades', { name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('id,type\n1,buy') }); await p2.waitForFunction(() => !document.getElementById('trade-error').hidden); assert.match(await text(p2, '#trade-error'), /가져오기 실패/); assert.match(await text(p2, '#trade-status'), /6건/);
    await p2.setInputFiles('#f-trades', { name: 't.json', mimeType: 'application/json', buffer: Buffer.from(json) }); await p2.waitForFunction(() => document.getElementById('trade-error').hidden); assert.equal(await dl(p2, '#btn-exp-json'), json);
    assert.deepEqual([...c.errors, ...c2.errors], []); await c.ctx.close(); await c2.ctx.close();
  } ok('trade log import/export: CSV↔JSON round trip identical, bad file keeps previous data');

  // 8. 앱 보유와 대조
  {
    const backup = JSON.stringify({ version: 5, domStocks: [{ id: 1, ticker: 'AAA', name: '합성전자', quantity: 15, avgPrice: 110, currentPrice: 125 }, { id: 2, ticker: 'QQQ', name: '기록없음', quantity: 1, avgPrice: 1, currentPrice: 1 }], ovStocks: [{ id: 3, ticker: 'USX', name: '합성미국', quantity: 99, avgPrice: 100, currentPrice: 100 }] });
    const c = await open(390, 844), p = c.page; await p.setInputFiles('#f-backup', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(backup) }); await p.waitForFunction(() => /보유 3건/.test(document.getElementById('load-status').textContent));
    await tab(p, 'pnl'); assert.match(await text(p, '#rec-result'), /실현손익.*계산 불가\/자료 부족/); await p.click('#btn-trade-sample'); const rec = await text(p, '#rec-result');
    assert.match(rec, /dom · AAA — 일치/); assert.match(rec, /ov · USX — 수량 불일치/); assert.match(rec, /dom · QQQ — 거래기록에 없음/); await noOverflow(p); await c.ctx.close();
  } ok('reconcile ledger vs app holdings: match / qty-mismatch / missing-in-ledger');

  // 9. 백테스트 화면: 표시 이름·판정·경고·재현성
  for (const [w, h] of SIZES) {
    const c = await open(w, h), p = c.page; await tab(p, 'bt'); assert.match(await text(p, '#bt-banner'), /실데이터 백테스트 0건/);
    await p.click('#btn-bt'); const r1 = await text(p, '#bt-result'); assert.match(r1, /합성 계산기 시험 \(성과 주장 불가\)/); assert.match(r1, /판정: (검증 부족|전략 재검토|가설 단계)/); assert.match(r1, /수정주가/); assert.match(r1, /매수 추천이나 미래 수익 보장이 아닙니다/); assert.match(r1, /통과/);
    assert.doesNotMatch(r1.replace(/매수 추천이나 미래 수익 보장이 아닙니다/, '').replace(/매수 추천 아님/g, ''), /추천|보장/);
    await p.click('#btn-bt'); assert.equal(await text(p, '#bt-result'), r1);   // 같은 시드 → 같은 결과
    await p.fill('#bt-seed', '8'); await p.click('#btn-bt'); assert.notEqual(await text(p, '#bt-result'), r1);
    await p.check('#bt-grid'); await p.click('#btn-bt'); assert.match(await text(p, '#bt-result'), /후보 5가지 탐색/);
    await p.fill('#bt-seed', '-1'); await p.click('#btn-bt'); assert.equal(await p.isVisible('#bt-error'), true); await p.fill('#bt-seed', '7'); await p.fill('#bt-fee', '5000'); await p.click('#btn-bt'); assert.equal(await p.isVisible('#bt-error'), true);
    await p.fill('#bt-fee', '5'); await p.selectOption('#bt-rule', 'cheer'); await p.click('#btn-bt'); assert.match(await text(p, '#bt-result'), /대용 규칙/);
    await noOverflow(p); await textQuality(p); await targets(p); assert.deepEqual(c.errors, []); assert.deepEqual(c.external, []); await c.ctx.close();
  } ok('backtest screen: synthetic label, verdict wording, warnings, determinism, input validation, proxy-rule warning');

  // 10. 시세 파일럿 화면: 계획만, 잠금, 0건 표기
  {
    const c = await open(390, 844), p = c.page; await tab(p, 'pilot'); const t = await text(p, '#p-pilot');
    for (const k of ['MSFT', 'GOOGL', 'AVGO', 'VRT', 'JPM', '실제 활성 감시 종목', '실제 시세 검증', '실데이터 백테스트', '사용권', '미실시']) assert.ok(t.includes(k), k);
    assert.equal(await p.isDisabled('#pilot-on'), true); assert.equal(await p.isChecked('#pilot-on'), false); assert.match(await text(p, '#pilot-state'), /꺼짐/); assert.match(t, /가격 제공이 아닙니다/);
    const dd = await p.$$eval('#pilot-counts dd', e => e.map(x => x.textContent)); assert.deepEqual(dd, ['0', '0건', '0회', '0건', '합성 0 / 캐시 0 / 실조회 0']); await noOverflow(p); await textQuality(p); await c.ctx.close();
  } ok('provider pilot screen: plan only, locked off, all real counts 0, KRX identity ≠ price noted');

  // 11. 네트워크 차단·저장소 무변경·서비스워커 없음
  {
    const c = await open(390, 844), p = c.page; await sample(p); await tab(p, 'pnl'); await p.click('#btn-trade-sample'); await tab(p, 'bt'); await p.click('#btn-bt'); assert.deepEqual(c.errors, [], '정상 사용 중 오류');
    const r = await p.evaluate(async () => { const o = {}; try { await fetch('/mobile-lab/invest.html'); o.fetch = 'allowed'; } catch (e) { o.fetch = 'blocked'; } o.ws = await new Promise(res => { try { const x = new WebSocket('ws://127.0.0.1:1'); x.onopen = () => res('open'); x.onerror = () => res('blocked'); setTimeout(() => res('pending'), 3000); } catch (e) { res('blocked'); } }); o.sw = (await navigator.serviceWorker.getRegistrations()).length; o.ls = localStorage.length + sessionStorage.length; o.idb = (indexedDB.databases ? (await indexedDB.databases()).length : 0); return o; });
    assert.equal(r.fetch, 'blocked'); assert.equal(r.ws, 'blocked'); assert.equal(r.sw, 0); assert.equal(r.ls, 0); assert.equal(r.idb, 0); assert.deepEqual(c.external, []); assert.ok(c.errors.length >= 1 && c.errors.every(e => /Content Security Policy/.test(e)), '의도한 차단 시험 외 오류 없음');
    await c.ctx.setOffline(true); await tab(p, 'risk'); await sample(p); assert.match(await text(p, '#risk-summary'), /1억 3,500만원/); await c.ctx.close();
  } ok('CSP blocks fetch/WebSocket, no service worker/storage, works offline, 0 external requests');

  // 12. 가로 방향·긴 문구·큰 글자 대응
  {
    const c = await open(740, 360), p = c.page; await sample(p); for (const t of ['risk', 'pnl', 'bt', 'pilot']) { await tab(p, t); await noOverflow(p, 'landscape ' + t); } await c.ctx.close();
    const c2 = await open(360, 740), p2 = c2.page; await sample(p2); await p2.fill('#in-themes', 'AAA=' + '아주긴테마이름'.repeat(8)); await p2.click('#btn-th'); await noOverflow(p2, 'long theme'); await p2.fill('#tk-ticker', 'X'.repeat(20)); await noOverflow(p2, 'long ticker'); await c2.ctx.close();
  } ok('landscape and long-text layouts: no horizontal overflow');

  // 13. 정보 노출·보호 경계
  {
    const html = fs.readFileSync(path.join(ROOT, 'mobile-lab/invest.html'), 'utf8'), js = fs.readFileSync(path.join(ROOT, 'mobile-lab/invest.js'), 'utf8');
    assert.match(html, /connect-src 'none'/); assert.match(html, /noindex/); assert.doesNotMatch(html, /<script(?![^>]*src=)/); assert.doesNotMatch(html + js, /https?:\/\//); assert.equal((js.match(/localStorage/g) || []).length, 1, '16단계: 임시 저장용 접근 1곳만 허용'); for (const w of ['sessionStorage', 'indexedDB', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'innerHTML', 'eval(', 'setTimeout', 'setInterval', 'serviceWorker']) assert.ok(!js.includes(w), w);
    for (const f of ['portfolio_v5.html', 'portfolio.html', 'service-worker.js', 'manifest.json']) assert.ok(!fs.readFileSync(path.join(ROOT, f), 'utf8').includes('invest.html'), f + ' 가 실험실을 참조');
    const port = server.address().port; for (const u of ['/portfolio_v5.html', '/invest/ledger.js', '/backup/core.js', '/docs/KST-stage15-report.md', '/.env', '/mobile-lab/../package.json']) { const r = await new Promise(res => http.get({ host: '127.0.0.1', port, path: u }, x => { res(x.statusCode); x.resume(); })); assert.notEqual(r, 200, u); }
  } ok('lab isolation: strict CSP, no storage/network APIs in UI code, app/service worker do not reference lab, server exposes only mobile-lab');

  // 14. 운영 파일·백업 코드 무변경 (실험 중 어떤 파일도 쓰지 않음)
  { for (const f of PROTECTED) assert.equal(sha(f), before[f], f + ' 변경됨'); } ok('protected files (app, service worker, manifest, backup core) byte-identical during the run');

  // 15. 묶음 파일 최신 여부
  { const { build } = require('../tools/build-invest-lab.cjs'); assert.equal(fs.readFileSync(path.join(ROOT, 'mobile-lab/invest-bundle.js'), 'utf8'), build()); } ok('invest-bundle.js is up to date with sources');

  await browser.close(); server.close(); console.log(`\n${passed} groups passed`);
})().catch(e => { console.error('FAIL', e && e.stack || e); process.exit(1); });
