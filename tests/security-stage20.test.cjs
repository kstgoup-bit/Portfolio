'use strict';
/* 20단계 D: 비밀값이 문서·시험·신규 코드에 들어가지 않았는지, 키가 URL에 실리는 위치가 늘지 않았는지 확인한다(값은 출력하지 않음). */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const ROOT = path.resolve(__dirname, '..'), read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('portfolio_v5.html'), pw = (html.match(/const PW_DEFAULT\s*=\s*"([^"]+)"/) || [])[1];
const walk = (d, out = []) => { for (const n of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { if (['node_modules', '.git', 'test-results'].includes(n.name)) continue; const p = path.join(d, n.name); if (n.isDirectory()) walk(p, out); else if (/\.(md|cjs|js|json|css|html|txt)$/.test(n.name)) out.push(p); } return out; };
test('기본 비밀번호 값은 portfolio_v5.html 밖(문서·시험·신규 코드·도구)에 나타나지 않음', () => {
  a.ok(pw && pw.length >= 4, '상수를 찾지 못함');
  const hits = walk('.').filter(f => f !== 'portfolio_v5.html' && read(f).includes(pw));
  a.deepEqual(hits, [], '기본 비밀번호 값 포함 파일 ' + hits.length + '개');
});
test('API 키가 URL 쿼리에 실리는 지점은 검토된 4곳이며 신규 코드(has/)에는 없음', () => {
  a.equal((html.match(/[?&](?:key|apikey)=/gi) || []).length, 4, '당일 기록 단계: Gemini 3, AlphaVantage 재무 1. 임의 시각을 만들던 이력 요청 1곳 제거; docs/daily-records/BENCHMARK-HISTORY.md 참조');
  for (const f of fs.readdirSync(path.join(ROOT, 'has')).filter(x => x.endsWith('.js'))) { const s = read('has/' + f); a.ok(!/apikey|api_key|[?&]key=|geminiKey|alphaVantageKey|v5_pw|PW_DEFAULT/i.test(s), f); }
});
test('새 코드·문서에 키 형태(긴 영숫자 토큰, Bearer, Token) 값이 없음', () => {
  for (const f of walk('.').filter(f => /^(has|docs|tests|tools)[\\/]/.test(f))) { const s = read(f); a.ok(!/AIza[0-9A-Za-z_-]{30,}/.test(s), f + ' Google 키 형태'); a.ok(!/sk-[A-Za-z0-9]{20,}/.test(s), f + ' sk- 키 형태'); a.ok(!/Authorization:\s*Token\s+[0-9a-f]{20,}/i.test(s), f); }
});
test('백업 허용 목록에 비밀번호·API 키가 없음(백업 파일로 새지 않음)', () => {
  const B = require('../backup/core.js'); for (const k of ['v5_pw', 'v5_geminiKey', 'v5_alphaVantageKey', 'v5_auth']) a.equal(B.allowed(k), false, k);
});
test('시범 원장·이전 시뮬레이터·가격 신뢰도 코드는 키·비밀번호 저장소를 읽지 않음', () => {
  for (const f of ['ledger-demo.js', 'ledger-demo-model.js', 'migration-sim.js', 'price-trust.js', 'price-trust-ui.js']) { const s = read('has/' + f).replace(/\/\*[\s\S]*?\*\//g, ''); a.ok(!/getItem\(|localStorage|sessionStorage/.test(s), f); }
});
