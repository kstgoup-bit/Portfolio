/* KST (stage9): provider rights/accuracy verdicts. Pure. Verdicts: 부적격 (a confirmed conflict with the intended use) /
   미확정 (anything unconfirmed or stale) / 후보 적격 (every required item confirmed, no conflict). 후보 적격 is NOT approval to connect. */
'use strict';
const { nonEmpty, day, httpsUrl, daysBetween } = require('./common.js');
const STATUSES = ['confirmed', 'unconfirmed', 'conflict'];
const MAX_CHECK_AGE_DAYS = 30;
function validate(cat) {
  const errors = [];
  if (!cat || cat.schemaVersion !== 2 || !Array.isArray(cat.providers) || !Array.isArray(cat.requiredPrice) || !Array.isArray(cat.requiredListing)) return { errors: ['카탈로그 v2 스키마 오류'] };
  const ids = new Set();
  for (const p of cat.providers) {
    if (!nonEmpty(p.id) || ids.has(p.id)) errors.push('id 오류/중복: ' + p.id); ids.add(p.id);
    if (!['price', 'listing'].includes(p.role)) { errors.push(p.id + ': role'); continue; }
    for (const k of (p.role === 'price' ? cat.requiredPrice : cat.requiredListing)) {
      const f = p.fields && p.fields[k];
      if (!f || !STATUSES.includes(f.status) || !nonEmpty(f.value) || !day(f.checkedAt)) { errors.push(p.id + '.' + k + ': 형식 오류'); continue; }
      if (f.status !== 'unconfirmed' && !httpsUrl(f.source)) errors.push(p.id + '.' + k + ': confirmed/conflict는 https 출처 필요');
    }
  }
  if (/(api[_-]?key|secret|token|password|serviceKey)\s*[:=]\s*["']?[A-Za-z0-9_%\-]{12,}/i.test(JSON.stringify(cat))) errors.push('비밀값 의심 문자열');
  return { errors };
}
function verdict(p, { today } = {}) {
  const cat = { requiredPrice: p.role === 'price' ? Object.keys(p.fields) : [], requiredListing: p.role === 'listing' ? Object.keys(p.fields) : [] };
  const keys = p.role === 'price' ? cat.requiredPrice : cat.requiredListing;
  const conflicts = keys.filter(k => p.fields[k].status === 'conflict');
  const unconfirmed = keys.filter(k => p.fields[k].status === 'unconfirmed');
  const stale = day(today) ? keys.filter(k => p.fields[k].status !== 'unconfirmed' && daysBetween(p.fields[k].checkedAt, today) > MAX_CHECK_AGE_DAYS) : keys.filter(k => p.fields[k].status !== 'unconfirmed');
  let v = '후보 적격'; const reasons = [];
  if (conflicts.length) { v = '부적격'; reasons.push('확인된 충돌: ' + conflicts.join(', ')); }
  else if (unconfirmed.length || stale.length) { v = '미확정'; if (unconfirmed.length) reasons.push('미확정 ' + unconfirmed.length + '건: ' + unconfirmed.join(', ')); if (stale.length) reasons.push('확인일 ' + MAX_CHECK_AGE_DAYS + '일 초과/오늘 미지정: ' + stale.join(', ')); }
  return { id: p.id, role: p.role, verdict: v, conflicts, unconfirmed, stale, reasons, approvalToConnect: false };
}
function summarize(cat, { today } = {}) {
  const val = validate(cat); if (val.errors.length) return { errors: val.errors, verdicts: [], counts: {}, realApiRequests: 0 };
  const verdicts = cat.providers.map(p => verdict(p, { today }));
  const counts = { '후보 적격': 0, '미확정': 0, '부적격': 0 }; verdicts.forEach(v => counts[v.verdict]++);
  return { errors: [], verdicts, counts, realApiRequests: 0 };
}
module.exports = { STATUSES, MAX_CHECK_AGE_DAYS, validate, verdict, summarize };
