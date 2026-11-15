/* 위대한 기업(장기보유 판단) — 순수 평가 엔진. 네트워크·저장소·주문·계좌 기록 접근 없음.
 * ORDER GPT-20261115-1326 2단계(GPT-REVIEW-great-companies-20261115-1431 반영: 매수 검토 게이트 닫힘·종목/기준시각 정합성·자본배분 같은 기간). 입력 계약 hasGreatCompanyInput.v1 → 출력 hasGreatCompanyAssessment.v1.
 * 목적: '보유할 이유'와 '보유 논리 훼손 신호'를 근거·반론·출처·기준일과 함께 보여 준다. 매수·매도 권유를 만들지 않는다.
 * 상태: priority(장기보유 우선 검토) / recheck(경쟁력 재점검) / erosion(보유 논리 훼손 우려) / hold(판단 보류).
 * 상태는 총점이 아니라 규칙으로 정한다. 참고 점수는 표시만 하며 결정에 쓰지 않는다.
 * 모든 임계값은 제안값이며 백테스트·실제 공시로 검증되지 않았다(미검증). 최종 결정은 순태씨. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./fundamental-filter.js'));
  else root.HASGreatCompanies = factory(root.HASFundamentalFilter || null);
})(typeof window !== 'undefined' ? window : this, function (F) {
  'use strict';
  var VERSION = 'has-great-companies-v1', IN_SCHEMA = 'hasGreatCompanyInput.v1', OUT_SCHEMA = 'hasGreatCompanyAssessment.v1', DAY = 86400000;
  var T = Object.freeze({
    qualMaxAgeDays: 365,          // 정성 확인일(경쟁우위·자본배분) 유효 기간
    priceFundGapDays: 456,        // 가격 기준일과 재무 결산일 차이 한도(약 15개월)
    priceStaleDays: 7,            // 가격 기준일이 이보다 오래되면 가격 신호 판단 보류
    fearDrawdown: -20,            // 곡소리 후보(52주 고점 대비)
    euphoriaDrawdown: -5,         // 고점권(환호성 후보) — 가격 위치일 뿐 과열 판단 아님
    taxRate: 0.21,                // ROIC 근사 세율 가정(미국 연방 법정세율)
    roicGood: 0.12, roicBad: 0.06,
    revCagrGood: 0.05,
    marginStdevWarn: 0.08,        // 영업이익률 5년 표준편차(8%p 초과 시 우위 불안정 주의)
    marginErosion: 0.05,          // 3년 연속 하락 + 누적 5%p 초과 → 장기 훼손 흔적
    dilutionWarn: 0.03, dilutionFail: 0.10,
    payoutOverFcf: 1.5,           // 자사주+배당이 FCF 합계의 1.5배 초과 → 차입 환원 의심(주의)
    valHighPct: 0.8, valLowPct: 0.2,
    weightLimit: 10, convictionLimit: 25,
    futureSkewMs: 10 * 60000,     // 평가 시각보다 미래인 기준시각 허용 오차(시계 차이 10분)
    valMaxAgeDays: 31             // 밸류에이션 기준일이 이보다 오래되면 밸류에이션 판단 보류
  });
  var VAL_METRICS = { 'PER': 1, 'PBR': 1, 'PSR': 1, 'P/FCF': 1, 'EV/EBIT': 1, 'EV/EBITDA': 1 };
  /* 매수 검토 게이트: 실제 검증된 밸류에이션 + 4단계 사전 조사(뉴스·실적/공시·컨센서스·커뮤니티) 계약이 연결되기 전까지 항상 닫힘.
   * 이 단계 엔진은 '분할매수 검토 대상'을 만들지 않는다(합성 입력이어도). 가격·가치 관계는 scenario(설명용 가상 분석)로만 보여 준다. */
  var BUY_GATE_MISSING = ['실제 검증된 밸류에이션 출처·기준일', '4단계 사전 조사(뉴스·실적/공시·컨센서스·커뮤니티) 출처·기준일'];
  /* 매도·축소 검토 게이트: 같은 이유로 항상 닫힘. 고점권은 가격 위치 신호(signal·signals)일 뿐이고, 비중 초과·고평가(입력 미검증)만 위험 근거(riskBasis·riskWarning)로 표시하며
   * 화면용 opinion은 '점검 필요'/'판단 보류'/'보유 지속 검토'에 머문다. 축소 관계 설명은 scenario에서만. */
  /* priceRelation 경고 소비 계약(GPT-REVIEW-great-companies-20261115-1630):
   *  - signal/signals: 가격 위치(곡소리 'fear'·환호성 'euphoria'·'stale')와 표시 라벨. 가격 위치만으로는 경고가 아니다
   *    (환호성은 매도 신호가 아니며 위대한 기업은 고점권에서도 장기 보유할 수 있다).
   *  - riskWarning + riskBasis[]: 가격과 독립된 위험 근거가 있을 때만 true. kind 'concentration'(비중 한도 초과),
   *    'valuation'(밸류에이션 높은 편 — 이 단계 입력은 항상 verified:false, 검증된 고평가 아님).
   *  - warning(= businessWarning): 경쟁력·보유 논리 훼손 우려(state 'erosion'). riskWarning과 별개라 둘 중 하나만 true일 수 있다.
   *    화면은 warning 또는 riskWarning 중 하나라도 true면 주의 표시를 하고, 각 문구(warningText·riskBasis)를 따로 보여 준다. */
  var SELL_GATE_MISSING = ['실제 검증된 밸류에이션 출처·기준일', '매도 전 4단계 조사(뉴스·실적/공시·컨센서스·커뮤니티) 출처·기준일', '비용·세금·재진입 분석'];
  function gates() { return { buyGate: { open: false, missing: BUY_GATE_MISSING.slice() }, sellGate: { open: false, missing: SELL_GATE_MISSING.slice() } }; }
  var STATE_KO = { priority: '장기보유 우선 검토', recheck: '경쟁력 재점검', erosion: '보유 논리 훼손 우려', hold: '판단 보류' };
  var STATE_RANK = { priority: 3, recheck: 2, hold: 1, erosion: 0 };
  var DOMAINS = [
    { id: 'moat', no: 1, name: '지속 경쟁우위' },
    { id: 'growth', no: 2, name: '장기 성장·잉여현금흐름' },
    { id: 'returns', no: 3, name: '수익성·ROIC·자본효율' },
    { id: 'balance', no: 4, name: '부채·유동성·재무안정' },
    { id: 'capital', no: 5, name: '경영진·자본배분' },
    { id: 'durability', no: 6, name: '5~10년 지속가능성·훼손 위험' }
  ];
  var STATUS_KO = { pass: '양호', warn: '주의', fail: '취약', unverified: '미확인', na: '제외' };
  var LOGIC = { maintained: 1, weakened: 1, broken: 1 };
  /* 화면에 나가면 안 되는 표현(주문·확정 추천). 엔진 출력 전체를 검사한다. */
  var BANNED = /자동\s*(매수|매도|주문)|주문(을)?\s*실행|매수하세요|매도하세요|사세요|파세요|강력\s*추천|확정|무조건/;

  function plain(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function num(x) { return typeof x === 'number' && Number.isFinite(x); }
  function day(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s; }
  function iso(s) { return typeof s === 'string' && (day(s) || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(s)) && Number.isFinite(Date.parse(day(s) ? s + 'T00:00:00Z' : s)); }
  function ms(s) { return Date.parse(day(s) ? s + 'T00:00:00Z' : s); }
  function str(x, max) { return typeof x === 'string' && x.length > 0 && x.length <= (max || 500); }
  function pct(x) { return Math.round(x * 1000) / 10; }
  function r1(x) { return Math.round(x * 10) / 10; }
  function avg(a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; }
  function stdev(a) { var m = avg(a); return Math.sqrt(avg(a.map(function (x) { return (x - m) * (x - m); }))); }
  function key(c) { return c.market + ':' + c.ticker; }

  /* ── 입력 검증: 형식 오류는 예외 대신 errors[] ── */
  function validateInput(x) {
    var e = [];
    if (!plain(x)) return { ok: false, errors: ['입력이 객체가 아님'] };
    if (x.schema !== IN_SCHEMA) e.push('schema 불일치');
    var c = x.company;
    if (!plain(c)) e.push('company 없음');
    else {
      if (typeof c.ticker !== 'string' || !/^[A-Z0-9][A-Z0-9.\-]{0,11}$/.test(c.ticker)) e.push('ticker 형식');
      if (c.market !== 'US' && c.market !== 'KR') e.push('market은 US/KR');
      if (c.listType !== 'holding' && c.listType !== 'watch') e.push('listType은 holding/watch');
      if (c.kind !== undefined && c.kind !== 'company' && c.kind !== 'etf') e.push('kind는 company/etf');
      if (c.name !== undefined && c.name !== null && !str(c.name, 120)) e.push('name 형식');
    }
    if (x.thesis !== undefined && x.thesis !== null) {
      var t = x.thesis;
      if (!plain(t)) e.push('thesis 형식');
      else {
        if (t.logicState !== undefined && t.logicState !== null && !LOGIC[t.logicState]) e.push('logicState 값');
        if (t.nextCheckDate !== undefined && t.nextCheckDate !== null && !day(t.nextCheckDate)) e.push('nextCheckDate 날짜');
        ['moat', 'capital'].forEach(function (k) {
          var q = t[k];
          if (q === undefined || q === null) return;
          if (!plain(q) || !str(q.text, 500) || !day(q.confirmedAt) || !Array.isArray(q.sourceRefs) || !q.sourceRefs.every(function (s) { return str(s, 300); })) e.push('thesis.' + k + ' 형식(text·confirmedAt·sourceRefs)');
        });
        if (t.checkpoints !== undefined && (!Array.isArray(t.checkpoints) || !t.checkpoints.every(function (s) { return str(s, 300); }))) e.push('checkpoints 형식');
      }
    }
    if (x.price !== undefined && x.price !== null) {
      var p = x.price;
      if (!plain(p) || !iso(p.asOf) || !num(p.drawdownPct) || p.drawdownPct > 0 || p.drawdownPct < -100) e.push('price 형식(asOf·drawdownPct 0~-100)');
      else {
        if (p.weightPct !== undefined && p.weightPct !== null && (!num(p.weightPct) || p.weightPct < 0 || p.weightPct > 100)) e.push('weightPct 0~100');
        if (p.conviction !== undefined && p.conviction !== null && typeof p.conviction !== 'boolean') e.push('conviction 형식');
      }
    }
    if (x.valuation !== undefined && x.valuation !== null) {
      var v = x.valuation;
      if (!plain(v) || !VAL_METRICS[v.metric] || !num(v.current) || !day(v.asOf) || !Array.isArray(v.history) || v.history.length < 3 || !v.history.every(num) || typeof v.ticker !== 'string' || !str(v.source, 300)) e.push('valuation 형식(ticker·metric 허용 목록·current·asOf·source·history 3개 이상)');
    }
    if (x.capitalAllocation !== undefined && x.capitalAllocation !== null) {
      var ca = x.capitalAllocation, prev = null;
      if (!Array.isArray(ca) || !ca.every(function (r) {
        var ok = plain(r) && day(r.end) && (prev === null || r.end < prev) && ['buybacks', 'dividends', 'acquisitions', 'dilutedShares'].every(function (k) { return r[k] === null || r[k] === undefined || (num(r[k]) && r[k] >= 0); });
        if (ok) prev = r.end; return ok;
      })) e.push('capitalAllocation 형식(최근→과거, 0 이상 숫자)');
    }
    if (x.fundamental !== undefined && x.fundamental !== null && F && !F.validNormalized(x.fundamental) && !(plain(x.fundamental) && x.fundamental.ok === false)) e.push('fundamental 형식(재무 필터 normalize 결과 아님)');
    if (x.previous !== undefined && x.previous !== null && (!plain(x.previous) || !STATE_KO[x.previous.state] || !plain(x.previous.domains) || !iso(x.previous.evaluatedAt))) e.push('previous 형식');
    return { ok: e.length === 0, errors: e };
  }

  function domain(d, status, evidence, counter, sources, unknowns, numericFail) {
    return { id: d.id, no: d.no, name: d.name, status: status, statusKo: STATUS_KO[status], evidence: evidence, counter: counter, sources: sources || [], unknowns: unknowns || [], numericFail: !!numericFail };
  }
  function fsrc(fa) { return fa && fa.asOf ? [{ kind: 'SEC 연간 공시(XBRL, 재무 필터 경유)', ref: (fa.ticker || '') + ' 10-K', asOf: fa.asOf, filed: fa.filed || null }] : []; }
  function qsrc(q, label) { return q.sourceRefs.map(function (s) { return { kind: label, ref: s, asOf: q.confirmedAt }; }); }
  function qualFresh(q, now) { return !!q && now - ms(q.confirmedAt) <= T.qualMaxAgeDays * DAY && ms(q.confirmedAt) <= now + DAY && q.sourceRefs.length > 0; }
  function chk(fa, id) { return fa && Array.isArray(fa.checks) ? fa.checks.filter(function (c) { return c.id === id; })[0] || null : null; }

  /* ── 6영역 평가 ── */
  function evalDomains(x, fa, now) {
    var years = x.fundamental && x.fundamental.ok && Array.isArray(x.fundamental.years) ? x.fundamental.years : [];
    var src = fsrc(fa), th = plain(x.thesis) ? x.thesis : null, out = [];
    // 1 경쟁우위: 수치는 '흔적'만. 정성 확인(출처·확인일) 없으면 pass 불가.
    (function () {
      var d = DOMAINS[0], m = years.filter(function (r) { return num(r.operatingIncome) && num(r.revenue) && r.revenue > 0; }).map(function (r) { return r.operatingIncome / r.revenue; });
      var q = th && th.moat, ev = [], un = [], erosion = false, unstable = false;
      if (m.length >= 4) {
        var falling = m[0] < m[1] && m[1] < m[2] && m[2] < m[3], drop = m[3] - m[0];
        erosion = falling && drop > T.marginErosion; unstable = stdev(m) > T.marginStdevWarn;
        ev.push('영업이익률 ' + m.length + '년: 최근 ' + pct(m[0]) + '% · 최저 ' + pct(Math.min.apply(null, m)) + '% · 표준편차 ' + pct(stdev(m)) + '%p' + (erosion ? ' · 3년 연속 하락(누적 ' + pct(drop) + '%p)' : ''));
      } else un.push('영업이익률 4년 이상 자료 없음');
      if (erosion) return out.push(domain(d, 'fail', ev.join(' / ') + ' — 경쟁우위 장기 훼손 흔적', '업황 순환·가격 정책 변경 등 일시 요인일 수 있습니다. 정성 확인 필요.', src.concat(q ? qsrc(q, '순태씨 확인 기록') : []), un, true));
      if (!qualFresh(q, now)) { un.push(q ? '정성 확인일 ' + q.confirmedAt + ' — 12개월 경과 또는 출처 없음' : '경쟁우위 정성 확인(출처·확인일) 없음'); return out.push(domain(d, 'unverified', (ev.join(' / ') || '수치 흔적 없음') + ' — 수치만으로 경쟁우위를 판정하지 않음', '정성 근거(사업보고서·10-K 사업 설명 등) 확인 전입니다.', src, un)); }
      ev.unshift('정성: ' + q.text + ' (확인 ' + q.confirmedAt + ')');
      out.push(domain(d, unstable ? 'warn' : 'pass', ev.join(' / '), unstable ? '이익률 변동이 커 우위가 가격 결정력으로 이어지는지 불확실합니다.' : '정성 기록은 순태씨 판단이며 앱이 사실 여부를 검증하지 않습니다.', src.concat(qsrc(q, '순태씨 확인 기록')), un));
    })();
    // 2 장기 성장·FCF
    (function () {
      var d = DOMAINS[1], rv = years.filter(function (r) { return num(r.revenue) && r.revenue > 0; });
      var fc = years.filter(function (r) { return num(r.ocf) && num(r.capex); }).map(function (r) { return r.ocf - r.capex; });
      if (rv.length < 3 || fc.length < 3) return out.push(domain(d, 'na', '매출 또는 FCF 자료 3년 미만', '자료가 없어 판정에서 제외했습니다.', src, ['매출·FCF 3년']));
      var n = rv.length - 1, cagr = Math.pow(rv[0].revenue / rv[n].revenue, 1 / n) - 1, fcfUp = fc[0] >= fc[fc.length - 1], fcfPos = fc[0] > 0;
      var st = cagr >= T.revCagrGood && fcfPos && fcfUp ? 'pass' : cagr < 0 && !fcfPos ? 'fail' : cagr < 0 && !fcfUp ? 'fail' : 'warn';
      out.push(domain(d, st, '매출 ' + n + '년 연평균 ' + (cagr >= 0 ? '+' : '') + pct(cagr) + '% · 최근 FCF ' + (fcfPos ? '흑자' : '적자') + ' · FCF ' + (fcfUp ? '유지·증가' : '감소') + ' (제안 기준: 매출 연 5% 이상 + FCF 흑자·유지)', '성장 둔화는 일시적일 수 있고, 투자 확대기엔 FCF가 줄 수 있습니다.', src, [], st === 'fail'));
    })();
    // 3 수익성·ROIC(근사)
    (function () {
      var d = DOMAINS[2], ro = years.filter(function (r) { return num(r.operatingIncome) && num(r.equity) && num(r.debt) && num(r.cash) && r.equity + r.debt - r.cash > 0; }).map(function (r) { return r.operatingIncome * (1 - T.taxRate) / (r.equity + r.debt - r.cash); });
      var roe = chk(fa, 'roe');
      if (ro.length < 3) {
        if (roe && roe.status !== 'na') return out.push(domain(d, roe.status, 'ROIC 계산 자료 부족 → 재무 필터 ROE로 대신: ' + roe.evidence, roe.counter, src, ['ROIC(투하자본) 3년'], roe.status === 'fail'));
        return out.push(domain(d, 'na', 'ROIC·ROE 자료 부족', '자료가 없어 판정에서 제외했습니다.', src, ['ROIC 3년']));
      }
      var lo = Math.min.apply(null, ro), st = lo >= T.roicGood ? 'pass' : ro[0] < T.roicBad ? 'fail' : 'warn';
      out.push(domain(d, st, 'ROIC 근사 ' + ro.length + '년: 최근 ' + pct(ro[0]) + '% · 최저 ' + pct(lo) + '% (영업이익×(1−세율 21% 가정) ÷ (자본+장기부채−현금), 제안 기준: 최저 12% 이상 양호·최근 6% 미만 취약)', '세율 가정·리스부채 제외로 실제 ROIC와 다를 수 있습니다(근사).', src, [], st === 'fail'));
    })();
    // 4 재무안정: 재무 필터 안정성·이자보상 재사용
    (function () {
      var d = DOMAINS[3], a = [chk(fa, 'leverage'), chk(fa, 'interest')].filter(function (c) { return c && c.status !== 'na'; });
      if (!a.length) return out.push(domain(d, 'na', '부채·이자 판정 자료 없음', '자료가 없어 판정에서 제외했습니다.', src, ['순부채·이자보상']));
      var st = a.some(function (c) { return c.status === 'fail'; }) ? 'fail' : a.some(function (c) { return c.status === 'warn'; }) ? 'warn' : 'pass';
      out.push(domain(d, st, a.map(function (c) { return c.name + ' ' + STATUS_KO[c.status] + ': ' + c.evidence; }).join(' / '), a.map(function (c) { return c.counter; }).join(' '), src, [], st === 'fail'));
    })();
    // 5 경영진·자본배분: 희석·환원 재원 수치 + 정성 확인
    (function () {
      var d = DOMAINS[4], ca = Array.isArray(x.capitalAllocation) ? x.capitalAllocation : [], q = th && th.capital, ev = [], un = [], st = null;
      var sh = ca.filter(function (r) { return num(r.dilutedShares) && r.dilutedShares > 0; });
      if (sh.length >= 3) {
        var dil = sh[0].dilutedShares / sh[sh.length - 1].dilutedShares - 1;
        ev.push('희석주식수 ' + (sh.length - 1) + '년 변화 ' + (dil >= 0 ? '+' : '') + pct(dil) + '%');
        if (dil > T.dilutionFail) st = 'fail'; else if (dil > T.dilutionWarn) st = 'warn';
      } else un.push('주식 수 3년 자료 없음');
      // 분자(환원)·분모(FCF)는 같은 결산일(교집합) 연도만 합산한다. 환원 항목이 빈 연도도 제외.
      var fy = {}; years.forEach(function (r) { if (num(r.ocf) && num(r.capex)) fy[r.end] = r.ocf - r.capex; });
      var both = ca.filter(function (r) { return Object.prototype.hasOwnProperty.call(fy, r.end) && (num(r.buybacks) || num(r.dividends)); });
      var fcfSum = both.reduce(function (s, r) { return s + fy[r.end]; }, 0);
      var payout = both.reduce(function (s, r) { return s + (num(r.buybacks) ? r.buybacks : 0) + (num(r.dividends) ? r.dividends : 0); }, 0);
      if (both.length >= 3 && fcfSum > 0) { ev.push('자사주+배당 = FCF 합계의 ' + r1(payout / fcfSum) + '배(같은 결산 ' + both.length + '년 ' + both[both.length - 1].end.slice(0, 4) + '~' + both[0].end.slice(0, 4) + ')'); if (payout / fcfSum > T.payoutOverFcf && st !== 'fail') st = 'warn'; }
      else if (both.length >= 3 && fcfSum <= 0 && payout > 0) { ev.push('FCF 합계 0 이하인데 주주환원 지출(같은 결산 ' + both.length + '년)'); if (st !== 'fail') st = 'warn'; }
      else if (ca.length) un.push('환원·FCF 같은 결산 연도 3년 미만(' + both.length + '년) — 환원 비율 판단 보류');
      var csrc = ca.length ? [{ kind: '자본배분 합성/공시 입력', ref: 'capitalAllocation ' + ca.length + '년', asOf: ca[0].end }] : [];
      if (st === 'fail') return out.push(domain(d, 'fail', ev.join(' / ') + ' — 주주가치 희석 큼(제안 기준 10% 초과)', '스톡옵션·인수 대가일 수 있어 사업상 정당성 확인이 필요합니다.', csrc, un, true));
      if (!qualFresh(q, now)) { un.push(q ? '자본배분 정성 확인 12개월 경과 또는 출처 없음' : '경영진·자본배분 정성 확인(출처·확인일) 없음'); return out.push(domain(d, 'unverified', (ev.join(' / ') || '수치 자료 없음') + ' — 정성 확인 전', '경영진 판단의 질은 수치만으로 알 수 없습니다.', csrc, un)); }
      ev.unshift('정성: ' + q.text + ' (확인 ' + q.confirmedAt + ')');
      out.push(domain(d, st || 'pass', ev.join(' / '), st === 'warn' ? '환원이 현금창출을 넘으면 차입에 의존했을 수 있습니다.' : '정성 기록은 순태씨 판단이며 앱이 사실 여부를 검증하지 않습니다.', csrc.concat(qsrc(q, '순태씨 확인 기록')), un));
    })();
    // 6 지속가능성: 투자논리 상태·점검일
    (function () {
      var d = DOMAINS[5], s = th ? [{ kind: '순태씨 투자논리 기록', ref: (x.company.ticker) + ' thesis', asOf: th.nextCheckDate || null }] : [];
      if (!th || !th.logicState) return out.push(domain(d, 'unverified', '투자논리 상태 기록 없음', '보유 논리를 적어 두지 않으면 훼손 여부를 점검할 수 없습니다.', s, ['투자논리 상태']));
      var overdue = day(th.nextCheckDate) && ms(th.nextCheckDate) < now - DAY / 2, br = str(th.logicBreak, 500) ? ' · 붕괴 조건: ' + th.logicBreak : '';
      if (th.logicState === 'broken') return out.push(domain(d, 'fail', '투자논리 붕괴로 기록됨' + br, '기록 이후 상황이 바뀌었을 수 있습니다. 최신 확인 필요.', s, []));
      if (th.logicState === 'weakened') return out.push(domain(d, 'warn', '투자논리 일부 약화로 기록됨' + br, '약화가 일시적인지 구조적인지 확인이 필요합니다.', s, overdue ? ['점검일 ' + th.nextCheckDate + ' 경과'] : []));
      if (overdue) return out.push(domain(d, 'unverified', '투자논리 유지로 기록됐으나 점검일 ' + th.nextCheckDate + ' 경과', '점검일이 지나 현재도 유지인지 알 수 없습니다.', s, ['점검일 경과']));
      out.push(domain(d, (th.checkpoints || []).length ? 'pass' : 'warn', '투자논리 유지' + br + ((th.checkpoints || []).length ? ' · 점검 항목 ' + th.checkpoints.length + '개' : ' · 점검 항목 없음'), '순태씨 기록 기반이며 외부 검증이 아닙니다.', s, []));
    })();
    return out;
  }

  function valuationBand(v, now) {
    // GPT-REVIEW-great-companies-20261115-1830: unknown 사유를 구분(missing = 입력 없음, stale = 입력은 있으나 기준일 오래됨).
    if (!plain(v)) return { band: 'unknown', reason: 'missing', text: '고평가 판단 보류(밸류에이션 미연결)' };
    if (num(now) && now - ms(v.asOf) > T.valMaxAgeDays * DAY) return { band: 'unknown', reason: 'stale', text: v.metric + ' 기준일 ' + v.asOf + ' — ' + T.valMaxAgeDays + '일 초과로 밸류에이션 판단 보류' };
    var all = v.history.slice().sort(function (a, b) { return a - b; }), below = all.filter(function (h) { return h < v.current; }).length, p = below / all.length;
    var band = p >= T.valHighPct ? 'high' : p <= T.valLowPct ? 'low' : 'mid';
    return { band: band, reason: 'unverified', pctRank: Math.round(p * 100), text: v.metric + ' ' + v.current + ' — 자기 과거 ' + all.length + '개 값 중 하위 ' + Math.round(p * 100) + '% 위치(' + { high: '높은 편', low: '낮은 편', mid: '중간' }[band] + ', ' + v.asOf + ')' };
  }

  function relate(state, x, fa, val, now) {
    var p = plain(x.price) ? x.price : null, res = { signal: 'none', signals: [], text: '', opinion: state === 'priority' ? '보유 지속 검토' : state === 'recheck' || state === 'erosion' ? '점검 필요' : '판단 보류', warning: state === 'erosion', businessWarning: state === 'erosion', warningText: state === 'erosion' ? '경쟁력·보유 논리 훼손 우려 — 가격 신호와 별개로 점검 필요' : null, riskWarning: false, riskBasis: [], conflicts: [], valuation: val, scenario: null }, g = gates();
    res.buyGate = g.buyGate; res.sellGate = g.sellGate;
    if (val.band === 'high') { res.riskWarning = true; res.riskBasis.push({ kind: 'valuation', verified: false, text: '밸류에이션 높은 편(입력 미검증 — 검증된 고평가 아님): ' + val.text, source: plain(x.valuation) ? (str(x.valuation.source, 200) ? x.valuation.source : '출처 표기 없음') : null }); }
    if (!p) { res.text = '가격 신호 없음(가격 미연결)'; if (val.band === 'high') res.signals.push('밸류에이션 높은 편(입력 미검증)'); return res; }
    var limit = p.conviction === true ? T.convictionLimit : T.weightLimit, over = num(p.weightPct) && p.weightPct > limit;
    if (over) { res.riskWarning = true; res.riskBasis.push({ kind: 'concentration', verified: false, text: '비중 ' + r1(p.weightPct) + '% > 한도 ' + limit + '%' + (p.conviction ? '(확신 종목)' : '') + ' — 집중위험(포트폴리오 비중 입력 기준)', source: '포트폴리오 비중 입력(' + p.asOf.slice(0, 10) + ')' }); }
    if (now - ms(p.asOf) > T.priceStaleDays * DAY) {
      res.text = '가격 기준일 ' + p.asOf.slice(0, 10) + ' — 오래되어 가격 신호 판단 보류'; res.signal = 'stale';
      if (val.band === 'high') res.signals.push('밸류에이션 높은 편(입력 미검증)');
      if (over) { res.signals.push('비중 ' + r1(p.weightPct) + '% > 한도 ' + limit + '%' + (p.conviction ? '(확신 종목)' : '') + ' (가격 기준일 오래됨)'); res.text += ' · 위험 신호: 비중 한도 초과 — 점검 필요(매도 검토 아님)'; if (res.opinion === '보유 지속 검토') res.opinion = '점검 필요'; }
      return res;
    }
    res.signal = p.drawdownPct <= T.fearDrawdown ? 'fear' : p.drawdownPct >= T.euphoriaDrawdown ? 'euphoria' : 'none';
    if (res.signal !== 'none') res.signals.push(res.signal === 'fear' ? '가격 하락(52주 고점 대비 ' + r1(p.drawdownPct) + '%)' : '고점권(52주 고점 대비 ' + r1(p.drawdownPct) + '%)');
    if (val.band === 'high') res.signals.push('밸류에이션 높은 편(입력 미검증)');
    if (over) res.signals.push('비중 ' + r1(p.weightPct) + '% > 한도 ' + limit + '%' + (p.conviction ? '(확신 종목)' : ''));
    var lim = ' · 현재 비중 ' + (num(p.weightPct) ? r1(p.weightPct) + '%' : '미상') + ' / 한도 ' + limit + '%';
    if (state === 'erosion') {
      res.text = res.signal === 'fear' ? '곡소리 아님 — 가격 하락과 기업가치 훼손 신호 동시' : res.signal === 'euphoria' ? '상승 중이지만 경쟁력 훼손 신호 — 점검 필요' : '보유 논리 훼손 우려 — 점검 필요';
      return res;
    }
    if (state !== 'priority') { res.text = res.signal === 'fear' ? '판단 보류 — 경쟁력 확인 먼저(가격 하락만으로 매수 검토하지 않음)' : res.signal === 'euphoria' ? '판단 보류 — 경쟁력 확인 먼저(가격 상승만으로 매도 검토하지 않음)' : STATE_KO[state] + ' — 가격 신호 없음'; return res; }
    // priority
    if (res.signal === 'fear' && (val.band === 'high' || over)) {
      res.conflicts = ['곡소리(가격 하락)', val.band === 'high' ? '밸류에이션 높은 편' : null, over ? '비중 한도 초과' : null].filter(Boolean);
      res.opinion = '판단 보류'; res.text = '신호 상충 — ' + res.conflicts.join(' · ') + ' — 판단 보류(근거 각각 확인)' + lim; return res;
    }
    if (res.signal === 'fear') {
      res.opinion = '판단 보류';
      if (val.band === 'unknown') { res.text = '가격 하락·경쟁력 유지 근거 — ' + (val.reason === 'stale' ? '밸류에이션 기준일 오래됨(' + x.valuation.asOf + ') — 확인 전 판단 보류' : '밸류에이션 확인 전이라 판단 보류(미연결)') + lim; return res; }
      res.text = '가격 하락·경쟁력 유지 근거 — 실제 밸류에이션 검증·4단계 사전 조사 연결 전이라 판단 보류(매수 검토 아님)' + lim;
      res.scenario = '가상 분석(설명용, 입력 미검증): 밸류에이션 ' + { low: '낮은 편', mid: '중간' }[val.band] + ' 입력 기준 — 검증·조사 후에만 곡소리 분할매수 검토 후보가 될 수 있음';
      return res;
    }
    if (over) {
      res.opinion = '점검 필요';
      res.text = '위험 신호: 집중위험(비중 한도 초과)' + (val.band === 'high' ? '·밸류에이션 높은 편(입력 미검증)' : '') + (res.signal === 'euphoria' ? '·고점권' : '') + ' — 점검 필요. 매도 검토 게이트 닫힘(검증 밸류에이션·매도 전 4단계 조사·비용/세금/재진입 분석 미연결), 행동 의견 아님' + lim;
      res.scenario = '가상 분석(설명용, 입력 미검증): 한도 초과분은 검증·조사·세금/비용/재진입 비교 후에만 분할 축소 검토 후보가 될 수 있음(최종 결정 순태씨)';
      return res;
    }
    if (val.band === 'high') { res.opinion = '보유 지속 검토'; res.text = '위험 신호: 밸류에이션 높은 편(입력 미검증) — 경쟁력 유지, 일률 매도 아님(매도 검토 게이트 닫힘, 최종 결정 순태씨)' + lim; return res; }
    // GPT-REVIEW-great-companies-20261115-1730: 경쟁력 지표 평가와 본질가치 평가를 분리. 밸류에이션이 없거나(unknown)
    // 입력이 있어도(low/mid) 미검증이므로 본질가치를 확정하는 문구(시험 VALUE_CONFIRM 목록)를 쓰지 않는다.
    // 1830: 없음(미연결) / 오래됨 / 최신이지만 미검증을 서로 다른 보류 사유로 표시한다.
    res.valuationPending = val.band !== 'unknown' ? '현재 본질가치 대비 평가 미완료(밸류에이션 입력 미검증)'
      : val.reason === 'stale' ? '현재 본질가치 대비 평가 미완료(밸류에이션 기준일 ' + x.valuation.asOf + ' 오래됨 — 확인 전 판단 보류)'
      : '현재 본질가치 대비 평가 미완료(밸류에이션 미연결)';
    res.text = (res.signal === 'euphoria' ? '고점권(가격 위치 신호) · 경쟁력 지표 유지 근거' : '가격 신호 없음 · 경쟁력 지표 유지 근거') + ' — ' + res.valuationPending + ' · 보유 지속 검토(제한된 자료 기준 검토 의견, 매수·매도 판단 아님)' + lim;
    return res;
  }

  function holdOut(x, reason, extra) {
    var c = plain(x) && plain(x.company) ? x.company : {};
    return Object.assign({ schema: OUT_SCHEMA, version: VERSION, ticker: typeof c.ticker === 'string' ? c.ticker.slice(0, 12) : null, market: c.market === 'US' || c.market === 'KR' ? c.market : null, name: typeof c.name === 'string' ? c.name.slice(0, 120) : null,
      state: 'hold', stateKo: STATE_KO.hold, reason: reason, domains: [], reasonsToHold: [], risks: [], changes: [], sources: [], asOf: null, unknowns: [reason], auxScore: { value: null, coveredDomains: 0 },
      priceRelation: { signal: 'none', signals: [], text: '판단 보류 — ' + reason, opinion: '판단 보류', warning: false, businessWarning: false, warningText: null, riskWarning: false, riskBasis: [], conflicts: [], scenario: null, buyGate: gates().buyGate, sellGate: gates().sellGate }, signalHold: true, opinion: '판단 보류', synthetic: !!(plain(x) && x.synthetic) }, extra || {});
  }

  /* ── 단일 종목 평가 ── */
  function assess(x, options) {
    var o = options || {}, now = num(o.now) ? o.now : Date.now();
    var v = validateInput(x);
    if (!v.ok) return finalize(holdOut(x, '입력 형식 오류: ' + v.errors.join(', '), { errors: v.errors }));
    var c = x.company;
    if (c.kind === 'etf') return finalize(holdOut(x, 'ETF — 기업 평가 대상 아님(구성 종목 평가 별도)'));
    if (c.market === 'KR') return finalize(holdOut(x, '국내 기업 재무(DART) 미연결'));
    if (!F) return finalize(holdOut(x, '재무 필터 모듈 없음'));
    if (!x.fundamental) return finalize(holdOut(x, '재무 자료 없음(미연결)'));
    if (!plain(x.fundamental) || x.fundamental.ticker !== c.ticker) return finalize(holdOut(x, '재무 자료 종목 불일치(' + (plain(x.fundamental) && typeof x.fundamental.ticker === 'string' ? x.fundamental.ticker.slice(0, 12) : '식별자 없음') + ' ≠ ' + c.ticker + ')'));
    if (plain(x.valuation) && x.valuation.ticker !== c.ticker) return finalize(holdOut(x, '밸류에이션 자료 종목 불일치'));
    var today = new Date(now).toISOString().slice(0, 10);
    if (plain(x.price) && ms(x.price.asOf) > now + T.futureSkewMs) return finalize(holdOut(x, '가격 기준시각이 평가 시각보다 미래'));
    if (plain(x.valuation) && x.valuation.asOf > today) return finalize(holdOut(x, '밸류에이션 기준일이 평가일보다 미래'));
    if (x.fundamental.ok && !x.fundamental.years.every(function (r) { return r.end <= today && (r.filed === '' || (r.filed >= r.end && r.filed <= today)); })) return finalize(holdOut(x, '재무 결산일·공시일 충돌(미래 또는 결산 전 공시)'));
    if (Array.isArray(x.capitalAllocation) && x.capitalAllocation.some(function (r) { return r.end > today; })) return finalize(holdOut(x, '자본배분 결산일이 평가일보다 미래'));
    var fa = F.assess(x.fundamental, { now: now });
    if (fa.label === 'insufficient') return finalize(holdOut(x, '재무 판정 불가 — ' + (fa.reason || '공시 부족')));
    if (fa.conflicts && fa.conflicts.length) return finalize(holdOut(x, '최근 결산 출처(태그) 값 충돌 ' + fa.conflicts.length + '건 — 근거 확인 전 판단 보류', { conflicts: fa.conflicts }));
    if (plain(x.price) && Math.abs(ms(x.price.asOf) - ms(fa.asOf)) > T.priceFundGapDays * DAY) return finalize(holdOut(x, '가격 기준일과 재무 결산일 차이 15개월 초과'));

    var doms = evalDomains(x, fa, now), by = {};
    doms.forEach(function (d) { by[d.id] = d; });
    var covered = doms.filter(function (d) { return d.status === 'pass' || d.status === 'warn' || d.status === 'fail'; });
    var fails = doms.filter(function (d) { return d.status === 'fail'; }), warns = doms.filter(function (d) { return d.status === 'warn'; });
    var numericFails = doms.filter(function (d) { return d.numericFail; }).length;
    var ls = x.thesis && x.thesis.logicState, qualFail = ls === 'weakened' || ls === 'broken';
    var prevDown = false, changes = [];
    if (plain(x.previous)) {
      doms.forEach(function (d) { var p = x.previous.domains[d.id]; if (typeof p === 'string' && p !== d.status) changes.push('영역 ' + d.no + ' ' + d.name + ': ' + (STATUS_KO[p] || p) + ' → ' + d.statusKo); var rank = { pass: 2, warn: 1, fail: 0 }; if (rank[p] !== undefined && rank[d.status] !== undefined && rank[d.status] < rank[p]) prevDown = true; });
    }
    var state, why;
    // 경고는 숨기지 않는다: 수치·정성 두 종류 이상에서 취약이면 정성 미확인이어도 훼손 우려.
    if (qualFail && numericFails >= 1) { state = 'erosion'; why = '수치 취약 ' + numericFails + '개 + 투자논리 ' + (ls === 'broken' ? '붕괴' : '약화') + ' 기록 — 서로 다른 근거 2종'; }
    else if (numericFails >= 3) { state = 'erosion'; why = '수치 영역 ' + numericFails + '개 취약'; }
    else if (fa.label === 'weak' && numericFails >= 2) { state = 'erosion'; why = '재무 라벨 취약 + 수치 영역 ' + numericFails + '개 취약'; }
    else if (fails.length || qualFail || by.durability.status === 'unverified' && x.thesis && x.thesis.logicState || prevDown) {
      state = 'recheck'; why = [fails.length ? '취약 영역 ' + fails.map(function (d) { return d.no; }).join('·') : null, qualFail ? '투자논리 약화 기록' : null, by.durability.status === 'unverified' && x.thesis && x.thesis.logicState ? '투자논리 점검일 경과' : null, prevDown ? '직전 평가보다 영역 상태 하락' : null].filter(Boolean).join(' · ') + ' — 단일 근거라 훼손 단정하지 않음';
    }
    else if (by.moat.status === 'unverified' || by.capital.status === 'unverified') { state = 'hold'; why = '정성 영역(' + [by.moat.status === 'unverified' ? '1 경쟁우위' : null, by.capital.status === 'unverified' ? '5 자본배분' : null].filter(Boolean).join('·') + ') 미확인 — 수치만으로 장기보유 판단하지 않음'; }
    else if (covered.length < 4) { state = 'hold'; why = '판정 가능 영역 ' + covered.length + '개(4개 미만)'; }
    else if (warns.length <= 1 && fa.label === 'strong') { state = 'priority'; why = '취약 0 · 주의 ' + warns.length + ' · 재무 라벨 우량 근거 충분 · 정성 확인 12개월 이내'; }
    else { state = 'recheck'; why = '주의 ' + warns.length + '개 또는 재무 라벨 ' + fa.labelKo + ' — 장기보유 우선 조건 미충족'; }

    var reasons = doms.filter(function (d) { return d.status === 'pass'; }).slice(0, 3).map(function (d) { return d.name + ': ' + d.evidence; });
    var risks = doms.filter(function (d) { return d.status === 'fail' || d.status === 'warn'; }).map(function (d) { return d.name + '(' + d.statusKo + '): ' + d.evidence; })
      .concat(doms.filter(function (d) { return d.status === 'pass'; }).map(function (d) { return d.name + ' 반론: ' + d.counter; }).slice(0, 2));
    var sources = [], seen = {};
    doms.forEach(function (d) { d.sources.forEach(function (s) { var k = s.kind + '|' + s.ref + '|' + s.asOf; if (!seen[k]) { seen[k] = 1; sources.push(s); } }); });
    if (plain(x.price)) sources.push({ kind: '가격(52주 고점 대비)', ref: c.ticker, asOf: x.price.asOf });
    if (plain(x.valuation)) sources.push({ kind: '밸류에이션 입력', ref: x.valuation.metric, asOf: x.valuation.asOf });
    if (state === 'priority' && (!reasons.length || !risks.length || !sources.length)) { state = 'hold'; why = '근거·반론·출처 중 빠진 것이 있어 판단 보류'; }
    var unknowns = []; doms.forEach(function (d) { d.unknowns.forEach(function (u) { unknowns.push('영역 ' + d.no + ': ' + u); }); });
    var sc = covered.map(function (d) { return d.status === 'pass' ? 100 : d.status === 'warn' ? 50 : 0; });
    var val = valuationBand(x.valuation, now), rel = relate(state, x, fa, val, now);
    if (plain(x.previous) && x.previous.state !== state) changes.unshift('상태: ' + STATE_KO[x.previous.state] + ' → ' + STATE_KO[state] + ' (직전 ' + x.previous.evaluatedAt.slice(0, 10) + ')');
    return finalize({ schema: OUT_SCHEMA, version: VERSION, ticker: c.ticker, market: c.market, name: c.name || fa.name || null, listType: c.listType,
      state: state, stateKo: STATE_KO[state], reason: why, domains: doms.map(function (d) { return { id: d.id, no: d.no, name: d.name, status: d.status, statusKo: d.statusKo, evidence: d.evidence, counter: d.counter, sources: d.sources, unknowns: d.unknowns }; }),
      fundamentalLabel: fa.label, fundamentalLabelKo: fa.labelKo, reasonsToHold: reasons, risks: risks, changes: changes, sources: sources, asOf: fa.asOf, filed: fa.filed, unknowns: unknowns,
      auxScore: { value: sc.length ? Math.round(avg(sc)) : null, coveredDomains: covered.length, note: '참고 점수(' + covered.length + '/6 영역, 동일 가중 · 양호100/주의50/취약0 · 미확인·제외 영역 빠짐) — 상태 결정에 쓰지 않음' },
      priceRelation: rel, signalHold: true, opinion: rel.opinion, synthetic: !!x.synthetic });
  }

  /* 출력 전체 금지어 검사: 걸리면 문구를 버리고 판단 보류로 낮춘다(fail-closed). */
  function finalize(a) {
    if (BANNED.test(JSON.stringify(a))) return holdOut({ company: { ticker: a.ticker, market: a.market } }, '출력 문구 검사 실패 — 표시 차단');
    return Object.freeze(a);
  }

  /* ── 여러 종목 + 메모리 캐시: 같은 JS 인스턴스(페이지가 살아 있는 동안) 안에서만 같은 입력·같은 날짜 재계산 생략.
   * 브라우저 새로고침·앱 재실행은 새 인스턴스라 다시 계산한다. 브라우저 저장소·백업 사용 없음. ── */
  function createEvaluator(opts) {
    var cache = new Map(), max = opts && num(opts.max) ? opts.max : 200, stats = { computed: 0, cacheHits: 0 };
    function evaluate(inputs, options) {
      var o = options || {}, now = num(o.now) ? o.now : Date.now(), dayKey = new Date(now).toISOString().slice(0, 10), seen = {}, out = [];
      (Array.isArray(inputs) ? inputs : []).forEach(function (x) {
        var c = plain(x) && plain(x.company) ? x.company : null;
        if (c && typeof c.ticker === 'string' && typeof c.market === 'string') {
          var k = key(c);
          if (seen[k]) { out.push(finalize(holdOut(x, '중복 종목 입력(' + k + ') — 첫 입력만 평가', { duplicate: true }))); return; }
          seen[k] = 1;
        }
        var ck = dayKey + '|' + JSON.stringify(x);
        if (cache.has(ck)) { stats.cacheHits++; out.push(cache.get(ck)); return; }
        var a = assess(x, { now: now }); stats.computed++;
        if (cache.size >= max) cache.delete(cache.keys().next().value);
        cache.set(ck, a); out.push(a);
      });
      return out;
    }
    return Object.freeze({ evaluate: evaluate, stats: function () { return { computed: stats.computed, cacheHits: stats.cacheHits, size: cache.size }; }, clear: function () { cache.clear(); } });
  }

  return Object.freeze({ VERSION: VERSION, IN_SCHEMA: IN_SCHEMA, OUT_SCHEMA: OUT_SCHEMA, THRESHOLDS: T, STATE_KO: STATE_KO, STATE_RANK: STATE_RANK, DOMAINS: DOMAINS, BANNED: BANNED,
    validateInput: validateInput, assess: assess, createEvaluator: createEvaluator, valuationBand: valuationBand });
});
