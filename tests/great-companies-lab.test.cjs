'use strict';
/* ORDER GPT-20261115-1326 3절 5)·6): 위대한 기업 시험 전용 화면(독립 경로·?test=1 게이트) 시험. 전부 가상 자료. */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const G = require('../has/great-companies.js'), X = require('../has/great-companies-fixtures.js'), L = require('../has/great-companies-lab.js');
const HTML = read('has/great-companies-lab.html'), JS = read('has/great-companies-lab.js'), FX = read('has/great-companies-fixtures.js');
const VALUE_CONFIRM = /기업가치 유지|저평가 확인|고평가 확인|매도 근거 부족|적정 주가|가치 확인됨|본질가치 유지/;
const tick = () => new Promise(r => setTimeout(r, 0));
async function until(fn, what) { for (let i = 0; i < 200; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 5)); } throw new Error('timeout: ' + (what || '')); }
async function go(t, hash) { const before = t.ui.renders(); t.w.location.hash = hash; await until(() => t.ui.renders() > before, hash); }
function dom(search, hash) {
  const d = new JSDOM(HTML.replace(/<script[\s\S]*?<\/script>/g, ''), { url: 'https://example.test/has/great-companies-lab.html' + (search || '') + (hash || ''), virtualConsole: new VirtualConsole() });
  const ui = L.mount(d.window.document, d.window, G, X);
  return { d, w: d.window, doc: d.window.document, ui, text: () => d.window.document.getElementById('lab').textContent };
}

test('독립 화면: 오프라인 CSP, 재무 필터·엔진·가상 자료·화면 스크립트만, 저장소·네트워크·HTML 주입 없음', () => {
  a.match(HTML, /connect-src 'none'/); a.match(HTML, /form-action 'none'/);
  a.deepEqual([...HTML.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]), ['fundamental-filter.js', 'great-companies.js', 'great-companies-fixtures.js', 'great-companies-lab.js']);
  for (const src of [JS, FX]) {
    a.doesNotMatch(src, /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|caches|serviceWorker)\b/);
    a.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
  }
  a.match(HTML, /가상 자료/); a.match(HTML, /매수·매도 검토 게이트는 닫혀/);
});

test('게이트 OFF 증빙: 운영 앱·서비스워커·다른 화면이 시험 화면·가상 자료를 부르거나 링크하지 않음', () => {
  for (const f of ['portfolio.html', 'service-worker.js', 'manifest.json']) if (fs.existsSync(path.join(ROOT, f))) a.doesNotMatch(read(f), /great-companies/, f);
  // 2026-11-15 순태씨 '진행': 운영 앱은 탭 진입 시 has/great-companies-panel.js만 지연 주입한다(시험 화면·가상 자료는 부르지 않음).
  const app = read('portfolio_v5.html'); a.deepEqual([...new Set(app.match(/great-companies[\w.\-]*/g))], ['great-companies-panel.js']); a.doesNotMatch(app, /<script[^>]+great-companies/);
  a.doesNotMatch(read('has/great-companies-panel.js'), /great-companies-fixtures|great-companies-lab\.html|HASGreatCompaniesFixtures/);
  for (const f of fs.readdirSync(path.join(ROOT, 'has')).filter(n => /\.(html|js)$/.test(n) && !/^great-companies/.test(n))) a.doesNotMatch(read('has/' + f), /great-companies/, f);
  a.equal(L.gateOn(''), false); a.equal(L.gateOn('?test=0'), false); a.equal(L.gateOn('?x=1'), false); a.equal(L.gateOn('?test=1'), true);
  const off = dom('');
  a.match(off.text(), /시험 게이트가 닫혀/); a.equal(off.doc.querySelectorAll('.co').length, 0); a.equal(off.ui.model, null);
});

test('가상 자료: 10개 사례 모두 synthetic·가상 이름, 지시서 시나리오 상태가 나옴', () => {
  const sc = X.scenarios(); a.equal(sc.length, 10); a.equal(new Set(sc.map(s => s.id)).size, 10);
  for (const s of sc) { a.equal(s.input.synthetic, true); a.match(s.input.company.name, /^가상 기업/); a.equal(G.validateInput(s.input).ok, true, s.id); }
  const by = Object.fromEntries(sc.map(s => [s.id, G.assess(s.input, { now: X.NOW })]));
  a.equal(by.SYNA.state, 'priority'); a.equal(by.SYNA.priceRelation.signal, 'fear'); a.equal(by.SYNA.opinion, '판단 보류');
  a.equal(by.SYNB.state, 'erosion'); a.match(by.SYNB.priceRelation.text, /곡소리 아님/);
  a.equal(by.SYNC.opinion, '보유 지속 검토'); a.equal(by.SYNC.priceRelation.signal, 'euphoria');
  a.equal(by.SYND.opinion, '점검 필요'); a.deepEqual(by.SYND.priceRelation.riskBasis.map(r => r.kind).sort(), ['concentration', 'valuation']);
  a.equal(by.SYNE.state, 'recheck'); a.ok(by.SYNE.changes.length >= 1);
  a.equal(by.SYNF.state, 'hold'); a.match(by.SYNF.reason, /재무 자료 없음/);
  a.equal(by.SYNG.priceRelation.valuation.reason, 'stale');
  a.equal(by.SYNH.state, 'erosion'); a.equal(by.SYNH.priceRelation.signal, 'euphoria'); a.equal(by.SYNH.priceRelation.warning, true);
  a.ok(by.SYNI.priceRelation.conflicts.length >= 2); a.equal(by.SYNI.opinion, '판단 보류');
  a.equal(by.SYNJ.priceRelation.signal, 'stale'); a.equal(by.SYNJ.priceRelation.valuation.reason, 'missing');
  for (const r of Object.values(by)) { a.equal(r.priceRelation.buyGate.open, false); a.equal(r.priceRelation.sellGate.open, false); }
});

test('목록: 10개 카드, 카드마다 가상 자료 표시·상태·의견·밸류에이션 보류 사유, 주의 표시는 warning 또는 riskWarning일 때만', () => {
  const t = dom('?test=1'), cards = [...t.doc.querySelectorAll('.co')];
  a.equal(cards.length, 10);
  const results = t.ui.model.results();
  cards.forEach((c, i) => {
    const r = results[i], txt = c.textContent, p = r.a.priceRelation;
    a.match(txt, /가상 자료/); a.ok(txt.includes(r.a.stateKo)); a.ok(txt.includes('의견: ' + r.a.opinion)); a.match(txt, /밸류에이션: /);
    a.equal(/주의/.test([...c.querySelectorAll('.tag')].map(x => x.textContent).join('|')), !!(p.warning || p.riskWarning), r.id);
  });
  a.match(t.text(), /평가 기준시각\(가상 고정\): 2026-11-15/);
});

test('밸류에이션 보류 사유는 모든 분기에서 따로 표시(1927 후속): 미연결·오래됨·입력 미검증·판단 보류가 서로 다르게, 오래됨을 미연결로 표시하지 않음', () => {
  const t = dom('?test=1'), m = t.ui.model;
  const line = id => L.valuationLine(m.find(id).a);
  a.match(line('SYNG'), /^밸류에이션: 기준일 오래됨 — 확인 전 판단 보류 · /); a.doesNotMatch(line('SYNG'), /미연결/);
  a.match(line('SYNJ'), /^밸류에이션: 미연결/);     // 가격 stale 분기(state priority 아닌 경로와 같은 return) — 주 설명문 대신 valuation.reason 사용
  a.match(line('SYNC'), /입력 미검증\(가상 입력\)/);
  a.match(line('SYNE'), /입력 미검증/);                      // state recheck 분기
  a.match(line('SYNF'), /평가하지 않음\(판단 보류 상태\)/);
  a.equal(new Set(['SYNG', 'SYNJ', 'SYNC', 'SYNF'].map(id => line(id).split(' · ')[0])).size, 4);
});

test('클릭 흐름: 자세히 → 6개 영역·보유 이유·위험·변경·출처·게이트 표시 → 목록으로, 재진입은 재계산 없음(⑩)', async () => {
  const t = dom('?test=1'), m = t.ui.model;
  a.equal(m.stats().computed, 10); a.equal(m.stats().cacheHits, 0);
  { const n = t.ui.renders(); t.doc.querySelector('button.open[data-id="SYNE"]').click(); await until(() => t.ui.renders() > n, 'open'); }
  a.equal(t.w.location.hash, '#d=SYNE');
  const d = t.text();
  for (const h of ['6개 영역', '보유할 이유', '위험·반론', '변경사항', '출처·기준일(가상)', '관련 가격 신호', '검토 게이트']) a.ok(d.includes(h), h);
  a.equal(t.doc.querySelectorAll('.domain').length, 6);
  a.match(d, /상태: 장기보유 우선 검토 → 경쟁력 재점검/); a.match(d, /매수 검토 게이트: 닫힘/); a.match(d, /매도·축소 검토 게이트: 닫힘/);
  a.match(d, /근거: /); a.match(d, /반론: /);
  t.doc.querySelector('button.back-list').click(); await until(() => t.doc.querySelectorAll('.co').length === 10, 'back');
  a.equal(t.doc.querySelectorAll('.co').length, 10);
  for (const id of X.ids) await go(t, '#d=' + id);
  await go(t, '');
  a.equal(m.stats().computed, 10, '화면 전환으로 다시 계산하지 않음'); a.equal(m.stats().cacheHits, 0);
  a.match(t.text(), /계산 10회 · 재사용 0회/);
});

test('주의 근거: 경쟁력 경고와 위험 근거(미검증)를 따로, 판단 보류 상세도 안전하게', async () => {
  const t = dom('?test=1', '#d=SYNH');
  a.match(t.text(), /경쟁력 경고: 경쟁력·보유 논리 훼손 우려/); a.doesNotMatch(t.text(), /위험 근거\(/);
  await go(t, '#d=SYND');
  a.match(t.text(), /위험 근거\(미검증\): 비중 18% > 한도 10%/); a.match(t.text(), /위험 근거\(미검증\): 밸류에이션 높은 편\(입력 미검증/); a.doesNotMatch(t.text(), /경쟁력 경고:/);
  a.match(t.text(), /가상 분석\(설명용, 입력 미검증\)/);
  await go(t, '#d=SYNF');
  a.match(t.text(), /판정 이유: 재무 자료 없음\(미연결\)/); a.match(t.text(), /없음\(판단 보류\)/); a.equal(t.doc.querySelectorAll('.domain').length, 0);
  await go(t, '#d=NOPE'); a.equal(t.doc.querySelectorAll('.co').length, 10, '없는 종목 → 목록');
  a.equal(L.parseHash('#d=<img>'), null);
});

test('화면 전체 문구: 금지어·가치 확정 문구·분할매수/매도 검토 대상 없음(목록·상세 10개 전부)', async () => {
  const t = dom('?test=1'); let all = t.text();
  for (const id of X.ids) { await go(t, '#d=' + id); all += t.text(); }
  a.doesNotMatch(all, G.BANNED); a.doesNotMatch(all, VALUE_CONFIRM);
  a.doesNotMatch(all, /분할매수 검토 대상|분할매도 검토 대상|매수 검토 가능|매도 검토 가능|축소 검토 가능/);
  a.doesNotMatch(all, /undefined|null|NaN|\[object/);
});

test('고정 핀: 새 시험 화면 파일 4개 sha256가 live-data-pins addedRuntimeFiles와 같음', () => {
  const pins = require('./lib/live-data-pins.json');
  for (const f of ['has/great-companies-fixtures.js', 'has/great-companies-lab.js', 'has/great-companies-lab.html', 'has/great-companies-lab.css'])
    a.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex'), pins.addedRuntimeFiles[f], f);
});
