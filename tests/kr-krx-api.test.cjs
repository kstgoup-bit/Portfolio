'use strict';
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const K = require('../kr-radar/krx-api.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../kr-radar/data/universe.json'), 'utf8'));
const TODAY = '2026-10-29', SHA = 'c'.repeat(64);
const isinOf = code => { const body = 'KR7' + code + '00'; const d = [...body].map(c => /[0-9]/.test(c) ? c : String(c.charCodeAt(0) - 55)).join(''); for (let k = 0; k < 10; k++) { const s = d + k; let sum = 0, dbl = false; for (let i = s.length - 1; i >= 0; i--) { let n = s.charCodeAt(i) - 48; if (dbl) { n *= 2; if (n > 9) n -= 9; } sum += n; dbl = !dbl; } if (sum % 10 === 0) return body + k; } };
const item = (code, name, market = 'KOSPI', o = {}) => ({ basDt: '20261028', srtnCd: 'A' + code, isinCd: isinOf(code), mrktCtg: market, itmsNm: name, ...o });
const xml = (items, { n, page = 1, total, rc = '00', rows } = {}) => `<response><header><resultCode>${rc}</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><numOfRows>${rows || Math.max(items.length, 1)}</numOfRows><pageNo>${page}</pageNo><totalCount>${total === undefined ? items.length : total}</totalCount><items>${items.map(i => '<item>' + Object.entries(i).map(([k, v]) => `<${k}>${String(v).replace(/&/g, '&amp;')}</${k}>`).join('') + '</item>').join('')}</items></body></response>`;
const json = (items, { total, rc = '00', rows, page = 1 } = {}) => JSON.stringify({ response: { header: { resultCode: rc, resultMsg: 'NORMAL SERVICE.' }, body: { items: items.length ? { item: items.length === 1 ? items[0] : items } : '', numOfRows: rows || Math.max(items.length, 1), pageNo: page, totalCount: total === undefined ? items.length : total } } });
const P = (t, o = {}) => K.parseResponse(t, { responseSha256: SHA, ...o });
const candItems = n => data.securities.slice(0, n).map(s => item(s.code, s.name, s.market));
const asListing = (t, o = {}) => { const p = P(t, o); return { ...p, baseDate: p.rows[0] && p.rows[0].baseDate }; };

test('guide example XML parses; A-prefix normalised to 6 digits while raw code/ISIN/market/base date are preserved', () => {
  const r = P(fs.readFileSync(path.join(__dirname, 'fixtures/krx/guide-example.xml'), 'utf8'));
  a.equal(r.ok, true); a.equal(r.origin, 'fixture'); const row = r.rows[0];
  a.equal(row.code, '000040'); a.equal(row.raw.srtnCd, 'A000040'); a.equal(row.isin, 'KR7000040006'); a.equal(row.market, 'KOSPI'); a.equal(row.baseDate, '2026-07-29'); a.equal(r.realApiRequests, 0);
});
test('normal JSON and XML give the same rows (JSON shape is an unconfirmed assumption)', () => {
  const its = [item('ZZ9001', '시험기업A'), item('ZZ9002', '시험기업B', 'KOSDAQ')];
  a.deepEqual(P(xml(its)).rows.map(r => r.code), ['ZZ9001', 'ZZ9002']); a.deepEqual(P(json(its)).rows.map(r => r.code), ['ZZ9001', 'ZZ9002']);
  a.equal(P(json([its[0]])).ok, true);
});
test('code normalisation never guesses', () => {
  a.deepEqual(K.normalizeCode('A000040'), { ok: true, raw: 'A000040', code: '000040', form: 'A-prefixed' });
  a.equal(K.normalizeCode('000040').form, 'bare'); a.equal(K.normalizeCode('A00004').form, 'bare', '6자 영숫자는 접두 없는 코드로만 해석'); a.equal(K.normalizeCode('A0000400').ok, false); a.equal(K.normalizeCode('a000040').ok, false); a.equal(K.normalizeCode('AA000040').ok, false); a.equal(K.normalizeCode(40).ok, false);
});
test('missing hash, invalid origin, empty and oversize inputs fail closed without throwing', () => {
  a.equal(K.parseResponse(xml([item('ZZ9001', 'A')]), {}).ok, false);
  a.equal(K.parseResponse(xml([item('ZZ9001', 'A')]), { responseSha256: SHA, origin: 'live' }).ok, false);
  for (const t of ['', '   ', null, undefined]) { const r = P(t); a.equal(r.ok, false); }
  a.equal(P('x'.repeat(K.MAX_TEXT_BYTES + 1)).ok, false);
});
test('empty data (totalCount 0) is not usable as evidence', () => {
  const r = P(xml([], { total: 0 })); a.equal(r.ok, false); a.ok(r.warnings.some(w => /빈 데이터/.test(w)));
  a.equal(P(json([], { total: 0 })).ok, false);
});
test('XML/JSON parse failures and DTD/ENTITY are rejected', () => {
  for (const t of ['<response><header>', '{"response":', '{"foo":1}', 'plain text', '<!DOCTYPE x [<!ENTITY e "x">]><response><header></header><body></body></response>', xml([item('ZZ9001', 'A')]).replace('</item>', '')]) {
    const r = P(t); a.equal(r.ok, false, t.slice(0, 30)); a.ok(r.errors.length);
  }
});
test('resultCode failure and missing page info are errors', () => {
  a.equal(P(xml([item('ZZ9001', 'A')], { rc: '30' })).failure.category, 'result-code');
  a.equal(P(xml([item('ZZ9001', 'A')]).replace('<totalCount>1</totalCount>', '')).ok, false);
});
test('Unauthorized / Forbidden / rate-limit / quota / backend errors map to categories (guide error table, no retry)', () => {
  const c = (httpStatus, text) => K.classifyFailure({ httpStatus, text });
  a.equal(c(401, 'Unauthorized').category, 'unauthorized'); a.equal(c(403, 'Forbidden').category, 'forbidden');
  a.equal(c(429, 'API rate limit exceeded').category, 'rate-limited'); a.equal(c(200, 'API token quota exceeded').category, 'quota-exceeded');
  a.equal(c(200, 'API token quota exceeded').retryable, false); a.equal(c(502, 'Error forwarding request to backend server').category, 'backend-unreachable');
  a.equal(c(404, '').category, 'api-not-found'); a.equal(c(500, '').category, 'server-error'); a.equal(c(200, 'zzz').category, 'unknown');
  for (const [s, t, cat] of [[401, 'Unauthorized', 'unauthorized'], [403, 'Forbidden', 'forbidden'], [429, 'API rate limit exceeded', 'rate-limited']]) { const r = P(t, { httpStatus: s }); a.equal(r.ok, false); a.equal(r.failure.category, cat); }
});
test('synthetic missing-key case: request spec never carries a key and refuses one', () => {
  const s = K.buildRequestSpec({ numOfRows: 100, pageNo: 1, resultType: 'json', basDt: '20261028' });
  a.equal(s.keyIncluded, false); a.equal(s.sendable, false); a.match(s.urlTemplate, /^https:\/\/apis\.data\.go\.kr\/1160100\/GetKrxListedInfoService_V2\/getItemInfo_V2\?serviceKey=<서버측/);
  a.throws(() => K.buildRequestSpec({ serviceKey: 'x' }), /인증키/); a.throws(() => K.buildRequestSpec({ foo: 1 }), /알 수 없는/);
  a.throws(() => K.buildRequestSpec({ numOfRows: 10001 }), /numOfRows/); a.throws(() => K.buildRequestSpec({ basDt: '2026-10-28' }), /basDt/);
});
test('base date format and calendar validity', () => {
  for (const d of ['2026-10-28', '20261340', '2026102', '']) { const r = P(xml([item('ZZ9001', 'A', 'KOSPI', { basDt: d })])); a.equal(r.rows.length, 0); a.ok(r.rejected[0].reasons.some(x => /기준일|누락/.test(x))); a.equal(r.ok, false); }
  a.equal(K.basDtToIso('20260230'), null); a.equal(K.basDtToIso('20260229'), null); a.equal(K.basDtToIso('20240229'), '2024-02-29');
});
test('page mismatch: totalCount vs item count, over numOfRows, pageNo beyond total', () => {
  a.equal(P(xml([item('ZZ9001', 'A')], { total: 5, rows: 3 })).ok, false);
  a.equal(P(xml([item('ZZ9001', 'A'), item('ZZ9002', 'B')], { total: 2, rows: 1 })).ok, false);
  a.equal(P(xml([item('ZZ9001', 'A')], { total: 2, rows: 1, page: 3 })).ok, false);
  a.equal(P(xml([item('ZZ9001', 'A')], { total: 3, rows: 2, page: 2 })).ok, true);
});
test('10,000 row cap: numOfRows > 10000 is invalid; assemblePages needs every page', () => {
  a.equal(P(xml([item('ZZ9001', 'A')], { total: 1, rows: 10001 })).ok, false);
  a.equal(P(xml([item('ZZ9001', 'A')], { total: 1, rows: 10000 })).ok, true);
  const p1 = P(xml([item('ZZ9001', 'A'), item('ZZ9002', 'B')], { total: 3, rows: 2, page: 1 })), p2 = P(xml([item('ZZ9003', 'C')], { total: 3, rows: 2, page: 2 }));
  a.equal(K.assemblePages([p1, p2]).ok, true); a.equal(K.assemblePages([p1]).ok, false); a.equal(K.assemblePages([p2]).ok, false);
  a.equal(K.assemblePages([p1, P(xml([item('ZZ9002', 'B')], { total: 3, rows: 2, page: 2 }))]).ok, false, '쪽 간 중복코드');
  a.equal(K.assemblePages([p1, { ...p2, origin: 'user-supplied-official' }]).ok, false, 'origin 혼합');
  a.equal(K.assemblePages([]).ok, false);
});
test('duplicate codes are rejected and match nothing', () => {
  const r = P(xml([item('ZZ9001', 'A'), item('ZZ9001', 'A2'), item('ZZ9002', 'B')])); a.deepEqual(r.rows.map(x => x.code), ['ZZ9002']); a.equal(r.rejected.length, 2);
});
test('ISIN checksum / ISIN-code mismatch / abnormal market / missing field are rejected per row', () => {
  const bad = [item('ZZ9001', 'A', 'KOSPI', { isinCd: isinOf('ZZ9001').slice(0, 11) + ((Number(isinOf('ZZ9001').slice(11)) + 1) % 10) }), item('ZZ9002', 'B', 'KOSPI', { isinCd: isinOf('ZZ9003') }), item('ZZ9004', 'D', 'NASDAQ'), item('ZZ9005', 'E', 'KOSPI', { itmsNm: '' })];
  const r = P(xml(bad)); a.equal(r.rows.length, 0); a.equal(r.rejected.length, 4); a.equal(r.ok, false);
  a.ok(r.rejected.some(x => x.reasons.some(y => /ISIN/.test(y)))); a.ok(r.rejected.some(x => x.reasons.some(y => /비정상시장/.test(y))));
});
test('mixed base dates in one response are an error', () => {
  a.equal(P(xml([item('ZZ9001', 'A'), item('ZZ9002', 'B', 'KOSPI', { basDt: '20261027' })])).ok, false);
});
test('adapter is OFF by default, fixture mode is memory-only, and no live mode exists', async () => {
  const off = K.createKrxListingAdapter(); a.equal(off.mode, 'off'); a.equal(off.realNetwork, false); await a.rejects(off.load('x'), /비활성/);
  const fx = K.createKrxListingAdapter({ mode: 'fixture', fixtures: { g: '<x/>' } }); const r = await fx.load('g'); a.equal(r.origin, 'fixture'); a.equal(r.realApiRequests, 0); await a.rejects(fx.load('none'), /픽스처 없음/);
  for (const m of ['live', 'real', 'on']) a.throws(() => K.createKrxListingAdapter({ mode: m }), /구현되어 있지 않/);
  const realFetch = globalThis.fetch; let called = 0; globalThis.fetch = () => { called++; throw new Error('net'); };
  try { await fx.load('g'); K.compareCandidates(data, null, { today: TODAY }); } finally { globalThis.fetch = realFetch; } a.equal(called, 0);
});
test('fixture responses can NEVER produce verified: fixture-matched is not counted as official verification', () => {
  const l = asListing(xml(candItems(10)));
  const r = K.compareCandidates(data, l, { today: TODAY });
  a.equal(r.mode, 'fixture-only'); a.equal(r.officialVerifiedCount, 0); a.equal(r.counts.verified, 0); a.equal(r.counts.fixtureMatchedNotCounted, 10);
  a.ok(r.log.every(x => x.result !== 'verified')); a.ok(r.log.filter(x => x.result === 'fixture-matched').every(x => /공식 조회 아님/.test(x.source)));
  a.equal(r.actualActiveCount, 0); a.equal(r.realApiRequests, 0); a.equal(r.realPriceApiRequests, 0);
});
test('user-supplied official response: exact match -> verified; mismatch/missing/blocked -> pending; input list unchanged', () => {
  const before = JSON.stringify(data), its = candItems(6); its[1].mrktCtg = its[1].mrktCtg === 'KOSPI' ? 'KOSDAQ' : 'KOSPI'; its[2].itmsNm = '다른이름'; its.splice(3, 1);
  const l = asListing(xml(its), { origin: 'user-supplied-official' });
  const r = K.compareCandidates(data, l, { today: TODAY });
  const by = Object.fromEntries(r.entries.map(e => [e.code, e]));
  a.equal(by[data.securities[0].code].status, 'verified'); a.equal(by[data.securities[1].code].rule, 'market-mismatch'); a.equal(by[data.securities[2].code].rule, 'name-mismatch'); a.equal(by[data.securities[3].code].rule, 'not-found-in-response');
  a.equal(r.counts.verified + r.counts.etfVerified, r.officialVerifiedCount); a.ok(r.officialVerifiedCount <= 3);
  a.equal(JSON.stringify(data), before, '원본 후보 목록 불변'); a.ok(r.entries.every(e => e.decision === 'HOLD' && e.priceStatus === 'DATA_UNAVAILABLE'));
  a.equal(r.counts.stockCandidates + r.counts.etfSeparate + r.counts.preferredSeparate, data.securities.length);
  a.ok(r.entries.every(e => e.rightsConfirmed === false), '권리 미확인 표시');
});
test('verification log has the required fields and no raw response content', () => {
  const l = asListing(xml(candItems(3)), { origin: 'user-supplied-official' }), r = K.compareCandidates(data, l, { today: TODAY });
  for (const e of r.log) a.deepEqual(Object.keys(e).sort(), ['baseDate', 'code', 'isin', 'market', 'name', 'responseSha256', 'result', 'rule', 'source'].sort());
  a.equal(r.log[0].responseSha256, SHA); a.doesNotMatch(JSON.stringify(r), /<response>|<item>|crno|corpNm/);
});
test('stale, future and invalid listings block everything', () => {
  const mk = d => asListing(xml(candItems(5).map(i => ({ ...i, basDt: d }))), { origin: 'user-supplied-official' });
  for (const d of ['20261001', '20271231']) { const r = K.compareCandidates(data, mk(d), { today: TODAY }); a.equal(r.officialVerifiedCount, 0); a.ok(r.entries.every(e => /^blocked:/.test(e.rule) || e.status === 'excluded')); }
  a.equal(K.compareCandidates(data, mk('20261026'), { today: TODAY }).officialVerifiedCount > 0, true);
  a.equal(K.compareCandidates(data, asListing('garbage', { origin: 'user-supplied-official' }), { today: TODAY }).officialVerifiedCount, 0);
  a.equal(K.compareCandidates(data, null, { today: TODAY }).officialVerifiedCount, 0); a.equal(K.compareCandidates(data, null, { today: 'x' }).errors.length, 1);
});
test('ETF candidates are counted separately; absent ETF stays pending (API coverage of ETFs unconfirmed)', () => {
  const etfs = data.securities.filter(s => s.group === 'etf'); a.equal(etfs.length, 5);
  const r = K.compareCandidates(data, asListing(xml(candItems(3)), { origin: 'user-supplied-official' }), { today: TODAY });
  a.equal(r.counts.etfSeparate, 5); a.equal(r.counts.etfPending, 5); a.equal(r.counts.etfVerified, 0); a.equal(r.counts.stockCandidates, 73);
  a.ok(r.entries.filter(e => e.group === 'etf').every(e => /etf-not-found/.test(e.rule)));
});
test('preferred shares are API-non-provided: separate count, pending, never verified even if present in a response', () => {
  const d = JSON.parse(JSON.stringify(data)); d.securities.push({ ...d.securities[0], code: 'ZZ9101', name: '시험전자우', group: 'stock' });
  const l = asListing(xml([...candItems(2), item('ZZ9101', '시험전자우')]), { origin: 'user-supplied-official' });
  const r = K.compareCandidates(d, l, { today: TODAY }), e = r.entries.find(x => x.code === 'ZZ9101');
  a.equal(e.status, 'pending'); a.equal(e.rule, 'preferred-not-provided-by-api'); a.equal(r.counts.preferredSeparate, 1); a.equal(r.counts.stockCandidates, 73);
});
test('market change between recorded candidate and official response is pending, not auto-updated', () => {
  const its = candItems(1); its[0].mrktCtg = data.securities[0].market === 'KOSPI' ? 'KOSDAQ' : 'KOSPI';
  const r = K.compareCandidates(data, asListing(xml(its), { origin: 'user-supplied-official' }), { today: TODAY });
  a.equal(r.entries[0].status, 'pending'); a.equal(data.securities[0].market === its[0].mrktCtg, false);
});
test('exclusion only with a separately confirmed reason; otherwise ignored', () => {
  const c0 = data.securities[0].code, c1 = data.securities[1].code;
  const r = K.compareCandidates(data, null, { today: TODAY, exclusions: [{ code: c0, reason: '상장폐지 공시 확인', confirmedBy: '순태', confirmedAt: '2026-10-29' }, { code: c1, reason: '' }] });
  a.equal(r.entries.find(e => e.code === c0).status, 'excluded'); a.equal(r.entries.find(e => e.code === c1).status, 'pending'); a.equal(r.counts.excluded, 1);
});
test('the 100-target is never filled with invented names: candidate total stays 73 + 5 ETF, 27 short', () => {
  const r = K.compareCandidates(data, null, { today: TODAY }); a.equal(r.counts.stockCandidates, 73); a.equal(100 - r.counts.stockCandidates, 27); a.equal(r.officialVerifiedCount, 0);
});
test('static guard: krx-api.js has no network/storage/env/timer and no key handling; unchanged universe file hash', () => {
  const src = fs.readFileSync(path.join(__dirname, '../kr-radar/krx-api.js'), 'utf8');
  a.doesNotMatch(src, /(\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|process\.env|child_process|setTimeout|setInterval|\beval\s*\(|new Function|require\(['"](http|https|net|fs|node:[a-z_]+)['"]\))/);
  for (const m of src.matchAll(/require\(['"]([^'"]+)['"]\)/g)) a.ok(m[1].startsWith('./'));
  const secret = /(serviceKey\s*[:=]\s*['"][A-Za-z0-9%+\/=]{16,}|ghp_[A-Za-z0-9]{20,}|BEGIN (RSA|PRIVATE))/;
  for (const f of ['kr-radar/krx-api.js', 'tools/kr-krx-verify.cjs', 'tests/fixtures/krx/guide-example.xml']) a.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), secret, f);
});
