'use strict';
/* 26단계 회귀시험: 대시보드 "Cannot read properties of undefined (reading 'color')" 재발 방지.
   원인: 자산이 있는 계좌가 3개 미만이면 colorRanks[1]/[2]가 없어 renderDashboard 가 중단(막대차트 미그림).
   합성 데이터로 계좌 조합 15가지(+없음)를 모두 열어 오류 0·막대 캔버스가 실제로 그려졌는지·카드/원형 차트가 남아 있는지 확인. 외부 네트워크 차단. */
const fs = require('fs'), path = require('path'), { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), APP = 'file://' + path.join(ROOT, 'portfolio_v5.html'), html = fs.readFileSync(path.join(ROOT, 'portfolio_v5.html'), 'utf8'), PWD = (html.match(/const PW_DEFAULT\s*=\s*"([^"]+)"/) || [])[1];
const S = (id, n, t, q, a, c) => ({ id, name: n, ticker: t, quantity: q, avgPrice: a, currentPrice: c, role: 'spear' });
const ACC = { v5_gen: [S(1, '일반', 'AAA', 10, 100, 120)], v5_dom: [S(2, '국내', 'BBB', 10, 100, 90)], v5_ov: [S(3, '해외', 'CCC', 10, 1, 1.2)], v5_pen: [S(4, '연금', 'DDD', 10, 100, 130)] };
const KEYS = Object.keys(ACC);
(async () => {
  const b = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined }); let fail = 0, n = 0;
  for (let mask = 0; mask < 16; mask++) {
    const on = KEYS.filter((k, i) => mask & (1 << i)), seed = {}; for (const k of KEYS) seed[k] = on.includes(k) ? ACC[k] : [];
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); await ctx.route('**/*', r => /^(file|data|blob):/.test(r.request().url()) ? r.continue() : r.abort());
    await ctx.addInitScript(sd => { if (!localStorage.getItem('__s')) { for (const [k, v] of Object.entries(sd)) localStorage.setItem(k, JSON.stringify(v)); localStorage.setItem('__s', '1'); localStorage.setItem('v5_fx', '1300'); } }, seed);
    const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto(APP); await p.waitForTimeout(400);
    if (await p.$('#lockInput')) { await p.fill('#lockInput', PWD); await p.click('#lockBtn'); } await p.waitForTimeout(2200);
    const info = await p.evaluate(() => { const c = document.querySelector('#mktSummary canvas'), svg = document.querySelector('#mktSummary svg'); let painted = 0; if (c) { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) painted++; } return { canvas: !!c, painted, pie: !!svg, cards: document.querySelectorAll('#mktSummary .mkt-card').length }; });
    n++; const name = on.length ? on.join('+') : '(보유 없음)'; let msgs = [];
    if (errs.length) msgs.push('페이지 오류 ' + [...new Set(errs)].join('|'));
    if (on.length) { if (!info.canvas || info.painted < 200) msgs.push('막대 캔버스가 그려지지 않음 ' + JSON.stringify(info)); if (!info.pie) msgs.push('원형 차트 없음'); if (info.cards !== on.length) msgs.push('계좌 카드 수 ' + info.cards + '≠' + on.length); }
    if (msgs.length) { fail++; console.log('FAIL', name, msgs.join(' ; ')); } else console.log('PASS', name, JSON.stringify(info));
    await ctx.close();
  }
  await b.close(); console.log(`${n - fail}/${n} 통과`); process.exit(fail ? 1 : 0);
})();
