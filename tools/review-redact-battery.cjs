'use strict';
// Synthetic fixtures only. CLI module paths must be trusted local code.
const SEC='Zq9vW3kLm7TpX2sRb5NhY8dC'+'4fG1jUe6', PLAIN='hunter2-VALUE-77';
const NUMERIC = PLAIN.replace(/\D/g, '') || '12345';
const T=[ // [이름, 템플릿, 비밀값]
['이스케이프 따옴표(결함 재현)',`var secret = "abc\\"${PLAIN}";`,PLAIN],
['이스케이프 작은따옴표',`var password = 'it\\'s ${PLAIN}';`,PLAIN],
['유니코드 이스케이프로 분할',`var token = "\\u0041${PLAIN}";`,PLAIN],
['문자열 이어붙이기',`var token = "ab" + "${PLAIN}";`,PLAIN],
['이어붙이기(뒤쪽)',`var token = prefix + "${PLAIN}";`,PLAIN],
['템플릿 리터럴 식',`var token = \`pre-\${x}-${PLAIN}\`;`,PLAIN],
['객체 속성',`var cfg = {appkey: "${PLAIN}", name: 'x'};`,PLAIN],
['따옴표 친 키',`var cfg = {"appsecret": "${PLAIN}"};`,PLAIN],
['JSON 응답',`{"token":"${PLAIN}","price":71500}`,PLAIN],
['대괄호 접근',`cfg['api_key'] = '${PLAIN}';`,PLAIN],
['복합 대입',`token += "${PLAIN}";`,PLAIN],
['널 병합',`token ??= "${PLAIN}";`,PLAIN],
['setProperty',`PropertiesService.getScriptProperties().setProperty('API_KEY','${PLAIN}');`,PLAIN],
['주석 안',`// token = ${PLAIN}\nvar a=1;`,PLAIN],
['블록 주석 안',`/* secret: ${PLAIN} */ var a=1;`,PLAIN],
['URL 쿼리',`var u = "https://x.test/p?token=${PLAIN}&a=1";`,PLAIN],
['줄바꿈 이어쓰기',`var secret = "abc\\\n${PLAIN}";`,PLAIN],
['16진 이스케이프',`var password = "\\x41${PLAIN}";`,PLAIN],
['긴 무작위 문자열',`var id = "${SEC}";`,SEC],
['문서 ID',`SpreadsheetApp.openById("${SEC}")`,SEC],
['값이 숫자',`var pin = 1; var secret = ${NUMERIC};`,NUMERIC],
['한 줄에 두 개',`var a={token:"${PLAIN}"},b={secret:"${PLAIN}2"};`,PLAIN],
['이메일',`var owner = "me.name@example.org";`,'me.name@example.org'],
['Bearer',`headers: {Authorization: "Bearer ${SEC}"}`,SEC],
['식별자 이스케이프',`var t\\u006fken = "${PLAIN}";`,PLAIN],
['정규식 안 따옴표',`var r=/"/; var token="${PLAIN}";`,PLAIN],
['미완성 문자열',`var token = "${PLAIN}`,PLAIN],
['삼항',`var token = ok ? "${PLAIN}" : "x";`,PLAIN],
['함수 호출 인자',`var token = decode("${PLAIN}");`,PLAIN],
['배열',`var token = ["${PLAIN}"];`,PLAIN],
];
const OK=[`function doGet(e){var t=e.parameter.t;var r=GOOGLEFINANCE(t,"price");return ContentService.createTextOutput(JSON.stringify({price:r})).setMimeType(ContentService.MimeType.JSON);}`,
`const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('시세');const v=sh.getRange('A1:B10').getValues();// 값 읽기\nreturn v.map(function(r){return {ticker:r[0],price:Number(r[1])};});`,
`{"005930":71500,"AAPL":189.42,"usdKrw":1412.5,"asOf":"2026-11-06T06:30:00Z"}`,
`function fetchFx(){var res=UrlFetchApp.fetch("https://example.test/api/fx?base=USD&quote=KRW");var j=JSON.parse(res.getContentText());return j.rate;}`,
`var cb=e.parameter.callback;return ContentService.createTextOutput(cb+"("+JSON.stringify(data)+")");`];

// Explicit expected text, not derived from the implementation under test.
// null means fail closed, with no output, rather than successful redaction.
const EXPECTED = [
  'var secret = "[가림:값]";', "var password = '[가림:값]';", 'var token = "[가림:값]";',
  null, null, null,
  'var cfg = {appkey: "[가림:값]", name: \'x\'};', 'var cfg = {"appsecret": "[가림:값]"};',
  '{"token":"[가림:값]","price":71500}', "cfg['api_key'] = '[가림:값]';", null, null,
  "PropertiesService.getScriptProperties().setProperty('API_KEY','[가림:값]');", null, null,
  'var u = "https://x.test/p?token=[가림:값]&a=1";', 'var secret = "[가림:값]";',
  'var password = "[가림:값]";', 'var id = "[가림:긴문자열]";', 'SpreadsheetApp.openById("[가림:값]")',
  'var pin = 1; var secret = "[가림:값]";', 'var a={token:"[가림:값]"},b={secret:"[가림:값]"};',
  'var owner = "[가림:이메일]";', 'headers: {Authorization: "[가림:값]"}',
  null, null, null, null, null, null
];
if (EXPECTED.length !== T.length) throw new Error('Fixture expectation count mismatch');
const fixtures = Object.freeze(T.map(([name, source, sentinel], i) => {
  if (!sentinel || !source.includes(sentinel)) throw new Error(`Missing source sentinel: ${name}`);
  return Object.freeze({ name, source, sentinel, expectedOk: EXPECTED[i] !== null, expectedText: EXPECTED[i] ?? '' });
}));
const normalFixtures = Object.freeze(OK.map((source, i) => Object.freeze({ name: `정상 스크립트 ${i + 1}`, source })));

function evaluate(redactor, source, sentinel) {
  try {
    const out = redactor.redact(source);
    if (!out || typeof out.ok !== 'boolean' || typeof out.text !== 'string') {
      return { status: '오류', leak: false, error: 'Invalid result shape' };
    }
    // Check returned text even when ok=false: a refusal must not contain secrets.
    const leak = !!sentinel && out.text.includes(sentinel);
    return { ok: out.ok, text: out.text, leak, status: leak ? '노출' : out.ok ? '가림' : '차단' };
  } catch (_) {
    // Do not log arbitrary exception text, which could contain input secrets.
    return { status: '오류', leak: false, error: 'Redactor threw' };
  }
}

function runBattery(current, baseline = null) {
  const failures = [], rows = [];
  let currentLeaks = 0, currentBlocked = 0, baselineLeaks = 0, baselineErrors = 0, normalUnchanged = 0;
  for (const fixture of fixtures) {
    const actual = evaluate(current, fixture.source, fixture.sentinel);
    const old = baseline ? evaluate(baseline, fixture.source, fixture.sentinel) : null;
    if (actual.leak) currentLeaks++;
    if (actual.ok === false) currentBlocked++;
    if (old?.leak) baselineLeaks++;
    if (old?.error) baselineErrors++;
    if (actual.error || actual.leak || actual.ok !== fixture.expectedOk || actual.text !== fixture.expectedText) {
      failures.push(`${fixture.name}: current output differs from expected safe behavior`);
    }
    rows.push({ name: fixture.name, current: actual.status, baseline: old?.status ?? '미지정' });
  }
  const normalRows = normalFixtures.map(fixture => {
    const actual = evaluate(current, fixture.source);
    const unchanged = actual.ok === true && actual.text === fixture.source;
    if (unchanged) normalUnchanged++;
    else failures.push(`${fixture.name}: valid GAS must remain unchanged`);
    return { name: fixture.name, status: unchanged ? '원문 유지' : actual.error ? '오류' : actual.ok ? '변경됨' : '차단됨' };
  });
  return { passed: failures.length === 0, failures, rows, normalRows, currentLeaks, currentBlocked,
    baselineLeaks, baselineErrors, normalUnchanged, total: fixtures.length };
}

const USAGE = 'Usage: node tools/review-redact-battery.cjs [trusted-baseline.js] [--current trusted-current.js]\nOnly trusted local .js/.cjs modules exporting redact() may be loaded; loading executes code.';
function loadLocal(filename) {
  const fs = require('node:fs'), path = require('node:path');
  if (!filename || !/\.(?:cjs|js)$/.test(filename) || /^[a-z]+:\/\//i.test(filename)) throw new Error('Expected a local .js/.cjs file');
  const resolved = path.resolve(filename);
  if (!fs.statSync(resolved).isFile()) throw new Error('Expected a regular file');
  const module = require(resolved);
  if (!module || typeof module.redact !== 'function') throw new Error('Module must export redact()');
  return module;
}
function main(args = process.argv.slice(2), io = console) {
  if (args.length === 1 && args[0] === '--help') { io.log(USAGE); return 0; }
  let baselinePath, currentPath;
  try {
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--current') {
        if (currentPath || !args[i + 1] || args[i + 1].startsWith('-')) throw new Error('Invalid --current');
        currentPath = args[++i];
      } else if (args[i].startsWith('-') || baselinePath) throw new Error('Invalid arguments');
      else baselinePath = args[i];
    }
    const current = currentPath ? loadLocal(currentPath) : require('../has/gas-redact.js');
    const baseline = baselinePath ? loadLocal(baselinePath) : null;
    const result = runBattery(current, baseline);
    io.log('항목 | 이전(참고용) | 현재(검증 대상)');
    for (const row of result.rows) io.log(`${row.name} | ${row.baseline} | ${row.current}`);
    io.log(`이전 노출 ${baseline ? result.baselineLeaks : '미지정'}건 / 이전 오류 ${result.baselineErrors}건 (참고용)`);
    io.log(`현재 노출 ${result.currentLeaks}건 / 현재 차단 ${result.currentBlocked}건 (총 ${result.total})`);
    for (const row of result.normalRows) io.log(`${row.name}: ${row.status}`);
    io.log(`현재 검증 ${result.passed ? 'PASS' : 'FAIL'} / 실패 ${result.failures.length}건`);
    for (const failure of result.failures) io.error(failure);
    return result.passed ? 0 : 1;
  } catch (_) {
    io.error(`Unable to load trusted local module or invalid arguments.\n${USAGE}`);
    return 2;
  }
}
module.exports = { fixtures, normalFixtures, runBattery, main };
if (require.main === module) process.exitCode = main();
