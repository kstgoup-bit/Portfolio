'use strict';
// 위대한 기업 탭 운영 앱 연결(2026-11-15 순태씨 '진행') — 읽기 전용·지연 로딩·판단 보류 정직 표시 시험
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..'), read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const P = require('../has/great-companies-panel.js'), G = require('../has/great-companies.js'), L = require('../has/great-companies-lab.js');
const NOW = Date.parse('2026-11-15T12:00:00Z');

const lists = () => ({
  gen: [{ id: 1, ticker: '005930', name: '삼성전자', quantity: 10, currentPrice: 70000 }, { id: 2, ticker: 'DEP_GEN', name: '예수금', quantity: 1, currentPrice: 100000 }, { id: 3, ticker: '000660', name: 'SK하이닉스', quantity: 0, currentPrice: 1 }],
  dom: [{ id: 7, ticker: '069500', name: 'KODEX 200', quantity: 5, currentPrice: 30000 }, { id: 8, ticker: '005930', name: '삼성전자', quantity: 2, currentPrice: 70000 }],
  ov: [{ id: 11, ticker: 'nvda', name: 'NVIDIA', quantity: 3, currentPrice: 180 }, { id: 12, ticker: 'QQQ', name: 'Invesco QQQ', quantity: 1, currentPrice: 500 }],
  pen: []
});
const principles = { 'gen-1': { thesis: '메모리 1위', logicState: 'weakened', checkpoints: [{ text: 'HBM 점유율', done: true }, { text: '', done: false }, { text: '재고', done: false }] }, 'ov-11': { thesis: '', logicState: '이상값', checkpoints: 'x' } };

test('buildInputs: 계좌 중복 합치기·예수금/수량 0 제외·ETF 추정·투자원칙 읽기 전용 매핑', () => {
  const src = lists(), snap = JSON.stringify(src), psnap = JSON.stringify(principles);
  const rows = P.buildInputs(src, principles, { 'KR:005930': 12.3, 'US:NVDA': 4.5 }, '2026-11-15');
  a.equal(JSON.stringify(src), snap); a.equal(JSON.stringify(principles), psnap); // 원본 불변
  a.deepEqual(rows.map(r => r.key), ['KR:005930', 'KR:069500', 'US:NVDA', 'US:QQQ']);
  const sam = rows[0]; a.deepEqual(sam.accounts, ['일반', 'ISA']); a.equal(sam.weightPct, 12.3);
  a.deepEqual(sam.input.thesis, { logicState: 'weakened', checkpoints: ['HBM 점유율', '재고'] });
  a.deepEqual(sam.record, { hasThesis: true, logicState: 'weakened', checkpoints: 2, done: 1 });
  a.equal(rows[1].input.company.kind, 'etf'); a.equal(rows[3].input.company.kind, 'etf'); a.equal(rows[2].input.company.kind, 'company');
  a.equal(rows[2].input.company.ticker, 'NVDA'); a.equal(rows[2].input.thesis.logicState, null); a.deepEqual(rows[2].input.thesis.checkpoints, []);
  a.equal(rows[1].weightPct, null); a.equal(rows[1].record, null);
  for (const r of rows) { a.equal(r.input.fundamental, null); a.equal(r.input.price, null); a.equal(r.input.company.listType, 'holding'); a.equal(G.validateInput(r.input).ok, true, r.key); }
  a.deepEqual(P.buildInputs(null, null, null, '2026-11-15'), []);
  a.deepEqual(P.buildInputs({ gen: [null, { ticker: 5 }, { ticker: 'X', quantity: NaN }] }, 'bad', [], '2026-11-15'), []);
});

test('엔진 결과: 재무·밸류에이션·가격 미연결이라 모든 종목이 판단 보류, 게이트 닫힘(꾸며 채우지 않음)', () => {
  const rows = P.buildInputs(lists(), principles, {}, '2026-11-15');
  const out = G.createEvaluator().evaluate(rows.map(r => r.input), { now: NOW });
  a.deepEqual(out.map(o => o.state), ['hold', 'hold', 'hold', 'hold']);
  a.match(out[0].reason, /DART/); a.match(out[1].reason, /ETF/); a.match(out[2].reason, /재무 자료 없음/); a.match(out[3].reason, /ETF/);
  for (const o of out) { a.equal(o.priceRelation.buyGate.open, false); a.equal(o.priceRelation.sellGate.open, false); a.equal(o.opinion, '판단 보류'); }
});

function panelDOM(opts = {}) {
  const d = new JSDOM('<!doctype html><head></head><body><input id="usdKrw" value="1400"><div class="panel" id="panel-greatco"></div></body>', { url: 'https://synthetic.invalid/portfolio_v5.html' }), w = d.window;
  w.fetch = () => { throw Error('Forbidden network'); };
  if (!opts.noModules) { w.HASFundamentalFilter = require('../has/fundamental-filter.js'); w.HASGreatCompanies = G; w.HASGreatCompaniesLab = L; }
  w.HASPortfolioReader = require('../has/portfolio-reader.js');
  const l = lists(), writes = [];
  const getter = k => ({ v5_gen: JSON.stringify(l.gen), v5_dom: JSON.stringify(l.dom), v5_ov: JSON.stringify(l.ov), v5_pen: '[]', v5_fx: '1400' })[k] ?? null;
  const ui = P.create({ win: w, doc: w.document, now: () => NOW, source: () => ({ lists: l, principles, getter }) });
  return { d, w, ui, writes, text: () => w.document.getElementById('panel-greatco').textContent };
}

test('탭 화면: 자료 연결 상태·판단 보류 사유·순태씨 기록·게이트 닫힘, 금지 문구 없음, 재진입 재사용', async () => {
  const { d, w, ui, text } = panelDOM();
  try {
    await ui.onTabChange('principledash'); a.equal(text(), ''); // 다른 탭에서는 아무것도 안 함
    await ui.onTabChange('greatco');
    const root = w.document.querySelector('[data-testid=hgc-root]'); a.ok(root);
    a.match(w.document.querySelector('[data-testid=hgc-data-status]').textContent, /SEC\): 미연결.*DART\): 미연결.*밸류에이션.*미연결.*모든 종목이 ‘판단 보류’/s);
    const cards = w.document.querySelectorAll('[data-testid=hgc-card]'); a.equal(cards.length, 4);
    a.match(cards[0].textContent, /삼성전자 · 005930/); a.match(cards[0].textContent, /일반·ISA 계좌/); a.match(cards[0].textContent, /판단 보류 사유: 국내 기업 재무\(DART\) 미연결/);
    a.match(cards[0].textContent, /순태씨 투자원칙 기록: 투자논리 일부 약화 · 점검 항목 2개 중 확인 1개/);
    a.match(cards[2].textContent, /NVIDIA · NVDA/); a.match(cards[2].textContent, /투자논리 상태 미기록 · 점검 항목 0개 중 확인 0개 · 투자 이유 미작성/);
    a.match(cards[1].textContent, /ETF 추정/); a.match(text(), /보유 4종목 · 판단 보류 4/);
    a.match(cards[0].textContent, /매수 검토: 닫힘/); a.match(cards[0].textContent, /매도·축소 검토: 닫힘/); a.match(cards[0].textContent, /밸류에이션: 평가하지 않음/);
    a.match(text(), /매수·매도 권유가 아닌 판단 보조이며 최종 결정은 순태씨/);
    a.doesNotMatch(text(), G.BANNED); a.doesNotMatch(text(), /undefined|null|NaN|매수하세요|매도하세요|검토 대상|위대한 기업 확정/);
    a.equal(w.document.querySelectorAll('#panel-greatco details').length, 4);
    const s1 = ui.stats(); a.equal(s1.engine.computed, 4); a.equal(s1.engine.cacheHits, 0);
    await ui.onTabChange('greatco');
    const s2 = ui.stats(); a.equal(s2.engine.computed, 4); a.equal(s2.engine.cacheHits, 4); a.equal(s2.shows, 2); // 재진입은 재계산 없음
    a.equal(w.document.querySelectorAll('[data-testid=hgc-root]').length, 1);
  } finally { d.window.close(); }
});

test('지연 로딩 실패·모듈 없음 → 판단 보류 안내, 다시 누르면 재시도', async () => {
  const { d, w, ui, text } = panelDOM({ noModules: true });
  try {
    await ui.show(); a.match(text(), /불러오지 못했습니다\(재무 필터 모듈 없음\).*다시 시도/);
    a.ok(w.document.getElementById('hgc-css'));
    w.HASFundamentalFilter = require('../has/fundamental-filter.js'); w.HASGreatCompanies = G; w.HASGreatCompaniesLab = L;
    await ui.show(); a.ok(w.document.querySelector('[data-testid=hgc-root]'));
  } finally { d.window.close(); }
});

test('읽기 전용 증빙: 패널 코드에 저장·삭제·네트워크·HTML 주입·AI 호출 없음', () => {
  const src = read('has/great-companies-panel.js');
  a.doesNotMatch(src, /setItem|removeItem|clear\(\)|safeSet|savePrinciples|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|innerHTML|insertAdjacentHTML|eval\(|script\.google|anthropic|openai/i);
  a.match(src, /getItem\('v5_investPrinciples'\)/); // 읽기만
  const css = read('has/great-companies-panel.css');
  for (const m of css.matchAll(/font-size:(\d+)px/g)) a.ok(+m[1] >= 12, m[0]);
  a.doesNotMatch(css, /@import|url\(|position:fixed/); a.ok(css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').filter(r => r.trim()).every(r => r.trim().startsWith('#panel-greatco')));
});

test('운영 앱 연결: 위험관리 메뉴 버튼·패널·처음 진입 때만 1회 스크립트 주입(defer 아님)', () => {
  const html = read('portfolio_v5.html');
  a.doesNotMatch(html, /<script[^>]*great-companies/);
  const section = html.slice(html.indexOf('<!-- 대분류 탭 -->'), html.indexOf('<div id="hasPriceTrust"'));
  const d = new JSDOM('<!doctype html><head></head>' + section + '<main></main>', { url: 'https://synthetic.invalid/portfolio_v5.html', runScripts: 'outside-only' }), w = d.window;
  try {
    w.scrollTo = () => {}; w.renderMemo = w.renderRetirement = w.renderNotouch = w.renderDebt = w.renderNetWorth = w.renderPrincipleDash = () => {};
    w.eval(html.slice(html.indexOf('var TAB_GROUPS='), html.indexOf('// 노터치 자산 (연금보험')));
    for (const tab of Object.keys(w.TAB_TO_GROUP)) { const p = w.document.createElement('section'); p.className = 'panel'; p.id = 'panel-' + tab; w.document.querySelector('main').append(p); }
    const btn = [...w.document.querySelectorAll('#subtabs-risk .tab')].find(b => b.getAttribute('onclick') === "switchTab('greatco')");
    a.match(btn.textContent, /위대한 기업/);
    const scripts = () => [...w.document.head.querySelectorAll('script')].filter(s => /great-companies-panel\.js$/.test(s.src));
    w.switchTab('principledash'); a.equal(scripts().length, 0); // 다른 탭·로그인 시 주입 없음
    w.switchTab('greatco'); a.equal(scripts().length, 1); a.equal(w.document.querySelector('.panel.active').id, 'panel-greatco');
    a.match(w.document.getElementById('panel-greatco').textContent, /불러오는 중/);
    w.switchTab('risk'); w.switchTab('greatco'); a.equal(scripts().length, 1); // 불러오는 중 중복 주입 없음
    scripts()[0].onerror(); a.match(w.document.getElementById('panel-greatco').textContent, /불러오지 못했습니다/);
    w.switchTab('greatco'); a.equal(scripts().length, 2); // 실패 뒤 재시도
    let shown = 0; w.HASGreatCompaniesPanel = { show: () => shown++ }; w.switchTab('greatco'); a.equal(shown, 1); a.equal(scripts().length, 2); // 로드 후엔 재사용
  } finally { d.window.close(); }
  a.ok(html.indexOf('id="panel-greatco"') > 0);
});
