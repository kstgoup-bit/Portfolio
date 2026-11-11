/* KST (stage13): 개인 PC 실행 결과를 "공유 가능한 요약"으로 줄인다. Pure.
   포함: 상태 합계·출처·기준일·조회일·호출 수·검증 버전·응답 해시. 제외: 종목코드·종목명·ISIN·승인 파일 내용·키·URL·원본. 누출 검사를 통과해야만 반환한다. */
'use strict';
function buildShareSummary(log) {
  if (!log || !log.summary || !Array.isArray(log.entries) || !Array.isArray(log.log)) throw new Error('verification-log 형식이 아님');
  const s = log.summary, h = log.log[0] && log.log[0].responseSha256 ? String(log.log[0].responseSha256).split(',') : [];
  const out = { kind: 'krx-share-summary', source: '금융위원회_KRX상장종목정보 / getItemInfo_V2', origin: s.acquisition || 'local-runner', status: s.status, basDt: s.basDt, queriedAt: s.queriedAt, verifierVersion: s.verifierVersion, transportCalls: s.transportCalls, retries: (s.attempts || []).filter(a => a.try > 1).length, failureCategories: [...new Set((s.attempts || []).map(a => a.category).filter(c => c !== 'ok'))], missingPages: s.missingPages || [], warnings: s.warnings || [], totals: s.totals || null, responseHashes: h, realPriceVerifiedCount: 0, actualActiveMonitoredCount: 0, notes: ['종목 신원 확인 결과이며 주가 확인·매수 신호가 아님', '이용허락(변경금지·재배포 금지) 때문에 코드·종목명·원본 응답은 공유 대상에서 제외'] };
  const text = JSON.stringify(out);
  for (const e of log.entries) { for (const v of [e.code, e.name]) if (v && v.length >= 2 && text.includes(JSON.stringify(v).slice(1, -1))) throw new Error('공유 요약에 종목 식별정보가 섞임'); }
  if (/serviceKey|KRX_SERVICE_KEY|https?:\/\//i.test(text)) throw new Error('공유 요약에 URL/키 단어가 섞임');
  return out;
}
module.exports = { buildShareSummary };
