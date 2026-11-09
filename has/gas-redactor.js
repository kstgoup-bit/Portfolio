/* 메모리 안에서만 동작: 저장·전송·파일 없음. */
(function () {
  'use strict'; var $ = function (id) { return document.getElementById(id); };
  function say(m) { $('status').textContent = m; }
  $('run').addEventListener('click', function () {
    var r = window.HASGasRedact.redact($('in').value); $('out').value = r.ok ? r.text : ''; var s = $('summary'); s.replaceChildren();
    r.warnings.forEach(function (w) { var p = document.createElement('p'); p.textContent = w; s.appendChild(p); });
    if (!r.ok) { say('가리지 못했습니다.'); return; }
    var names = Object.keys(r.counts); say(r.total ? ('가린 값 ' + r.total + '개: ' + names.map(function (n) { return n + ' ' + r.counts[n]; }).join(', ')) : '가릴 값을 찾지 못했습니다. 그래도 직접 확인하세요.');
  });
  $('copy').addEventListener('click', function () { var o = $('out'); if (!o.value) { say('먼저 가리기를 누르세요.'); return; } o.select(); try { document.execCommand('copy'); say('결과를 복사했습니다. 붙여넣기 전에 한 번 더 확인하세요.'); } catch (e) { say('복사하지 못했습니다. 결과를 길게 눌러 직접 복사하세요.'); } });
  $('reset').addEventListener('click', function () { $('in').value = ''; $('out').value = ''; $('summary').replaceChildren(); say('입력과 결과를 비웠습니다.'); });
  window.addEventListener('pageshow', function () { $('in').value = ''; $('out').value = ''; $('summary').replaceChildren(); say('대기 중'); });
})();
