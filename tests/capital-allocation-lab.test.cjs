'use strict';
/* 지시서 GPT-20261113-0024 4절: 자본배분 비교 시험 게이트 화면(별도 페이지) 시험 */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const C = require('../has/capital-allocation.js'), L = require('../has/capital-allocation-lab.js');
const FIX = JSON.parse(read('tests/fixtures/capital-allocation-nvda-synthetic.json'));
const HTML = read('has/capital-allocation-lab.html'), JS = read('has/capital-allocation-lab.js'), ENGINE = read('has/capital-allocation.js');
const vals = () => JSON.parse(JSON.stringify(L.DEFAULTS));

test('독립 화면: 오프라인 CSP, 엔진+화면 스크립트만, 저장소·네트워크·HTML 주입 없음', () => {
  a.match(HTML, /connect-src 'none'/); a.match(HTML, /form-action 'none'/);
  a.deepEqual([...HTML.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]), ['capital-allocation.js', 'capital-allocation-lab.js']);
  a.doesNotMatch(JS, /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|caches)\b/);
  a.doesNotMatch(JS, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
  a.doesNotMatch(JS.replace(/\/\*[\s\S]*?\*\//g, ''), /매수 검토(?!: 표시하지 않음)/, "'매수 검토'는 '표시하지 않음' 문구로만 등장");
});

test('게이트 OFF 증빙: 기존 앱·서비스워커·다른 화면이 시험 화면을 부르거나 링크하지 않음', () => {
  for (const f of ['portfolio_v5.html', 'portfolio.html', 'service-worker.js', 'manifest.json']) a.doesNotMatch(read(f), /capital-allocation/, f);
  for (const f of fs.readdirSync(path.join(ROOT, 'has')).filter(n => /\.(html|js)$/.test(n) && !/^capital-allocation/.test(n))) a.doesNotMatch(read('has/' + f), /capital-allocation/, f);
  a.equal(L.gateOn(''), false); a.equal(L.gateOn('?test=0'), false); a.equal(L.gateOn('?x=1'), false); a.equal(L.gateOn('?test=1'), true);
});

test('기본 입력 = 합성 픽스처: 엔진 결과(대안·매도·비중)가 픽스처와 같음', () => {
  const ui = C.compareAlternatives(L.buildInput(vals())), fx = C.compareAlternatives(FIX);
  a.equal(ui.ok, true); a.deepEqual(ui.sale, fx.sale); a.deepEqual(ui.alternatives, fx.alternatives); a.deepEqual(ui.afterSaleBeforeReinvest, fx.afterSaleBeforeReinvest);
  a.deepEqual(ui.alternatives.map(x => x.id), ['A', 'B', 'C1', 'C2', 'C3', 'D', 'E']);
  a.equal(ui.alternatives.find(x => x.id === 'B').soldSymbolNetShareChange, 3);
  a.equal(ui.header.dataMode, 'synthetic'); a.match(ui.header.priceVerification, /현재 시세 아님/);
  a.deepEqual(ui.header.notReflected, ['매도 수수료·세금 미반영', '매수 수수료 미반영', '환율 미반영(원화 평가 산출 보류)']);
  a.equal(ui.buyReview.allowed, false);
});

test('입력 변환: 빈칸=null(미반영), 숫자 아님=NaN→보류, 수수료율 %, 환율·전체 분모, 가정 수익률', () => {
  a.equal(L.num(''), null); a.equal(L.num(' 1,234.5 '), 1234.5); a.ok(Number.isNaN(L.num('12abc'))); a.ok(Number.isNaN(L.num('1e3')));
  a.deepEqual(L.parseReturns('nvda:20, GOOGL=-5%\nCASH:3'), { NVDA: 20, GOOGL: -5, CASH: 3 });
  const bad = L.parseReturns('NVDA 20, MSFT:'); a.ok(Number.isNaN(bad['NVDA 20'])); a.ok(Number.isNaN(bad.MSFT));
  const v = vals(); v.buyFeeRatePct = '0.25'; v.sellFee = '3'; v.fxAcq = '1300'; v.fxSale = '1400'; v.scope = 'total-invested'; v.otherAssetsUSD = '10000'; v.fractional = true;
  v.scenarios[3] = 'NVDA:30, GOOGL:10, MSFT:20, AVGO:15, CASH:6';
  const inp = L.buildInput(v);
  a.equal(inp.fees.buyingFeeRate, 0.0025); a.equal(inp.fees.sellingFeesUSD, 3); a.equal(inp.fx.acquisitionUsdKrw, 1300);
  a.deepEqual(inp.portfolioScope, { kind: 'total-invested', otherAssetsUSD: 10000 }); a.equal(inp.fractionalAllowed, true);
  const r = C.compareAlternatives(inp);
  a.equal(r.ok, true); a.equal(r.sale.netProceedsUSD, 3217); a.equal(r.sale.taxKRW.status, '원화 차익만 계산(세액 산출 보류)');
  a.match(r.alternatives[0].weights.denominatorLabel, /전체 투자자산/);
  a.equal(r.alternatives.find(x => x.id === 'B').scenarios[0].status, '사용자 가정 계산');
  const hold = vals(); hold.saleQty = '50'; a.equal(C.compareAlternatives(L.buildInput(hold)).status, 'HOLD_CONFLICT', '보유량 초과 매도');
  const miss = vals(); miss.salePrice = 'abc'; a.equal(C.compareAlternatives(L.buildInput(miss)).status, 'HOLD_INSUFFICIENT_DATA');
  const empty = vals(); empty.cashUSD = ''; a.equal(C.compareAlternatives(L.buildInput(empty)).status, 'HOLD_INSUFFICIENT_DATA');
  const sc = vals(); sc.scenarios[1] = 'NVDA:abc'; a.equal(C.compareAlternatives(L.buildInput(sc)).status, 'HOLD_INSUFFICIENT_DATA');
  const v2 = vals(); L.buildInput(v2); a.deepEqual(v2, vals(), '입력 불변');
});

async function page(search) {
  const html = HTML.replace(/<script src="[^"]+"><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'https://example.invalid/has/capital-allocation-lab.html' + search, runScripts: 'outside-only' });
  const w = dom.window, log = { storage: 0, net: 0 };
  ['localStorage', 'sessionStorage'].forEach(k => { const s = w[k]; ['setItem', 'removeItem', 'clear', 'getItem'].forEach(m => { const o = s[m].bind(s); s[m] = (...x) => { log.storage++; return o(...x); }; }); });
  w.fetch = () => { log.net++; return Promise.reject(new Error('blocked')); };
  w.XMLHttpRequest = function () { log.net++; throw new Error('blocked'); };
  w.eval(ENGINE); w.eval(JS);
  if (w.document.readyState === 'loading') await new Promise(r => w.document.addEventListener('DOMContentLoaded', r));
  return { w, d: w.document, log };
}

test('화면(jsdom) 게이트 OFF: 입력 화면을 그리지 않음', async () => {
  const { d, log } = await page('');
  a.equal(d.querySelectorAll('input,select,button').length, 0);
  a.match(d.getElementById('lab').textContent, /시험 게이트가 꺼져/);
  a.equal(log.storage, 0); a.equal(log.net, 0);
});

test('화면(jsdom) 게이트 ON: 계산·대안 카드·미반영·매수 검토 미표시, 저장소·네트워크 0, 되돌리기', async () => {
  const { w, d, log } = await page('?test=1');
  a.ok(d.querySelectorAll('input').length > 30);
  for (const i of d.querySelectorAll('input,select')) a.ok(d.querySelector('label[for="' + i.id + '"]'), '라벨 ' + i.id);
  d.getElementById('run').click();
  const cards = [...d.querySelectorAll('article.alt')];
  a.deepEqual(cards.map(c => c.getAttribute('data-alt')), ['A', 'B', 'C1', 'C2', 'C3', 'D', 'E']);
  const body = d.getElementById('result-body').textContent;
  a.match(body, /매도금액3,220\.00 USD/); a.match(body, /426\.40 USD/); a.match(body, /NVDA 주식 수 변화\+3주/);
  a.match(body, /미반영: 매도 수수료·세금 미반영/); a.match(body, /합성 · 현재 시세 아님/); a.match(body, /매수 검토: 표시하지 않음/);
  a.match(body, /경고일 뿐 매도 지시 아님/); a.match(body, /산출 보류/);
  a.match(d.getElementById('status').textContent, /계산 완료 · 대안 7개/);
  d.getElementById('f-salePrice').value = ''; d.getElementById('f-saleQty').value = '99'; d.getElementById('run').click();
  a.match(d.getElementById('result-body').textContent, /추가 정보 필요 \(HOLD_INSUFFICIENT_DATA\)/);
  d.getElementById('f-salePrice').value = '161'; d.getElementById('run').click();
  a.match(d.getElementById('result-body').textContent, /판단 보류 \(HOLD_CONFLICT\)/);
  d.getElementById('reset').click();
  a.equal(d.getElementById('f-saleQty').value, '20'); a.equal(d.querySelectorAll('article.alt').length, 0);
  a.equal(log.storage, 0); a.equal(log.net, 0);
  a.equal(d.querySelector('form').getAttribute('action'), null);
  void w;
});
