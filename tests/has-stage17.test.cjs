'use strict';
const test = require('node:test'), a = require('node:assert/strict'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { legacySha, legacyText, RENAMES } = require('./lib/has-rename.cjs');
const ROOT = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8'), sha = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
const STAGE16 = { 'portfolio_v5.html': 'b16656a6525d9127fe3a3fb4d3ad19c8717afc58fb0fe256feb503692913ebd5', 'manifest.json': '79f5292b2c95dba718b453194b255f02d16a1585677b559735b9fad52f16d878' };
const UNTOUCHED = { 'portfolio.html': '97235e2a02feeec84511d9b4caf4c548e47ba37eb229625438acbc15427bfa2d', 'service-worker.js': '77d553efcfc3eb93f65a1f2901de1cf3b6b61b36febd9605053e66db6724dcd8', 'backup/core.js': '8a455cdc0606cce844fbb8d40551c9435d42c49b5d1bceafc8455c11a6e0eb3f', 'backup/ui.js': '88eda5884de2aa42416f4d1eaee4ba32301d6128d9ec9d6f252be408b9b8da24' };

test('이름 변경은 정해진 치환뿐: 되돌리면 16단계 원본과 바이트 동일', () => { for (const [f, h] of Object.entries(STAGE16)) a.equal(legacySha(f), h, f); });
test('서비스워커·백업 모듈·구 화면은 한 바이트도 바뀌지 않음', () => { for (const [f, h] of Object.entries(UNTOUCHED)) a.equal(sha(f), h, f); });
test('치환이 실제로 적용됨(현재 파일은 16단계 원본과 다르다 = 시험이 공허하지 않음)', () => { for (const f of Object.keys(STAGE16)) a.notEqual(sha(f), STAGE16[f], f); });
test('치환 대상 외 줄은 전부 동일(줄 단위 비교: 변경 줄 수 = 치환 수)', () => {
  for (const f of Object.keys(RENAMES)) { const now = rd(f).split('\n'), old = legacyText(f).split('\n'); a.equal(now.length, old.length, f + ' 줄 수'); const diff = now.filter((l, i) => l !== old[i]).length; a.equal(diff, RENAMES[f].length, f + ' 바뀐 줄 수'); }
});
test('보이는 이름: 제목·잠금화면·머리글·홈화면 이름이 HAS로 일관', () => {
  const h = rd('portfolio_v5.html');
  a.match(h, /<title>HAS · Hidden Alpha System<\/title>/); a.match(h, /apple-mobile-web-app-title" content="HAS"/);
  a.match(h, /class="lock-title">HAS · Hidden Alpha System</); a.match(h, /class="header-title"[^>]*>HAS · Hidden Alpha System/);
  a.ok(!/<title>[^<]*10억/.test(h)); a.ok(!/apple-mobile-web-app-title" content="10억/.test(h));
});
test('매니페스트: 이름만 바뀌고 start_url·scope·아이콘·표시모드·id 없음(설치 정체성 불변)', () => {
  const m = JSON.parse(rd('manifest.json')), o = JSON.parse(legacyText('manifest.json'));
  a.equal(m.name, 'HAS (Hidden Alpha System)'); a.equal(m.short_name, 'HAS'); a.ok(m.short_name.length <= 12);
  for (const k of ['start_url', 'display', 'orientation', 'icons', 'background_color', 'theme_color']) a.deepEqual(m[k], o[k], k);
  a.ok(!('id' in m), 'id를 새로 넣으면 설치 앱 식별이 바뀔 수 있음'); a.ok(!('scope' in m));
});
test('내부 식별자 불변: 저장 키(v5_*, kst.portfolio.*), 캐시 이름, 비밀 문자열 위치가 그대로', () => {
  const now = rd('portfolio_v5.html'), old = legacyText('portfolio_v5.html'), keys = s => [...new Set(s.match(/\b(v5_[A-Za-z0-9_]+|kst\.portfolio\.[A-Za-z0-9_.]+)/g) || [])].sort();
  a.deepEqual(keys(now), keys(old)); a.ok(keys(now).length >= 5);
  a.match(rd('service-worker.js'), /CACHE_NAME = 'portfolio-v5-'/);
});
test('실험실·국내 레이더 내부 이름(KST*)도 일괄 변경하지 않았다', () => {
  a.match(rd('mobile-lab/invest-bundle.js'), /KSTLedger/); a.match(rd('mobile-lab/bundle.js'), /KSTMobileLab/); a.match(rd('invest/draft-store.js'), /kst\.lab\.s16\.draft/);
});
