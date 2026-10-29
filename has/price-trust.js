(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASPriceTrust = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
/* HAS (stage19): 가격 신뢰도 표시 규칙. 순수 함수 — 저장소·네트워크·타이머·DOM 접근 없음.
   이 표시는 "정확한 가격을 새로 확보했다"는 뜻이 아니다. 출처·기준시각을 확인하지 못한 가격에 그 사실을 붙여 보여줄 뿐이며,
   기존 평가금액·저장된 거래 기록을 바꾸지 않는다. 모르는 값은 항상 '미확인'으로 둔다. */
'use strict';
/* 가격 메타데이터 스키마(모든 필드는 모르면 null → '미확인') */
const SCHEMA = Object.freeze({
  provider: '공급자(이름 또는 "사용자 GAS 웹앱" 등 경로)', fetchedAt: '취득 시각(ISO 8601, UTC)', marketDate: '시장 기준일(YYYY-MM-DD)', timezone: '시장 시간대(IANA)', currency: '통화(USD|KRW)',
  priceKind: '가격 종류: intraday | delayed | regular-close | adjusted-close | unknown', adjusted: '수정주가: none | split | split+dividend | unknown',
  verification: '검증: independent-verified | single-source | unverified | synthetic | manual', status: '상태: ok | stale | error | corporate-action-suspected | date-mismatch | unknown', errorMessage: '오류 문구(있을 때)'
});
const KINDS = ['intraday', 'delayed', 'regular-close', 'adjusted-close', 'unknown'], VERIFS = ['independent-verified', 'single-source', 'unverified', 'synthetic', 'manual'];
const KIND_LABEL = { intraday: '장중', delayed: '지연', 'regular-close': '정규장 종가', 'adjusted-close': '조정 종가', unknown: '가격 종류 미확인' };
const MAX_AGE_DAYS = 4;
const dayOk = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const val = (x, f) => (x == null || x === '' ? '미확인' : (f ? f(x) : String(x)));
/* 앱이 가격을 받는 경로별 "알려진 사실만" 담은 기본 메타(조사: docs/price-flow-audit-stage19.md) */
const KNOWN_SOURCES = Object.freeze({
  'gas-jsonp': { provider: '사용자 지정 GAS 웹앱(JSONP) — 하위 출처 미확인', verification: 'unverified', priceKind: 'unknown', adjusted: 'unknown', marketDate: null, currency: null, fetchedAt: null },
  'yahoo-proxy': { provider: '비공식 야후 주소 + 제3자 중계(allorigins 등)', verification: 'unverified', priceKind: 'unknown', adjusted: 'unknown', marketDate: null, currency: null, fetchedAt: null },
  manual: { provider: '사용자 직접 입력', verification: 'manual', priceKind: 'unknown', adjusted: 'unknown', marketDate: null, currency: null, fetchedAt: null }
});
function ageDays(meta, nowISO) { if (!dayOk(meta && meta.marketDate) || !dayOk(String(nowISO).slice(0, 10))) return null; return Math.floor((Date.parse(String(nowISO).slice(0, 10)) - Date.parse(meta.marketDate)) / 86400000); }
/* 한 가격의 표시 문구와 신호 보류 여부. '실시간'·'공식'·'검증 완료'라는 말은 어떤 경우에도 만들지 않는다. */
function describe(meta, nowISO, opts) {
  const maxAge = (opts && opts.maxAgeDays) || MAX_AGE_DAYS, m = meta || {}, out = { provider: val(m.provider), marketDate: val(m.marketDate), currency: val(m.currency), kind: KIND_LABEL[m.priceKind] || KIND_LABEL.unknown, adjusted: val(m.adjusted), verification: VERIFS.includes(m.verification) ? m.verification : 'unverified', fetchedAt: val(m.fetchedAt), ageDays: ageDays(m, nowISO) };
  const flags = []; let label, severity = 'warn', hold = true;
  if (m.status === 'error') { label = '조회 실패 — 표시된 값은 최신이 아님'; severity = 'error'; flags.push('error'); }
  else if (m.status === 'corporate-action-suspected') { label = '기업행위(분할·배당) 의심 — 가격이 불연속일 수 있음'; flags.push('corporate-action'); }
  else if (m.status === 'date-mismatch') { label = '기준일 불일치 — 다른 날짜의 값이 섞였을 수 있음'; flags.push('date-mismatch'); }
  else if (out.ageDays !== null && out.ageDays > maxAge) { label = '오래된 가격(기준일 ' + m.marketDate + ', ' + out.ageDays + '일 전)'; flags.push('stale'); }
  else if (out.verification === 'synthetic') { label = '합성(시험용) 가격 — 실제 가격 아님'; }
  else if (out.verification === 'manual') { label = '수동 입력 가격 — 출처는 직접 확인 필요'; hold = false; severity = 'info'; }
  else if (out.verification === 'independent-verified' && m.provider && dayOk(m.marketDate) && m.priceKind && m.priceKind !== 'unknown' && m.currency) { label = '독립 대조 완료(' + m.provider + ', 기준일 ' + m.marketDate + ')'; severity = 'ok'; hold = false; }
  else if (out.verification === 'single-source') { label = '단일 출처 가격 — 독립 대조 전'; }
  else { label = '미검증 가격 · 출처·기준시각 확인 필요'; }
  if (!dayOk(m.marketDate) && !flags.length && severity !== 'ok' && out.verification !== 'manual' && out.verification !== 'synthetic') flags.push('no-market-date');
  return Object.assign(out, { label, severity, flags, signalHold: hold, signalNote: hold ? '이 가격으로 만든 매수·매도 신호는 판단 보류(판단 불가)' : '신호 사용 전 출처 확인 권장' });
}
/* 보유 종목 목록의 이번 접속 갱신 현황. fresh = {"US:AAA":true,...}, 종목은 {ticker, market}. 현금성(DEP_) 제외. */
function sessionCounts(stocks, fresh) {
  const held = stocks.filter(s => s && typeof s.ticker === 'string' && s.ticker.indexOf('DEP_') !== 0), f = fresh || {};
  const refreshed = held.filter(s => f[s.market + ':' + s.ticker] === true).length;
  return { total: held.length, refreshed, notRefreshed: held.length - refreshed };
}
function sourceNotice(sourceKey, counts, nowISO) {
  const meta = Object.assign({}, KNOWN_SOURCES[sourceKey] || {}), d = describe(meta, nowISO);
  const lines = ['가격 출처: ' + d.provider, '기준 시각·통화·가격 종류: ' + [d.marketDate, d.currency, d.kind].join(' / ') + (d.marketDate === '미확인' ? ' (앱이 기록하지 않음)' : '')];
  if (counts) lines.push('이번 접속에서 새로 받은 종목 ' + counts.refreshed + '개 · 받지 못해 저장된 이전 값을 쓰는 종목 ' + counts.notRefreshed + '개(저장된 값은 받은 날짜 기록이 없어 오래됐을 수 있음)');
  lines.push('이 표시는 가격을 새로 확보했다는 뜻이 아니며 평가금액·거래 기록을 바꾸지 않습니다.');
  return { label: d.label, severity: d.severity, signalNote: d.signalNote, lines };
}
return { SCHEMA, KINDS, VERIFS, MAX_AGE_DAYS, KNOWN_SOURCES, describe, sessionCounts, sourceNotice };
});
