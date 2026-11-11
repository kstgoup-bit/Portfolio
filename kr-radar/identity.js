/* KST (stage11): KRX 공식 종목 "신원 검증"(krx-api.js)과 10단계 시세 데이터 파이프라인(pipeline.js)의 경계면. Pure. No network/storage/env/timers.
   규칙: 신원 검증은 시세 검증이 아니다. 신원 verified 가 아니면 파이프라인은 '미연결'을 벗어나지 못하며, 신원 verified 여도 활성화되지 않는다(정책상 차단). */
'use strict';
const { day } = require('./common.js');
const PL = require('./pipeline.js');
const TARGET_STOCK_CANDIDATES = 100;
/* JSON 응답 구조는 실제 데이터로 확인되지 않은 가정이다. 실응답을 확보하면 checkAssumedJsonShape 로 경계에서 재검증한다. */
const ASSUMED_JSON_SHAPE = Object.freeze({ status: 'assumed-unconfirmed', paths: Object.freeze(['response.header.resultCode', 'response.header.resultMsg', 'response.body.numOfRows', 'response.body.pageNo', 'response.body.totalCount', 'response.body.items']), itemFields: Object.freeze(['basDt', 'srtnCd', 'isinCd', 'mrktCtg', 'itmsNm']) });
function checkAssumedJsonShape(text) {
  const out = { assumedStatus: ASSUMED_JSON_SHAPE.status, ok: false, missing: [], note: '실응답 구조 확인용 경계 검사 — 통과해도 가정이 "확정"되는 것은 아님(사람이 원본과 대조)' };
  let j; try { j = JSON.parse(text); } catch { out.missing.push('JSON 파싱 실패'); return out; }
  for (const p of ASSUMED_JSON_SHAPE.paths) { let c = j; for (const k of p.split('.')) c = c && typeof c === 'object' ? c[k] : undefined; if (c === undefined) out.missing.push(p); }
  const items = j && j.response && j.response.body && j.response.body.items, first = items && items.item ? [].concat(items.item)[0] : null;
  if (first) for (const f of ASSUMED_JSON_SHAPE.itemFields) if (!(f in first)) out.missing.push('item.' + f);
  out.ok = out.missing.length === 0; return out;
}
/* '원본 무결성' 단계 증거. 해시는 호출자가 원본 바이트로 계산해 파서에 전달한 값이다. 합성/예시 응답은 official=false 라 단계가 막힌다. */
function integrityEvidenceFromListing(listing) {
  if (!listing) return { sha256Matches: false, rowCount: 0, expectedRowCount: -1, official: false };
  const total = listing.page ? listing.page.totalCount : listing.totalCount;
  const hasHash = !!(listing.responseSha256 || (listing.hashes && listing.hashes.length && listing.hashes.every(h => /^[0-9a-f]{64}$/.test(h || ''))));
  return { sha256Matches: hasHash && listing.ok === true, rowCount: (listing.rows ? listing.rows.length : 0) + (listing.rejected ? listing.rejected.length : 0), expectedRowCount: Number.isInteger(total) ? total : -1, official: listing.origin === 'user-supplied-official' };
}
function identityGate(entry) {
  const verified = !!entry && entry.status === 'verified';
  return Object.freeze({ code: entry ? entry.code : null, identityVerified: verified, priceVerified: false, monitorable: false, decision: 'HOLD', priceStatus: 'DATA_UNAVAILABLE', reason: verified ? 'KRX 신원 일치 — 시세·권리 검증 전이므로 감시 불가' : '신원 미검증(' + (entry ? entry.status + ': ' + entry.rule : '항목 없음') + ')' });
}
/* 한국 종목은 신원 verified 일 때만 '미연결' 이후 단계로 진행할 수 있다. */
function advanceWithIdentity(rec, entry, evidence, { today } = {}) {
  if (!day(today) || !rec) return { ok: false, record: rec, reason: '입력 오류' };
  const g = identityGate(entry);
  const why = rec.market !== 'KR' ? '한국 종목 전용 경계면' : !entry || entry.code !== rec.symbol ? '신원 항목과 종목코드 불일치' : !g.identityVerified ? g.reason : null;
  if (why) { const h = Object.freeze({ to: PL.STATES[PL.STATES.indexOf(rec.state) + 1] || rec.state, at: today, result: '보류', reason: 'KRX 신원 게이트: ' + why, realPrice: false }); return { ok: false, record: Object.freeze({ ...rec, hold: h.reason, history: Object.freeze([...rec.history, h]) }), reason: h.reason }; }
  return PL.advance(rec, evidence, { today });
}
function integrationSummary(data, comparison) {
  const c = comparison && comparison.counts, pend = c ? c.pending + c.etfPending + c.preferredSeparate + c.fixtureMatchedNotCounted : null;
  return { stockCandidates: c ? c.stockCandidates : null, etfSeparate: c ? c.etfSeparate : null, preferredSeparate: c ? c.preferredSeparate : null, officialVerified: comparison ? comparison.officialVerifiedCount : 0, onHold: pend, excluded: c ? c.excluded : 0, targetShortfall: c ? Math.max(0, TARGET_STOCK_CANDIDATES - c.stockCandidates) : null, actualActiveCount: 0, realApiRequests: 0, realPriceApiRequests: 0, realActivationAllowed: PL.POLICY.realActivationAllowed, jsonSchema: ASSUMED_JSON_SHAPE.status, verdict: '실데이터 감시 NO-GO 유지' };
}
module.exports = { TARGET_STOCK_CANDIDATES, ASSUMED_JSON_SHAPE, checkAssumedJsonShape, integrityEvidenceFromListing, identityGate, advanceWithIdentity, integrationSummary };
