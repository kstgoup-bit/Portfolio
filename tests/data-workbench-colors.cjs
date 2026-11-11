'use strict';
/* 작업대 화면 기준 시험(360/390/430): 글자 12px 이상, 어두운 배경이 아닌 곳의 글자색 #333 이하, 대비 4.5:1 이상, 가로 넘침 없음, 터치 44px, 외부 요청 0.
   사용법: BROWSER_EXECUTABLE_PATH=… node tests/data-workbench-colors.cjs */
const path = require('path'), { chromium } = require('playwright'), ROOT = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined }); let bad = 0;
  for (const page of ['data-workbench.html', 'gas-redactor.html']) for (const w of [360, 390, 430]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true }), net = []; await ctx.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file://')) return r.continue(); net.push(u); r.abort(); });
    const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto('file://' + path.join(ROOT, 'has', page));
    if (page === 'data-workbench.html') { await p.click('#load-sample'); await p.click('#analyze'); const stx = await p.innerText('#status'); if (!/검사 완료/.test(stx)) errs.push('분석 실패: ' + stx); } else { await p.fill('#in', "var k='AIza" + "SyA1234567890abcdefghijklmnopqrstuv'; // me@example.com"); await p.click('#run'); const o = await p.inputValue('#out'); if (/AIza|me@example/.test(o)) errs.push('비밀값이 결과에 남음'); }
    await p.waitForTimeout(300);
    const r = await p.evaluate(() => { const parse = x => (x.match(/[\d.]+/g) || []).map(Number), lum = c => { const t = c.slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * t[0] + .7152 * t[1] + .0722 * t[2]; };
      const bg = e => { for (; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.length >= 3 && (c.length < 4 || c[3] > .5)) return c; } return [255, 255, 255]; };
      const small = [], low = [], light = []; document.querySelectorAll('body *').forEach(e => { if (!e.offsetParent && !(e instanceof SVGElement)) return; const t = [...e.childNodes].filter(x => x.nodeType === 3 && x.textContent.trim()).map(x => x.textContent.trim()).join(''); if (!t) return;
        const cs = getComputedStyle(e), fs = parseFloat(cs.fontSize), col = e instanceof SVGElement && cs.fill && cs.fill.startsWith('rgb') ? parse(cs.fill) : parse(cs.color), L1 = lum(col), L2 = lum(bg(e)), cr = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
        if (fs < 12) small.push(t.slice(0, 20)); if (cr < 4.5) low.push(t.slice(0, 20) + ':' + cr.toFixed(2)); if (L2 > .5 && L1 > 0.0332) light.push(e.tagName + ':' + t.slice(0, 16) + ':' + col.slice(0, 3)); });
      const tap = [...document.querySelectorAll('button,a,summary')].filter(e => e.offsetParent).filter(e => { const q = e.getBoundingClientRect(); return Math.min(q.width, q.height) < 44; }).length;
      return { small, low, light, tap, overflow: document.documentElement.scrollWidth > innerWidth }; });
    const ok = !r.small.length && !r.low.length && !r.light.length && !r.tap && !r.overflow && !net.length && !errs.length; if (!ok) bad++;
    console.log((ok ? 'PASS ' : 'FAIL ') + page + ' ' + w + 'px', ok ? '' : JSON.stringify({ ...r, net: net.length, errs: errs.length }).slice(0, 400)); await ctx.close();
  }
  await b.close(); process.exit(bad ? 1 : 0);
})();
