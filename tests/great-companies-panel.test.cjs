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
  a.equal(rows[1].input.company.kind, 'etf'); a.equal(rows[3].input.company.kind, 'etf'); a.equal(rows[2].input.company.kind, 'unknown'); a.equal(rows[0].input.company.kind, 'unknown'); // 2130 CR1: 유형 칸 없으면 일반기업으로 단정하지 않음
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
  a.match(out[0].reason, /상품 유형 미확인 — 기업 평가 보류/); a.match(out[1].reason, /ETF/); a.match(out[2].reason, /상품 유형 미확인 — 기업 평가 보류/); a.match(out[3].reason, /ETF/);
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
    a.match(cards[0].textContent, /삼성전자 · 005930/); a.match(cards[0].textContent, /일반·ISA 계좌/); a.match(cards[0].textContent, /판단 보류 사유: 상품 유형 미확인 — 기업 평가 보류/); a.match(cards[0].textContent, /상품 유형 미확인/);
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

/* ---- 2130 지피 CR 1: 상품 유형 오분류 반례 ---- */
test('상품 유형: 목록 밖 ETF·공백 없는 국내 ETF는 일반기업으로 확정하지 않음, 보통주·출처 미확인은 유형 미확인 보류', () => {
  const mk = (m, t, n, extra) => Object.assign({ id: 1, ticker: t, name: n, quantity: 1, currentPrice: 1 }, extra || {});
  const kinds = (acct, items) => P.buildInputs({ [acct]: items }, {}, {}, '2026-11-15').map(r => r.input.company.kind);
  // 지피 반례 4개: 목록 밖 미국 ETF는 'company'가 아니라 'unknown', 공백 없는 국내 ETF 이름은 'etf'
  a.deepEqual(kinds('ov', [mk('US', 'QLD', 'ProShares Ultra QQQ'), mk('US', 'GLDM', 'SPDR Gold MiniShares')]), ['unknown', 'unknown']);
  a.deepEqual(kinds('gen', [mk('KR', '379800', 'KODEX미국S&P500TR'), mk('KR', '360750', 'TIGER미국S&P500')]), ['etf', 'etf']);
  // 이름에 ETF 낱말이 있으면 etf (미국 목록 밖이어도)
  a.deepEqual(kinds('ov', [mk('US', 'ZZZE', 'Some Fund ETF')]), ['etf']);
  // 일반 보통주 반례: ETF로 오인하지 않고, 유형 칸이 없으니 일반기업으로 단정하지도 않음
  a.deepEqual(kinds('gen', [mk('KR', '005930', '삼성전자'), mk('KR', '011070', 'LG이노텍'), mk('KR', '000000', 'SOLUM테크')]), ['unknown', 'unknown', 'unknown']);
  a.deepEqual(kinds('ov', [mk('US', 'AAPL', 'Apple Inc.'), mk('US', 'NVDA', 'NVIDIA')]), ['unknown', 'unknown']);
  // 출처 미확인(이름 없음) 반례
  a.deepEqual(kinds('ov', [{ id: 9, ticker: 'XYZ', quantity: 1 }]), ['unknown']);
  a.deepEqual(kinds('gen', [{ id: 9, ticker: '123456', quantity: 1 }]), ['unknown']);
  // 2230 CR 2: 유형 칸(productType)은 출처 미검증 → 'company'로 승격하지 않음, 'etf'는 추정으로만(잘못된 값은 무시)
  a.deepEqual(kinds('ov', [mk('US', 'QLD', 'x', { productType: 'etf' }), mk('US', 'MSFT', 'Microsoft', { productType: 'company' }), mk('US', 'QQQ', 'Invesco QQQ', { productType: '이상값' })]), ['etf', 'unknown', 'etf']);
  // 엔진: unknown은 입력 검증 통과 + '상품 유형 미확인 — 기업 평가 보류', 게이트 닫힘
  const rows = P.buildInputs({ ov: [mk('US', 'QLD', 'ProShares Ultra QQQ')] }, {}, {}, '2026-11-15');
  a.equal(G.validateInput(rows[0].input).ok, true);
  const o = G.createEvaluator().evaluate([rows[0].input], { now: NOW })[0];
  a.equal(o.state, 'hold'); a.equal(o.reason, '상품 유형 미확인 — 기업 평가 보류'); a.equal(o.priceRelation.buyGate.open, false); a.equal(o.priceRelation.sellGate.open, false);
  a.equal(G.validateInput({ schema: 'hasGreatCompanyInput.v1', company: { ticker: 'A', market: 'US', listType: 'holding', kind: 'fund' } }).ok, false);
});

/* ---- 2130 지피 CR 2: 같은 종목 여러 계좌의 투자원칙 기록 ---- */
test('투자원칙 기록: 빈 기록이 실제 기록을 가리지 않음, 상충은 고르거나 합치지 않고 확인 필요 표시, 원본 불변', () => {
  const deep = o => { Object.freeze(o); Object.values(o).forEach(v => v && typeof v === 'object' && deep(v)); return o; };
  const L2 = deep({ gen: [{ id: 1, ticker: '005930', name: '삼성전자', quantity: 1 }], dom: [{ id: 2, ticker: '005930', name: '삼성전자', quantity: 1 }] });
  const good = { logicState: 'maintained', checkpoints: [{ text: '매출 추세', done: true }], thesis: '장기 경쟁우위' };
  const one = pr => P.buildInputs(L2, deep(pr), {}, '2026-11-15')[0];
  // 빈 기록 → 유효 기록 (지피 재현 입력)
  let r = one({ 'gen-1': {}, 'dom-2': good });
  a.deepEqual(r.input.thesis, { logicState: 'maintained', checkpoints: ['매출 추세'] });
  a.deepEqual(r.record, { hasThesis: true, logicState: 'maintained', checkpoints: 1, done: 1 }); a.deepEqual(r.recordFrom, ['ISA']); a.equal(r.recordConflict, false);
  // 유효 기록 → 빈 기록
  r = one({ 'gen-1': good, 'dom-2': { thesis: '  ', checkpoints: [] } });
  a.deepEqual(r.input.thesis.checkpoints, ['매출 추세']); a.deepEqual(r.recordFrom, ['일반']);
  // 같은 내용 두 계좌 → 상충 아님
  r = one({ 'gen-1': good, 'dom-2': JSON.parse(JSON.stringify(good)) });
  a.equal(r.recordConflict, false); a.deepEqual(r.recordFrom, ['일반', 'ISA']); a.equal(r.input.thesis.logicState, 'maintained');
  // 상충: 임의 선택·합치기 금지 → thesis null, 상충 표시
  r = one({ 'gen-1': good, 'dom-2': { logicState: 'broken', checkpoints: [{ text: '점유율 하락', done: false }], thesis: '이유' } });
  a.equal(r.recordConflict, true); a.equal(r.input.thesis, null); a.deepEqual(r.record, { conflict: true, accounts: ['일반', 'ISA'], diffs: ['투자 이유', '논리 상태', '점검 항목'] });
  a.match(P.recordLine(r.record), /원칙 기록 상충 — 확인 필요\(일반·ISA/);
  // 둘 다 빈 기록 → 예전처럼 첫 기록(상태 미기록) 표시, 상충 아님
  r = one({ 'gen-1': {}, 'dom-2': {} });
  a.equal(r.recordConflict, false); a.equal(r.record.checkpoints, 0); a.match(P.recordLine(r.record), /상태 미기록/);
  // 기록 없음
  r = one({}); a.equal(r.record, null); a.equal(r.input.thesis, null); a.match(P.recordLine(r.record), /없음/);
  a.ok(!('_th' in r));
});

test('탭 화면: 원칙 기록 상충·상품 유형 미확인 태그 표시(저장 없음)', async () => {
  const d = new JSDOM('<!doctype html><head></head><body><div id="panel-greatco"></div></body>', { url: 'https://synthetic.invalid/portfolio_v5.html' }), w = d.window;
  try {
    w.fetch = () => { throw Error('Forbidden network'); };
    w.HASFundamentalFilter = require('../has/fundamental-filter.js'); w.HASGreatCompanies = G; w.HASGreatCompaniesLab = L;
    const l = { gen: [{ id: 1, ticker: '005930', name: '삼성전자', quantity: 1 }], dom: [{ id: 2, ticker: '005930', name: '삼성전자', quantity: 1 }], ov: [{ id: 3, ticker: 'QLD', name: 'ProShares Ultra QQQ', quantity: 1 }], pen: [] };
    const pr = { 'gen-1': { logicState: 'maintained', checkpoints: [], thesis: 'a' }, 'dom-2': { logicState: 'weakened', checkpoints: [], thesis: 'b' } };
    const before = JSON.stringify([l, pr]);
    const ui = P.create({ win: w, doc: w.document, now: () => NOW, source: () => ({ lists: l, principles: pr, getter: () => null }) });
    await ui.onTabChange('greatco');
    const cards = w.document.querySelectorAll('[data-testid=hgc-card]'); a.equal(cards.length, 2);
    a.match(cards[0].textContent, /원칙 기록 상충/); a.match(cards[0].textContent, /원칙 기록 상충 — 확인 필요\(일반·ISA/);
    a.match(cards[1].textContent, /상품 유형 미확인/); a.doesNotMatch(cards[1].textContent, /재무 자료 없음/);
    a.equal(JSON.stringify([l, pr]), before);
  } finally { d.window.close(); }
});

/* ---- 2230 지피 CR 1: 원문 내용만 다른 다계좌 투자원칙 기록 ---- */
test('투자원칙 기록: 축약값이 같아도 원문 내용이 다르면 상충, 공백만 다르면 같은 기록, 비교값은 결과에 남지 않음', () => {
  const deep = o => { Object.freeze(o); Object.values(o).forEach(v => v && typeof v === 'object' && deep(v)); return o; };
  const L2 = deep({ gen: [{ id: 1, ticker: '005930', name: '삼성전자', quantity: 1 }], dom: [{ id: 2, ticker: '005930', name: '삼성전자', quantity: 1 }] });
  const one = pr => { const snap = JSON.stringify(pr), r = P.buildInputs(L2, deep(pr), {}, '2026-11-15')[0]; a.equal(JSON.stringify(pr), snap); return r; };
  // 지피 반례: logicState·점검 항목 동일, 투자 이유 원문만 상반
  let r = one({ 'gen-1': { thesis: '장기 경쟁우위 유지', logicState: 'maintained', checkpoints: [] }, 'dom-2': { thesis: '핵심 경쟁력 소멸 우려', logicState: 'maintained', checkpoints: [] } });
  a.equal(r.recordConflict, true); a.equal(r.input.thesis, null); a.deepEqual(r.record, { conflict: true, accounts: ['일반', 'ISA'], diffs: ['투자 이유'] });
  a.match(P.recordLine(r.record), /서로 다름: 투자 이유, 어느 쪽도 평가에 쓰지 않음/);
  a.doesNotMatch(P.recordLine(r.record), /장기 경쟁우위|소멸 우려/); // 원문 노출 없음
  // 공백만 다른 같은 원문 → 같은 기록
  r = one({ 'gen-1': { thesis: '장기  경쟁우위\n유지 ', logicState: 'maintained', checkpoints: [{ text: ' HBM  점유율', done: true }] }, 'dom-2': { thesis: '장기 경쟁우위 유지', logicState: 'maintained', checkpoints: [{ text: 'HBM 점유율 ', done: true }] } });
  a.equal(r.recordConflict, false); a.deepEqual(r.recordFrom, ['일반', 'ISA']); a.equal(r.input.thesis.logicState, 'maintained');
  // 유니코드 정규화(NFC/NFD)만 다른 같은 원문 → 같은 기록
  r = one({ 'gen-1': { thesis: '경쟁우위'.normalize('NFD'), logicState: 'maintained' }, 'dom-2': { thesis: '경쟁우위', logicState: 'maintained' } });
  a.equal(r.recordConflict, false);
  // 의미가 다른 원문(한 글자 차이도 다른 기록으로 보수 처리)
  r = one({ 'gen-1': { thesis: '점유율 상승', logicState: 'maintained' }, 'dom-2': { thesis: '점유율 하락', logicState: 'maintained' } });
  a.equal(r.recordConflict, true); a.deepEqual(r.record.diffs, ['투자 이유']);
  // 서로 다른 logicBreak
  r = one({ 'gen-1': { thesis: 'a', logicState: 'maintained', logicBreak: '영업이익률 10% 미만' }, 'dom-2': { thesis: 'a', logicState: 'maintained', logicBreak: '점유율 2위로 하락' } });
  a.equal(r.recordConflict, true); a.deepEqual(r.record.diffs, ['논리 붕괴 조건']); a.equal(r.input.thesis, null);
  // 점검 항목 문구만 다름 / 확인 여부만 다름
  r = one({ 'gen-1': { thesis: 'a', checkpoints: [{ text: '재고', done: false }] }, 'dom-2': { thesis: 'a', checkpoints: [{ text: '가격', done: false }] } });
  a.equal(r.recordConflict, true); a.deepEqual(r.record.diffs, ['점검 항목']);
  r = one({ 'gen-1': { thesis: 'a', checkpoints: [{ text: '재고', done: true }] }, 'dom-2': { thesis: 'a', checkpoints: [{ text: '재고', done: false }] } });
  a.equal(r.recordConflict, true); a.deepEqual(r.record.diffs, ['점검 항목']);
  // 빈→유효·유효→빈 유지
  r = one({ 'gen-1': {}, 'dom-2': { thesis: 'a', logicState: 'maintained' } }); a.equal(r.recordConflict, false); a.deepEqual(r.recordFrom, ['ISA']);
  r = one({ 'gen-1': { thesis: 'a', logicState: 'maintained' }, 'dom-2': { thesis: ' ' } }); a.equal(r.recordConflict, false); a.deepEqual(r.recordFrom, ['일반']);
  // 비교값(_cmp)은 결과·JSON에 남지 않음
  r = one({ 'gen-1': { thesis: '비밀 메모', logicState: 'maintained' } });
  a.doesNotMatch(JSON.stringify(r), /비밀 메모|_cmp/); a.ok(!('_cmp' in r.record)); a.ok(!('_ks' in r));
  // 상충이면 엔진 판단 보류·게이트 닫힘
  r = one({ 'gen-1': { thesis: 'x', logicState: 'maintained' }, 'dom-2': { thesis: 'y', logicState: 'maintained' } });
  const o = G.createEvaluator().evaluate([r.input], { now: NOW })[0];
  a.equal(o.priceRelation.buyGate.open, false); a.equal(o.priceRelation.sellGate.open, false);
});

/* ---- 2230 지피 CR 2: 상품 유형 출처 미검증·다계좌 상충 ---- */
test('상품 유형: productType 단독 company 승격 금지, ETF 신호와 상충·계좌 순서 무관 상충 보류, 게이트 닫힘', () => {
  const mk = (id, t, n, extra) => Object.assign({ id, ticker: t, name: n, quantity: 1, currentPrice: 1 }, extra || {});
  const row = l => P.buildInputs(l, {}, {}, '2026-11-15')[0];
  const ev = G.createEvaluator();
  const check = (r, kind, basis, conflict) => {
    a.equal(r.input.company.kind, kind, r.key); a.equal(r.kindBasis, basis, r.key); a.equal(r.typeConflict, conflict, r.key);
    a.equal(G.validateInput(r.input).ok, true);
    const o = ev.evaluate([r.input], { now: NOW })[0];
    a.equal(o.state, 'hold'); a.equal(o.priceRelation.buyGate.open, false); a.equal(o.priceRelation.sellGate.open, false);
  };
  // 임의 입력의 company 기록 + ETF 추정 신호(목록·이름) → 상충
  check(row({ ov: [mk(1, 'QQQ', 'Invesco QQQ', { productType: 'company' })] }), 'unknown', 'conflict', true);
  check(row({ gen: [mk(1, '379800', 'KODEX미국S&P500TR', { productType: 'company' })] }), 'unknown', 'conflict', true);
  check(row({ gen: [mk(1, '360750', 'TIGER미국S&P500', { productType: 'company' })] }), 'unknown', 'conflict', true);
  // 같은 티커 상반 유형 — 계좌 순서를 바꿔도 같은 결과
  const A = mk(1, '005930', '삼성전자', { productType: 'company' }), B = mk(2, '005930', '삼성전자', { productType: 'etf' });
  check(row({ gen: [A], dom: [B] }), 'unknown', 'conflict', true);
  check(row({ gen: [B], dom: [A] }), 'unknown', 'conflict', true);
  // 미국: 유형 칸 없는 QLD·GLDM → unknown(출처 없음), company 기록만 → unknown(기록상 일반기업 — 출처 미검증)
  check(row({ ov: [mk(1, 'QLD', 'ProShares Ultra QQQ')] }), 'unknown', 'none', false);
  check(row({ ov: [mk(1, 'GLDM', 'SPDR Gold MiniShares')] }), 'unknown', 'none', false);
  check(row({ ov: [mk(1, 'QLD', 'ProShares Ultra QQQ', { productType: 'company' })] }), 'unknown', 'claimed', false); // 유형 출처 검증 수단 없음 → 승격 안 함
  // 일반 보통주 반례: company 기록이어도 확인된 company 아님, ETF로 오인도 안 함
  check(row({ gen: [mk(1, '005930', '삼성전자', { productType: 'company' })], dom: [mk(2, '005930', '삼성전자', { productType: 'company' })] }), 'unknown', 'claimed', false);
  check(row({ ov: [mk(1, 'AAPL', 'Apple Inc.')] }), 'unknown', 'none', false);
  // 같은 종목 한 계좌만 ETF 추정 이름 + 다른 계좌 유형 칸 없음 → ETF 추정(상충 아님)
  check(row({ gen: [mk(1, '069500', '069500')], dom: [mk(2, '069500', 'KODEX 200')] }), 'etf', 'guess', false);
  // productType etf 단독 → ETF 추정(출처 미검증)
  check(row({ ov: [mk(1, 'ZZZ', 'Zeta', { productType: 'etf' })] }), 'etf', 'claimed', false);
  a.deepEqual(P.resolveKind([]), { kind: 'unknown', basis: 'none', conflict: false });
});

test('탭 화면: 상품 유형 상충·출처 미검증·투자 이유 상충 표시', async () => {
  const d = new JSDOM('<!doctype html><head></head><body><div id="panel-greatco"></div></body>', { url: 'https://synthetic.invalid/portfolio_v5.html' }), w = d.window;
  try {
    w.fetch = () => { throw Error('Forbidden network'); };
    w.HASFundamentalFilter = require('../has/fundamental-filter.js'); w.HASGreatCompanies = G; w.HASGreatCompaniesLab = L;
    const l = { gen: [{ id: 1, ticker: '005930', name: '삼성전자', quantity: 1, productType: 'company' }], dom: [{ id: 2, ticker: '005930', name: '삼성전자', quantity: 1, productType: 'company' }], ov: [{ id: 3, ticker: 'QQQ', name: 'Invesco QQQ', quantity: 1, productType: 'company' }], pen: [] };
    const pr = { 'gen-1': { logicState: 'maintained', checkpoints: [], thesis: '장기 경쟁우위 유지' }, 'dom-2': { logicState: 'maintained', checkpoints: [], thesis: '핵심 경쟁력 소멸 우려' } };
    const before = JSON.stringify([l, pr]);
    const ui = P.create({ win: w, doc: w.document, now: () => NOW, source: () => ({ lists: l, principles: pr, getter: () => null }) });
    await ui.onTabChange('greatco');
    const cards = w.document.querySelectorAll('[data-testid=hgc-card]'); a.equal(cards.length, 2);
    a.match(cards[0].textContent, /상품 유형 미확인\(기록상 일반기업 — 출처 미검증\)/); a.match(cards[0].textContent, /서로 다름: 투자 이유/);
    a.doesNotMatch(cards[0].textContent, /소멸 우려/);
    a.match(cards[1].textContent, /상품 유형 상충 — 확인 필요/); a.doesNotMatch(cards[1].textContent, /ETF 추정/);
    a.doesNotMatch(w.document.body.textContent, /매수 검토: 열림|매도·축소 검토: 열림/);
    a.equal(JSON.stringify([l, pr]), before);
  } finally { d.window.close(); }
});
