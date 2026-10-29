/* KST (stage13): 실조회 전 "합성 응답 리허설"용 가짜 서버. Pure, 네트워크 없음. 후보 목록에서 일부는 일치·일부는 불일치·일부는 누락시킨
   합성 응답을 만든다. 이 응답으로는 어떤 종목도 VERIFIED 가 될 수 없다(origin=fixture). */
'use strict';
const isinOf = code => { const body = 'KR7' + code + '00', d = [...body].map(c => /[0-9]/.test(c) ? c : String(c.charCodeAt(0) - 55)).join(''); for (let k = 0; k < 10; k++) { const s = d + k; let sum = 0, dbl = false; for (let i = s.length - 1; i >= 0; i--) { let n = s.charCodeAt(i) - 48; if (dbl) { n *= 2; if (n > 9) n -= 9; } sum += n; dbl = !dbl; } if (sum % 10 === 0) return body + k; } };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function synthListing(universe, basDt) {
  const rows = []; let i = 0;
  for (const s of universe.securities) {
    i++;
    if (s.group === 'etf') { if (i % 3 === 0) continue; rows.push({ basDt, srtnCd: 'A' + s.code, isinCd: isinOf(s.code), mrktCtg: s.market, itmsNm: s.name }); continue; }
    if (i % 17 === 0) continue;                                                      // 응답에 없음
    const bad = i % 11 === 0 ? 'name' : i % 13 === 0 ? 'market' : null;               // 불일치 주입
    rows.push({ basDt, srtnCd: 'A' + s.code, isinCd: isinOf(s.code), mrktCtg: bad === 'market' ? (s.market === 'KOSPI' ? 'KOSDAQ' : 'KOSPI') : s.market, itmsNm: bad === 'name' ? s.name + '(개명가정)' : s.name });
  }
  for (let k = 0; k < 40; k++) { const code = 'Y' + String(k).padStart(5, '0'); rows.push({ basDt, srtnCd: 'A' + code, isinCd: isinOf(code), mrktCtg: 'KOSDAQ', itmsNm: '합성채움' + k }); }
  return rows;
}
function render(rows, rows_, pageNo, total, format) {
  if (format === 'json') return JSON.stringify({ response: { header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' }, body: { numOfRows: rows_, pageNo, totalCount: total, items: rows.length ? { item: rows } : '' } } });
  return `<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><numOfRows>${rows_}</numOfRows><pageNo>${pageNo}</pageNo><totalCount>${total}</totalCount><items>${rows.map(r => '<item>' + Object.entries(r).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join('') + '</item>').join('')}</items></body></response>`;
}
/* fault: none | 429 | 401 | garbage | gateway30 */
function createRehearsalTransport(universe, { basDt, format = 'xml', fault = 'none' } = {}) {
  const all = synthListing(universe, basDt); let n = 0;
  const fn = async ({ url }) => {
    n++; const u = new URL(url), rows = Number(u.searchParams.get('numOfRows')), pg = Number(u.searchParams.get('pageNo'));
    if (fault === '401') return { status: 401, text: 'Unauthorized' };
    if (fault === 'gateway30') return { status: 200, text: '<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>' };
    if (fault === '429' && n === 2) return { status: 429, text: 'API rate limit exceeded' };
    if (fault === 'garbage' && n === 2) return { status: 200, text: '<response><header>' };
    return { status: 200, text: render(all.slice((pg - 1) * rows, pg * rows), rows, pg, all.length, format) };
  };
  fn.total = all.length; return fn;
}
module.exports = { isinOf, synthListing, createRehearsalTransport };
