const test = require('node:test'), a = require('node:assert/strict'), fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
const ROOT = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8'), H = require('./lib/has-rename.cjs');
const NEW = ['has/advisor-panel.js', 'has/briefing-model.js', 'has/opinion-conflict.js', 'has/advisor-synthetic.js'];
test('25단계 AI 참모 코드: 저장소 쓰기·네트워크·동적 실행·HTML 주입 구문이 없다', () => {
  for (const f of NEW) { const s = rd(f).replace(/\/\*[\s\S]*?\*\//g, ''); for (const w of ['setItem', 'removeItem', 'localStorage.clear', 'sessionStorage', 'indexedDB', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'eval(', 'new Function', 'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'document.cookie', 'importScripts', 'serviceWorker']) a.ok(!s.includes(w), f + ' ' + w); }
});
test('25단계 패널은 localStorage를 v5_cma_amount 한 키의 getItem으로만 읽고 Gemini 키는 읽지 않는다', () => {
  const s = rd('has/advisor-panel.js'); const m = s.match(/localStorage\.[A-Za-z]+\([^)]*\)/g) || [];
  a.ok(m.length >= 1); for (const x of m) a.equal(x, "localStorage.getItem('v5_cma_amount')");
  a.ok(!/geminiKey|apiKey|password|계좌번호/i.test(s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')));
});
test('앱 수정은 추가뿐: 24단계 문구로 되돌리면 24단계 커밋 파일과 일치하고, 새 외부 주소·저장 키가 없다', () => {
  const now = H.beforeRecordingText('portfolio_v5.html'), old = H.stage24Text('portfolio_v5.html');
  a.ok(now.length > old.length); a.equal(H.STAGE25.length, 10);
  const urls = s => (s.match(/https?:\/\/[^\s"'<>)]+/g) || []).sort().join('\n'), keys = s => (s.match(/\b(v5_[A-Za-z0-9_]+|has_[a-z_0-9]+|kst\.[a-z.A-Z0-9_]+)/g) || []).sort().join('\n');
  a.equal(urls(now), urls(old)); a.equal(keys(now), keys(old));
  let base; try { base = cp.execSync('git show 3b2e65c:portfolio_v5.html', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 }).toString('utf8'); } catch (e) { return; }
  a.equal(old, base);
});
test('매니페스트·서비스워커는 과거 단계와 동일하며 백업 보완은 별도 고정 핀 시험', () => {
  for (const f of ['manifest.json', 'service-worker.js']) {
    let b; try { b = cp.execSync('git show 3b2e65c:' + f, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 }); } catch (e) { continue; }
    a.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex'), crypto.createHash('sha256').update(b).digest('hex'), f);
  }
});
