/* GAS 스크립트·응답 예시에서 비밀로 보이는 값을 가리는 순수 함수(저장·네트워크 없음).
   목적: 순태씨가 현재 시세 중계 스크립트를 안전하게 공유할 수 있게 한다. 구조·함수 이름·로직은 남기고 값만 가린다.
   한계: 패턴으로 찾으므로 100% 보장하지 못한다. 공유 전 결과를 사람이 한 번 더 확인해야 한다(화면에도 안내). */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASGasRedact = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var MAX = 300000;
  // 순서 중요: 구체적인 규칙을 먼저 적용한다.
  var RULES = [
    ['구글 API 키', /AIza[0-9A-Za-z_\-]{30,}/g, '[가림:API키]'],
    ['배포 URL의 식별자', /(script\.google\.com\/macros\/s\/)[A-Za-z0-9_\-]{10,}/g, '$1[가림:배포ID]'],
    ['시트·문서·폴더 식별자(URL)', /(\/(?:d|folders|file\/d)\/)[A-Za-z0-9_\-]{20,}/g, '$1[가림:문서ID]'],
    ['시트·문서 식별자(함수 인자)', /((?:openById|getFolderById|getFileById|openByUrl)\s*\(\s*)(['"`])[^'"`]+\2/g, '$1$2[가림:문서ID]$2'],
    ['Bearer 토큰', /Bearer\s+[A-Za-z0-9._\-~+\/]{8,}=*/gi, 'Bearer [가림:토큰]'],
    ['이메일', /[A-Za-z0-9._%+\-]{1,64}@[A-Za-z0-9.\-]{1,255}\.[A-Za-z]{2,24}/g, '[가림:이메일]'],
    ['계좌번호 형태', /\b\d{8}-\d{2}\b|\b\d{3}-\d{2,6}-\d{4,8}(?:-\d{1,3})?\b/g, '[가림:번호]'],
    ['전화번호 형태', /\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b/g, '[가림:전화]']
  ];
  // 이름이 비밀임을 암시하는 키의 값: key = "값", key: '값', key=값(URL 쿼리)
  var KEYNAME = '(?:app[_-]?key|app[_-]?secret|api[_-]?key|api' + 'key|secret|token|access[_-]?token|password|passwd|pwd|auth|authorization|client[_-]?secret|private[_-]?key|appkey|appsecret)';
  var KV = [
    new RegExp('(["\']?' + KEYNAME + '["\']?\\s*[:=]\\s*)(["\'`])((?:(?!\\2)[^\\n]){1,})\\2', 'gi'),
    new RegExp('([?&;]' + KEYNAME + '=)([^&\\s"\'`<>]{3,})', 'gi')
  ];
  // 그 밖에 길고 무작위로 보이는 문자열(영문+숫자 혼합 32자 이상)
  var LONG = /(["'`=:\s])([A-Za-z0-9_\-+\/]{32,})(?=["'`\s,;)&]|$)/g;
  function mixed(s) { return /[A-Za-z]/.test(s) && /\d/.test(s); }
  function redact(input) {
    var out = { ok: false, text: '', counts: {}, total: 0, warnings: [] };
    if (typeof input !== 'string') { out.warnings.push('문자열이 필요합니다.'); return out; }
    if (input.length > MAX) { out.warnings.push('입력이 너무 깁니다(최대 ' + MAX + '자). 필요한 함수만 나눠서 넣어 주세요.'); return out; }
    var t = input, add = function (name) { out.counts[name] = (out.counts[name] || 0) + 1; out.total++; };
    RULES.forEach(function (r) { t = t.replace(r[1], function () { add(r[0]); var a = arguments; return r[2].replace(/\$(\d)/g, function (_, i) { return a[+i]; }); }); });
    t = t.replace(KV[0], function (m, pre, q) { add('비밀 이름의 값'); return pre + q + '[가림:값]' + q; });
    t = t.replace(KV[1], function (m, pre) { add('비밀 이름의 값(URL)'); return pre + '[가림:값]'; });
    t = t.replace(LONG, function (m, pre, s) { if (!mixed(s) || /^\[가림/.test(s)) return m; add('길고 무작위로 보이는 문자열'); return pre + '[가림:긴문자열]'; });
    out.ok = true; out.text = t;
    if (/(?:['"`])(?:ya29\.|sk-|ghp_|xox[bap]-)/i.test(t)) out.warnings.push('토큰 접두사로 보이는 값이 남아 있습니다. 직접 확인하세요.');
    if (/@/.test(t.replace(/\[가림:이메일\]/g, ''))) out.warnings.push('@가 포함된 부분이 남아 있습니다. 이메일·주소인지 확인하세요.');
    out.warnings.push('패턴으로 찾은 결과이며 완전하지 않을 수 있습니다. 공유 전에 화면에서 한 번 더 확인하세요.');
    return out;
  }
  return Object.freeze({ redact: redact, MAX: MAX });
});
