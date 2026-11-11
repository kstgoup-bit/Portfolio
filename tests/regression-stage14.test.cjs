'use strict';
/* 14단계: 모바일 실험실의 접근 경계·번들 일치·정적 안전 검사. 운영 앱·서비스워커·백업 모듈은 바뀌지 않았음을 별도로 고정한다. */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ROOT = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');

test('번들(mobile-lab/bundle.js)은 kr-radar 소스와 정확히 일치 — 판정 규칙이 CLI와 같은 코드', () => { const { build } = require('../tools/build-mobile-lab.cjs'); a.equal(rd('mobile-lab/bundle.js'), build()); });
test('브라우저 SHA-256 구현은 node:crypto 와 일치(한글·경계 길이 포함)', () => {
  const s = require('../mobile-lab/sha256.js'); for (const t of ['', 'abc', '한글 테스트'.repeat(40), 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(63), 'x'.repeat(64), 'x'.repeat(119), 'y'.repeat(100000), '😀 emoji'])
    a.equal(s(t), crypto.createHash('sha256').update(t).digest('hex'), t.slice(0, 10));
});
test('운영 앱·서비스워커·매니페스트·백업 모듈은 14단계에서 바뀌지 않았다(13단계 해시 고정)', () => {
  const PINNED = { 'portfolio_v5.html': 'b16656a6525d9127fe3a3fb4d3ad19c8717afc58fb0fe256feb503692913ebd5', 'portfolio.html': '97235e2a02feeec84511d9b4caf4c548e47ba37eb229625438acbc15427bfa2d' };
  for (const [f, h] of Object.entries(PINNED)) a.equal(require('./lib/has-rename.cjs').legacySha(f), h, f);
  const sw = rd('service-worker.js'); a.ok(!/mobile-lab|kr-radar/.test(sw)); a.ok(!/mobile-lab|kr-radar/.test(rd('manifest.json')));
});
test('운영 앱·서비스워커 캐시 목록·매니페스트 어디에서도 실험실을 참조하지 않는다 (공개 PWA 노출 0)', () => {
  for (const f of ['portfolio_v5.html', 'portfolio.html', 'service-worker.js', 'manifest.json', 'sell/index.html', 'sell/ui.js', 'radar/ui.js']) a.ok(!/mobile-lab/.test(rd(f)), f);
  const list = [...new Set([...rd('service-worker.js').matchAll(/'\.\/([^']+)'/g)].map(m => m[1]))]; a.deepEqual(list.sort(), ['icon-192.png', 'icon-512.png', 'manifest.json', 'portfolio_v5.html']);
});
test('실험실 HTML: noindex, CSP(connect-src none, default-src none, script-src self), 외부 URL·인라인 스크립트·이벤트 속성 없음', () => {
  const h = rd('mobile-lab/index.html'); a.match(h, /name="robots" content="noindex, nofollow"/); a.match(h, /connect-src 'none'/); a.match(h, /default-src 'none'/); a.match(h, /script-src 'self'/);
  a.doesNotMatch(h, /https?:\/\//); a.doesNotMatch(h, /<script(?![^>]*\bsrc=)[^>]*>/); a.doesNotMatch(h, /\son[a-z]+\s*=/i); a.doesNotMatch(h, /unsafe-inline|unsafe-eval/); a.match(h, /name="viewport"/);
});
test('실험실 스크립트/스타일 정적 검사: 네트워크·저장소·동적 코드·innerHTML·서비스워커 등록 없음, 최소 글자 크기', () => {
  for (const f of ['mobile-lab/ui.js', 'mobile-lab/sha256.js', 'mobile-lab/index.html', 'mobile-lab/style.css']) { const s = rd(f); for (const w of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'EventSource', 'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'eval(', 'new Function', 'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'serviceWorker', 'importScripts', 'document.write']) a.ok(!s.includes(w), f + ' ' + w); }
  const css = rd('mobile-lab/style.css'); for (const m of css.matchAll(/font(?:-size)?:\s*([\d.]+)(px|rem)/g)) a.ok(m[2] === 'px' ? Number(m[1]) >= 12 : Number(m[1]) >= .75, m[0]);
  for (const m of css.matchAll(/color:\s*#([0-9a-f]{3,6})\b/gi)) { const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1]; const lum = parseInt(h.slice(0, 2), 16) * .299 + parseInt(h.slice(2, 4), 16) * .587 + parseInt(h.slice(4, 6), 16) * .114; if (!/background/.test(css.slice(Math.max(0, m.index - 12), m.index))) a.ok(lum < 140 || /#fff\b|#ffffff/i.test(m[0]), '밝은 글자색 ' + m[0]); }
});
test('실험실은 실제 transport 를 만들지 못한다: ui.js 의 transport 는 합성(rehearsal)뿐이고 REAL_CALLS_ALLOWED=false', () => {
  const ui = rd('mobile-lab/ui.js'); a.match(ui, /createRehearsalTransport/); a.match(ui, /t\.isSynthetic = true/); a.equal(require('../kr-radar/mobile-flow.js').REAL_CALLS_ALLOWED, false);
  a.doesNotMatch(rd('mobile-lab/bundle.js'), /node:https|require\('https'\)|serviceKey=[A-Za-z0-9%]{8,}/);
});
test('저장소에 인증키·승인 파일·원본 응답 형태 파일이 없다', () => {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name === 'node_modules' || e.name === '.git' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(ROOT)) { const r = path.relative(ROOT, f); a.ok(!/(^|\/)\.env|approval.*\.json$|(^|\/)raw\//.test(r), r); }
  a.deepEqual(require('../tools/scan-secrets.cjs').scan(ROOT), []);
});
test('실험실 서버 측 기능 없음: 중계 API·서버 코드·워커 설정 파일이 저장소에 없다', () => {
  for (const f of ['wrangler.toml', 'wrangler.jsonc', 'server.js', 'functions', 'worker.js', 'vercel.json', 'netlify.toml', 'Dockerfile']) a.ok(!fs.existsSync(path.join(ROOT, f)), f);
});
