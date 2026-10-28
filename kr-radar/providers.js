/* KST (stage8): provider decision catalog validation + pilot readiness gate. Pure. Reading docs is not an API request. */
'use strict';
const { nonEmpty, day, httpsUrl, copy } = require('./common.js');
const FIELDS = ['market', 'dataKind', 'adjustedPrice', 'delay', 'calendar', 'auth', 'rateLimit', 'cost', 'personalDisplay', 'storage', 'processing', 'redistribution', 'benchmarks'];
// A pilot needs every one of these confirmed with an official source, otherwise the provider is blocked.
const PILOT_REQUIRED = ['market', 'dataKind', 'adjustedPrice', 'delay', 'calendar', 'auth', 'rateLimit', 'cost', 'personalDisplay', 'storage', 'processing', 'benchmarks'];
const US_PILOT_SYMBOLS = Object.freeze(['MSFT', 'GOOGL', 'AVGO', 'VRT', 'JPM']);
function validateCatalog(cat) {
  const errors = [];
  if (!cat || cat.schemaVersion !== 1 || !Array.isArray(cat.providers)) return { errors: ['카탈로그 스키마 오류'] };
  const ids = new Set();
  for (const p of cat.providers) {
    if (!nonEmpty(p.id) || ids.has(p.id)) errors.push('id 오류/중복: ' + p.id); ids.add(p.id);
    if (!p.fields) { errors.push(p.id + ': fields 누락'); continue; }
    for (const k of FIELDS) {
      const f = p.fields[k];
      if (!f || !['confirmed', 'unconfirmed'].includes(f.status) || !nonEmpty(f.value) || !day(f.checkedAt)) { errors.push(p.id + '.' + k + ': 형식 오류'); continue; }
      if (f.status === 'confirmed' && !httpsUrl(f.source)) errors.push(p.id + '.' + k + ': 확인됨 항목은 https 출처 필요');
    }
  }
  const text = JSON.stringify(cat);
  if (/(api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9_\-]{12,}/i.test(text)) errors.push('비밀값 의심 문자열');
  return { errors };
}
function gate(provider, purpose = 'pilot') {
  const missing = PILOT_REQUIRED.filter(k => !(provider.fields[k] && provider.fields[k].status === 'confirmed'));
  const blocked = [];
  if (missing.length) blocked.push('미확정 항목: ' + missing.join(', '));
  const red = provider.fields.redistribution;
  if (!red || red.status !== 'confirmed') blocked.push('재배포/이용허락 미확정');
  return { id: provider.id, purpose, allowed: blocked.length === 0, blocked, confirmedCount: FIELDS.filter(k => provider.fields[k].status === 'confirmed').length, totalFields: FIELDS.length };
}
function summarize(cat) {
  const v = validateCatalog(cat);
  return { errors: v.errors, gates: v.errors.length ? [] : cat.providers.map(p => gate(p)), realApiRequests: 0, pilotAllowedProviders: v.errors.length ? [] : cat.providers.filter(p => gate(p).allowed).map(p => p.id) };
}
/* Pilot readiness: every prerequisite is an explicit boolean supplied by the caller (a human decision), never inferred. */
const READINESS_ITEMS = ['userApprovedPilot', 'officialListingVerified5KrSymbols', 'providerRightsConfirmed', 'adjustmentBasisConfirmed', 'exchangeCalendarImplemented', 'keyStoragePlanApproved', 'backupBeforePilot', 'rollbackPlan'];
function pilotReadiness(flags = {}) {
  const missing = READINESS_ITEMS.filter(k => flags[k] !== true);
  return { ready: missing.length === 0, missing, usSymbols: US_PILOT_SYMBOLS.slice(), actualActiveCount: 0, realApiRequests: 0, realPriceValidated: 0, note: missing.length ? '실데이터 파일럿 준비 미완료 — 실제 감시 운영 준비 완료로 해석 금지' : '체크리스트 충족(사람의 확인 값) — 실제 호출은 별도 승인' };
}
function createDisabledProviderAdapter(id) {
  return Object.freeze({ id, mode: 'disabled', realNetwork: false, async load() { throw new Error('공급자 어댑터 비활성: 권리·키·승인 전에는 호출할 수 없습니다.'); } });
}
module.exports = { FIELDS, PILOT_REQUIRED, US_PILOT_SYMBOLS, READINESS_ITEMS, validateCatalog, gate, summarize, pilotReadiness, createDisabledProviderAdapter, copy };
