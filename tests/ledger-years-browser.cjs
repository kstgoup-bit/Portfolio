'use strict';
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'); let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const SEED = { '2025-12': { income: [{ name: 'a', amount: 3000000, date: '2025-12-05', cat: '' }], expense: [{ name: 'b', amount: 1000000, date: '2025-12-06', cat: '' }], invest: [] },
  '2026-09': { income: [{ name: 'c', amount: 2000000, date: '2026-09-01', cat: '' }], expense: [], invest: [{ name: 'd', amount: 300000, date: '2026-09-02', broker: '', cat: '' }] },
  '2026-10': { income: [{ name: 'e', amount: 8711612, date: '2026-10-05', cat: '' }], expense: [{ name: 'f', amount: 4582004, date: '2026-10-06', cat: '' }], invest: [{ name: 'g', amount: 500000, date: '2026-10-07', broker: '', cat: '' }] } };
(async () => {
  const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/portfolio_v5.html')); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); } r.end(fs.readFileSync(f)); }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH, args: ['--no-sandbox'] });
  for (const w of [360, 390, 430, 1280]) {
    const c = await b.newContext({ viewport: { width: w, height: 800 }, serviceWorkers: 'block' });
    await c.route(u => !u.href.startsWith(base), r => r.abort());
    await c.addInitScript(s => { sessionStorage.setItem('v5_auth', '1'); if (!localStorage.getItem('v5_ledger')) localStorage.setItem('v5_ledger', JSON.stringify(s)); }, SEED);
    const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto(base + '/portfolio_v5.html'); await p.waitForTimeout(400);
    await p.evaluate(() => { window.switchTab('assets'); }); await p.evaluate(() => { const t = document.getElementById('gtab-asset') || document.getElementById('gtab-assets'); if (t) t.click(); });
    await p.evaluate(() => { if (window.switchTab) window.switchTab('ledger'); }); await p.waitForTimeout(300);
    const t = (s) => w + 'px ' + s;
    const txt = await p.evaluate(() => (document.getElementById('ldgYearCard') || {}).innerText || '');
    ok(/2026년/.test(txt) && /2025년/.test(txt), t('2026·2025 연도 카드 표시'));
    const y26 = await p.evaluate(() => { const d = document.querySelector('#ldgYearCard details[data-year="2026"]'); return d ? { open: d.open, t: d.innerText } : null; });
    ok(y26 && y26.open && /10,711,612원/.test(y26.t) && /4,582,004원/.test(y26.t) && /800,000원/.test(y26.t) && /\+5,329,608원|5,329,608/.test(y26.t), t('2026 합계 수입 10,711,612 / 지출 4,582,004 / 투자 800,000 / 잔액 5,329,608'));
    const y25 = await p.evaluate(() => { const d = document.querySelector('#ldgYearCard details[data-year="2025"]'); return d ? { open: d.open } : null; });
    ok(y25 && !y25.open, t('2025는 접힘'));
    await p.click('#ldgYearCard details[data-year="2025"] summary'); await p.waitForTimeout(100);
    const t25 = await p.evaluate(() => document.querySelector('#ldgYearCard details[data-year="2025"]').innerText);
    ok(/3,000,000원/.test(t25) && /1,000,000원/.test(t25) && /\+2,000,000원/.test(t25), t('2025 펼침 합계 3,000,000 / 1,000,000 / 잔액 +2,000,000'));
    const m = await p.evaluate(() => { const bad = []; document.querySelectorAll('#ldgYearCard *').forEach(e => { if (e.children.length === 0 && e.textContent.trim()) { const f = parseFloat(getComputedStyle(e).fontSize); if (f < 12) bad.push(e.textContent.trim().slice(0, 12)); } }); const s = document.querySelector('#ldgYearCard summary').getBoundingClientRect(); return { bad, sh: s.height, over: document.documentElement.scrollWidth - document.documentElement.clientWidth, cw: document.getElementById('ldgYearCard').getBoundingClientRect().width }; });
    ok(m.bad.length === 0 && m.sh >= 44 && m.over <= 0, t('글씨 12px 이상 · 터치 44px 이상 · 가로 넘침 0 (요약줄 ' + Math.round(m.sh) + 'px)'));
    // 새 항목 추가 → 올해 합계 즉시 반영
    await p.evaluate(() => { document.getElementById('ldgIncDate').value = '2026-10-20'; document.getElementById('ldgIncName').value = '시험'; document.getElementById('ldgIncAmt').value = '1,000'; });
    await p.click('#ldgIncomeBtn'); await p.waitForTimeout(200);
    const t26b = await p.evaluate(() => document.querySelector('#ldgYearCard details[data-year="2026"]').innerText);
    ok(/10,712,612원/.test(t26b), t('추가 직후 연도 합계 갱신(+1,000)'));
    const open25 = await p.evaluate(() => document.querySelector('#ldgYearCard details[data-year="2025"]').open);
    ok(open25 === true, t('사용자가 펼친 상태 유지'));
    const keys = await p.evaluate(() => Object.keys(localStorage).sort().join(','));
    ok(!/has_ledger|ledger_years/.test(keys), t('새 저장 키 없음'));
    ok(errs.length === 0, t('페이지 오류 0'));
    await c.close();
  }
  await b.close(); srv.close(); console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
})();
