const NEW=require('../has/gas-redact.js'),OLD=require(require('path').resolve(process.argv[2]));
const SEC='Zq9vW3kLm7TpX2sRb5NhY8dC'+'4fG1jUe6', PLAIN='hunter2-VALUE-77';
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
['값이 숫자',`var pin = 1; var secret = ${PLAIN.replace(/\D/g,'')||'12345'};`,'12345'],
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
let leakO=0,leakN=0,failClosed=0;const rows=[];
for(const [n,src,sec] of T){const o=OLD.redact(src),w=NEW.redact(src);const lo=o.ok&&o.text.includes(sec),lw=w.ok&&w.text.includes(sec);if(lo)leakO++;if(lw)leakN++;if(!w.ok)failClosed++;rows.push([n,lo?'노출':(o.ok?'가림':'차단'),lw?'노출':(w.ok?'가림':'차단')]);}
console.log('항목'.padEnd(28),'이전(2eed163)','현재(보완본)');for(const r of rows)console.log(r[0].padEnd(28),r[1].padEnd(12),r[2]);
console.log(`\n이전 노출 ${leakO}건 / 보완본 노출 ${leakN}건 / 보완본 차단(fail-closed) ${failClosed}건 (총 ${T.length})`);
// 정상 GAS 가 지나치게 차단되지 않는지
const OK=[`function doGet(e){var t=e.parameter.t;var r=GOOGLEFINANCE(t,"price");return ContentService.createTextOutput(JSON.stringify({price:r})).setMimeType(ContentService.MimeType.JSON);}`,
`const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('시세');const v=sh.getRange('A1:B10').getValues();// 값 읽기\nreturn v.map(function(r){return {ticker:r[0],price:Number(r[1])};});`,
`{"005930":71500,"AAPL":189.42,"usdKrw":1412.5,"asOf":"2026-11-06T06:30:00Z"}`,
`function fetchFx(){var res=UrlFetchApp.fetch("https://example.test/api/fx?base=USD&quote=KRW");var j=JSON.parse(res.getContentText());return j.rate;}`,
`var cb=e.parameter.callback;return ContentService.createTextOutput(cb+"("+JSON.stringify(data)+")");`];
OK.forEach((s,i)=>{const w=NEW.redact(s);console.log('정상 스크립트',i+1,w.ok?(w.text===s?'원문 유지':'일부 변경(가림 '+w.total+')'):'차단됨');});
