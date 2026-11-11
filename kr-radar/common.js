/* KST KR radar (stage7): shared pure helpers. No storage, network, timers, env or portfolio access. */
'use strict';
const finite = x => typeof x === 'number' && Number.isFinite(x);
const nonEmpty = s => typeof s === 'string' && s.trim().length > 0;
const day = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
const daysBetween = (from, to) => (Date.parse(to) - Date.parse(from)) / 86400000;
const copy = v => JSON.parse(JSON.stringify(v));
const httpsUrl = s => { try { const u = new URL(s); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } };
// KRX short codes are 6 characters. New listings may use letters, so digits-only is not assumed.
const CODE_RE = /^[0-9A-Z]{6}$/;
const SYNTH_ID = /^KR-DEMO-[A-Z0-9-]{1,24}$/;
// Calendar-day tolerance covers a weekend or a short holiday. An exact KRX trading calendar is NOT implemented.
const MAX_QUOTE_AGE_DAYS = 4;
const MAX_ASSESSMENT_AGE_DAYS = 150;
const MAX_CHECK_AGE_DAYS = 30;
function deepFreeze(o) { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; }
function baseResult(kind) {
  // Every result states, in the data itself, that nothing is wired to orders, alerts, accounts or real symbols.
  return { schemaVersion: 1, kind, mode: 'synthetic', status: '평가 불가', reasons: [], counterEvidence: [], missing: [], formulas: [], notes: [], automaticAction: false, order: null, notification: null, actualActiveCount: 0, realPriceValidated: 0, realApiRequests: 0 };
}
module.exports = { finite, nonEmpty, day, daysBetween, copy, httpsUrl, CODE_RE, SYNTH_ID, MAX_QUOTE_AGE_DAYS, MAX_ASSESSMENT_AGE_DAYS, MAX_CHECK_AGE_DAYS, deepFreeze, baseResult };
