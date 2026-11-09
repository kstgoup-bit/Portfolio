/* HAS 29단계 — "위험관리 > 매매 점검" 화면. 점검표를 채워 기록하고, 점검을 끝내고 진행했는지 스스로 돌아보게 한다.
   주문·매매·추천을 하지 않는다. 원장(v5_*)은 읽지도 쓰지도 않고, 저장은 has_pretrade_log_v1 하나뿐(모듈 안). 네트워크·innerHTML 없음.
   모듈이 없거나 저장소를 쓸 수 없으면 이 화면만 '사용할 수 없음'으로 표시한다(기존 앱은 영향 없음). */
(function () {
  'use strict';
  var W = window, root = null, side = 'buy', msg = null, seq = 0;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function mod() { return W.HASPretradeLog || null; }
  function store() { try { return mod() ? mod().createStore(W.localStorage) : null; } catch (e) { return null; } }
  function nowISO() { return new Date().toISOString(); }
  function kst(iso) { try { return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }); } catch (e) { return iso; } }
  function note(cls, text, tid) { var d = el('div', cls, text); if (tid) d.setAttribute('data-testid', tid); return d; }

  function render() {
    if (!root) return; root.replaceChildren(); var M = mod();
    root.appendChild(el('h2', '', '📝 매매 전 점검 · 사유 기록'));
    if (!M) { root.appendChild(note('pt-warn', '매매 점검 모듈을 불러오지 못해 이 화면을 사용할 수 없습니다. 기존 투자·백업 기능에는 영향이 없습니다.', 'pt-unavailable')); return; }
    root.appendChild(note('pt-note', '이 화면은 매수·매도를 하거나 권하지 않습니다. 결정 전에 점검하고, 이유와 반대 근거를 기록해 나중에 돌아보는 용도입니다. 최종 결정은 순태씨가 직접 합니다.'));
    var st = store(), loaded = st ? st.load() : { ok: false, entries: [], dropped: 0, error: 'storage-unavailable' };
    if (!loaded.ok) root.appendChild(note('pt-warn', '기록 저장소를 읽지 못했습니다(' + loaded.error + '). 새 기록은 저장하지 않습니다. 기존 기록은 그대로입니다.', 'pt-storage-warn'));
    if (loaded.dropped) root.appendChild(note('pt-warn', '형식이 맞지 않는 기록 ' + loaded.dropped + '건은 표시하지 않았습니다(삭제하지 않음).'));
    if (msg) { root.appendChild(note(msg.ok ? 'pt-ok' : 'pt-warn', msg.text, 'pt-msg')); msg = null; }
    root.appendChild(form(loaded.ok ? st : null));
    root.appendChild(history(st, loaded));
  }

  function form(st) {
    var M = mod(), c = el('section', 'pt-card'); c.setAttribute('data-testid', 'pt-form'); c.appendChild(el('h3', '', '새 점검'));
    var l1 = el('label', '', '구분'); l1.setAttribute('for', 'pt-side'); c.appendChild(l1);
    var sel = el('select'); sel.id = 'pt-side'; sel.setAttribute('data-testid', 'pt-side');
    Object.keys(M.SIDES).forEach(function (k) { var o = el('option', '', M.SIDES[k]); o.value = k; if (k === side) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', function () { side = sel.value; render(); }); c.appendChild(sel);
    var l2 = el('label', '', '종목 이름 또는 티커'); l2.setAttribute('for', 'pt-name'); c.appendChild(l2);
    var name = el('input'); name.type = 'text'; name.id = 'pt-name'; name.maxLength = 40; name.setAttribute('data-testid', 'pt-name'); c.appendChild(name);
    c.appendChild(el('h3', '', '점검표 (확인한 것만 체크하세요)'));
    var refs = {};
    M.required(side).forEach(function (k) {
      var def = M.CHECKS[k], row = el('label', 'pt-check'); var cb = el('input'); cb.type = 'checkbox'; cb.setAttribute('data-testid', 'pt-check-' + k); row.appendChild(cb); row.appendChild(el('span', '', def.label)); c.appendChild(row);
      var ta = null; if (def.research) { ta = el('input'); ta.type = 'text'; ta.maxLength = 200; ta.placeholder = '확인한 출처·핵심 내용 (예: 실적 발표 7/23, 가이던스 상향)'; ta.setAttribute('aria-label', def.label + ' 출처 메모'); ta.setAttribute('data-testid', 'pt-note-' + k); c.appendChild(ta); }
      refs[k] = { cb: cb, ta: ta };
    });
    function area(label, tid, max, ph) { var l = el('label', '', label); c.appendChild(l); var t = el('textarea'); t.maxLength = max; t.placeholder = ph || ''; t.setAttribute('data-testid', tid); t.setAttribute('aria-label', label); c.appendChild(t); return t; }
    var rf = area('이 결정의 이유', 'pt-for', 500), ra = area('반대 근거 — 이 결정이 틀릴 수 있는 이유', 'pt-against', 500), pl = area('계획 (분할 회차·금액·재점검일)', 'pt-plan', 300);
    var l3 = el('label', '', '지금 내 감정 상태'); c.appendChild(l3); var em = el('select'); em.setAttribute('data-testid', 'pt-emotion'); em.setAttribute('aria-label', '감정 상태');
    Object.keys(M.EMOTIONS).forEach(function (k) { var o = el('option', '', M.EMOTIONS[k]); o.value = k; em.appendChild(o); }); c.appendChild(em);
    var l4 = el('label', '', '결정'); c.appendChild(l4); var dc = el('select'); dc.setAttribute('data-testid', 'pt-decision'); dc.setAttribute('aria-label', '결정');
    Object.keys(M.DECISIONS).forEach(function (k) { var o = el('option', '', M.DECISIONS[k]); o.value = k; if (k === 'wait') o.selected = true; dc.appendChild(o); }); c.appendChild(dc);
    var b = el('button', '', '점검 결과 기록하기'); b.type = 'button'; b.setAttribute('data-testid', 'pt-save');
    b.addEventListener('click', function () {
      if (!st) { msg = { ok: false, text: '기록 저장소를 사용할 수 없어 저장하지 않았습니다.' }; render(); return; }
      var checks = {}; Object.keys(refs).forEach(function (k) { checks[k] = { done: refs[k].cb.checked, note: refs[k].ta ? refs[k].ta.value : '' }; });
      var t = nowISO(), entry = { id: (name.value.trim() || 'x') + '@' + t + '#' + (++seq), createdAt: t, name: name.value, side: side, checks: checks, reasonFor: rf.value, reasonAgainst: ra.value, emotion: em.value, plan: pl.value, decision: dc.value, review: null };
      var r = st.add(entry);
      if (!r.ok) msg = { ok: false, text: '저장하지 못했습니다: ' + (r.errors ? r.errors.join(', ') : r.error) };
      else { var a = M.assess(M.validate(entry).entry); msg = { ok: true, text: a.complete ? '기록했습니다. 점검이 모두 끝났습니다.' : '기록했습니다. 아직 비어 있는 점검 ' + a.missing.length + '건이 있습니다.' + (a.warnings.length ? ' ' + a.warnings.join(' ') : '') }; }
      render();
    });
    c.appendChild(b); return c;
  }

  function history(st, loaded) {
    var M = mod(), c = el('section', 'pt-card'); c.setAttribute('data-testid', 'pt-history'); c.appendChild(el('h3', '', '내 점검 기록'));
    var es = loaded.entries.slice().reverse(); if (!es.length) { c.appendChild(el('div', 'pt-kv', '아직 기록이 없습니다.')); return c; }
    var s = M.summarize(loaded.entries);
    c.appendChild(note('pt-kv', '전체 ' + s.total + '건 · 진행 ' + s.proceed + '건(점검 완료 ' + s.proceedComplete + ' / 점검 미완료 ' + s.proceedIncomplete + ') · 보류 ' + s.wait + ' · 취소 ' + s.cancel + ' · 감정 상태에서 진행 ' + s.emotionalProceed + '건 · 사후 메모 ' + s.reviewed + '건', 'pt-summary'));
    es.slice(0, 10).forEach(function (e) {
      var a = M.assess(e), d = el('div', 'pt-card'); d.setAttribute('data-testid', 'pt-entry');
      var r = el('div', 'pt-row'); r.appendChild(el('b', '', e.name + ' · ' + M.SIDES[e.side] + ' · ' + M.DECISIONS[e.decision])); r.appendChild(el('span', 'pt-kv', kst(e.createdAt))); d.appendChild(r);
      d.appendChild(el('div', 'pt-kv', a.complete ? '점검 완료' : '점검 미완료 ' + a.missing.length + '건'));
      if (a.missing.length) { var u = el('ul'); a.missing.forEach(function (m) { u.appendChild(el('li', 'pt-kv', m)); }); d.appendChild(u); }
      a.warnings.forEach(function (w) { d.appendChild(note('pt-warn', w)); });
      d.appendChild(el('div', 'pt-kv', '이유: ' + (e.reasonFor || '(없음)'))); d.appendChild(el('div', 'pt-kv', '반대 근거: ' + (e.reasonAgainst || '(없음)')));
      if (e.plan) d.appendChild(el('div', 'pt-kv', '계획: ' + e.plan));
      if (e.review) d.appendChild(note('pt-ok', '사후 메모(' + kst(e.review.at) + '): ' + e.review.note));
      else if (st) {
        var rv = el('input'); rv.type = 'text'; rv.maxLength = 500; rv.placeholder = '나중에 돌아보며 한 줄 메모 (결과·배운 점)'; rv.setAttribute('aria-label', '사후 메모'); rv.setAttribute('data-testid', 'pt-review-input'); d.appendChild(rv);
        var rb = el('button', 'pt-sub', '사후 메모 저장'); rb.type = 'button'; rb.setAttribute('data-testid', 'pt-review-save');
        rb.addEventListener('click', function () { var x = st.addReview(e.id, rv.value, nowISO()); msg = x.ok ? { ok: true, text: '사후 메모를 저장했습니다.' } : { ok: false, text: '저장하지 못했습니다: ' + x.error }; render(); });
        d.appendChild(rb);
      }
      c.appendChild(d);
    });
    return c;
  }

  function onTabChange(tab) {
    if (tab === 'pretrade') { root = document.getElementById('panel-pretrade'); try { render(); } catch (e) { if (root) { root.replaceChildren(); root.appendChild(note('pt-warn', '매매 점검 화면 오류로 표시하지 못했습니다. 기존 앱은 영향이 없습니다.')); } } }
    else if (root) { root.replaceChildren(); }
  }
  W.HASPretradePanel = { onTabChange: onTabChange };
})();
