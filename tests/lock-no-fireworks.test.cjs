'use strict';
/* 2026-11-12 순태씨 요청: 잠금화면 불꽃놀이 제거(입력·잠금해제 지연). 달·축하 문구·잠금 흐름은 유지. */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../portfolio_v5.html'), 'utf8');
test('불꽃놀이 캔버스·애니메이션 코드 없음(계속 도는 requestAnimationFrame 없음)', () => {
  a.doesNotMatch(html, /confettiCanvas|startFireworks|function Rocket|salvo\(/);
  a.equal((html.match(/requestAnimationFrame\(loop\)/g) || []).length, 0);
});
test('잠금화면 구성(10억 달·축하합니다·제목·비밀번호·확인)과 잠금 해제 함수는 유지', () => {
  for (const s of ['id="lockScreen"', '10억</text>', '✨ 축하합니다! ✨', 'HAS · Hidden Alpha System', 'id="lockInput"', 'id="lockBtn"', 'function checkPw()', 'lb.addEventListener("click", checkPw)']) a.ok(html.includes(s), s);
});
