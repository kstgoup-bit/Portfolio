/* KST (stage14): 휴대폰 관리자 전용 "공식 종목정보 확인" 흐름의 상태머신(모의). Pure.
   - 이번 단계에서는 합성 transport(isSynthetic=true)만 허용한다. 실제 transport 는 REAL_CALLS_ALLOWED=false 로 코드에서 거부한다.
   - 판정 규칙은 새로 만들지 않고 krx-run(runPlan)·krx-api(compareCandidates)·krx-status(toStates)를 그대로 재사용한다(= CLI 와 동일).
   - 자동 재시도 없음(maxRetries 0). 승인 1건 = 실행 1회(+ 남은 호출 한도 내 재개). 종목 코드·이름·원본 응답은 결과 화면/요약에 싣지 않는다.
   - 종목정보 API는 "신원 확인용"이며 주가·매수 신호가 아니다. */
'use strict';
const RUN = require('./krx-run.js'), K = require('./krx-api.js'), ST = require('./krx-status.js'), SH = require('./share.js');
const { day } = require('./common.js');
const REAL_CALLS_ALLOWED = false, MOBILE_MAX_CALLS = 3, ADMIN_MAX_SESSION_MS = 30 * 60 * 1000;
const NOTICE = '이 조회는 종목의 이름·시장·ISIN 신원 확인용입니다. 주가 확인이나 매수·매도 신호 활성화가 아닙니다.';
const isoOf = b => `${b.slice(0, 4)}-${b.slice(4, 6)}-${b.slice(6, 8)}`;

function createFlow({ universe, transport, clock, sha256, wait }) {
  const st = { state: 'LOCKED', reason: '관리자 로그인 필요(모의)', session: null, plan: null, approval: null, budget: 0, used: 0, resume: null, result: null, running: false, history: [], syntheticRequests: 0 };
  const log = (e) => { st.history.push(e); };
  const sessionOk = () => { const s = st.session; return !!(s && s.role === 'admin' && s.verified === true && Number.isFinite(s.expiresAtMs) && s.expiresAtMs > clock.nowMs() && Number.isFinite(s.issuedAt) && s.issuedAt <= clock.nowMs() && s.expiresAtMs - s.issuedAt <= ADMIN_MAX_SESSION_MS); };
  const guard = (need) => {
    if (!sessionOk()) { if (st.state !== 'LOCKED') { st.state = 'LOCKED'; st.reason = '관리자 세션이 없거나 만료됨'; st.running = false; } return { ok: false, code: 'NOT_ADMIN', reason: st.reason }; }
    if (need && !need.includes(st.state)) return { ok: false, code: 'BAD_STATE', reason: '현재 상태(' + st.state + ')에서는 할 수 없음' };
    return { ok: true };
  };
  const countTargets = () => { const sec = universe().securities || []; const etfs = sec.filter(x => x.group === 'etf').length; return { stocks: sec.length - etfs, etfs }; };
  const api = {
    REAL_CALLS_ALLOWED, MOBILE_MAX_CALLS, NOTICE,
    /* 관리자 세션은 서버가 발급해야 한다(이번 단계는 합성 세션). 형식·만료·최장 30분을 검사한다. */
    unlock(session) {
      st.session = session && typeof session === 'object' ? { ...session } : null;
      if (!sessionOk()) { st.state = 'LOCKED'; st.reason = '관리자 세션 검증 실패(모의)'; return { ok: false, code: 'NOT_ADMIN', reason: st.reason }; }
      st.state = 'READY'; st.reason = null; log('unlock'); return { ok: true };
    },
    lock() { st.session = null; st.state = 'LOCKED'; st.reason = '잠금'; st.approval = null; st.plan = null; return { ok: true }; },
    prepare({ basDt, maxCalls }) {
      const g = guard(['READY', 'DONE', 'FAILED', 'BLOCKED', 'CANCELLED']); if (!g.ok) return g;
      const n = Number(maxCalls); if (!Number.isInteger(n) || n < 1 || n > MOBILE_MAX_CALLS) return { ok: false, code: 'BAD_LIMIT', reason: '최대 호출은 1~' + MOBILE_MAX_CALLS + '회' };
      const plan = RUN.planCalls({ basDt, maxCalls: n, queriedAt: clock.today(), resultType: 'xml' });
      if (!plan.ok) return { ok: false, code: 'BAD_PLAN', reason: plan.errors.join('; ') };
      st.plan = { basDt: String(basDt), maxCalls: n, warnings: plan.warnings, minimumCalls: plan.minimumCalls, targets: countTargets() };
      st.approval = null; st.resume = null; st.used = 0; st.result = null; st.state = 'CONFIRMING'; st.reason = null;
      return { ok: true, confirmScreen: { ...st.plan, notice: NOTICE, stopConditions: ['401·403·한도 초과·권한 오류는 즉시 중단', '자동 재시도 없음', '호출 상한 도달 시 중단'], mode: '합성 시험(실제 외부 요청 0회)' } };
    },
    confirm({ ack, approval }) {
      const g = guard(['CONFIRMING']); if (!g.ok) return g;
      if (ack !== true) return { ok: false, code: 'NO_ACK', reason: '확인 체크 필요' };
      const errs = RUN.validateApproval(approval, clock.today()); if (errs.length) return { ok: false, code: 'BAD_APPROVAL', reason: errs.join('; ') };
      if (!day(approval.expiresAt)) return { ok: false, code: 'BAD_APPROVAL', reason: '모바일 승인은 만료일(expiresAt) 필수' };
      if (String(approval.basDt) !== st.plan.basDt) return { ok: false, code: 'BAD_APPROVAL', reason: '승인 기준일과 조회 기준일이 다름' };
      if (approval.maxCalls < st.plan.maxCalls) return { ok: false, code: 'BAD_APPROVAL', reason: '승인 호출 한도가 요청보다 작음' };
      st.approval = { basDt: approval.basDt, maxCalls: Math.min(approval.maxCalls, st.plan.maxCalls, MOBILE_MAX_CALLS), expiresAt: approval.expiresAt, scope: approval.scope };
      st.budget = st.approval.maxCalls; st.state = 'APPROVED'; return { ok: true, budget: st.budget };
    },
    async run() { return exec(false); },
    async resume() { return exec(true); },
    cancel() { if (!sessionOk()) return guard(); if (st.running) { st.cancelRequested = true; return { ok: true, note: '진행 중 호출이 끝나면 중단' }; } st.state = 'CANCELLED'; st.approval = null; return { ok: true }; },
    getView() { return view(); }
  };
  async function exec(isResume) {
    const g = guard(isResume ? ['PARTIAL'] : ['APPROVED']); if (!g.ok) return g;
    if (st.running) return { ok: false, code: 'ALREADY_RUNNING', reason: '이미 실행 중(중복 누르기 무시)' };
    if (st.approval && st.approval.expiresAt < clock.today()) { st.state = 'BLOCKED'; st.reason = '승인 만료'; st.approval = null; return { ok: false, code: 'APPROVAL_EXPIRED', reason: st.reason }; }
    if (REAL_CALLS_ALLOWED !== false || !transport || transport.isSynthetic !== true) { st.state = 'BLOCKED'; st.reason = '실제 외부 요청은 이번 단계에서 차단됨(합성 transport만 허용)'; st.approval = null; return { ok: false, code: 'REAL_TRANSPORT_BLOCKED', reason: st.reason }; }
    const remaining = st.budget - st.used; if (remaining < 1) { st.state = 'BLOCKED'; st.reason = '승인된 호출 한도 소진'; return { ok: false, code: 'BUDGET_EXHAUSTED', reason: st.reason }; }
    st.running = true; st.cancelRequested = false; st.state = 'RUNNING';
    let res;
    try {
      res = await RUN.runPlan({ basDt: st.plan.basDt, maxCalls: remaining, key: undefined, transport: async (r) => { if (st.cancelRequested) throw new Error('cancelled'); st.syntheticRequests++; return transport(r); }, wait: wait || (async () => {}), sha256, queriedAt: clock.today(), origin: 'fixture', resume: isResume ? st.resume : null, resultType: 'xml', maxRetries: 0 });
    } catch (e) { st.diagnostic = String(e && e.message).slice(0, 120); res = { status: 'failed', reason: '내부 오류', transportCalls: 0, attempts: [], missingPages: [], warnings: [] }; }
    st.running = false; st.used += res.transportCalls || 0; st.attempts = res.attempts || [];
    if (!sessionOk()) { st.state = 'LOCKED'; st.reason = '실행 중 관리자 세션 만료'; return { ok: false, code: 'NOT_ADMIN', reason: st.reason }; }
    if (res.status === 'complete') {
      const cmp = K.compareCandidates(universe(), res.listing, { today: clock.today(), expectedBaseDate: isoOf(st.plan.basDt) }), s = ST.toStates(cmp);
      const logObj = { summary: { status: 'complete', reason: null, acquisition: 'fixture', transportCalls: st.used, attempts: res.attempts, missingPages: [], warnings: res.warnings, verifierVersion: res.verifierVersion, queriedAt: clock.today(), basDt: st.plan.basDt, totals: s.totals, fixtureMatchedNotCounted: cmp.counts.fixtureMatchedNotCounted, realPriceVerifiedCount: 0, actualActiveMonitoredCount: 0 }, entries: s.entries, log: cmp.log };
      st.result = { share: SH.buildShareSummary(logObj), totals: s.totals }; st.state = 'DONE'; st.reason = null; st.approval = null; st.resume = null;
      return { ok: true, status: 'DONE' };
    }
    if (res.status === 'partial' && res.resume && st.budget - st.used > 0) { st.resume = res.resume; st.state = 'PARTIAL'; st.reason = res.reason; return { ok: false, code: 'PARTIAL', reason: res.reason }; }
    st.state = res.status === 'blocked' ? 'BLOCKED' : 'FAILED'; st.reason = res.reason || (res.attempts.length ? '실패: ' + res.attempts[res.attempts.length - 1].category : '실패'); st.approval = null; st.resume = null;
    return { ok: false, code: st.state, reason: st.reason };
  }
  function view() {
    const real = { officialVerified: 0, realPriceChecked: 0, activeMonitoring: 0, realApiRequests: 0 };
    return { state: st.state, reason: st.reason, dataLabel: '합성 시험', notice: NOTICE, plan: st.plan, callsUsed: st.used, callsBudget: st.budget, syntheticRequests: st.syntheticRequests,
      result: st.result ? { dataLabel: '합성 시험', basDt: st.result.share.basDt, source: st.result.share.source, queriedAt: st.result.share.queriedAt, totals: st.result.totals, note: '합성 응답 결과이며 어떤 종목도 공식 검증(VERIFIED)으로 인정되지 않음' } : null,
      shareSummary: st.result ? st.result.share : null, diagnostic: st.diagnostic || null, ...real, missingPages: st.resume ? st.resume.missing.slice() : [] };
  }
  return api;
}
module.exports = { REAL_CALLS_ALLOWED, MOBILE_MAX_CALLS, ADMIN_MAX_SESSION_MS, NOTICE, createFlow };
