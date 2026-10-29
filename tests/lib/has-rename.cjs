'use strict';
// 17단계: 표시 이름만 바뀐 파일이 "16단계 원본에서 아래 치환만 한 것"임을 증명하는 도우미.
// 현재 파일에서 새 이름을 옛 이름으로 되돌린 뒤 해시를 내면 16단계 해시와 같아야 한다.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
const RENAMES = {
  'portfolio_v5.html': [
    ['<meta name="apple-mobile-web-app-title" content="HAS">', '<meta name="apple-mobile-web-app-title" content="10억 포폴">'],
    ['<title>HAS · Hidden Alpha System</title>', '<title>순태씨의 5년 안에 10억!</title>'],
    ['<div class="lock-title">HAS · Hidden Alpha System</div>', '<div class="lock-title">순태씨의 5년 안에 10억!</div>'],
    ['<div class="header-title" style="text-align:center">HAS · Hidden Alpha System 💰</div>', '<div class="header-title" style="text-align:center">순태씨의 5년 안에 10억! 💰</div>']],
  'manifest.json': [
    ['"name": "HAS (Hidden Alpha System)"', '"name": "순태씨의 5년 안에 10억"'],
    ['"short_name": "HAS"', '"short_name": "10억 포폴"'],
    ['"description": "HAS(Hidden Alpha System) — 개인 투자 연구·판단·기록 앱"', '"description": "클로 & 재미가 함께하는 투자 포트폴리오 앱"']] };
function legacyText(file) {
  let s = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const [now, old] of RENAMES[file] || []) { if (s.split(now).length !== 2) throw new Error(file + ': 치환 대상이 정확히 1개가 아님: ' + now); s = s.replace(now, () => old); }
  return s;
}
const legacySha = file => crypto.createHash('sha256').update(RENAMES[file] ? legacyText(file) : fs.readFileSync(path.join(ROOT, file))).digest('hex');
module.exports = { RENAMES, legacyText, legacySha };
