/* KST KR radar (stage8): OFFLINE verification of the candidate list against a user-supplied OFFICIAL listing package.
   Pure functions. No network, storage, env, timers or real holdings. A match proves only that a code/name/market triple exists
   in the supplied file on its base date; it never activates monitoring (that also needs rights-cleared, verified prices). */
'use strict';
const { CODE_RE, nonEmpty, day, daysBetween, httpsUrl, copy } = require('./common.js');
const MAX_LISTING_AGE_DAYS = 10;
const MARKETS = ['KOSPI', 'KOSDAQ', 'KONEX'];
const nfc = s => String(s).normalize('NFC').trim();
// Name-based hints are suspicions only. They send an item to HOLD; they never exclude or confirm on their own.
function classifyByName(name) {
  const n = nfc(name || '');
  if (/스팩|제\d+호$/.test(n)) return 'spac-suspected';
  if (/(?<!메)리츠|REIT/i.test(n)) return 'reit-suspected'; // '메리츠' 같은 일반 사명의 오탐 방지(12단계)
  if (/ETN$|\bETN\b/i.test(n)) return 'etn-suspected';
  if (/(우|우B|우C|\d우|우\(전환\))$/.test(n)) return 'preferred-suspected';
  if (/^(KODEX|TIGER|KBSTAR|ACE|SOL|HANARO|ARIRANG|KOSEF|PLUS|RISE)\b/i.test(n)) return 'etf-suspected';
  return 'common-presumed';
}
function checkProvenance(p, today) {
  const e = [];
  if (!p || typeof p !== 'object') return ['provenance 누락'];
  if (!nonEmpty(p.provider)) e.push('provider');
  if (!nonEmpty(p.datasetName)) e.push('datasetName');
  if (!httpsUrl(p.sourceUrl)) e.push('sourceUrl(https)');
  if (!day(p.baseDate)) e.push('baseDate');
  if (!day(p.queriedAt)) e.push('queriedAt');
  if (!/^[0-9a-f]{64}$/.test(p.sha256 || '')) e.push('sha256(64 hex)');
  if (!nonEmpty(p.licenseNote)) e.push('licenseNote(이용허락범위 기록)');
  if (!Number.isInteger(p.rowCount) || p.rowCount < 1) e.push('rowCount');
  if (day(p.baseDate) && day(p.queriedAt) && p.baseDate > p.queriedAt) e.push('baseDate가 조회일보다 늦음');
  if (day(today) && day(p.queriedAt) && p.queriedAt > today) e.push('queriedAt이 미래');
  return e;
}
/* Returns {ok, stale, errors, byCode, duplicates, rows}. Never throws on bad data. */
function normalizeListing(pkg, { today, fileSha256 } = {}) {
  const out = { ok: false, stale: false, errors: [], byCode: new Map(), duplicates: [], rows: 0 };
  if (!day(today)) { out.errors.push('today'); return out; }
  if (!pkg || !Array.isArray(pkg.rows)) { out.errors.push('상장목록 패키지 형식 오류'); return out; }
  out.errors.push(...checkProvenance(pkg.provenance, today).map(x => 'provenance: ' + x));
  if (fileSha256 !== undefined && pkg.provenance && fileSha256 !== pkg.provenance.sha256) out.errors.push('원본 파일 해시 불일치');
  if (pkg.provenance && pkg.provenance.rowCount !== pkg.rows.length) out.errors.push('rowCount와 실제 행 수 불일치');
  const seen = new Map();
  for (const r of pkg.rows) {
    if (!r || !CODE_RE.test(r.code || '') || !nonEmpty(r.name) || !MARKETS.includes(r.market)) { out.errors.push('잘못된 행: ' + JSON.stringify(r && r.code)); continue; }
    if (seen.has(r.code)) { out.duplicates.push(r.code); continue; }
    seen.set(r.code, { code: r.code, name: nfc(r.name), market: r.market, isin: r.isin || null, hint: classifyByName(r.name) });
  }
  out.byCode = seen; out.rows = pkg.rows.length;
  for (const c of out.duplicates) seen.delete(c); // ambiguous code: nothing may match it
  if (day(pkg.provenance && pkg.provenance.baseDate) && day(today) && daysBetween(pkg.provenance.baseDate, today) > MAX_LISTING_AGE_DAYS) out.stale = true;
  out.ok = out.errors.length === 0 && !out.stale;
  return out;
}
/* Returns NEW data; the input is not mutated. Without a fully valid, fresh package every candidate stays 'unverified'. */
function crossCheckOfficial(data, pkg, opts = {}) {
  const norm = normalizeListing(pkg, opts), out = copy(data);
  const report = { matched: [], mismatch: [], notFound: [], ambiguous: [], blockedByPackage: [], packageErrors: norm.errors, stale: norm.stale, evidence: null };
  if (!norm.ok) { for (const s of out.securities) report.blockedByPackage.push(s.code); return { data: out, report, normalized: norm }; }
  const p = pkg.provenance;
  report.evidence = { provider: p.provider, datasetName: p.datasetName, baseDate: p.baseDate, queriedAt: p.queriedAt, sourceUrl: p.sourceUrl, sha256: p.sha256, licenseNote: p.licenseNote };
  for (const s of out.securities) {
    const l = norm.byCode.get(s.code);
    s.status = 'hold'; // a listing match never activates
    if (norm.duplicates.includes(s.code)) { s.listingCheck = 'mismatch'; report.ambiguous.push(s.code); continue; }
    if (!l) { s.listingCheck = 'not-found'; report.notFound.push(s.code); continue; }
    const exact = l.name === nfc(s.name) && l.market === s.market;
    const typeOk = s.group === 'etf' ? l.hint === 'etf-suspected' || l.hint === 'common-presumed' : l.hint === 'common-presumed';
    if (exact && typeOk) {
      s.listingCheck = 'matched'; s.reviewStatus = 'verified'; s.lastVerified = opts.today; s.codeStatus = 'official-listing-matched';
      s.listingEvidence = { provider: p.provider, baseDate: p.baseDate, sourceUrl: p.sourceUrl, sha256: p.sha256, isin: l.isin };
      report.matched.push(s.code);
    } else { s.listingCheck = 'mismatch'; report.mismatch.push({ code: s.code, reason: !exact ? 'name/market' : 'security-type:' + l.hint }); }
  }
  return { data: out, report, normalized: norm };
}
/* Fill the shortfall ONLY from the official listing. `picks` are explicit {code, sector, evaluationProfile, reason} choices made by a person/analyst;
   this function never chooses names itself and never invents a code. */
function supplement(data, pkg, picks, opts = {}) {
  const norm = normalizeListing(pkg, opts), out = copy(data), added = [], rejected = [];
  if (!norm.ok) return { data: out, added, rejected: [{ code: null, reason: '공식 목록 패키지 무효/만료: ' + (norm.stale ? 'stale' : norm.errors.join(';')) }], normalized: norm };
  const have = new Set(out.securities.map(s => s.code)), p = pkg.provenance;
  for (const pick of Array.isArray(picks) ? picks : []) {
    const code = pick && pick.code, l = norm.byCode.get(code);
    if (!CODE_RE.test(code || '')) { rejected.push({ code, reason: '코드 형식' }); continue; }
    if (have.has(code)) { rejected.push({ code, reason: '중복' }); continue; }
    if (!l) { rejected.push({ code, reason: '공식 목록에 없음 또는 중복코드로 모호' }); continue; }
    if (l.hint !== 'common-presumed') { rejected.push({ code, reason: '보통주 아님 의심: ' + l.hint }); continue; }
    if (l.market === 'KONEX') { rejected.push({ code, reason: 'KONEX는 후보 범위 밖' }); continue; }
    if (![pick.sector, pick.evaluationProfile, pick.reason].every(nonEmpty)) { rejected.push({ code, reason: '업종/평가유형/선정근거 누락' }); continue; }
    out.securities.push({ code, name: l.name, market: l.market, securityType: '보통주', group: 'stock', sector: pick.sector, evaluationProfile: pick.evaluationProfile, selectionReason: pick.reason + ' (조사 대상 선정 이유이며 매수 적격 판정이 아님)', selectedAt: opts.today, source: p.provider + ' / ' + p.datasetName + ' 기준일 ' + p.baseDate, codeStatus: 'official-listing-matched', listingCheck: 'matched', status: 'hold', reviewStatus: 'verified', lastVerified: opts.today, evidenceUrl: p.sourceUrl, listingEvidence: { provider: p.provider, baseDate: p.baseDate, sourceUrl: p.sourceUrl, sha256: p.sha256, isin: l.isin } });
    have.add(code); added.push(code);
  }
  return { data: out, added, rejected, normalized: norm };
}
module.exports = { MAX_LISTING_AGE_DAYS, MARKETS, classifyByName, checkProvenance, normalizeListing, crossCheckOfficial, supplement };
