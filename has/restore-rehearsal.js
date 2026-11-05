/* HAS 26단계 — 백업 복원 리허설(격리). 선택한 백업 파일을 읽기만 하고, 가짜(메모리) 저장소에서 복원·되돌리기·복원 도중 실패·손상 파일 거절을 연습한다.
   이 파일은 localStorage·sessionStorage·IndexedDB·네트워크·쿠키를 쓰지 않는다(정적 시험으로 확인). 보고 요약에는 파일 이름·크기·SHA-256·개수·시험 결과만 넣고 종목명·금액은 넣지 않는다. */
(function () {
  'use strict';
  var B = window.KSTPortfolioBackup, sha256 = window.KSTSha256 || null;
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  /* 가짜 저장소: Storage 와 같은 4개 메서드 + 쓰기 실패 주입 */
  function FakeStorage(init) { this.m = new Map(Object.entries(init || {})); this.fail = null; }
  FakeStorage.prototype.getItem = function (k) { return this.m.has(k) ? this.m.get(k) : null; };
  FakeStorage.prototype.setItem = function (k, v) { if (this.fail && this.fail(k, v)) throw new Error('주입된 저장 실패'); this.m.set(k, String(v)); };
  FakeStorage.prototype.removeItem = function (k) { this.m.delete(k); };
  FakeStorage.prototype.key = function (i) { return Array.from(this.m.keys())[i] === undefined ? null : Array.from(this.m.keys())[i]; };
  Object.defineProperty(FakeStorage.prototype, 'length', { get: function () { return this.m.size; } });
  FakeStorage.prototype.dump = function () { return JSON.stringify(Array.from(this.m.entries()).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; })); };
  FakeStorage.prototype.dumpWithout = function (skip) { return JSON.stringify(Array.from(this.m.entries()).filter(function (e) { return e[0] !== skip; }).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; })); };

  /* 가짜 '현재 앱 상태'(합성): 복원이 실제로 무언가를 바꿔야 의미가 있으므로 백업과 다른 내용을 둔다 */
  function baseline() {
    var s = new FakeStorage(); var st = function (id, t) { return { id: id, name: '합성 ' + t, ticker: t, quantity: 1, avgPrice: 1, currentPrice: 1 }; };
    s.setItem('v5_gen', JSON.stringify([st(1, 'SYNA')])); s.setItem('v5_dom', JSON.stringify([st(2, 'SYNB')])); s.setItem('v5_ov', JSON.stringify([st(3, 'SYNC')])); s.setItem('v5_pen', JSON.stringify([st(4, 'SYND')]));
    s.setItem('v5_div', '[]'); s.setItem('v5_ledger', '{}'); s.setItem('v5_fx', '1300'); s.setItem('v5_cma_amount', '1'); return s;
  }
  function hash(text) { return sha256 ? sha256(text) : 'sha256 모듈 없음'; }
  function bytesToHex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function fileSha(file, text) { // 원본 바이트의 SHA-256(가능하면 브라우저 암호 기능, 아니면 텍스트 기준)
    if (window.crypto && window.crypto.subtle && file.arrayBuffer) return file.arrayBuffer().then(function (ab) { return window.crypto.subtle.digest('SHA-256', ab); }).then(function (d) { return { hex: bytesToHex(d), how: '파일 바이트 기준' }; }).catch(function () { return { hex: hash(text), how: '글자 기준(대체 방식)' }; });
    return Promise.resolve({ hex: hash(text), how: '글자 기준(대체 방식)' });
  }
  function counts(plan) {
    var v = plan.values, out = [], names = { v5_gen: '일반', v5_dom: 'ISA', v5_ov: '해외', v5_pen: '연금' };
    B.ACCOUNTS.forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(v, k)) { out.push(names[k] + ': 백업에 없음(현재 값 유지)'); return; } var a = JSON.parse(v[k]), dep = a.filter(function (s) { return /^DEP_/.test(s.ticker); }).length; out.push(names[k] + ': 종목 ' + (a.length - dep) + '개 · 예수금 행 ' + dep + '개'); });
    function len(k, f) { if (!Object.prototype.hasOwnProperty.call(v, k)) return null; try { return f(JSON.parse(v[k])); } catch (e) { return null; } }
    var led = len('v5_ledger', function (o) { return Object.keys(o).length; }), div = len('v5_div', function (a) { return a.length; }), memo = len('v5_memos', function (a) { return a.length; });
    if (led !== null) out.push('가계부: ' + led + '개월'); if (div !== null) out.push('배당 기록: ' + div + '건'); if (memo !== null) out.push('메모: ' + memo + '건');
    out.push('복원 대상 항목 수: ' + Object.keys(v).length + '개' + (plan.legacy ? ' (이전 버전 백업)' : '')); return out;
  }
  function run(text) {
    var res = [], add = function (name, okk, detail) { res.push({ name: name, ok: !!okk, detail: detail || '' }); };
    var plan; try { plan = B.parse(text); add('백업 형식·필수 항목·안전성 검사', true, plan.legacy ? '이전 버전 형식으로 인식' : '현재(v6) 형식으로 인식'); } catch (e) { add('백업 형식·필수 항목·안전성 검사', false, '거절됨: ' + e.message); return { plan: null, res: res }; }
    try {
      var s = baseline(), pre = s.dump(); var rows = B.preview(s, plan); add('복원 미리보기(아직 적용 안 함)', s.dump() === pre && rows.length > 0, '변경될 항목 ' + rows.filter(function (r) { return r.changed; }).length + '개 · 미리보기가 저장소를 바꾸지 않음');
      B.apply(s, plan);
      var bad = Object.keys(plan.values).filter(function (k) { var exp = plan.values[k]; if (plan.legacy && (k === 'v5_snap' || k === 'v5_deposits')) return false; return s.getItem(k) !== exp; }); add('복원 적용 → 백업 내용과 항목별 완전 일치', !bad.length, bad.length ? '다른 항목 ' + bad.length + '개: ' + bad.join(',') : '모든 항목 일치');
      var untouched = Array.from(baseline().m.keys()).filter(function (k) { return !Object.prototype.hasOwnProperty.call(plan.values, k); }).every(function (k) { return s.getItem(k) === baseline().getItem(k); }); add('백업에 없는 현재 항목은 그대로 유지', untouched, untouched ? '유지됨' : '변경됨');
      var h1 = s.dumpWithout(B.JOURNAL); B.apply(s, plan); add('같은 백업을 한 번 더 적용해도 결과 동일', s.dumpWithout(B.JOURNAL) === h1, '반복 적용 안전');
      var s2 = baseline(), pre2 = s2.dumpWithout(B.JOURNAL); B.apply(s2, plan); B.undo(s2); var restored = s2.dumpWithout(B.JOURNAL) === pre2; add('복원 되돌리기 → 복원 직전 상태로 복귀', restored, restored ? '복원 전과 동일' : '복원 전과 다름');
      var s3 = baseline(), pre3 = s3.dumpWithout(B.JOURNAL), n = 0; s3.fail = function (k) { return k !== B.JOURNAL && ++n === 2; }; var failedOk = false; try { B.apply(s3, plan); } catch (e) { failedOk = /복원 실패|복구/.test(e.message); } s3.fail = null; var same3 = s3.dumpWithout(B.JOURNAL) === pre3; add('복원 도중 저장 실패(두 번째 항목에서 강제) → 자동 원복', failedOk && same3, failedOk ? (same3 ? '실패를 알리고 복원 전 상태로 복구' : '복구 불완전') : '실패 처리가 예상과 다름');
      var s4 = baseline(), pre4 = s4.dump(); s4.fail = function (k) { return k === B.JOURNAL; }; var refused = false; try { B.apply(s4, plan); } catch (e) { refused = true; } s4.fail = null; add('복원 전 사본을 저장하지 못하면(저장공간 부족) 복원 거부', refused && s4.dump() === pre4, refused ? '기록은 하나도 바뀌지 않음' : '거부하지 않음');
    } catch (e) { add('복원 연습 중 예기치 않은 오류', false, e.message); }
    var cut = text.slice(0, Math.max(10, Math.floor(text.length * 0.6))), rej1 = false, rej2 = false; try { B.parse(cut); } catch (e) { rej1 = true; } try { B.parse(text.replace(/"schemaVersion":\s*\d+/, '"schemaVersion": 99')); } catch (e) { rej2 = true; }
    add('손상(잘린) 파일은 거절', rej1, rej1 ? '거절됨' : '받아들임(위험)'); add('미래 버전 파일은 거절', rej2 || plan.legacy, plan.legacy ? '이전 버전 파일에는 해당 없음' : (rej2 ? '거절됨' : '받아들임(위험)'));
    return { plan: plan, res: res };
  }
  window.HASRestoreRehearsal = Object.freeze({ run: run });
  function show(file, text, sha, out) {
    var info = $('rhFileInfo'); info.replaceChildren(el('div', '', '파일: ' + file.name + ' · ' + file.size.toLocaleString('ko-KR') + '바이트'), el('div', 'mono', 'SHA-256(' + sha.how + '): ' + sha.hex));
    var box = $('rhResult'); box.replaceChildren(); var all = out.res.every(function (r) { return r.ok; });
    box.appendChild(el('div', all ? 'ok' : 'bad', all ? '✅ 모든 리허설 항목 통과' : '❌ 실패한 항목이 있습니다 — 이 파일로 실제 복원하지 마세요'));
    var t = el('table'); out.res.forEach(function (r) { var tr = el('tr'); tr.setAttribute('data-testid', 'rh-row'); tr.appendChild(el('td', r.ok ? 'ok' : 'bad', r.ok ? '통과' : '실패')); tr.appendChild(el('td', '', r.name)); tr.appendChild(el('td', '', r.detail)); t.appendChild(tr); }); box.appendChild(t);
    var cs = out.plan ? counts(out.plan) : []; if (cs.length) { box.appendChild(el('h2', '', '백업에 들어 있는 것(개수만)')); var u = el('ul'); cs.forEach(function (c) { u.appendChild(el('li', '', c)); }); box.appendChild(u); }
    var lines = ['[HAS 백업 복원 리허설 보고 요약]', '리허설 화면: has/restore-rehearsal.html (가짜 저장소에서만 연습, 실제 앱 저장소 미접촉, 외부 전송 없음)', '파일 이름: ' + file.name, '파일 크기: ' + file.size + '바이트', 'SHA-256(' + sha.how + '): ' + sha.hex, '결과: ' + (all ? '전체 통과' : '실패 있음')].concat(out.res.map(function (r) { return (r.ok ? '[통과] ' : '[실패] ') + r.name + (r.detail ? ' — ' + r.detail : ''); }), cs.map(function (c) { return '· ' + c; }), ['※ 이 요약에는 종목명·금액·계좌번호·키가 없습니다.', '※ 실제 앱에서의 복원은 이 리허설과 별개이며 아직 하지 않았습니다.']);
    $('rhReport').value = lines.join('\n');
  }
  function fail(msg) { $('rhResult').replaceChildren(el('div', 'bad', msg)); $('rhReport').value = ''; }
  $('rhFile').addEventListener('change', function (ev) {
    var f = ev.target.files && ev.target.files[0]; if (!f) return; if (!B) { fail('백업 검사 모듈을 불러오지 못했습니다. 이 화면은 사용할 수 없습니다(앱에는 영향 없음).'); return; }
    if (f.size > B.MAX_BYTES) { fail('파일이 너무 큽니다(최대 20MB).'); ev.target.value = ''; return; }
    f.text().then(function (text) { return fileSha(f, text).then(function (sha) { return f.text().then(function (again) { var out = run(text); out.res.push({ name: '파일을 읽기만 함(두 번 읽어 내용이 같음 = 시험 중 파일 불변)', ok: again === text, detail: '' }); show(f, text, sha, out); }); }); }).catch(function (e) { fail('파일을 읽지 못했습니다: ' + (e && e.message ? e.message : e)); });
    ev.target.value = '';
  });
  $('rhCopy').addEventListener('click', function () { var t = $('rhReport'); t.select(); try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value); else document.execCommand('copy'); } catch (e) { /* 복사 실패 시 직접 선택해 복사 */ } });
})();
