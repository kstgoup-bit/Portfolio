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
    ['Bearer 토큰', /Bearer\s+[A-Za-z0-9._\-~+\/]{8,}=*/gi, 'Bearer [가림:토큰]'],
    ['이메일', /[A-Za-z0-9._%+\-]{1,64}@[A-Za-z0-9.\-]{1,255}\.[A-Za-z]{2,24}/g, '[가림:이메일]'],
    ['계좌번호 형태', /\b\d{8}-\d{2}\b|\b\d{3}-\d{2,6}-\d{4,8}(?:-\d{1,3})?\b/g, '[가림:번호]'],
    ['전화번호 형태', /\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b/g, '[가림:전화]']
  ];
  // 이름이 비밀임을 암시하는 키의 값: key = "값", key: '값', key=값(URL 쿼리)
  var KEYNAME = '(?:app[_-]?key|app[_-]?secret|api[_-]?key|api' + 'key|secret|token|access[_-]?token|password|passwd|pwd|auth|authorization|client[_-]?secret|private[_-]?key|appkey|appsecret)';
  var URLKV = new RegExp('([?&;]' + KEYNAME + '=)([^&\\s"\'`<>]{1,})', 'gi');
  var SECRET = new RegExp(KEYNAME + '$', 'i');
  var COMMENT_SECRET = new RegExp(KEYNAME + '[\"\']?\\s*[:=,]', 'i');
  // Small, conservative lexer, not a JavaScript parser. Never publish a partially
  // consumed sensitive expression. Comments and escaped delimiters are atomic.
  function literals(source, add) {
    var tokens = [], i = 0, n = source.length;
    while (i < n) {
      var start = i, ch = source[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (source.slice(i, i + 2) === '//') { while (i < n && source[i] !== '\n') i++; if (COMMENT_SECRET.test(source.slice(start, i))) throw new Error('boundary'); continue; }
      if (source.slice(i, i + 2) === '/*') {
        var close = source.indexOf('*/', i + 2); if (close < 0 || COMMENT_SECRET.test(source.slice(i, close))) throw new Error('boundary'); i = close + 2; continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        var q = ch, value = '', dynamic = false; i++;
        while (i < n && source[i] !== q) {
          if (source[i] === '\\') {
            i++; if (i >= n) throw new Error('boundary');
            var kind = source[i], len = kind === 'u' ? 4 : kind === 'x' ? 2 : 0;
            if (kind === 'u' && source[i + 1] === '{') {
              var endCode = source.indexOf('}', i + 2), hex = source.slice(i + 2, endCode);
              if (endCode < 0 || !/^[0-9a-f]{1,6}$/i.test(hex) || parseInt(hex, 16) > 0x10ffff) throw new Error('boundary');
              value += String.fromCodePoint(parseInt(hex, 16)); i = endCode + 1; continue;
            }
            if (/[1-9]/.test(kind) || (kind === '0' && /[0-9]/.test(source[i + 1] || ''))) throw new Error('boundary');
            if (len && new RegExp('^[0-9a-f]{' + len + '}$', 'i').test(source.slice(i + 1, i + 1 + len))) {
              value += String.fromCharCode(parseInt(source.slice(i + 1, i + 1 + len), 16)); i += len + 1;
            } else {
              if (len) throw new Error('boundary');
              var escapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' };
              if (kind === '\r' && source[i + 1] === '\n') i++;
              if (kind !== '\r' && kind !== '\n') value += Object.prototype.hasOwnProperty.call(escapes, kind) ? escapes[kind] : kind;
              i++;
            }
          } else {
            if (q === '`' && source.slice(i, i + 2) === '${') dynamic = true;
            if (q !== '`' && /[\r\n]/.test(source[i])) throw new Error('boundary');
            value += source[i++];
          }
        }
        if (i >= n) throw new Error('boundary');
        i++; tokens.push({ start: start, end: i, value: value, quote: q, dynamic: dynamic }); continue;
      }
      if (ch === '\\') throw new Error('boundary'); // Unsupported escaped identifiers/regex syntax: withhold.
      if (/[A-Za-z0-9_$]/.test(ch)) { while (i < n && /[A-Za-z0-9_$]/.test(source[i])) i++; }
      else i++;
      tokens.push({ start: start, end: i, value: source.slice(start, i) });
    }
    var edits = [];
    function hide(index, name) {
      var t = tokens[index], next = tokens[index + 1];
      if (!t || t.dynamic || (!t.quote && !/^\d+$/.test(t.value))) throw new Error('boundary');
      // Operators, calls, indexing and concatenation mean the secret continues.
      if (next && !/^[,;})\]]$/.test(next.value)) throw new Error('boundary');
      edits.push({ start: t.start, end: t.end, text: (t.quote || '"') + '[가림:값]' + (t.quote || '"') }); add(name);
    }
    tokens.forEach(function (t, k) {
      var next = tokens[k + 1], prev = tokens[k - 1];
      if (t.quote) {
        // Inspect the decoded value too, so escaped URLs/API prefixes cannot
        // bypass the same rules that protect their ordinary spellings.
        var clean = t.value;
        RULES.forEach(function (r) { clean = clean.replace(r[1], function () { add(r[0]); var args = arguments; return r[2].replace(/\$(\d)/g, function (_, j) { return args[+j]; }); }); });
        clean = clean.replace(URLKV, function (m, pre) { add('비밀 이름의 값(URL)'); return pre + '[가림:값]'; });
        clean = ('\"' + clean + '\"').replace(LONG, function (m, pre, v) { if (!mixed(v)) return m; add('길고 무작위로 보이는 문자열'); return pre + '[가림:긴문자열]'; }).slice(1, -1);
        if (clean !== t.value) {
          if (t.dynamic) throw new Error('boundary');
          edits.push({ start: t.start, end: t.end, text: JSON.stringify(clean) });
        }
      }
      if (SECRET.test(t.value)) {
        var operator = k + 1;
        // Static bracket access is as unambiguous as a dot/object property.
        if (t.quote && prev && prev.value === '[' && next && next.value === ']') operator++;
        var op = tokens[operator];
        if (op && /^[=:]$/.test(op.value)) hide(operator + 1, '비밀 이름의 값');
        else if (op && /^[+*\/%?&|^-]$/.test(op.value)) {
          // Compound/nullish assignments can retain earlier secret fragments.
          for (var j = operator + 1; j <= operator + 3 && tokens[j]; j++) {
            if (tokens[j].value === '=') throw new Error('boundary');
            if (!/^[?&|*]$/.test(tokens[j].value)) break;
          }
        }
      }
      if (t.quote && SECRET.test(t.value) && prev && prev.value === '(' && tokens[k - 2] && tokens[k - 2].value === 'setProperty' && next && next.value === ',') hide(k + 2, '비밀 이름의 값');
      if (!t.quote && /^(openById|getFolderById|getFileById|openByUrl)$/.test(t.value) && next && next.value === '(' && tokens[k + 2] && tokens[k + 2].quote) hide(k + 2, '시트·문서 식별자(함수 인자)');
    });
    edits.sort(function (a, b) { return a.start - b.start; });
    var parts = [], cursor = 0;
    edits.forEach(function (e) { if (e.start < cursor) return; parts.push(source.slice(cursor, e.start), e.text); cursor = e.end; });
    parts.push(source.slice(cursor)); return parts.join('');
  }
  // 그 밖에 길고 무작위로 보이는 문자열(영문+숫자 혼합 32자 이상)
  var LONG = /(["'`=:\s])([A-Za-z0-9_\-+\/]{32,})(?=["'`\s,;)&]|$)/g;
  function mixed(s) { return /[A-Za-z]/.test(s) && /\d/.test(s); }
  function redact(input) {
    var out = { ok: false, text: '', counts: {}, total: 0, warnings: [] };
    if (typeof input !== 'string') { out.warnings.push('문자열이 필요합니다.'); return out; }
    if (input.length > MAX) { out.warnings.push('입력이 너무 깁니다(최대 ' + MAX + '자). 필요한 함수만 나눠서 넣어 주세요.'); return out; }
    var t = input, add = function (name) { out.counts[name] = (out.counts[name] || 0) + 1; out.total++; };
    try { t = literals(t, add); } catch (e) { out.counts = {}; out.total = 0; out.warnings.push('비밀값의 경계를 안전하게 확인하지 못해 결과를 내보내지 않았습니다. 연결식·템플릿 표현식·미완성 문자열을 확인하고 필요한 부분만 나눠 넣어 주세요.'); return out; }
    RULES.forEach(function (r) { t = t.replace(r[1], function () { add(r[0]); var a = arguments; return r[2].replace(/\$(\d)/g, function (_, i) { return a[+i]; }); }); });
    t = t.replace(URLKV, function (m, pre) { add('비밀 이름의 값(URL)'); return pre + '[가림:값]'; });
    t = t.replace(LONG, function (m, pre, s) { if (!mixed(s) || /^\[가림/.test(s)) return m; add('길고 무작위로 보이는 문자열'); return pre + '[가림:긴문자열]'; });
    out.ok = true; out.text = t;
    if (/(?:['"`])(?:ya29\.|sk-|ghp_|xox[bap]-)/i.test(t)) out.warnings.push('토큰 접두사로 보이는 값이 남아 있습니다. 직접 확인하세요.');
    if (/@/.test(t.replace(/\[가림:이메일\]/g, ''))) out.warnings.push('@가 포함된 부분이 남아 있습니다. 이메일·주소인지 확인하세요.');
    out.warnings.push('패턴으로 찾은 결과이며 완전하지 않을 수 있습니다. 공유 전에 화면에서 한 번 더 확인하세요.');
    return out;
  }
  return Object.freeze({ redact: redact, MAX: MAX });
});
