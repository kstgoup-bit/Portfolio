'use strict';
/* 11단계 통합 시험: KRX 신원 검증 ↔ 10단계 파이프라인 경계면. 모든 입력은 합성/문서 예시이며 공식 검증 성공이나 실제 가격 감시 성공을 뜻하지 않는다. */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const K = require('../kr-radar/krx-api.js'), ID = require('../kr-radar/identity.js'), PL = require('../kr-radar/pipeline.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../kr-radar/data/universe.json'), 'utf8'));
const T = '2026-10-29', SHA = 'd'.repeat(64);
const isinOf = code => { const body = 'KR7' + code + '00'; const d = [...body].map(c => /[0-9]/.test(c) ? c : String(c.charCodeAt(0) - 55)).join(''); for (let k = 0; k < 10; k++) { const s = d + k; let sum = 0, dbl = false; for (let i = s.length - 1; i >= 0; i--) { let n = s.charCodeAt(i) - 48; if (dbl) { n *= 2; if (n > 9) n -= 9; } sum += n; dbl = !dbl; } if (sum % 10 === 0) return body + k; } };
const item = (s, o = {}) => ({ basDt: '20261028', srtnCd: 'A' + s.code, isinCd: isinOf(s.code), mrktCtg: s.market, itmsNm: s.name, ...o });
const xml = (items, { total, rows, page = 1 } = {}) => `<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><numOfRows>${rows || Math.max(items.length, 1)}</numOfRows><pageNo>${page}</pageNo><totalCount>${total === undefined ? items.length : total}</totalCount><items>${items.map(i => '<item>' + Object.entries(i).map(([k, v]) => `<${k}>${v}</${k}>`).join('') + '</item>').join('')}</items></body></response>`;
const stocks = data.securities.filter(s => s.group !== 'etf');
const listingOf = (text, origin = 'user-supplied-official') => { const p = K.parseResponse(text, { origin, responseSha256: SHA }); return { ...p, baseDate: p.rows[0] && p.rows[0].baseDate }; };
const cmp = (l, o = {}) => K.compareCandidates(data, l, { today: T, ...o });
const entryOf = (r, code) => r.entries.find(e => e.code === code);
const ok = { value: '시험', status: 'confirmed', source: 'https://example.com/d', checkedAt: T };
const KEYS = ['coverage', 'dailyRegularClose', 'updateTimingDelay', 'adjustmentBasis52w', 'holidayCalendarTimezone', 'sessionSplit', 'corrections', 'benchmarks', 'personalDisplay', 'internalProcessing', 'localCacheRights', 'derivedRetention', 'redistribution', 'cost', 'rateLimit', 'keyHandling'];
const provider = () => ({ id: 'syn', role: 'price', markets: ['KR'], fields: Object.fromEntries(KEYS.map(k => [k, ok])) });

test('baseline universe file is untouched by integration (73 stocks + 5 ETF, all unverified, none active)', () => {
  a.equal(stocks.length, 73); a.equal(data.securities.length - stocks.length, 5);
  a.ok(data.securities.every(s => s.reviewStatus !== 'verified' && s.status === 'hold'));
});
test('fixture/example responses never reach identity-verified and are blocked at the pipeline integrity step', () => {
  const l = listingOf(xml(stocks.slice(0, 5).map(s => item(s))), 'fixture'), r = cmp(l), e = entryOf(r, stocks[0].code);
  a.equal(e.status, 'fixture-matched'); a.equal(ID.identityGate(e).identityVerified, false); a.equal(r.officialVerifiedCount, 0);
  const ev = ID.integrityEvidenceFromListing(l); a.equal(ev.official, false);
  const rec = PL.newRecord(e.code, 'KR'), x = ID.advanceWithIdentity(rec, e, { provider: provider() }, { today: T });
  a.equal(x.ok, false); a.match(x.reason, /KRX 신원 게이트/); a.equal(x.record.state, '미연결');
  const direct = PL.advance(PL.advance(rec, { provider: provider() }, { today: T }).record, ev, { today: T }); a.equal(direct.ok, false); a.match(direct.reason, /공식 출처로 인정되지 않음/);
});
test('identity-verified KR record may enter the pipeline but can never become active or evaluable (policy NO-GO)', () => {
  const l = listingOf(xml(stocks.slice(0, 5).map(s => item(s)))), r = cmp(l), e = entryOf(r, stocks[0].code);
  a.equal(e.status, 'verified'); const g = ID.identityGate(e); a.equal(g.identityVerified, true); a.equal(g.priceVerified, false); a.equal(g.monitorable, false); a.equal(g.priceStatus, 'DATA_UNAVAILABLE');
  let rec = PL.newRecord(e.code, 'KR');
  let s = ID.advanceWithIdentity(rec, e, { provider: provider() }, { today: T }); a.equal(s.ok, true); a.equal(s.record.state, '권리 확인');
  s = ID.advanceWithIdentity(s.record, e, ID.integrityEvidenceFromListing(l), { today: T }); a.equal(s.ok, true); a.equal(s.record.state, '원본 무결성');
  s = ID.advanceWithIdentity(s.record, e, {}, { today: T }); a.equal(s.ok, false, '시세 증거 없이 다음 단계 불가'); a.equal(PL.isEvaluable(s.record), false);
  a.equal(s.record.actualActiveCount, 0); a.equal(s.record.realApiRequests, 0);
});
test('unverified, wrong-code, wrong-market and non-KR records are held at 미연결', () => {
  const l = listingOf(xml([item(stocks[0], { itmsNm: '다른이름' })])), r = cmp(l), e = entryOf(r, stocks[0].code);
  a.equal(e.rule, 'name-mismatch'); const rec = PL.newRecord(e.code, 'KR');
  a.equal(ID.advanceWithIdentity(rec, e, { provider: provider() }, { today: T }).ok, false);
  const good = entryOf(cmp(listingOf(xml([item(stocks[1])]))), stocks[1].code);
  a.match(ID.advanceWithIdentity(PL.newRecord(stocks[2].code, 'KR'), good, {}, { today: T }).reason, /불일치/);
  a.match(ID.advanceWithIdentity(PL.newRecord(good.code, 'US'), good, {}, { today: T }).reason, /한국 종목 전용/);
  a.equal(ID.advanceWithIdentity(rec, undefined, {}, { today: T }).ok, false); a.equal(ID.advanceWithIdentity(rec, good, {}, { today: 'x' }).ok, false);
});
test('failure blocking: wrong code, same code different name, market change, duplicate, date mismatch, missing field', () => {
  const s0 = stocks[0], s1 = stocks[1], s2 = stocks[2], s3 = stocks[3];
  const items = [item(s0, { srtnCd: 'A00004' }), item(s1, { itmsNm: s1.name + '2' }), item(s2, { mrktCtg: s2.market === 'KOSPI' ? 'KOSDAQ' : 'KOSPI' }), item(s3), item(s3), item(stocks[4], { isinCd: '' }), item(stocks[5], { basDt: '20261027' })];
  const l = listingOf(xml(items)); a.equal(l.ok, false, '한 응답 내 기준일 혼재·필수필드 누락은 응답 전체 차단 또는 행 제외');
  const r = cmp(l); a.equal(r.officialVerifiedCount, 0); a.ok(r.entries.every(e => e.status !== 'verified'));
  const each = (it, rule) => { const x = cmp(listingOf(xml([it]))); const e = entryOf(x, it.srtnCd.slice(1)) || x.entries[0]; return e; };
  a.equal(cmp(listingOf(xml([item(s1, { itmsNm: s1.name + '2' })]))).entries.find(e => e.code === s1.code).rule, 'name-mismatch');
  a.equal(cmp(listingOf(xml([item(s2, { mrktCtg: s2.market === 'KOSPI' ? 'KOSDAQ' : 'KOSPI' })]))).entries.find(e => e.code === s2.code).rule, 'market-mismatch');
  a.equal(cmp(listingOf(xml([item(s3), item(s3)]))).entries.find(e => e.code === s3.code).status, 'pending');
  a.equal(cmp(listingOf(xml([item(stocks[4], { isinCd: '' })]))).officialVerifiedCount, 0);
  a.equal(cmp(listingOf(xml([item(s0, { srtnCd: 'A00004' })]))).entries.find(e => e.code === s0.code).status, 'pending');
});
test('date mismatch against the requested base date blocks every candidate', () => {
  const l = listingOf(xml(stocks.slice(0, 3).map(s => item(s))));
  a.ok(cmp(l, { expectedBaseDate: '2026-10-28' }).officialVerifiedCount === 3);
  const r = cmp(l, { expectedBaseDate: '2026-10-27' }); a.equal(r.officialVerifiedCount, 0); a.ok(r.entries.every(e => /기준일 불일치/.test(e.rule) || e.status !== 'verified'));
});
test('response errors, abnormal JSON, wrong source and missing pages block verification', () => {
  const blocked = l => { const r = cmp(l); a.equal(r.officialVerifiedCount, 0); return r; };
  blocked(K.parseResponse('Unauthorized', { httpStatus: 401, responseSha256: SHA, origin: 'user-supplied-official' }));
  blocked(K.parseResponse('API rate limit exceeded', { httpStatus: 429, responseSha256: SHA, origin: 'user-supplied-official' }));
  blocked(K.parseResponse('{"response":{"header":{"resultCode":"00"},"body":', { responseSha256: SHA, origin: 'user-supplied-official' }));
  blocked(K.parseResponse('{"response":{"header":{"resultCode":"00"},"body":{"items":"x","numOfRows":1,"pageNo":1,"totalCount":1}}}', { responseSha256: SHA, origin: 'user-supplied-official' }));
  const wrongSource = K.parseResponse(xml([item(stocks[0])]), { responseSha256: SHA, origin: 'scraped-site' }); blocked(wrongSource);
  const p1 = K.parseResponse(xml(stocks.slice(0, 2).map(s => item(s)), { total: 6, rows: 2, page: 1 }), { responseSha256: SHA, origin: 'user-supplied-official' });
  const p3 = K.parseResponse(xml(stocks.slice(4, 6).map(s => item(s)), { total: 6, rows: 2, page: 3 }), { responseSha256: SHA, origin: 'user-supplied-official' });
  const asm = K.assemblePages([p1, p3]); a.equal(asm.ok, false); blocked(asm);
});
test('no network access, no storage and no key in the integration path (fetch trap + static guards)', async () => {
  const realFetch = globalThis.fetch; let called = 0; globalThis.fetch = () => { called++; throw new Error('net'); };
  try { const l = listingOf(xml(stocks.slice(0, 3).map(s => item(s)))); const r = cmp(l); ID.integrationSummary(data, r); ID.advanceWithIdentity(PL.newRecord(stocks[0].code, 'KR'), r.entries[0], {}, { today: T }); await K.createKrxListingAdapter({ mode: 'fixture', fixtures: { a: 'x' } }).load('a'); } finally { globalThis.fetch = realFetch; }
  a.equal(called, 0);
  for (const f of ['krx-api.js', 'identity.js']) { const src = fs.readFileSync(path.join(__dirname, '../kr-radar', f), 'utf8'); a.doesNotMatch(src, /(\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|process\.env|child_process|setTimeout|setInterval|\beval\s*\(|new Function)/, f); for (const m of src.matchAll(/require\(['"]([^'"]+)['"]\)/g)) a.ok(m[1].startsWith('./'), f); }
  const secret = /(serviceKey\s*[:=]\s*['"][A-Za-z0-9%+\/=]{16,}|serviceKey=[A-Za-z0-9%]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_|BEGIN (RSA|PRIVATE))/;
  for (const f of ['kr-radar/identity.js', 'kr-radar/krx-api.js', 'tools/kr-krx-verify.cjs', 'tests/fixtures/krx/guide-example.xml', 'docs/krx-official-api-supplement-stage8.md', 'docs/krx-integration-stage11.md']) if (fs.existsSync(path.join(__dirname, '..', f))) a.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), secret, f);
});
test('the browser app and PWA files do not reference the KRX modules or any key', () => {
  for (const f of ['portfolio_v5.html', 'portfolio.html', 'service-worker.js', 'manifest.json']) { const p = path.join(__dirname, '..', f); if (!fs.existsSync(p)) continue; a.doesNotMatch(fs.readFileSync(p, 'utf8'), /krx-api|identity\.js|getItemInfo_V2|apis\.data\.go\.kr|serviceKey/, f); }
});
test('integration summary: 73 stocks + 5 ETF, 27 short of target, official 0, active 0, NO-GO', () => {
  const none = ID.integrationSummary(data, cmp(null));
  a.deepEqual({ ...none }, { stockCandidates: 73, etfSeparate: 5, preferredSeparate: 0, officialVerified: 0, onHold: 78, excluded: 0, targetShortfall: 27, actualActiveCount: 0, realApiRequests: 0, realPriceApiRequests: 0, realActivationAllowed: false, jsonSchema: 'assumed-unconfirmed', verdict: '실데이터 감시 NO-GO 유지' });
  const fx = ID.integrationSummary(data, cmp(listingOf(xml(stocks.slice(0, 4).map(s => item(s))), 'fixture'))); a.equal(fx.officialVerified, 0); a.equal(fx.onHold, 78);
});
test('the assumed JSON shape is re-validated at the boundary and stays labelled unconfirmed', () => {
  const good = JSON.stringify({ response: { header: { resultCode: '00', resultMsg: 'x' }, body: { numOfRows: 1, pageNo: 1, totalCount: 1, items: { item: { basDt: '20261028', srtnCd: 'A000040', isinCd: 'KR7000040006', mrktCtg: 'KOSPI', itmsNm: 'x' } } } } });
  a.equal(ID.checkAssumedJsonShape(good).ok, true); a.equal(ID.checkAssumedJsonShape(good).assumedStatus, 'assumed-unconfirmed');
  const bad = ID.checkAssumedJsonShape('{"result":{}}'); a.equal(bad.ok, false); a.ok(bad.missing.length >= 5); a.equal(ID.checkAssumedJsonShape('{').ok, false);
  a.equal(ID.ASSUMED_JSON_SHAPE.status, 'assumed-unconfirmed');
});
test('the original candidate list is not mutated by comparison or summary', () => {
  const h = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  cmp(listingOf(xml(stocks.slice(0, 10).map(s => item(s))))); ID.integrationSummary(data, cmp(null));
  a.equal(crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex'), h);
});
