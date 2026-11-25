'use strict';
// 지피 CR-5, 순태씨 D5 승인(2026-11-25): 합의/단독/불일치/응답없음/만료 구분. 합성 자료만.
const test = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const R = require('../has/review-cards.js');
const doc = { reviewedAt: '2026-11-25T07:45:00+09:00' };
const card = (cons) => ({ ticker: 'SYN1', market: 'KR', verdict: 'buy-review', consensus: cons });
const ok = (o) => Object.assign({ status: 'agreed', review: 'GPT-REVIEW-ai-review-20261125-0730.md', date: '2026-11-25', ticker: 'SYN1', market: 'KR', verdict: 'buy-review' }, o);
const now = Date.parse('2026-11-25T09:00:00+09:00');
test('D5: 기록 없음 → 클로 단독(일괄 승격 없음)', () => { a.equal(R.consensusOf(card(undefined), doc, now), 'solo'); });
test('D5: 종목·시장·판단·날짜·검토 파일이 모두 맞을 때만 합의', () => {
  a.equal(R.consensusOf(card(ok()), doc, now), 'agreed');
  a.equal(R.consensusOf(card(ok({ ticker: 'SYN2' })), doc, now), 'mismatch');
  a.equal(R.consensusOf(card(ok({ market: 'US' })), doc, now), 'mismatch');
  a.equal(R.consensusOf(card(ok({ verdict: 'wait' })), doc, now), 'mismatch');
  a.equal(R.consensusOf(card(ok({ date: '2026-11-24', review: 'GPT-REVIEW-ai-review-20261124-0730.md' })), doc, now), 'mismatch'); // 다른 날 검토
  a.equal(R.consensusOf(card(ok({ review: 'GPT-REVIEW-ai-review-20261124-0730.md' })), doc, now), 'mismatch'); // 파일 날짜 불일치
  a.equal(R.consensusOf(card(ok({ review: 'anything.md' })), doc, now), 'mismatch');
  a.equal(R.consensusOf(card(ok({ status: 'yes' })), doc, now), 'mismatch');
});
test('D5: 불일치·응답 없음·만료 구분', () => {
  a.equal(R.consensusOf(card(ok({ status: 'disagree' })), doc, now), 'disagree');
  a.equal(R.consensusOf(card(ok({ status: 'no-response' })), doc, now), 'no-response');
  a.equal(R.consensusOf(card(ok()), doc, Date.parse('2026-12-03T09:00:00+09:00')), 'expired');
});
test('D5: 실제 게시 카드들은 합의 기록이 없어 모두 단독으로 시작', () => {
  for (const f of ['latest.json', 'fear-us-latest.json', 'holdings-latest.json']) {
    const v = R.validate(JSON.parse(fs.readFileSync(path.join(__dirname, '../reviews', f), 'utf8')));
    a.ok(v.cards.every((c) => R.consensusOf(c, v) === 'solo'), f);
  }
});
test('D5 화면: 합의여도 매수 쪽은 판단 보류 유지, 불일치·응답없음은 판단 라벨 대신 보류', async () => {
  const { JSDOM } = require('jsdom');
  const D = { v: 1, reviewedAt: '2026-11-25T07:45:00+09:00', reviewer: 'Claude', notice: '투자 자문이 아닙니다.', cards: [
    { ticker: 'SYN1', market: 'KR', name: '합성1', verdict: 'buy-review', headline: 'h', reasons: ['r'], risks: ['k'], sources: [], consensus: ok() },
    { ticker: 'SYN2', market: 'KR', name: '합성2', verdict: 'sell-review', headline: 'h', reasons: ['r'], risks: ['k'], sources: [], consensus: ok({ ticker: 'SYN2', verdict: 'sell-review', status: 'disagree' }) },
    { ticker: 'SYN3', market: 'KR', name: '합성3', verdict: 'trim-review', headline: 'h', reasons: ['r'], risks: ['k'], sources: [] }] };
  const dom = new JSDOM('<!doctype html><body><section id="m"></section></body>', { url: 'https://example.test/', runScripts: 'outside-only' });
  const w = dom.window; w.Date.now = () => now; w.fetch = (u) => Promise.resolve({ ok: /\/latest\.json$/.test(u), json: () => Promise.resolve(JSON.parse(JSON.stringify(D))) });
  w.eval(fs.readFileSync(path.join(__dirname, '../has/review-cards.js'), 'utf8'));
  w.HASReviewCards.mount(w.document.getElementById('m')); await new Promise((r) => setTimeout(r, 30));
  const arts = [...w.document.querySelectorAll('#m article')].map((x) => x.textContent);
  const t1 = arts.find((x) => /합성1/.test(x)), t2 = arts.find((x) => /합성2/.test(x)), t3 = arts.find((x) => /합성3/.test(x));
  a.match(t1, /판단 보류/); a.match(t1, /🤝 지피 합의 · GPT-REVIEW-ai-review-20261125-0730/); a.doesNotMatch(t1, /🟢/);
  a.match(t2, /⚖ 의견 불일치로 보류/); a.doesNotMatch(t2, /매도 검토/); a.doesNotMatch(w.document.getElementById('m').textContent, /🔴 매도 검토 1/); a.match(w.document.getElementById('m').textContent, /⚖ 의견 불일치로 보류 1/);
  a.match(t3, /🧑 클로 단독 의견/); a.match(t3, /비중 축소 검토/);
});
