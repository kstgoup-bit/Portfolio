/* KST (stage15): 휴대폰 화면용 숫자 표기. 순수. 값이 없으면 "자료 부족"(0 으로 보이게 하지 않는다). */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.KSTFormat = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const fin = x => typeof x === 'number' && Number.isFinite(x), NA = '자료 부족';
  const group = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  function krw(x) { if (!fin(x)) return NA; const r = Math.round(Math.abs(x)); return (x < 0 && r !== 0 ? '-' : '') + group(r) + '원'; }
  /* 1억 이상은 "3억 2,150만원" 처럼 읽기 쉽게. 만 단위 미만은 반올림(표시용). */
  function krwCompact(x) {
    if (!fin(x)) return NA; const neg = x < 0, v = Math.round(Math.abs(x)); if (v < 10000) return krw(x);
    const eok = Math.floor(v / 100000000), man = Math.round((v % 100000000) / 10000); let e = eok, m = man; if (m === 10000) { e += 1; m = 0; }
    const body = (e ? group(e) + '억' + (m ? ' ' + group(m) + '만' : '') : group(m) + '만') + '원'; return (neg ? '-' : '') + body;
  }
  function pct(x, d = 1, { sign = false } = {}) { if (!fin(x)) return NA; const s = x.toFixed(d); const z = Number(s) === 0; return (sign && x > 0 && !z ? '+' : '') + (z && s[0] === '-' ? s.slice(1) : s) + '%'; }
  function pp(x, d = 1) { if (!fin(x)) return NA; return (x > 0 ? '+' : '') + x.toFixed(d) + '%p'; }
  function qty(x) { if (!fin(x)) return NA; return Number.isInteger(x) ? group(x) : String(Number(x.toFixed(6))); }
  return { NA, krw, krwCompact, pct, pp, qty };
});
