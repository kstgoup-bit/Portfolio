/* KST (stage12): 공식 KRX상장종목정보 조회의 "실행 오케스트레이션". Pure — 전송 수단(transport)·대기(wait)·해시(sha256)는 호출자가 주입한다.
   이 파일은 네트워크·환경변수·타이머·저장소에 접근하지 않는다. 실제 전송은 tools/krx-live-runner.cjs(개인 PC 전용)만 수행한다.
   호출 총량 상한 20회(재시도 포함), 재시도는 일시 오류만 최대 2회(지수 백오프), 영구 오류는 즉시 중단, 모든 오류 문구는 키 마스킹. */
'use strict';
const { day, daysBetween } = require('./common.js');
const K = require('./krx-api.js');
const VERIFIER_VERSION = 'krx-verify-2026.10.29-s12';
const HARD_MAX_CALLS = 20, MAX_RETRIES = 2, BACKOFF_MS = Object.freeze([1000, 2000, 4000]), PAGE_SIZE = K.SERVICE.maxRows;
const TRANSIENT = new Set(['rate-limited', 'backend-unreachable', 'backend-no-response', 'unexpected', 'server-error', 'timeout', 'network']);
const HALT = new Set(['unauthorized', 'forbidden', 'quota-exceeded', 'api-not-found', 'gateway-error', 'bad-request', 'result-code']);

function maskSecrets(text, key) {
  let t = String(text == null ? '' : text);
  if (typeof key === 'string' && key.length >= 4) {
    const variants = new Set([key]); try { variants.add(encodeURIComponent(key)); variants.add(decodeURIComponent(key)); } catch { /* 이미 인코딩 안 된 값 */ }
    for (const v of variants) if (v && v.length >= 4) t = t.split(v).join('***');
  }
  return t.replace(/serviceKey=[^&\s"'<>]*/gi, 'serviceKey=***').replace(/(authorization|x-api-key)\s*[:=]\s*\S+/gi, '$1=***');
}
/* 승인 기록은 사용자가 로컬에 직접 만든 파일이다. 이 모듈은 "있다/형식이 맞다"만 확인하며 승인을 만들어내지 않는다. */
function validateApproval(a, today) {
  const e = [];
  if (!a || typeof a !== 'object') return ['승인 기록 없음'];
  if (a.approvedBy !== 'user') e.push('approvedBy=user 필요');
  if (!day(a.approvedAt) || (day(today) && a.approvedAt > today)) e.push('approvedAt');
  if (!/^\d{8}$/.test(String(a.basDt || ''))) e.push('basDt(YYYYMMDD)');
  if (!Number.isInteger(a.maxCalls) || a.maxCalls < 1 || a.maxCalls > HARD_MAX_CALLS) e.push('maxCalls는 1~' + HARD_MAX_CALLS);
  if (typeof a.scope !== 'string' || !a.scope.trim()) e.push('scope');
  if (a.expiresAt !== undefined && (!day(a.expiresAt) || (day(today) && a.expiresAt < today))) e.push('승인 만료');
  return e;
}
/* 계획만 만든다(호출하지 않음). 1단계 탐색(1건) → 2단계 쪽별 조회. 예상 총 호출수를 먼저 계산해 상한 초과 계획을 거절한다. */
const weekdayOf = basDt => new Date(Date.UTC(+basDt.slice(0, 4), +basDt.slice(4, 6) - 1, +basDt.slice(6, 8))).getUTCDay();
function planCalls({ basDt, totalCount = null, maxCalls = HARD_MAX_CALLS, resultType = 'xml', queriedAt = null }) {
  const errs = [], warnings = [];
  if (!['xml', 'json'].includes(resultType)) errs.push('resultType(xml|json)');
  if (!/^\d{8}$/.test(String(basDt || ''))) errs.push('basDt');
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > HARD_MAX_CALLS) errs.push('maxCalls');
  const pages = Number.isInteger(totalCount) ? Math.max(1, Math.ceil(totalCount / PAGE_SIZE)) : null;
  if (/^\d{8}$/.test(String(basDt || '')) && day(String(basDt).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'))) {
    const wd = weekdayOf(String(basDt)); if (wd === 0 || wd === 6) warnings.push('기준일이 주말 — 거래일이 아니라 빈 응답일 가능성이 높음(공휴일 캘린더는 미구현)');
    if (day(queriedAt)) { const iso = String(basDt).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'), lag = daysBetween(iso, queriedAt); if (lag < 0) errs.push('기준일이 조회일보다 미래'); else if (lag < 2) warnings.push('기준일이 조회일 기준 ' + lag + '일 전 — 가이드상 영업일 하루 뒤 13시 이후 개방이라 아직 없을 수 있음'); }
  } else if (/^\d{8}$/.test(String(basDt || ''))) errs.push('basDt 달력상 존재하지 않는 날짜');
  const minimum = 1 + (pages === null ? 1 : pages);
  if (!errs.length && minimum > maxCalls) errs.push('최소 필요 호출수 ' + minimum + ' > 상한 ' + maxCalls);
  return { ok: errs.length === 0, errors: errs, warnings, resultType, minimumCalls: minimum, pages, steps: [{ phase: 'probe', params: { numOfRows: 1, pageNo: 1, resultType, basDt: String(basDt) } }, { phase: 'pages', params: { numOfRows: PAGE_SIZE, resultType, basDt: String(basDt) }, pageCount: pages }], note: '명세만 있음 — 실제 호출은 tools/krx-live-runner.cjs --live 와 사용자 승인 기록이 모두 있을 때만' };
}
function resultOk(r) { return { ok: true, record: r }; }
async function runPlan({ basDt, maxCalls = HARD_MAX_CALLS, key, transport, wait, sha256, queriedAt, origin = 'fixture', resume = null, resultType = 'xml' }) {
  const out = { status: 'failed', reason: null, transportCalls: 0, attempts: [], pages: [], raw: [], listing: null, missingPages: [], resume: null, queriedAt: queriedAt || null, verifierVersion: VERIFIER_VERSION, acquisition: origin === 'fixture' ? 'fixture' : 'local-runner', warnings: [] };
  const fail = (status, reason) => { out.status = status; out.reason = maskSecrets(reason, key); return out; };
  if (typeof transport !== 'function' || typeof wait !== 'function' || typeof sha256 !== 'function') return fail('blocked', '주입 의존성(transport/wait/sha256) 누락');
  if (!day(queriedAt)) return fail('blocked', 'queriedAt(YYYY-MM-DD) 필요');
  const plan = planCalls({ basDt, maxCalls, totalCount: resume && resume.totalCount, resultType, queriedAt }); if (!plan.ok) return fail('blocked', plan.errors.join('; '));
  if (origin !== 'fixture' && (typeof key !== 'string' || key.length < 8)) return fail('blocked', '인증키 없음(환경변수에서만 주입)');
  const spec = params => { const s = K.buildRequestSpec(params); return { template: s.urlTemplate }; };
  const urlFor = params => { const t = spec(params).template; const k = key ? (/%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key)) : ''; return t.replace('<서버측-비밀저장소에서-주입>', k); };
  async function callOnce(phase, pageNo, params) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (out.transportCalls >= maxCalls) return { halt: 'budget-exhausted' };
      out.transportCalls++;
      let res, cat = null, parsed = null;
      try { res = await transport({ url: urlFor(params), timeoutMs: 15000 }); } catch (e) { cat = /timeout|ETIMEDOUT|aborted/i.test(String(e && e.message)) ? 'timeout' : 'network'; res = null; }
      let text = res && typeof res.text === 'string' ? res.text : '';
      if (res && !cat) {
        const f = K.classifyFailure({ httpStatus: res.status, text });
        if (res.status >= 400 || (f.category !== 'unknown' && !/<response>|"response"/.test(text))) cat = f.category;
        else { const sha = sha256(text); parsed = K.parseResponse(text, { httpStatus: res.status, responseSha256: sha, origin, format: resultType }); if (!parsed.ok && !(phase === 'probe' && parsed.page && parsed.errors.length === 0)) cat = parsed.failure ? parsed.failure.category : 'parse-error'; out.lastSha = sha; }
      }
      out.attempts.push({ phase, pageNo, try: attempt + 1, httpStatus: res ? res.status : null, category: cat || 'ok' });
      if (!cat) return { ok: true, parsed, text, sha: out.lastSha };
      if (HALT.has(cat)) return { halt: cat };
      if (!TRANSIENT.has(cat) || attempt === MAX_RETRIES) return { permanent: cat };
      await wait(BACKOFF_MS[attempt]);
    }
    return { permanent: 'unknown' };
  }
  let total = resume && Number.isInteger(resume.totalCount) ? resume.totalCount : null;
  const done = new Map(); for (const d of (resume && resume.done) || []) done.set(d.pageNo, d);
  if (total === null) {
    const r = await callOnce('probe', 0, { numOfRows: 1, pageNo: 1, resultType, basDt: String(basDt) });
    if (!r.ok) return fail(r.halt ? 'blocked' : 'failed', '탐색 호출 실패: ' + (r.halt || r.permanent));
    total = r.parsed.page.totalCount;
    if (total === 0) return fail('failed', '빈 데이터(휴일·미개방일 가능)');
  }
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (out.transportCalls + (pages - done.size) > maxCalls) return fail('blocked', '필요 호출수가 상한 초과');
  for (let p = 1; p <= pages; p++) {
    if (done.has(p)) { const d = done.get(p), parsed = K.parseResponse(d.text, { responseSha256: sha256(d.text), origin }); if (parsed.ok) { out.pages.push(parsed); out.raw.push({ pageNo: p, text: d.text, sha256: sha256(d.text) }); continue; } }
    const r = await callOnce('pages', p, { numOfRows: PAGE_SIZE, pageNo: p, resultType, basDt: String(basDt) });
    if (r.ok) { out.pages.push(r.parsed); out.raw.push({ pageNo: p, text: r.text, sha256: r.sha }); }
    else { out.missingPages.push(p); if (r.halt) { for (let q = p + 1; q <= pages; q++) out.missingPages.push(q); out.reason = '중단: ' + r.halt; break; } }
  }
  out.resume = { basDt: String(basDt), totalCount: total, done: out.raw.map(r => ({ pageNo: r.pageNo, text: r.text })), missing: out.missingPages.slice() };
  if (out.missingPages.length) { out.status = 'partial'; out.reason = out.reason || '일부 쪽 실패(누락 쪽만 재시도 가능)'; return out; }
  const asm = K.assemblePages(out.pages);
  out.listing = { ...asm, origin, page: { totalCount: total }, responseSha256: null, baseDate: asm.baseDate, rejected: out.pages.flatMap(p => p.rejected) };
  if (!asm.ok) return fail('failed', '쪽 합치기 실패: ' + asm.errors.join('; '));
  if (asm.baseDate !== `${basDt.slice(0, 4)}-${basDt.slice(4, 6)}-${basDt.slice(6, 8)}`) return fail('blocked', 'basDt 불일치: 요청 ' + basDt + ' / 응답 ' + asm.baseDate);
  if (daysBetween(asm.baseDate, queriedAt) < 0) return fail('blocked', '기준일이 조회일보다 미래');
  if (asm.baseDate === queriedAt) out.warnings.push('기준일=조회일: 가이드상 다음 영업일 13시 이후 개방이라 비정상 가능');
  out.status = 'complete'; return out;
}
module.exports = { VERIFIER_VERSION, HARD_MAX_CALLS, MAX_RETRIES, BACKOFF_MS, PAGE_SIZE, maskSecrets, validateApproval, planCalls, runPlan, resultOk };
