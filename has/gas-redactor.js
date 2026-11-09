/* 메모리 안에서만 동작: 저장·전송·파일 없음. */
(function () {
  'use strict'; var $ = function (id) { return document.getElementById(id); };
  var revision = 0, copiedInput = null, pending = false;
  function say(m) { $('status').textContent = m; }
  function invalidate() { revision++; copiedInput = null; $('out').value = ''; $('summary').replaceChildren(); }
  $('in').addEventListener('input', function () { invalidate(); say('입력이 바뀌었습니다. 다시 가리기를 누르세요.'); });
  $('run').addEventListener('click', function () {
    invalidate();
    var input = $('in').value, r = window.HASGasRedact.redact(input); $('out').value = r.ok ? r.text : ''; var s = $('summary');
    r.warnings.forEach(function (w) { var p = document.createElement('p'); p.textContent = w; s.appendChild(p); });
    if (!r.ok) { say('가리지 못했습니다. 결과를 복사할 수 없습니다.'); return; }
    copiedInput = input;
    var names = Object.keys(r.counts); say(r.total ? ('가린 값 ' + r.total + '개: ' + names.map(function (n) { return n + ' ' + r.counts[n]; }).join(', ')) : '가릴 값을 찾지 못했습니다. 그래도 직접 확인하세요.');
  });
  $('copy').addEventListener('click', function () {
    var o = $('out');
    if (pending) return;
    if (!o.value || copiedInput !== $('in').value) { invalidate(); say('먼저 현재 입력을 다시 가리세요.'); return; }
    var version = revision, input = copiedInput, value = o.value;
    function finish(ok) {
      pending = false; $('copy').disabled = false;
      if (version !== revision || input !== $('in').value || value !== o.value) {
        say(ok ? '복사 도중 입력 또는 결과가 바뀌었습니다. 클립보드에는 이전 결과가 있을 수 있으니 다시 가리고 복사하세요.' : '복사하지 못했습니다. 현재 입력을 다시 가리고 복사하세요.'); return;
      }
      say(ok ? '결과를 복사했습니다. 붙여넣기 전에 한 번 더 확인하세요.' : '복사하지 못했습니다. 클립보드에 원본이 남아 있을 수 있습니다. 결과를 선택해 직접 복사하세요.');
    }
    pending = true; $('copy').disabled = true;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        Promise.resolve(navigator.clipboard.writeText(value)).then(function () { finish(true); }, function () { finish(false); });
      } else { o.select(); finish(document.execCommand('copy') === true); }
    } catch (e) { finish(false); }
  });
  $('reset').addEventListener('click', function () { $('in').value = ''; invalidate(); say('입력과 결과를 비웠습니다.'); });
  window.addEventListener('pageshow', function () { $('in').value = ''; invalidate(); say('대기 중'); });
})();
