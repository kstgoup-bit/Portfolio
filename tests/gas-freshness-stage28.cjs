'use strict';
/* 28단계 브라우저 시험(합성 데이터): 앱이 GAS(가짜 응답)로 시세를 받으면 AI 참모가 "이번 접속 갱신 시각·미검증"을 표시하는지.
   외부 네트워크는 모두 차단하고 가짜 GAS 주소(gas-test.invalid)만 시험용으로 응답한다. 사용법: node tests/gas-freshness-stage28.cjs */
const fs = require('fs'), path = require('path'), { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), APP = 'file://' + path.join(ROOT, 'portfolio_v5.html'), html = fs.readFileSync(path.join(ROOT, 'portfolio_v5.html'), 'utf8'), PWD = (html.match(/const PW_DEFAULT\s*=\s*"([^"]+)"/) || [])[1];
const S = (id, name, ticker, quantity, avgPrice, currentPrice, role) => ({ id, name, ticker, quantity, avgPrice, currentPrice, role });
const GAS = 'https://gas-test.invalid/exec', SEED = { v5_gen: [S(1, '합성 일반주', 'AAA', 200, 40000, 50000, 'spear'), S(9, '예수금', 'DEP_GEN', 1, 1, 1000000, 'shield')], v5_dom: [S(2, '합성 국내주', 'BBB', 30, 10000, 12000)], v5_ov: [S(3, '합성 해외주', 'CCC', 5, 90, 95)], v5_pen: [], v5_fx: '1370', v5_cma_amount: '500000', v5_gas: GAS };
const results = [], other = new Set(), gasHits = [], ok = (c, m) => { if (!c) throw new Error(m); };
async function step(name, fn) { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: String(e.message).split('\n')[0] }); console.log('FAIL', name, '-', String(e.message).split('\n')[0]); } }
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file://') || u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
    if (u.startsWith(GAS)) { const q = new URL(u).searchParams, cb = q.get('callback'); gasHits.push(u); const body = q.get('type') === 'exchange' ? { usdKrw: 1412 } : (q.get('market') === 'US' ? { CCC: 99 } : { AAA: 51000, BBB: 12500 }); return r.fulfill({ status: 200, contentType: 'application/javascript', body: cb + '(' + JSON.stringify(body) + ');' }); }
    other.add(new URL(u).host); return r.abort(); });
  await ctx.addInitScript(sd => { if (!localStorage.getItem('__seeded')) { for (const [k, v] of Object.entries(sd)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); localStorage.setItem('__seeded', '1'); } }, SEED);
  const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(APP); await p.waitForTimeout(400); await p.fill('#lockInput', PWD); await p.click('#lockBtn'); await p.waitForTimeout(1500);
  const riskText = async () => { await p.click('#gtab-risk'); await p.waitForTimeout(150); await p.evaluate(() => switchTab('staff')); await p.waitForTimeout(300); await p.click('[data-testid=hs-refresh]').catch(() => { }); await p.waitForTimeout(200); return p.evaluate(() => [...document.querySelectorAll('[data-testid=hs-risk-item]')].map(e => e.textContent).join('\n')); };
  await step('시작 직후(앱이 자동 갱신한 만큼만): 일부 갱신·나머지 저장값 표시, 예수금 안내 1회, 시각 중복 표기 없음', async () => { const t = await riskText(); ok(/종목 중 \d종목만 이번 접속에서 갱신.*저장값: CCC/.test(t), t.slice(0, 400)); ok(((t.match(/예수금 기록이 없는 계좌/g)) || []).length === 1, '예수금 안내 중복: ' + t.slice(0, 500)); ok(!/(\d\d:\d\d)~\1/.test(t), '같은 시각 중복 표기'); });
  await step('GAS 갱신 후: 시각·GAS·미검증·대조불가 표시, 종목 3개 전부 갱신', async () => {
    await p.evaluate(() => { fetchFX(); fetchKR(0); fetchUS(0); }); await p.waitForTimeout(2500);
    const t = await riskText(); ok(/3종목 전부 이번 접속에서 구글 시트\(GAS\)로 갱신\(\d\d:\d\d(~\d\d:\d\d)? KST\)/.test(t), t.slice(0, 400)); ok(/독립 대조 불가/.test(t) && /환율은 이번 접속 갱신/.test(t), t.slice(0, 400));
    ok(gasHits.length >= 3, 'GAS 요청 수 ' + gasHits.length); });
  await step('앱 값이 실제로 갱신됨(가짜 GAS 응답 반영) — 기존 동작 유지', async () => { const v = await p.evaluate(() => ({ fx: document.getElementById('usdKrw').value, a: genStocks.find(s => s.ticker === 'AAA').currentPrice, c: ovStocks[0].currentPrice })); ok(v.fx === '1412' && v.a === 51000 && v.c === 99, JSON.stringify(v)); });
  await step('의견 규칙 불변: 시세가 갱신돼도 미검증이므로 "매수 검토/비중 축소 검토"가 새로 생기지 않음', async () => { const t = await p.evaluate(() => document.body.innerText); ok(!/독립 대조 완료/.test(t), '대조 완료 표시 발견'); });
  await step('시각 기록은 저장되지 않음(localStorage·백업에 없음)', async () => { const r = await p.evaluate(() => ({ keys: Object.keys(localStorage), dump: JSON.stringify(Object.assign({}, localStorage)) })); ok(!r.keys.some(k => /quote_?meta/i.test(k)) && !/quoteMeta/.test(r.dump), '저장됨'); });
  await step('외부 접속은 가짜 GAS 주소뿐(그 밖의 호스트 요청은 모두 차단됨)·화면 오류 없음', async () => { ok(errs.length === 0, errs.join('|').slice(0, 200)); await p.evaluate(() => 0); });
  await browser.close(); const bad = results.filter(r => !r.ok); console.log('외부 호스트 차단 시도:', [...other].join(',') || '없음'); console.log(`28단계 GAS 시각 표시 시험: ${results.length - bad.length}/${results.length} 통과`); process.exit(bad.length ? 1 : 0);
})();
