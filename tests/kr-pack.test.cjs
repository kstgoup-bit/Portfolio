'use strict';
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const P = require('../kr-radar/pack.js'), L = require('../kr-radar/listing.js'), U = require('../kr-radar/universe.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../kr-radar/data/universe.json'), 'utf8'));
const meta = { provider: '시험(공식 아님)', datasetName: 'TEST', sourceUrl: 'https://example.com/x', queriedAt: '2026-10-29', licenseNote: '시험' };
const SHA = 'c'.repeat(64);
const csv = rows => '기준일자,단축코드,ISIN코드,시장구분,종목명\n' + rows.join('\n') + '\n';
test('example CSV wraps into a package that listing.js accepts, and nothing real gets verified', () => {
  const txt = fs.readFileSync(path.join(__dirname, '../kr-radar/examples/listing-sample.csv'), 'utf8'); const r = P.buildPackage(txt, meta, { fileSha256: SHA });
  a.equal(r.ok, true); a.equal(r.pkg.provenance.rowCount, 2); a.equal(r.pkg.provenance.baseDate, '2026-10-28');
  const n = L.normalizeListing(r.pkg, { today: '2026-10-29' }); a.equal(n.ok, true);
  const x = L.crossCheckOfficial(data, r.pkg, { today: '2026-10-29' }); a.equal(U.audit(x.data).verifiedAgainstOfficialListing, 0); a.equal(x.report.notFound.length, 78);
});
test('quoted fields, BOM, CRLF and blank lines are parsed', () => {
  const rows = P.parseCsv('﻿a,b\r\n"x,1","y""z"\r\n\r\n'); a.deepEqual(rows, [['a', 'b'], ['x,1', 'y"z']]);
});
test('missing headers, missing meta/hash, mixed base dates and bad dates are rejected (fail closed)', () => {
  a.equal(P.buildPackage('a,b\n1,2\n', meta, { fileSha256: SHA }).ok, false);
  a.equal(P.buildPackage(csv(['20261028,ZZ0001,I,KOSPI,가상']), { ...meta, licenseNote: '' }, { fileSha256: SHA }).ok, false);
  a.equal(P.buildPackage(csv(['20261028,ZZ0001,I,KOSPI,가상']), meta, {}).ok, false);
  a.equal(P.buildPackage(csv(['20261028,ZZ0001,I,KOSPI,가상', '20261027,ZZ0002,I,KOSPI,가상2']), meta, { fileSha256: SHA }).ok, false);
  a.equal(P.buildPackage(csv(['2026-13-45,ZZ0001,I,KOSPI,가상']), meta, { fileSha256: SHA }).ok, true, '날짜 형식은 통과하나 listing.js에서 걸러짐');
  a.equal(L.normalizeListing(P.buildPackage(csv(['2026-13-45,ZZ0001,I,KOSPI,가상']), meta, { fileSha256: SHA }).pkg, { today: '2026-10-29' }).ok, false);
});
test('unknown market labels or prefixed codes are NOT translated; the listing check rejects those rows', () => {
  const r = P.buildPackage(csv(['20261028,A005930,I,유가증권,가상', '20261028,ZZ0002,I,KOSPI,가상2']), meta, { fileSha256: SHA }); a.equal(r.ok, true);
  const n = L.normalizeListing(r.pkg, { today: '2026-10-29' }); a.equal(n.ok, false); a.equal(n.byCode.size, 1);
});
test('sample has no secret-like content and the tool contains no network or key handling', () => {
  const t = fs.readFileSync(path.join(__dirname, '../tools/kr-listing-pack.cjs'), 'utf8'); a.doesNotMatch(t, /fetch\(|https?\.request|XMLHttpRequest|process\.env|serviceKey/);
});
