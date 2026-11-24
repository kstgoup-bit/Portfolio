'use strict';
/* GPT-20261116-1030: 위험관리 상단 '오늘의 투자 판단'(매수 검토·매도 검토·장기보유·판단 보류·중요 위험) 분류와 같은 버튼 펼치기/접기.
   합성 자료만 사용, 저장소·네트워크 없음. */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const D = require('../has/decision-brief.js'), R = require('../has/portfolio-reader.js'), B = require('../has/advisor-bridge.js'), M = require('../has/briefing-model.js'), S = require('../has/advisor-synthetic.js');
const ROOT = path.resolve(__dirname, '..'), read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const NOW = '2026-11-06T09:00:00+09:00';
const st = (id, t, q, avg, cur, extra = {}) => Object.assign({ id, name: '합성 ' + t, ticker: t, quantity: q, avgPrice: avg, currentPrice: cur }, extra);
function brief(data, ext = {}, basis = 'real', now = NOW) { const g = k => data[k] === undefined ? null : data[k]; return M.build(R.read(g, { basis, asOf: now }), B.run(g, ext, now, { basis }), now); }
// 보유 40종목 + 집중 위험 1건(합성) — '판단 보류 40 · 위험 1'과 같은 모양
function forty() { const gen = []; for (let i = 0; i < 39; i++) gen.push(st(i + 1, 'K' + String(i).padStart(3, '0'), 1, 100, 100)); gen.push(st(99, 'BIG', 400, 100, 100)); gen.push(st(100, 'DEP_GEN', 1, 1, 20000, { role: 'shield' })); return { v5_gen: JSON.stringify(gen), v5_dom: '[]', v5_ov: '[]', v5_pen: '[]', v5_fx: '1400', v5_cma_amount: '0' }; }

test('① 미검증 40·위험 1 자료: 매수·매도·장기보유 0, 판단 보류 40, 중요 위험 1 (상수 아님·입력 불변)', () => {
  const b = brief(forty()), snap = JSON.stringify(b), c = D.classify(b);
  a.equal(JSON.stringify(b), snap);
  a.equal(c.buy.length, 0); a.equal(c.sell.length, 0); a.equal(c.hold.length, 0); a.equal(c.pending.length, 40); a.equal(c.risks.length, 1);
  a.match(c.risks[0].text, /BIG 비중/); a.ok(c.checks.some(r => r.type === 'stale'), '가격 최신성 확인 항목 유지');
  a.equal(D.summaryText(c), '매수 검토 0 · 매도 검토 0 · 장기보유 0 · 판단 보류 40 · 중요 위험 1');
  const c2 = D.classify(brief({ v5_gen: JSON.stringify([st(1, 'AAA', 1, 1, 1)]), v5_dom: '[]', v5_ov: '[]', v5_pen: '[]', v5_fx: '1400' }));
  a.equal(c2.pending.length, 1); a.notEqual(D.summaryText(c2), D.summaryText(c), '고정 문구가 아님');
  for (const s of [read('has/decision-brief.js')]) { a.doesNotMatch(s, /판단 보류 40|위험 1['"]/); a.doesNotMatch(s, /AVGO|NVDA|MSFT/); a.doesNotMatch(s, /localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest/); }
});

const mk = (ticker, opinion, held, ext = {}) => Object.assign({ ticker, market: 'US', opinion, holding: { held }, reasonsFor: ['근거 ' + ticker], reasonsAgainst: ['반론 ' + ticker], basis: 'real', asOf: NOW, dataQuality: { ok: true, why: [] }, facts: [{ text: '사실 ' + ticker, source: '출처 ' + ticker }] }, ext);

test('② 근거가 모두 검증된 규칙 엔진 의견만 숫자가 바뀜(합성 예시: 매수 검토 1)', () => {
  const c = D.classify(brief(S.DATA, S.externals(), 'synthetic', S.NOW));
  a.equal(c.buy.length, 1); a.equal(c.buy[0].ticker, 'SYN-KR2'); a.equal(c.buy[0].held, false); a.match(c.buy[0].reason, /재무·투자 논리 이상 없음/); a.ok(c.buy[0].against.length > 0, '반론 표시');
  a.equal(c.sell.length, 0); a.equal(c.hold.length, 0); a.equal(c.pending.length, 2, '집중 위험만으로 매도 검토 아님'); a.ok(c.risks.some(r => r.type === 'concentration'));
  const c2 = D.classify({ basis: 'real', generatedAt: NOW, opinions: [mk('A', '보유', true), mk('B', '비중 축소 검토', true), mk('C', '판단 보류', true)], buyCandidates: [mk('D', '매수 검토', false)], risks: [] });
  a.deepEqual([c2.buy.length, c2.sell.length, c2.hold.length, c2.pending.length], [1, 1, 1, 1]);
  a.equal(c2.sell[0].ticker, 'B'); a.equal(c2.hold[0].ticker, 'A'); a.equal(c2.pending[0].reason, '반론 C');
});

test('③ 고점 대비 급락(가격만)·상승만으로는 매수·매도 후보가 되지 않음', () => {
  const ext = S.externals(); ext.fundamentals = {}; ext.thesis = {};
  const g = k => S.DATA[k] === undefined ? null : S.DATA[k], br = B.run(g, ext, S.NOW, { basis: 'synthetic' }), b = M.build(R.read(g, { basis: 'synthetic', asOf: S.NOW }), br, S.NOW), c = D.classify(b);
  a.equal(c.buy.length, 0); a.equal(c.sell.length, 0); a.equal(c.hold.length, 0); a.equal(c.pending.length, 2);
  const kr2 = br.advices.find(x => x.ticker === 'SYN-KR2'); a.equal(kr2.opinion, '판단 보류'); a.ok(kr2.reasonsAgainst.some(r => /가격만 하락/.test(r)), '고점 대비 -40%여도 재무 없으면 보류');
  // 고점 근접·상승(환호 신호)만 있는 보유 종목도 매도 검토가 아님
  const e2 = S.externals(); e2.high52w['SYN-KR1'] = { price: 60, asOfDate: '2026-11-05', source: '합성' }; e2.returns['SYN-KR1'] = { stockPct: 40, benchPct: 5, periodDays: 20, asOfDate: '2026-11-05', source: '합성' };
  const c2 = D.classify(brief(S.DATA, e2, 'synthetic', S.NOW)); a.equal(c2.sell.length, 0); a.ok(c2.pending.some(p => p.ticker === 'SYN-KR1'));
});

test('④ 알 수 없는 의견·미보유 장기보유·실제 화면의 합성 의견·손상 입력은 판단 보류(던지지 않음)', () => {
  const c = D.classify({ basis: 'real', opinions: [{ ticker: 'X', opinion: '강력 매수', holding: { held: true } }, { ticker: 'Y', opinion: '보유', holding: { held: false } }, { ticker: 'Z', opinion: '매수 검토', holding: { held: true }, basis: 'synthetic' }, null, { opinion: '매수 검토' }, { ticker: 'X', opinion: '매수 검토' }], buyCandidates: 'bad', risks: [null, { type: 'loss', text: 'L' }] });
  a.deepEqual([c.buy.length, c.sell.length, c.hold.length, c.pending.length], [0, 0, 0, 3]); a.equal(c.pending[0].reason, '같은 종목 의견 상충');
  a.equal(c.pending[1].reason, '자료 구분(실제/합성) 없음'); a.equal(c.pending[2].reason, '실제 화면에 합성 자료 의견'); a.equal(c.risks.length, 1);
  for (const x of [null, undefined, 5, 'x', {}]) assert0(D.classify(x));
  function assert0(r) { a.deepEqual([r.buy.length, r.sell.length, r.hold.length, r.pending.length], [0, 0, 0, 0]); }
});

function dom() {
  const w = new JSDOM('<!doctype html><body><div id="hasPriceTrust" class="hpt"></div><div id="hasBriefStrip"></div><button id="other">x</button></body>', { runScripts: 'outside-only' }).window;
  w.eval(read('has/decision-brief.js'));
  const pt = w.document.getElementById('hasPriceTrust'); pt.innerHTML = '<div class="hpt-head"><strong>💱 가격 신뢰도: </strong><span>미검증 가격·출처·기준시각 확인 필요</span></div><details><summary>자세히 보기</summary><div class="hpt-line">줄1</div><div class="hpt-line">줄2</div></details>';
  return w;
}
const click = (w, el) => { el.click(); return new Promise(r => w.setTimeout(r, 0)); };

test('⑤ 접힌 상태에서도 가격 신뢰도 경고·중요 위험 한 줄·집계는 보임', async () => {
  const w = dom(), D2 = w.HASDecisionBrief, box = w.document.getElementById('hasBriefStrip');
  D2.install(); D2.renderStrip(box, { brief: brief(forty()) }, () => { });
  const det = box.querySelector('details'); a.equal(det.open, false);
  a.match(box.querySelector('[data-testid=hs-strip-text]').textContent, /위험 점검: 중요 위험 1건 · 매수·매도 판단은 아래 AI 검토/);
  const risk = box.querySelector('[data-testid=hdb-risk-line]'); a.ok(risk && !det.contains(risk), '위험 한 줄은 접기 밖'); a.equal(risk.getAttribute('role'), 'alert'); a.match(risk.textContent, /BIG 비중/); a.doesNotMatch(risk.textContent, /외 \d+건/);
  const pt = w.document.getElementById('hasPriceTrust'), pd = pt.querySelector('details'); a.equal(pd.open, false);
  a.ok(!pd.contains(pt.querySelector('.hpt-head')), '가격 신뢰도 경고는 접기 밖'); a.match(pt.textContent, /미검증 가격·출처·기준시각 확인 필요/);
  a.equal(pd.querySelectorAll('.hpt-line').length, 2, '상세 문구 보존');
});

test('같은 버튼: 접힘→펼침→접힘 2회, 문구·aria-expanded 일치, 내부 버튼은 접지 않음, 영역 분리', async () => {
  const w = dom(), D2 = w.HASDecisionBrief, box = w.document.getElementById('hasBriefStrip'); let opened = 0;
  D2.install(); D2.renderStrip(box, { brief: brief(S.DATA, S.externals(), 'synthetic', S.NOW) }, () => { opened++; });
  const det = box.querySelector('.hdb-head > details'), s = det.querySelector('summary'), pd = w.document.querySelector('#hasPriceTrust details'), ps = pd.querySelector('summary');
  a.equal(s.getAttribute('role'), 'button'); a.ok(w.document.getElementById(s.getAttribute('aria-controls')));
  for (let i = 0; i < 2; i++) {
    a.equal(s.getAttribute('aria-expanded'), 'false'); a.match(s.textContent, /펼치기/);
    await click(w, s); a.equal(det.open, true); a.equal(s.getAttribute('aria-expanded'), 'true'); a.match(s.textContent, /접기/);
    await click(w, s); a.equal(det.open, false); a.equal(s.getAttribute('aria-expanded'), 'false');
  }
  s.click(); a.equal(s.getAttribute('aria-expanded'), 'true', '즉시 일치(비동기 지연 없음)'); a.equal(det.open, true); s.click(); a.equal(s.getAttribute('aria-expanded'), 'false'); a.match(s.textContent, /펼치기/);
  await click(w, s); const go = box.querySelector('[data-testid=hs-strip-open]'); await click(w, go); a.equal(opened, 1); a.equal(det.open, true, '내부 버튼은 접지 않음');
  const it = box.querySelector('[data-testid=hdb-item-buy] details'); a.ok(it); await click(w, it.querySelector('summary')); a.equal(it.open, true); a.equal(det.open, true, '후보 상세는 별도');
  a.equal(pd.open, false, '가격 신뢰도는 따로'); await click(w, ps); a.equal(pd.open, true); a.equal(ps.getAttribute('aria-expanded'), 'true'); a.equal(det.open, true);
  await click(w, ps); a.equal(pd.open, false); a.equal(det.open, true);
});

test('탭 이동 → 모두 접힘·재진입 기본 접힘 / 자료 갱신 다시 그리기 → 펼침 유지·새 상태 반영', async () => {
  const w = dom(), D2 = w.HASDecisionBrief, box = w.document.getElementById('hasBriefStrip');
  D2.install(); D2.renderStrip(box, { brief: brief(forty()) }, () => { });
  let s = box.querySelector('.hdb-head > details > summary'); await click(w, s); a.equal(s.parentNode.open, true);
  const ps = w.document.querySelector('#hasPriceTrust details > summary'); await click(w, ps);
  // 자료 갱신(다른 결과로 다시 그림) — 펼침 유지, 새 숫자 반영
  D2.renderStrip(box, { brief: brief(S.DATA, S.externals(), 'synthetic', S.NOW) }, () => { }); await new Promise(r => w.setTimeout(r, 0));
  s = box.querySelector('.hdb-head > details > summary'); a.equal(s.parentNode.open, true); a.equal(s.getAttribute('aria-expanded'), 'true'); a.match(box.textContent, /매수 검토 1/);
  D2.renderStrip(box, { brief: null }, () => { }); a.match(box.textContent, /점검 불가/); // 조회 실패
  D2.renderStrip(box, { brief: brief(forty()) }, () => { });
  D2.onTabChange('risk'); await new Promise(r => w.setTimeout(r, 0));
  a.equal(w.document.querySelector('#hasPriceTrust details').open, false); a.equal(box.querySelector('.hdb-head > details').open, false);
  D2.renderStrip(box, { brief: brief(forty()) }, () => { }); await new Promise(r => w.setTimeout(r, 0));
  s = box.querySelector('.hdb-head > details > summary'); a.equal(s.parentNode.open, false); a.match(s.textContent, /펼치기/);
  await click(w, s); a.equal(s.parentNode.open, true, '재터치 정상');
});

test('정적: 앱 연결은 최소 변경(스크립트·CSS 추가, 탭 전환 시 접기, 원본 띠는 모듈 없을 때 그대로) · 12px 이상', () => {
  const html = read('portfolio_v5.html'), ap = read('has/advisor-panel.js'), css = read('has/decision-brief.css');
  a.match(html, /<script defer src="has\/advisor-panel\.js"><\/script>\n<script defer src="has\/decision-brief\.js"><\/script>/);
  a.match(html, /<link rel="stylesheet" href="has\/decision-brief\.css">/);
  a.match(html, /HASDecisionBrief\.onTabChange\(tab\);\n  if\(window\.HASPriceTrustUI\) window\.HASPriceTrustUI\.refresh\(\);/);
  a.match(ap, /if \(W\.HASDecisionBrief\) \{ W\.HASDecisionBrief\.renderStrip\(s, c, [^\n]+\n      var t = el\('span', '', '🧭 오늘의 투자 브리핑: '/);
  for (const m of css.matchAll(/font(?:-size)?:[^;}]*?(\d+)px/g)) a.ok(Number(m[1]) >= 12, m[0]);
  a.doesNotMatch(css, /#subtabs-risk/, '위험관리 하위 메뉴는 원래 가로 스크롤 그대로(순태씨 2026-11-16)');
  a.match(css, /#hasBriefStrip\.hdb\.hdb-off,body #hasPriceTrust\.hdb-off\.hdb-off\{display:none\}/);
});

test('순태씨 2026-11-16: 오늘의 투자 판단 띠는 투자 대분류에서만 보이고 위험관리·자산관리·설정에서는 숨김', () => {
  const w = new JSDOM('<!doctype html><body><button class="gtab active" id="gtab-invest"></button><button class="gtab" id="gtab-risk"></button><div id="hasPriceTrust"></div><div id="hasBriefStrip"></div></body>', { runScripts: 'outside-only' }).window;
  w.eval(read('has/decision-brief.js')); const D2 = w.HASDecisionBrief, box = w.document.getElementById('hasBriefStrip');
  const gi = w.document.getElementById('gtab-invest'), gr = w.document.getElementById('gtab-risk');
  D2.renderStrip(box, { brief: brief(forty()) }, () => { });
  a.equal(box.classList.contains('hdb-off'), false, '투자 탭: 보임'); a.match(box.textContent, /판단 보류 40/);
  gi.classList.remove('active'); gr.classList.add('active'); D2.onTabChange('principledash');
  a.equal(box.classList.contains('hdb-off'), true, '위험관리: 숨김');
  D2.renderStrip(box, { brief: brief(forty()) }, () => { }); a.equal(box.classList.contains('hdb-off'), true, '다시 그려도 숨김 유지');
  gr.classList.remove('active'); gi.classList.add('active'); D2.onTabChange('dashboard');
  a.equal(box.classList.contains('hdb-off'), false, '투자 탭 복귀: 다시 보임');
});

test('순태씨 2026-11-16: 가격 신뢰도 띠도 투자 탭에서만 — 원본 refresh가 className을 덮어써도 숨김 유지', () => {
  const w = new JSDOM('<!doctype html><body><button class="gtab" id="gtab-invest"></button><button class="gtab active" id="gtab-risk"></button><div id="hasPriceTrust" class="hpt"></div><div id="hasBriefStrip"></div></body>', { runScripts: 'outside-only' }).window;
  // 원본 price-trust-ui처럼 className을 통째로 바꾸는 가짜 refresh
  w.HASPriceTrustUI = { refresh() { const b = w.document.getElementById('hasPriceTrust'); b.className = 'hpt hpt-warn'; b.innerHTML = '<div class="hpt-head">가격</div><details><summary>자세히 보기</summary><div>줄</div></details>'; } };
  w.HASPriceTrustUI.refresh(); w.eval(read('has/decision-brief.js')); const D2 = w.HASDecisionBrief, pt = w.document.getElementById('hasPriceTrust');
  D2.install(); a.equal(pt.classList.contains('hdb-off'), true, '위험관리에서 숨김');
  w.HASPriceTrustUI.refresh(); a.equal(pt.classList.contains('hdb-off'), true, '원본 다시 그려도 숨김');
  w.document.getElementById('gtab-risk').classList.remove('active'); w.document.getElementById('gtab-invest').classList.add('active');
  D2.onTabChange('dashboard'); w.HASPriceTrustUI.refresh(); a.equal(pt.classList.contains('hdb-off'), false, '투자 탭: 보임'); a.match(pt.textContent, /가격/);
});

test('CR-2 검증된 후보 계약: 신뢰성·근거·반론·출처·시각·실제/합성·보유·상충 중 하나라도 어긋나면 판단 보류(fail-closed)', () => {
  const one = (adv, basis = 'real') => D.classify({ basis, generatedAt: NOW, opinions: [], buyCandidates: [adv], risks: [] });
  // 기준: 모든 조건을 갖춘 실제 의견은 후보 1건
  a.equal(one(mk('OK', '매수 검토', false)).buy.length, 1);
  const cases = [
    [{ ticker: 'X', market: 'KR', opinion: '매수 검토', basis: 'real', dataQuality: { ok: false } }, '자료 신뢰성 미확인'],
    [mk('Q', '매수 검토', false, { dataQuality: { ok: false, why: ['미검증'] } }), '자료 신뢰성 미확인'],
    [mk('Q2', '매수 검토', false, { dataQuality: undefined }), '자료 신뢰성 미확인'],
    [mk('R', '매수 검토', false, { reasonsFor: [] }), '근거 없음'],
    [mk('R2', '매수 검토', false, { reasonsFor: ['  ', ''] }), '근거 없음'],
    [mk('A', '매수 검토', false, { reasonsAgainst: [] }), '반론 없음'],
    [mk('F', '매수 검토', false, { facts: [] }), '출처가 확인된 사실 없음'],
    [mk('F2', '매수 검토', false, { facts: [{ text: '사실' }] }), '출처가 확인된 사실 없음'],
    [mk('T', '매수 검토', false, { asOf: '' }), '기준 시각 없음'],
    [mk('T2', '매수 검토', false, { asOf: 'nope' }), '기준 시각 없음'],
    [mk('T3', '매수 검토', false, { asOf: '2026-12-01T00:00:00+09:00' }), '기준 시각이 미래'],
    [mk('B', '매수 검토', false, { basis: '' }), '자료 구분(실제/합성) 없음'],
    [mk('B2', '매수 검토', false, { basis: 'synthetic' }), '실제 화면에 합성 자료 의견'],
    [mk('S', '비중 축소 검토', false), '미보유 종목의 매도 검토'],
    [mk('S2', '비중 축소 검토', 'yes'), '미보유 종목의 매도 검토'],
    [mk('H', '보유', false), '미보유 종목의 장기보유']
  ];
  for (const [adv, why] of cases) { const c = one(adv); a.deepEqual([c.buy.length, c.sell.length, c.hold.length, c.pending.length], [0, 0, 0, 1], adv.ticker); a.equal(c.pending[0].reason, why, adv.ticker); a.equal(c.pending[0].verified, false); }
  // 합성 화면의 실제 의견도 섞지 않음
  a.equal(one(mk('M', '매수 검토', false), 'synthetic').pending[0].reason, '합성 화면에 실제 자료 의견');
  // 동종목 상충(보유 의견 vs 매수 후보) → 둘 다 세지 않음
  const cf = D.classify({ basis: 'real', generatedAt: NOW, opinions: [mk('C', '비중 축소 검토', true)], buyCandidates: [mk('C', '매수 검토', true)], risks: [] });
  a.deepEqual([cf.buy.length, cf.sell.length, cf.pending.length, cf.total], [0, 0, 1, 1]); a.equal(cf.pending[0].reason, '같은 종목 의견 상충');
  // 같은 종목·같은 의견 중복은 1건으로 집계(상충 아님)
  const du = D.classify({ basis: 'real', generatedAt: NOW, opinions: [mk('E', '보유', true), mk('E', '보유', true)], buyCandidates: [], risks: [] });
  a.deepEqual([du.hold.length, du.pending.length], [1, 0]);
  // 실제 엔진 경로의 유효 합성 예시는 계속 통과(②) — 검증 통과 표시
  const c = D.classify(brief(S.DATA, S.externals(), 'synthetic', S.NOW)); a.equal(c.buy.length, 1); a.equal(c.buy[0].verified, true);
  // 입력 불변
  const adv = mk('Z', '매수 검토', false), snap = JSON.stringify(adv); one(adv); a.equal(JSON.stringify(adv), snap);
});

test('CR-1 접힌 기본 화면: 매수·매도·장기보유 3카드와 정확한 건수가 접기 밖에 보이고, 종목·사유는 접기 안', async () => {
  const w = dom(), D2 = w.HASDecisionBrief, box = w.document.getElementById('hasBriefStrip');
  D2.install(); D2.renderStrip(box, { brief: brief(S.DATA, S.externals(), 'synthetic', S.NOW) }, () => { });
  const det = box.querySelector('.hdb-head > details'); a.equal(det.open, false);
  const mini = box.querySelector('[data-testid=hdb-mini]'); a.ok(mini && !det.contains(mini), '3카드는 접기 밖');
  const want = { buy: '매수 검토1건', sell: '매도 검토0건', hold: '장기보유0건' };
  for (const k of ['buy', 'sell', 'hold']) { const m = box.querySelector('[data-testid=hdb-card-' + k + ']'); a.ok(m && mini.contains(m), k); a.equal(m.textContent, want[k]); }
  a.equal(mini.children.length, 3); a.doesNotMatch(mini.textContent, /SYN-/, '종목명은 펼친 뒤에만');
  const list = box.querySelector('[data-testid=hdb-list-buy]'); a.ok(det.contains(list)); a.match(list.textContent, /SYN-KR2/);
  a.ok(det.contains(box.querySelector('[data-testid=hdb-card-pending]')), '판단 보류 상세는 접기 안');
  // 세 칸 모두 0건이면 3칸을 숨기고 위험 점검 문구만(순태씨 2026-11-25: 0건 칸이 아래 AI 검토와 헷갈림)
  D2.renderStrip(box, { brief: brief(forty()) }, () => { });
  a.equal(box.querySelector('[data-testid=hdb-mini]'), null); a.match(box.querySelector('[data-testid=hs-strip-text]').textContent, /위험 점검: .*아래 AI 검토/);
  a.ok(box.querySelector('[data-testid=hdb-risk-line]'), '위험 한 줄 유지');
});

test('CR-3 같은 종목 다계좌·중복: 모든 기록을 검사(순서 무관), 한 건 실패·속성 상충이면 종목 전체 판단 보류, 위험 키 안전', () => {
  const run = ops => D.classify({ basis: 'real', generatedAt: NOW, opinions: ops, buyCandidates: [], risks: [] });
  const cnt = c => [c.buy.length, c.sell.length, c.hold.length, c.pending.length];
  // 정상 다계좌(같은 속성) → 1건, 역순도 동일
  const ok2 = [mk('MSFT', '보유', true), mk('MSFT', '보유', true)];
  a.deepEqual(cnt(run(ok2)), [0, 0, 1, 0]); a.deepEqual(cnt(run(ok2.slice().reverse())), [0, 0, 1, 0]);
  const bad = [
    [[mk('MSFT', '보유', true), mk('MSFT', '보유', true, { dataQuality: { ok: false } })], /2건 중 검증 실패: 자료 신뢰성 미확인/],
    [[mk('MSFT', '보유', true), mk('MSFT', '보유', true, { facts: [] })], /2건 중 검증 실패: 출처가 확인된 사실 없음/],
    [[mk('MSFT', '보유', true), mk('MSFT', '보유', true, { asOf: '2026-11-05T09:00:00+09:00' })], /기록 상충\(기준 시각\)/],
    [[mk('MSFT', '매수 검토', true), mk('MSFT', '매수 검토', false)], /기록 상충\(보유 여부\)/],
    [[mk('MSFT', '보유', true, { market: 'US' }), mk('MSFT', '보유', true, { market: 'KR' })], /기록 상충\(시장\)/],
    [[mk('MSFT', '보유', true), mk('MSFT', '보유', false)], /2건 중 검증 실패: 미보유 종목의 장기보유/]
  ];
  for (const [ops, re] of bad) for (const o of [ops, ops.slice().reverse()]) {
    const c = run(o); a.deepEqual(cnt(c), [0, 0, 0, 1], String(re)); a.match(c.pending[0].reason, re); a.equal(c.pending[0].verified, false); a.equal(c.total, 1);
  }
  // 손상·위험 티커 키: 던지지 않고 일반 키로 처리, 프로토타입 오염 없음
  const keys = ['constructor', '__proto__', 'toString', 'hasOwnProperty'];
  const c = run(keys.map(t => mk(t, '보유', true)).concat([mk('constructor', '보유', true)]));
  a.deepEqual(cnt(c), [0, 0, 4, 0]); a.deepEqual(c.hold.map(x => x.ticker), keys);
  a.equal({}.polluted, undefined); a.equal(typeof Object.prototype.constructor, 'function');
});

test('CR-4 브리핑 판단 시각·실제/합성 필수: 누락·손상·불일치는 판단 보류, 정상 실제·합성 계약은 유지', () => {
  const one = (adv, b) => D.classify(Object.assign({ opinions: [], buyCandidates: [adv], risks: [] }, b));
  const cnt = c => [c.buy.length, c.sell.length, c.hold.length, c.pending.length];
  a.deepEqual(cnt(one(mk('OK', '매수 검토', false), { basis: 'real', generatedAt: NOW })), [1, 0, 0, 0]);
  a.deepEqual(cnt(one(mk('OK', '매수 검토', false, { basis: 'synthetic' }), { basis: 'synthetic', generatedAt: NOW })), [1, 0, 0, 0]);
  const fut = { asOf: '2027-01-01T00:00:00+09:00' };
  const cases = [
    [mk('G1', '매수 검토', false, fut), { basis: 'real' }, '브리핑 판단 시각 없음'],
    [mk('G2', '매수 검토', false, fut), { basis: 'real', generatedAt: '' }, '브리핑 판단 시각 없음'],
    [mk('G3', '매수 검토', false, fut), { basis: 'real', generatedAt: 'broken' }, '브리핑 판단 시각 없음'],
    [mk('G4', '매수 검토', false), { basis: 'real', generatedAt: 12345 }, '브리핑 판단 시각 없음'],
    [mk('G5', '매수 검토', false, fut), { basis: 'real', generatedAt: NOW }, '기준 시각이 미래'],
    [mk('P1', '매수 검토', false), { generatedAt: NOW }, '브리핑 자료 구분(실제/합성) 없음'],
    [mk('P2', '매수 검토', false), { basis: '', generatedAt: NOW }, '브리핑 자료 구분(실제/합성) 없음'],
    [mk('P3', '매수 검토', false), { basis: 'unspecified', generatedAt: NOW }, '브리핑 자료 구분(실제/합성) 없음'],
    [mk('P4', '보유', true, { basis: 'synthetic' }), { basis: 'real', generatedAt: NOW }, '실제 화면에 합성 자료 의견'],
    [mk('P5', '보유', true), { basis: 'synthetic', generatedAt: NOW }, '합성 화면에 실제 자료 의견']
  ];
  for (const [adv, b, why] of cases) { const c = one(adv, b); a.deepEqual(cnt(c), [0, 0, 0, 1], adv.ticker); a.equal(c.pending[0].reason, why, adv.ticker); }
  // 실제 엔진 경로: 합성 예시 유지, 'unspecified'(구분 미지정) 브리핑은 후보 0
  a.equal(D.classify(brief(S.DATA, S.externals(), 'synthetic', S.NOW)).buy.length, 1);
  const u = D.classify(brief(S.DATA, S.externals(), 'unspecified', S.NOW)); a.deepEqual([u.buy.length, u.sell.length, u.hold.length], [0, 0, 0]);
});

test('CR-5 시장 식별자 전달: portfolio-reader → advisor-bridge → advisor-core → briefing-model → decision-brief 실제 경로, KR/US 양쪽 계좌 같은 종목은 순서와 무관하게 판단 보류', () => {
  const cnt = c => [c.buy.length, c.sell.length, c.hold.length, c.pending.length];
  const gen = JSON.parse(S.DATA.v5_gen), ov = JSON.parse(S.DATA.v5_ov), kr2 = st(7, 'SYN-KR2', 10, 100, 60), kr2us = Object.assign({}, kr2, { id: 8, quantity: 10 / 1400 });
  const run = d => { const g = k => d[k] === undefined ? null : d[k], br = B.run(g, S.externals(), S.NOW, { basis: 'synthetic' }); return { br, c: D.classify(M.build(R.read(g, { basis: 'synthetic', asOf: S.NOW }), br, S.NOW)) }; };
  // 기준: 국내 계좌 1곳만 보유 → 엔진 의견에 market 'KR'이 실리고 검증된 후보 1건
  const one = run(Object.assign({}, S.DATA, { v5_gen: JSON.stringify(gen.concat([kr2])) }));
  const kAdv = one.br.advices.find(x => x.ticker === 'SYN-KR2'); a.equal(kAdv.market, 'KR'); a.equal(one.c.buy.length, 1); a.equal(one.c.buy[0].ticker, 'SYN-KR2');
  for (const x of one.br.advices) a.ok(x.market === 'KR' || x.market === 'US', x.ticker + ' 시장 식별자 전달');
  a.equal(one.br.advices.find(x => x.ticker === 'SYN-US2').market, 'US', '관심종목·보류 조언(hold)도 시장 전달');
  // 같은 종목이 국내·해외 계좌 양쪽 → 입력 순서와 무관하게 종목 전체 판단 보류
  const both = [Object.assign({}, S.DATA, { v5_gen: JSON.stringify(gen.concat([kr2])), v5_ov: JSON.stringify(ov.concat([kr2us])) }),
    Object.assign({}, S.DATA, { v5_gen: JSON.stringify([kr2].concat(gen)), v5_ov: JSON.stringify([kr2us].concat(ov)) }),
    Object.assign({}, S.DATA, { v5_ov: JSON.stringify([kr2us].concat(ov)), v5_gen: JSON.stringify(gen.concat([kr2])) })];
  for (const d of both) {
    const r = run(d), ms = r.br.advices.filter(x => x.ticker === 'SYN-KR2').map(x => x.market).sort();
    a.deepEqual(ms, ['KR', 'US'], '계좌별 시장이 손실 없이 최종 조언까지');
    a.equal(r.c.buy.length + r.c.sell.length + r.c.hold.length, 0); const p = r.c.pending.filter(x => x.ticker === 'SYN-KR2'); a.equal(p.length, 1); a.equal(p[0].verified, false);
  }
  // 실제 엔진이 만든 조언 그대로, 의견이 같아도 시장만 다르면 '기록 상충(시장)' (순서 무관)
  const usCopy = Object.assign({}, kAdv, { market: 'US' }), b0 = { basis: 'synthetic', generatedAt: S.NOW, opinions: [], risks: [] };
  for (const list of [[kAdv, usCopy], [usCopy, kAdv]]) { const c = D.classify(Object.assign({}, b0, { buyCandidates: list })); a.deepEqual(cnt(c), [0, 0, 0, 1]); a.match(c.pending[0].reason, /기록 상충\(시장\)/); }
  // 시장 누락·비정상 값은 fail-closed
  for (const m of [undefined, null, '', 'JP', 'kr', 1]) { const x = Object.assign({}, kAdv, { market: m }); const c = D.classify(Object.assign({}, b0, { buyCandidates: [x] })); a.deepEqual(cnt(c), [0, 0, 0, 1], String(m)); a.equal(c.pending[0].reason, '시장 식별자(KR/US) 없음'); }
  // 관심종목 시장 값이 비정상이면 조언 market = null → 후보가 되지 않음(보류 조언 경로 포함)
  const ext = S.externals(); ext.watchlist = [{ ticker: 'SYN-KR2', name: '합성 C', market: 'JP' }, { ticker: 'NOQ', name: '시세 없음' }];
  const g = k => S.DATA[k] === undefined ? null : S.DATA[k], br = B.run(g, ext, S.NOW, { basis: 'synthetic' });
  a.equal(br.advices.find(x => x.ticker === 'SYN-KR2').market, null); a.equal(br.advices.find(x => x.ticker === 'NOQ').market, null);
  const c = D.classify(M.build(R.read(g, { basis: 'synthetic', asOf: S.NOW }), br, S.NOW)); a.equal(c.buy.length, 0);
  // 화면 표시 항목에 계좌·금액 노출 없음(시장 식별자만 조언에 실림)
  for (const x of br.advices) a.ok(!('account' in x) && !('valueKRW' in x), '계좌·금액 미포함');
});

test('순태씨 2026-11-16: 두 띠는 투자 > 현황에서만 — 일반·ISA·해외 등 다른 하위 탭에서는 숨김', () => {
  const w = new JSDOM('<!doctype html><body><button class="gtab active" id="gtab-invest"></button><button class="gtab" id="gtab-risk"></button><div id="hasPriceTrust" class="hpt"></div><div id="hasBriefStrip"></div><div class="panel active" id="panel-dashboard"></div><div class="panel" id="panel-gen"></div></body>', { runScripts: 'outside-only' }).window;
  w.eval(read('has/decision-brief.js')); const D2 = w.HASDecisionBrief, box = w.document.getElementById('hasBriefStrip'), pt = w.document.getElementById('hasPriceTrust');
  const dash = w.document.getElementById('panel-dashboard'), gen = w.document.getElementById('panel-gen');
  D2.renderStrip(box, { brief: brief(forty()) }, () => { }); D2.install();
  a.equal(box.classList.contains('hdb-off'), false, '현황: 판단 보임'); a.equal(pt.classList.contains('hdb-off'), false, '현황: 가격 보임');
  dash.classList.remove('active'); gen.classList.add('active'); D2.onTabChange('gen');
  a.equal(box.classList.contains('hdb-off'), true, '일반: 판단 숨김'); a.equal(pt.classList.contains('hdb-off'), true, '일반: 가격 숨김');
  D2.renderStrip(box, { brief: brief(forty()) }, () => { }); a.equal(box.classList.contains('hdb-off'), true, '일반: 다시 그려도 숨김');
  gen.classList.remove('active'); dash.classList.add('active'); D2.onTabChange('dashboard');
  a.equal(box.classList.contains('hdb-off'), false, '현황 복귀: 판단 보임'); a.equal(pt.classList.contains('hdb-off'), false, '현황 복귀: 가격 보임');
});

test('판단 보류 종목에 종목명 표시: 앱 이름표 우선, 없으면 의견의 name, 둘 다 없으면 코드만', async () => {
  const w = dom(), D2 = w.HASDecisionBrief, box = w.document.getElementById('hasBriefStrip');
  D2.install();
  const mk = (t, name) => ({ ticker: t, name, opinion: '판단 보류', reasonsFor: [], reasonsAgainst: ['확인된 시세 없음'], unknown: [], risks: [], holding: { held: true } });
  const b = { opinions: [mk('00680K', '00680K'), mk('487240', '487240'), mk('AAA', 'Alpha Corp')], buyCandidates: [], risks: [] };
  D2.renderStrip(box, { brief: b, names: { '00680K': '미래에셋증권2우B', constructor: 'x' } }, () => { });
  const rows = Array.from(box.querySelectorAll('[data-testid=hdb-item-pending] .hdb-row b')).map(e => e.textContent);
  a.deepEqual(rows, ['미래에셋증권2우B (00680K)', '487240', 'Alpha Corp (AAA)']);
  D2.renderStrip(box, { brief: b }, () => { }); // names 없이 다시 그려도 오류 없음
  a.equal(box.querySelectorAll('[data-testid=hdb-item-pending]').length, 3);
});

test('가격 신뢰도 띠 접힌 상태: 경고와 펼치기 버튼이 한 행(flex)에 오고 펼치면 전체 폭', () => {
  const css = read('has/decision-brief.css');
  a.match(css, /body #hasPriceTrust\.hpt:not\(\.hdb-off\)\{display:flex;flex-wrap:wrap;align-items:center/);
  a.match(css, /#hasPriceTrust \.hpt-head\{flex:1 1 0;min-width:0/);
  a.match(css, /#hasPriceTrust>details\[open\]\{flex:1 1 100%\}/);
  a.ok(css.indexOf('body #hasPriceTrust.hpt:not(.hdb-off)') < css.indexOf('body #hasPriceTrust.hdb-off.hdb-off'), '숨김 규칙이 항상 우선');
});
