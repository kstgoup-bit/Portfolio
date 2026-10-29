/* KST (stage13): 저장된 응답 1쪽의 "구조"만 설명한다(값은 출력하지 않음). 사용자가 본인 PC에서 실응답을 받은 뒤, 값 없이 구조만 공유해
   가이드 예시(XML)·가정(JSON)과 대조하는 용도. Pure. 결과에는 경로·개수·값의 종류(숫자/영숫자/텍스트/빈값)·최대 길이만 들어간다. */
'use strict';
const GUIDE_ITEM_FIELDS = Object.freeze(['basDt', 'srtnCd', 'isinCd', 'mrktCtg', 'itmsNm', 'crno', 'corpNm']);
const REQUIRED_ITEM_FIELDS = Object.freeze(['basDt', 'srtnCd', 'isinCd', 'mrktCtg', 'itmsNm']);
const kindOf = v => { const s = String(v); if (s === '') return 'empty'; if (/^-?\d+(\.\d+)?$/.test(s)) return 'numeric'; if (/^[0-9A-Za-z]+$/.test(s)) return 'alnum'; return 'text'; };
function add(map, path, kind, len) { const e = map.get(path) || { path, count: 0, kinds: new Set(), maxLen: 0 }; e.count++; if (kind) e.kinds.add(kind); e.maxLen = Math.max(e.maxLen, len || 0); map.set(path, e); }
function walkJson(v, path, map, depth) {
  if (depth > 6 || map.size > 300) return;
  if (Array.isArray(v)) { add(map, path + '#array', 'array', v.length); for (const x of v.slice(0, 5000)) walkJson(x, path + '[]', map, depth + 1); }
  else if (v && typeof v === 'object') { add(map, path, 'object', Object.keys(v).length); for (const [k, x] of Object.entries(v)) walkJson(x, path ? path + '.' + k : k, map, depth + 1); }
  else add(map, path, v === null ? 'null' : typeof v === 'string' ? 'string:' + kindOf(v) : typeof v, String(v).length);
}
function walkXml(text, map) {
  const re = /<(\/?)([A-Za-z_][\w.-]*)\s*(\/?)>|([^<]+)/g, stack = []; let m;
  while ((m = re.exec(text.replace(/<\?xml[^>]*\?>/g, '')))) {
    if (m[2]) {
      if (m[1]) { stack.pop(); continue; }
      stack.push(m[2]); add(map, stack.join('.'), null, 0); if (m[3]) stack.pop();
    } else if (stack.length && m[4].trim()) { const t = m[4].trim(); add(map, stack.join('.'), kindOf(t), t.length); }
  }
}
function describeShape(text) {
  const out = { ok: false, format: null, error: null, paths: [], itemCount: null, itemFields: [], note: '값은 포함하지 않음(경로·개수·종류·최대 길이만)' };
  if (typeof text !== 'string' || !text.trim()) { out.error = '빈 입력'; return out; }
  const t = text.trim(), map = new Map();
  try {
    if (t.startsWith('{') || t.startsWith('[')) { out.format = 'json'; walkJson(JSON.parse(t), '', map, 0); }
    else if (t.startsWith('<')) { out.format = 'xml'; walkXml(t, map); if (!map.size) throw new Error('태그 없음'); }
    else { out.error = 'JSON/XML이 아님(오류 문구일 수 있음, 값은 보고하지 않음)'; out.format = 'text'; return out; }
  } catch (e) { out.error = '파싱 실패: ' + String(e.message).slice(0, 60); return out; }
  out.paths = [...map.values()].map(e => ({ path: e.path, count: e.count, kinds: [...e.kinds].sort(), maxLen: e.maxLen })).sort((a, b) => a.path < b.path ? -1 : 1);
  const itemPaths = out.paths.filter(p => /(^|\.)item(\[\])?\.[^.]+$/.test(p.path) && !/\[\]\.[^.]+\./.test(p.path));
  out.itemFields = [...new Set(itemPaths.map(p => p.path.split('.').pop()))].sort();
  const itemNode = out.paths.find(p => /(^|\.)item(\[\])?$/.test(p.path)); out.itemCount = itemNode ? itemNode.count : 0;
  out.ok = true; return out;
}
/* 가이드(XML)·가정(JSON)과 대조. "일치"는 가정이 확정됨을 뜻하지 않는다 — 사람이 원본과 대조해야 한다. */
function compareToExpectation(shape) {
  const r = { assumedStatus: shape.format === 'json' ? 'assumed-unconfirmed' : 'guide-example-based', missingRequired: [], unexpectedFields: [], headerBodyOk: false, note: '구조 대조일 뿐 데이터 정확성·공식성 확인이 아님' };
  if (!shape.ok) { r.missingRequired.push('구조 해석 불가'); return r; }
  const has = suffix => shape.paths.some(p => p.path.endsWith(suffix));
  r.headerBodyOk = ['header.resultCode', 'header.resultMsg', 'body.numOfRows', 'body.pageNo', 'body.totalCount'].every(has);
  r.missingRequired = REQUIRED_ITEM_FIELDS.filter(f => !shape.itemFields.includes(f));
  r.unexpectedFields = shape.itemFields.filter(f => !GUIDE_ITEM_FIELDS.includes(f));
  r.matchesExpectation = r.headerBodyOk && r.missingRequired.length === 0;
  return r;
}
module.exports = { GUIDE_ITEM_FIELDS, REQUIRED_ITEM_FIELDS, describeShape, compareToExpectation };
