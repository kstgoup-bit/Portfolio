'use strict';
const test = require('node:test'), a = require('node:assert/strict'), R = require('../has/gas-redact.js');
// 시험용 가짜 값은 조각을 이어 붙여 만든다(저장소 비밀값 검사기가 소스에 키 형태 문자열이 없는지 보기 때문)
const SECRETS = ['AIza' + 'SyA1234567890abcdefghijklmn' + 'opqrstuv', '1AbCdEfGhIjKlMnOpQrStUv' + 'WxYz0123456789abc', 'AKfycbx' + 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'abcdef123456', 'ya29.' + 'abcdefghijk123456', 'hunter2hunter2', 'me.name' + '@gmail.com', '12345678-01', '010-1234-5678', 'sk_' + 'live_abcdefghijklmnopqrstuvwxyz0123456789'];
const SRC = `const KEY='${SECRETS[0]}'; const ss=SpreadsheetApp.openById('${SECRETS[1]}'); var url='https://script.google.com/macros/s/${SECRETS[2]}/exec?token=${SECRETS[3]}';
const h={Authorization:'Bearer ${SECRETS[4]}'}; var secret="${SECRETS[5]}"; // owner ${SECRETS[6]} 계좌 ${SECRETS[7]} 전화 ${SECRETS[8]}
var stripeKey = "${SECRETS[9]}"; function quote(t){var r=GOOGLEFINANCE(t,'price'); return JSON.stringify({price:r});}`;
test('비밀로 보이는 값은 결과에 남지 않는다', () => { const o = R.redact(SRC); a.ok(o.ok); for (const s of SECRETS) a.ok(!o.text.includes(s), s); a.ok(o.total >= 9); });
test('구조·함수 이름·로직은 남는다(분석 가능)', () => { const o = R.redact(SRC); for (const k of ['SpreadsheetApp.openById', 'GOOGLEFINANCE(t,\'price\')', 'function quote', 'JSON.stringify', 'script.google.com/macros/s/', '/exec?token=']) a.ok(o.text.includes(k), k); });
test('가격·종목코드·날짜·환율이 든 응답 예시는 훼손하지 않는다', () => { const j = '{"005930":71500,"AAPL":189.42,"usdKrw":1412.5,"asOf":"2026-11-06T06:30:00Z","name":"Samsung Electronics","status":"ok"}'; const o = R.redact(j); a.equal(o.text, j); a.equal(o.total, 0); });
test('이미 가린 결과를 다시 가려도 같다(멱등)', () => { const o = R.redact(SRC), o2 = R.redact(o.text); a.equal(o2.text, o.text); });
test('입력이 문자열이 아니거나 너무 길면 거절', () => { for (const x of [null, undefined, 5, {}, []]) a.equal(R.redact(x).ok, false); a.equal(R.redact('x'.repeat(R.MAX + 1)).ok, false); });
test('큰 입력도 빠르게 끝난다(정규식 폭주 없음)', () => { for (const s of ['a'.repeat(250000), 'key='.repeat(50000), '"secret": "' + 'z'.repeat(200000), ('A1'.repeat(20) + ' ').repeat(5000), '@'.repeat(100000), '1'.repeat(100000) + '-']) { const t = Date.now(); R.redact(s); a.ok(Date.now() - t < 2000, 'slow: ' + s.slice(0, 12)); } });
test('항상 완전하지 않다는 경고를 낸다', () => { a.ok(R.redact('hello').warnings.some(w => /완전하지 않을 수 있습니다/.test(w))); });
test('토큰 접두사가 가려지지 않고 남으면 경고', () => { a.ok(R.redact("x = 'sk-abcdefg'").warnings.some(w => /토큰 접두사/.test(w))); });
test('모듈에 저장·네트워크 코드가 없다', () => { const src = require('fs').readFileSync(require('path').join(__dirname, '../has/gas-redact.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''); a.ok(!/localStorage|sessionStorage|fetch\(|XMLHttpRequest|indexedDB|navigator\./.test(src)); const ui = require('fs').readFileSync(require('path').join(__dirname, '../has/gas-redactor.js'), 'utf8'); a.ok(!/localStorage|sessionStorage|fetch\(|XMLHttpRequest|indexedDB|innerHTML/.test(ui)); });
