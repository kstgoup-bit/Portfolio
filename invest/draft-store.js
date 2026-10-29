/* KST (stage16): 실험실 전용 임시 저장(초안) 저장소. 저장소 객체(storage)는 호출자가 주입한다 — 이 모듈은 전역 저장소에 직접 접근하지 않는다.
   안전 규칙: ① 키는 단 하나('kst.lab.s16.draft'), 앱 투자기록(v5_*)·백업 키는 읽지도 쓰지도 않음 ② 저장은 사용자의 명시적 요청 때만
   ③ 저장 실패(용량·차단)는 기존 초안을 지우지 않고 복구 안내를 반환 ④ 손상/버전 불일치는 삭제하지 않고 알림 ⑤ 삭제는 이 키만. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.KSTDraftStore = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const KEY = 'kst.lab.s16.draft', FORMAT = 'kst-lab-draft', VERSION = 1, MAX_BYTES = 2 * 1024 * 1024;
  const day = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
  const bytes = s => { let n = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : (c >= 0xd800 && c < 0xdc00 ? (i++, 4) : 3); } return n; };
  const RECOVERY = '임시 저장에 실패했습니다. 지금 화면의 내용은 그대로이며, "내보내기" 버튼으로 파일을 보관하세요. 기존 임시 저장은 바뀌지 않았습니다.';
  function usable(storage) { return !!storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function' && typeof storage.removeItem === 'function'; }
  function errCode(e) { const n = e && (e.name || ''), m = String(e && e.message || ''); if (n === 'QuotaExceededError' || /quota/i.test(m) || (e && e.code === 22)) return 'quota'; if (n === 'SecurityError' || /denied|insecure/i.test(m)) return 'denied'; return 'unknown'; }
  /* payload: { tradesJson: string|null, thesesJson: string|null, themeText: string, thresholds: object } — 이미 검증된 내보내기 문자열을 그대로 담는다 */
  function save(storage, payload, savedAt) {
    if (!usable(storage)) return { ok: false, code: 'unavailable', message: '이 브라우저에서는 임시 저장을 쓸 수 없습니다. ' + RECOVERY };
    if (!payload || typeof payload !== 'object' || !day(savedAt)) return { ok: false, code: 'bad-input', message: '저장할 내용 또는 날짜 오류' };
    for (const k of ['tradesJson', 'thesesJson']) if (payload[k] != null && typeof payload[k] !== 'string') return { ok: false, code: 'bad-input', message: k + ' 형식 오류' };
    const body = { format: FORMAT, schemaVersion: VERSION, savedAt, tradesJson: payload.tradesJson ?? null, thesesJson: payload.thesesJson ?? null, themeText: typeof payload.themeText === 'string' ? payload.themeText : '', thresholds: payload.thresholds && typeof payload.thresholds === 'object' ? payload.thresholds : {} };
    let text; try { text = JSON.stringify(body); } catch { return { ok: false, code: 'bad-input', message: '직렬화 실패' }; }
    if (bytes(text) > MAX_BYTES) return { ok: false, code: 'too-large', message: '내용이 너무 큽니다(최대 2MB). ' + RECOVERY };
    try { storage.setItem(KEY, text); } catch (e) { return { ok: false, code: errCode(e), message: RECOVERY }; }
    let back; try { back = storage.getItem(KEY); } catch { back = null; }
    if (back !== text) return { ok: false, code: 'verify-failed', message: '저장 확인에 실패했습니다. ' + RECOVERY };
    return { ok: true, savedAt, bytes: bytes(text) };
  }
  function peek(storage) {
    if (!usable(storage)) return { ok: false, code: 'unavailable', message: '임시 저장을 쓸 수 없습니다' };
    let raw; try { raw = storage.getItem(KEY); } catch { return { ok: false, code: 'unavailable', message: '임시 저장을 읽을 수 없습니다' }; }
    if (raw === null || raw === undefined) return { ok: false, code: 'none', message: '임시 저장이 없습니다' };
    let o; try { o = JSON.parse(raw); } catch { return { ok: false, code: 'corrupt', message: '임시 저장이 손상되어 복원하지 않았습니다. 삭제하지 않았으며, 새로 저장하면 덮어씁니다.' }; }
    if (!o || o.format !== FORMAT) return { ok: false, code: 'corrupt', message: '임시 저장 형식이 달라 복원하지 않았습니다' };
    if (o.schemaVersion !== VERSION) return { ok: false, code: 'version', message: '임시 저장 버전(' + o.schemaVersion + ')을 이 화면이 지원하지 않습니다(지원: ' + VERSION + ')' };
    if (!day(o.savedAt) || typeof o.themeText !== 'string' || !o.thresholds || typeof o.thresholds !== 'object' || (o.tradesJson != null && typeof o.tradesJson !== 'string') || (o.thesesJson != null && typeof o.thesesJson !== 'string')) return { ok: false, code: 'corrupt', message: '임시 저장 내용 오류로 복원하지 않았습니다' };
    return { ok: true, state: o, savedAt: o.savedAt };
  }
  function discard(storage) { if (!usable(storage)) return { ok: false, code: 'unavailable' }; try { storage.removeItem(KEY); } catch (e) { return { ok: false, code: errCode(e) }; } return { ok: true }; }
  return { KEY, FORMAT, VERSION, MAX_BYTES, RECOVERY, save, peek, discard };
});
