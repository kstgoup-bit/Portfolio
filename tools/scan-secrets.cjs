/* 저장소(또는 지정 폴더) 파일에서 키·토큰·공식 원본 응답으로 보이는 문자열을 검사한다. 네트워크 없음. 발견 시 종료코드 1.
   usage: node tools/scan-secrets.cjs [폴더=저장소 루트] — 출력에는 발견된 값 자체를 싣지 않고 파일·줄·패턴 이름만 쓴다. */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const PATTERNS = [
  ['serviceKey 값', /serviceKey=(?!\*\*\*)(?!<)[A-Za-z0-9%+\/=]{20,}/g],
  ['KRX_SERVICE_KEY 대입', /KRX_SERVICE_KEY\s*[:=]\s*['"]?[A-Za-z0-9%+\/=]{16,}/g],
  ['GitHub 토큰', /(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g],
  ['API 키 형태', /(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})/g],
  ['개인키', /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/g]
];
// 비밀값 탐지 시험이 쓰는 명백한 가짜 값(허용 목록)
const ALLOW = ['AbCdEf0123456789xyzXYZ', 'FAKEKEY-abc123'];
const SKIP_DIR = new Set(['node_modules', '.git', 'test-results']);
function* walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (SKIP_DIR.has(e.name)) continue; const p = path.join(dir, e.name); if (e.isDirectory()) yield* walk(p); else yield p; } }
function scan(root) {
  const hits = [];
  for (const f of walk(root)) {
    const rel = path.relative(root, f); let buf; try { buf = fs.readFileSync(f); } catch { continue; }
    if (buf.length > 6 * 1024 * 1024 || buf.includes(0)) continue;
    const text = buf.toString('utf8'), lines = text.split('\n');
    lines.forEach((ln, i) => { if (ALLOW.some(a => ln.includes(a))) return; for (const [name, re] of PATTERNS) { re.lastIndex = 0; if (re.test(ln)) hits.push({ file: rel, line: i + 1, pattern: name }); } });
    const items = (text.match(/<srtnCd>/g) || []).length; // 공식 응답 대량 추출물 의심(가이드 예시는 1건)
    if (items > 3) hits.push({ file: rel, line: 0, pattern: '공식 응답 대량 추출물 의심(srtnCd ' + items + '건)' });
  }
  return hits;
}
if (require.main === module) { const root = path.resolve(process.argv[2] || path.join(__dirname, '..')), hits = scan(root); console.log(JSON.stringify({ root: path.basename(root), findings: hits }, null, 2)); process.exit(hits.length ? 1 : 0); }
module.exports = { scan, PATTERNS, ALLOW };
