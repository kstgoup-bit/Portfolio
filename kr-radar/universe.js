/* KST KR radar: candidate-universe validation and OFFLINE cross-check against a user-supplied listing file.
   A candidate list is never an active watch list. Nothing here reads the network or any real holding. */
'use strict';
const { CODE_RE, nonEmpty, day, httpsUrl, copy } = require('./common.js');
const GROUPS = ['stock', 'etf'];
const STATUS = ['active', 'hold', 'excluded'];
const TARGET_STOCK_CANDIDATES = 100;
function validate(data) {
  const errors = [];
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.securities)) return { errors: ['후보 목록 스키마 오류'], securities: [] };
  const codes = new Set();
  data.securities.forEach((s, idx) => {
    const tag = '#' + idx + ' ' + (s && s.code);
    if (!s || !CODE_RE.test(s.code || '')) { errors.push(tag + ': 종목코드 형식 오류'); return; }
    if (codes.has(s.code)) errors.push(tag + ': 중복 종목코드');
    codes.add(s.code);
    if (![s.name, s.sector, s.selectionReason, s.source].every(nonEmpty)) errors.push(tag + ': 필수 문자열 누락');
    if (!['KOSPI', 'KOSDAQ'].includes(s.market)) errors.push(tag + ': 시장구분 오류');
    if (!GROUPS.includes(s.group)) errors.push(tag + ': group 오류');
    if (s.group === 'etf' && !(s.securityType === 'ETF' && nonEmpty(s.etfKind))) errors.push(tag + ': ETF는 securityType=ETF와 etfKind 필요');
    if (s.group === 'stock' && s.securityType !== '보통주') errors.push(tag + ': 개별주 후보는 보통주만 허용(우선주·ETN·SPAC·리츠는 별도 정책)');
    if (!STATUS.includes(s.status) || !['candidate', 'verified'].includes(s.reviewStatus)) errors.push(tag + ': 상태 오류');
    if (!(s.lastVerified === null || day(s.lastVerified))) errors.push(tag + ': lastVerified 형식 오류');
    if (!['unverified', 'matched', 'mismatch', 'not-found'].includes(s.listingCheck)) errors.push(tag + ': listingCheck 오류');
    if (s.status === 'active' && !(s.reviewStatus === 'verified' && s.listingCheck === 'matched' && day(s.lastVerified) && httpsUrl(s.evidenceUrl))) errors.push(tag + ': 활성 종목은 공식 목록 대조(matched)·검증일·근거 URL 필요');
  });
  return { errors, securities: data.securities };
}
function audit(data) {
  const { errors, securities } = validate(data);
  const stocks = securities.filter(s => s && s.group === 'stock'), etfs = securities.filter(s => s && s.group === 'etf');
  const count = (arr, f) => arr.filter(f).length;
  return {
    version: data && data.version, recordedStockCandidates: stocks.length, recordedEtfCandidates: etfs.length, targetStockCandidates: TARGET_STOCK_CANDIDATES,
    shortfallStockCandidates: Math.max(0, TARGET_STOCK_CANDIDATES - stocks.length),
    verifiedAgainstOfficialListing: count(securities, s => s.listingCheck === 'matched'), unverified: count(securities, s => s.listingCheck === 'unverified'),
    mismatch: count(securities, s => s.listingCheck === 'mismatch'), notFound: count(securities, s => s.listingCheck === 'not-found'),
    hold: count(securities, s => s.status === 'hold'), excluded: count(securities, s => s.status === 'excluded'), activeReal: count(securities, s => s.status === 'active'),
    realPriceValidated: 0, realApiRequests: 0, errors
  };
}
// Offline only: `listing` is a file the user obtained legitimately (e.g. an official KRX listing export). Returns a NEW object.
function crossCheck(data, listing, checkedAt) {
  const out = copy(data); const report = { matched: [], mismatch: [], notFound: [] };
  if (!day(checkedAt) || !Array.isArray(listing)) throw new Error('대조 기준일과 상장 목록이 필요합니다.');
  const byCode = new Map(); for (const l of listing) if (l && CODE_RE.test(l.code || '')) byCode.set(l.code, l);
  for (const s of out.securities) {
    const l = byCode.get(s.code);
    if (!l) { s.listingCheck = 'not-found'; s.status = 'hold'; report.notFound.push(s.code); continue; }
    const ok = l.name === s.name && l.market === s.market && (l.securityType === undefined || l.securityType === s.securityType);
    s.listingCheck = ok ? 'matched' : 'mismatch'; if (ok) { s.lastVerified = checkedAt; s.reviewStatus = 'verified'; report.matched.push(s.code); } else { s.status = 'hold'; report.mismatch.push(s.code); }
    // Matching a listing proves the code/name pair exists. It does NOT activate monitoring; that needs separate price verification.
  }
  return { data: out, report };
}
module.exports = { validate, audit, crossCheck, TARGET_STOCK_CANDIDATES };
