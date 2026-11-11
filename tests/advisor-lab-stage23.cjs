'use strict';
/* 23단계 독립 시험 화면(has/advisor-lab.html)을 실제 Chromium에서 360/390/430/1280px로 검증. 합성 데이터만, 외부 요청 차단·집계. */
const { chromium } = require('playwright'); const path = require('path');
const URL = 'file://' + path.join(__dirname, '../has/advisor-lab.html');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH, args: ['--no-sandbox'] });
  for (const w of [360, 390, 430, 1280]) {
    const c = await b.newContext({ viewport: { width: w, height: 900 }, hasTouch: w < 500, isMobile: w < 500, serviceWorkers: 'block' }); const ext = [];
    await c.route(u => !u.href.startsWith('file:'), r => { ext.push(r.request().url()); r.abort(); });
    const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e))); await p.goto(URL); await p.waitForTimeout(300);
    const T = s => w + 'px ' + s, txt = id => p.locator('[data-testid="' + id + '"]').innerText();
    ok(/시험 화면 · 합성 데이터/.test(await txt('adv-banner')), T('시험·합성 배너 표시'));
    ok(/실제 활성 감시 종목: 0개/.test(await txt('real-active')) && /합성 시험 종목: 3개 활성 \/ 1개/.test(await txt('synth-active')), T('실제 활성 감시 0개, 합성 3 활성/1 비활성 구분'));
    const ops = {}; for (const t of ['SYN-KR1', 'SYN-US1', 'SYN-KR2', 'SYN-US2']) ops[t] = await txt('opinion-' + t);
    ok(ops['SYN-KR1'] === '매수 검토' && ops['SYN-US1'] === '판단 보류' && ops['SYN-KR2'] === '판단 보류' && ops['SYN-US2'] === '판단 보류', T('의견: 매수 검토/판단 보류(축소 종합 근거 부족)/판단 보류(미검증 시세)/판단 보류(가격만 하락) ' + JSON.stringify(ops)));
    ok((await txt('kind-SYN-KR1')) === '종가', T('가격 종류 표시(종가)'));
    const before = await txt('valuation'); await p.click('[data-testid="btn-fail"]'); const during = await txt('valuation'), pr = await txt('price-SYN-KR1');
    ok(/조회 실패.*최신이 아닙니다|최신이 아닙니다/.test(pr), T('조회 실패 시 "최신이 아닙니다" 경고'));
    ok(/마지막 검증가\(추정\)/.test(await txt('val-basis')) && /보유 기록 변경: 없음/.test(during), T('실패 시 평가는 마지막 검증가(추정)로 표기, 보유 기록 변경 없음'));
    ok(before.match(/평가액 [\d,]+원/)[0] === during.match(/평가액 [\d,]+원/)[0] && /추정/.test(during), T('실패 전후 평가액 동일, 추정 부분 표시'));
    await p.click('[data-testid="btn-retry"]'); ok(!/최신이 아닙니다/.test(await txt('price-SYN-KR1')), T('다시 조회하면 경고 해제'));
    const n0 = await p.locator('[data-testid="alert"]').count(); ok(n0 === 5, T('초기 알림 5건(하루 상한) n=' + n0));
    await p.click('[data-testid="btn-again"]'); ok((await p.locator('[data-testid="alert"]').count()) === 0 && /쿨다운/.test(await txt('alert-log')), T('같은 신호 다시 생성 → 쿨다운으로 억제'));
    await p.click('[data-testid="btn-nextday"]'); ok((await p.locator('[data-testid="alert"]').count()) > 0, T('8일 뒤에는 다시 알림'));
    ok(/항상 보장되지 않습니다/.test(await p.locator('#push-note').innerText()), T('앱 종료 상태 푸시 한계 고지'));
    await p.click('[data-testid="btn-eval"]'); ok(/수익률 20% · 시장 3% · 초과 17%p/.test(await txt('eval')), T('사후 평가 표시(합성)'));
    await p.locator('[data-testid="adv-SYN-KR1"] summary').click(); const dt = await txt('adv-SYN-KR1'); ok(/같은 분석 엔진/.test(dt) && /반대 근거/.test(dt) && /추가 확인이 필요한 사항/.test(dt), T('상세: 반대 근거·확인사항·같은 엔진 고지'));
    const m = await p.evaluate(() => { const bad = []; document.querySelectorAll('body *').forEach(e => { if (e.children.length === 0 && e.textContent.trim()) { const f = parseFloat(getComputedStyle(e).fontSize); if (f < 12) bad.push(e.textContent.trim().slice(0, 15)); } }); const small = []; document.querySelectorAll('button,summary').forEach(e => { const r = e.getBoundingClientRect(); if (r.height < 44 || r.width < 44) small.push(e.textContent.trim().slice(0, 10)); }); return { bad, small, over: document.documentElement.scrollWidth - document.documentElement.clientWidth, ls: localStorage.length, ss: sessionStorage.length }; });
    ok(m.bad.length === 0 && m.small.length === 0 && m.over <= 0, T('글씨 12px 이상·터치 44px 이상·가로 넘침 0 ' + JSON.stringify(m)));
    ok(m.ls === 0 && m.ss === 0, T('저장소 사용 0')); ok(ext.length === 0 && errs.length === 0, T('외부 요청 0·페이지 오류 0 ' + JSON.stringify([ext, errs])));
    await c.close();
  }
  await b.close(); console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
})();
