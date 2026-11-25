// =====================================================================
// HAS 추가분: 곡소리 Top10 → 구글 시트 (매일 아침 클로 검토용).
// 기존 has-universe-screen.gs가 만든 공개 요약(PUBLIC)을 읽어 국내·미국 각각 Top10을 시트에 적는다.
// 읽기 전용: 곡소리 계산·doGet·KIS 코드는 바꾸지 않는다. 웹앱 응답도 추가하지 않는다(시트에만 씀).
// 시트에는 공개 목록(core) 종목만 쓴다. 보유·계좌·금액 정보는 쓰지 않는다. 키·토큰 없음.
//
// 처음 한 번: hasFearSheetSetup 실행 → 시트가 만들어지고 실행 로그에 주소가 찍힘 + 매일 06시대 자동 실행 등록.
// 시험: hasFearSheetWrite 실행 → 로그에 결과 요약.
// 시트 탭: 'latest'(매번 덮어씀), 'history'(같은 계산 세대는 한 번만 추가).
// =====================================================================
var HAS_FEAR_SHEET_PROP = 'HAS_FEAR_SHEET_ID';
var HAS_FEAR_SHEET_LIMIT = 10;
var HAS_FEAR_SHEET_HEADER = ['기록시각(KST)', '계산시각(UTC)', '세대', '시장', '순위', '티커', '하락률%', '가격', '통화', '가격기준일', '자료출처', '판단'];

function hasFearSheetSetup() {
  var ss = hasFearSheetBook_();
  // 같은 함수 트리거가 이미 있으면 지우고 하나만 둔다.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'hasFearSheetWrite') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('hasFearSheetWrite').timeBased().everyDays(1).atHour(6).nearMinute(30)
    .inTimezone('Asia/Seoul').create();
  Logger.log('시트 주소: ' + ss.getUrl());
  Logger.log('매일 06시대(한국시간) 자동 기록을 등록했어요.');
  hasFearSheetWrite();
}

function hasFearSheetBook_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(HAS_FEAR_SHEET_PROP), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('HAS 곡소리 Top10 (자동 기록)');
    props.setProperty(HAS_FEAR_SHEET_PROP, ss.getId());
  }
  ['latest', 'history'].forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(HAS_FEAR_SHEET_HEADER);
  });
  var first = ss.getSheetByName('시트1') || ss.getSheetByName('Sheet1');
  if (first && ss.getSheets().length > 2) ss.deleteSheet(first);
  return ss;
}

function hasFearSheetWrite() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('곡소리 계산이 실행 중이라 이번엔 건너뜀'); return; }
  var pub;
  try { pub = hasScreenRead_('PUBLIC'); } finally { lock.releaseLock(); }
  if (!pub) { Logger.log('아직 공개된 곡소리 계산이 없음(screen-not-published)'); return; }
  var now = Date.now();
  HASUniverseScreen.validateSummary(pub, now);
  var ranked = HASUniverseScreen.rank(pub, now).filter(function (r) { return r.scope === 'core'; });
  var stamp = Utilities.formatDate(new Date(now), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
  var rows = [];
  ['KR', 'US'].forEach(function (m) {
    ranked.filter(function (r) { return r.market === m; }).slice(0, HAS_FEAR_SHEET_LIMIT).forEach(function (r, i) {
      rows.push([stamp, pub.generatedAt, pub.generation, m, i + 1, r.ticker,
        Math.round(r.drawdownPct * 100) / 100, r.price, r.currency || '', r.asOf || '', r.source || '', r.opinion || '']);
    });
  });
  var ss = hasFearSheetBook_();
  var latest = ss.getSheetByName('latest');
  latest.clearContents();
  latest.appendRow(HAS_FEAR_SHEET_HEADER);
  if (rows.length) latest.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  else latest.appendRow([stamp, pub.generatedAt, pub.generation, '', '', '후보 없음(자료가 오래됐거나 부족)']);
  var hist = ss.getSheetByName('history'), last = hist.getLastRow(), dup = false;
  if (last > 1) dup = String(hist.getRange(last, 3).getValue()) === String(pub.generation);
  if (rows.length && !dup) hist.getRange(last + 1, 1, rows.length, rows[0].length).setValues(rows);
  var ageH = Math.round((now - Date.parse(pub.generatedAt)) / 36e5);
  Logger.log('계산 시각 ' + pub.generatedAt + '(' + ageH + '시간 전), 국내 ' +
    rows.filter(function (x) { return x[3] === 'KR'; }).length + '개 · 미국 ' +
    rows.filter(function (x) { return x[3] === 'US'; }).length + '개 기록' + (dup ? ' (history는 같은 세대라 추가 안 함)' : ''));
}
