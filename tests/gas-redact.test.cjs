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

test('escaped JSON quotes/backslashes preserve structure without secret tails', () => {
  for (const secret of ['prefix"tailSecret123', "prefix'tailSecret123", 'prefix\\tailSecret123', 'prefix\\"tailSecret123']) {
    const src = JSON.stringify({ password: secret, price: 123, other: 'unchanged' });
    const out = R.redact(src); a.ok(out.ok); a.equal(JSON.parse(out.text).password, '[가림:값]');
    a.equal(JSON.parse(out.text).other, 'unchanged'); a.equal(JSON.parse(out.text).price, 123);
    a.ok(!out.text.includes('tailSecret123'));
  }
});
test('GAS escaped strings, multiline literals and property initialization', () => {
  for (const src of [
    String.raw`const password = 'prefix\'tailSecret123';`,
    String.raw`const password = "prefix\\\"tailSecret123";`,
    'const secret = `first\ntailSecret123`;',
    `PropertiesService.getScriptProperties().setProperty('API_KEY', 'tailSecret123');`,
    `props.setProperties({ API_KEY: 'tailSecret123', price: 123 });`,
    String.raw`const cfg = { "pass\u0077ord": "tailSecret123" };`,
    String.raw`SpreadsheetApp.openById('prefix\'tailSecret123');`
  ]) { const out = R.redact(src); a.ok(out.ok, src); a.ok(!out.text.includes('tailSecret123'), src); }
});
test('uncertain sensitive expression boundaries refuse all output', () => {
  for (const src of [
    `const secret = 'first' + 'tailSecret123';`,
    `const secret = 'first' /* comment */ + 'tailSecret123';`,
    `const secret = 'first'\n + 'tailSecret123';`,
    'const secret = `first${value}tailSecret123`;',
    `const secret = 'unterminated tailSecret123`,
    `const secret = 'first'.concat('tailSecret123');`,
    `props.setProperty('API_KEY', 'first' + 'tailSecret123');`,
    `const secret = build('tailSecret123');`,
    `const secret = 'first' /* unfinished`,
    `const password = { value: 'tailSecret123' };`
  ]) { const out = R.redact(src); a.equal(out.ok, false, src); a.equal(out.text, '', src); a.ok(out.warnings.length); }
});
test('adjacent nonsecret values and escaped delimiters do not get swallowed', () => {
  const out = R.redact(String.raw`const cfg = { password: 'p\'secret', label: 'visible', enabled: true };`);
  a.ok(out.ok); a.ok(out.text.includes("label: 'visible', enabled: true"));
});
test('many escaped literals and unterminated tails remain bounded', () => {
  for (const src of [String.raw`const secret = 'a\'b';`.repeat(9000), 'const secret = "' + '\\\\'.repeat(100000)]) {
    const started = Date.now(); R.redact(src); a.ok(Date.now() - started < 2000);
  }
});
test('commented-out secret assignments are blocked rather than silently exposed', () => {
  for (const src of ["// const password = 'tailSecret123';", "/* const secret = 'tailSecret123'; */", "// props.setProperty('API_KEY', 'tailSecret123');"]) {
    const out = R.redact(src); a.equal(out.ok, false); a.equal(out.text, '');
  }
});
test('empty and numeric secret literals are hidden without damaging adjacent JSON', () => {
  for (const password of ['', 12345]) {
    const out = R.redact(JSON.stringify({password, price: 42})); a.ok(out.ok);
    a.deepEqual(JSON.parse(out.text), {password: '[가림:값]', price: 42});
  }
});
test('static bracket secret keys are hidden, compound assignments are withheld', () => {
  for (const src of [`config["password"] = "demoValue123";`, String.raw`config['pass\u0077ord'] = 'demoValue123';`]) {
    const out = R.redact(src); a.ok(out.ok); a.ok(!out.text.includes('demoValue123'));
  }
  for (const op of ['+=', '??=', '||=', '&&=', '**=']) {
    for (const key of ['config.password', 'config["password"]']) {
      const out = R.redact(`${key} ${op} "demoValue123";`); a.equal(out.ok, false); a.equal(out.text, '');
    }
  }
});
test('escaped API prefixes and URLs are screened as decoded literal values', () => {
  const fakeKey = 'SyA1234567890abcdefghijklmn' + 'opqrstuv';
  const fakeId = 'AKfycbx' + 'A'.repeat(33);
  for (const src of [
    'const x = "\\x41Iza' + fakeKey + '";',
    'const x = "\\u0041Iza' + fakeKey + '";',
    'const x = "\\u{41}Iza' + fakeKey + '";',
    'const x = "https:\\/\\/script.google.com\\/macros\\/s\\/' + fakeId + '\\/exec";'
  ]) {
    const out = R.redact(src); a.ok(out.ok); a.ok(!out.text.includes(fakeKey)); a.ok(!out.text.includes(fakeId));
  }
  const json = '{"url":"https:\\/\\/script.google.com\\/macros\\/s\\/' + fakeId + '\\/exec","other":"stay\\nput"}';
  const out = R.redact(json); a.ok(out.ok); a.equal(JSON.parse(out.text).other, 'stay\nput'); a.ok(!out.text.includes(fakeId));
});
test('escaped identifier unsupported forms fail closed and codepoint keys are recognized', () => {
  for (const src of [String.raw`const pass\u0077ord = 'demoValue123';`, String.raw`const x = '\u{110000}';`, String.raw`const x = '\uZZZZ';`]) {
    const out = R.redact(src); a.equal(out.ok, false); a.equal(out.text, '');
  }
  const out = R.redact(String.raw`const cfg = { "pass\u{77}ord": "demoValue123" };`);
  a.ok(out.ok); a.ok(!out.text.includes('demoValue123'));
});
test('legacy octal and ambiguous zero-digit escapes are withheld', () => {
  const id = 'AKfycbx' + 'A'.repeat(33);
  const src = 'const x="https:\\057\\057script.google.com\\057macros\\057s\\057' + id + '\\057exec";';
  for (const input of [src, String.raw`const x = '\08';`, String.raw`const x = '\00';`, String.raw`const x = '\09';`]) {
    const out = R.redact(input); a.equal(out.ok, false); a.equal(out.text, '');
  }
  a.ok(R.redact(String.raw`const x = '\0';`).ok);
});
