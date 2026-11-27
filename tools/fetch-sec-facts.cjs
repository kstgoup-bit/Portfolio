#!/usr/bin/env node
'use strict';
/* GitHub Actions에서 하루 한 번 SEC 재무(companyfacts)를 받아 has/fundamental-filter.js normalize() 결과만 저장한다.
 * 왜: Apps Script에서 SEC로 직접 가면 403(Request Rate Threshold Exceeded)로 막힘(2026-11-26 순태씨 진단).
 * 규칙: SEC 접속 규칙(User-Agent에 연락처 선언, 초당 10건 이하)을 지킨다 — 요청 간격 300ms, 직렬. 403·429가 한 번이라도 나오면
 *   남은 요청을 모두 멈추고 실패로 끝낸다(재시도·우회 없음). 종목별 실패는 그 종목만 기록하고 마지막 성공 파일은 지우거나 덮지 않는다.
 * 비밀: 연락처(User-Agent)는 환경변수 SEC_USER_AGENT(저장소 비밀값)로만 받고 어디에도 출력·저장하지 않는다.
 * 저장: data/fundamentals/<TICKER>.json(정리된 결과만, 원본 companyfacts 저장 안 함), data/fundamentals/index.json(상태 요약).
 * 투자 자문 아님. 앱 코드·GAS·사용자 자료 변경 없음. */
const fs = require('fs'), path = require('path');
const F = require('../has/fundamental-filter.js');
const V = require('../has/valuation-v1.js');
const GAP_MS = 300, MAX_BYTES = 30 * 1024 * 1024, TICKER_RE = /^[A-Z]{1,5}(?:[.-][A-Z])?$/;
const MAP_URL = 'https://www.sec.gov/files/company_tickers.json';
const cikOf = n => (typeof n === 'number' && Number.isSafeInteger(n) && n > 0 && n <= 9999999999 ? String(n) : typeof n === 'string' && /^\d{1,10}$/.test(n) && Number(n) > 0 ? String(Number(n)) : null);
const sleepReal = ms => new Promise(r => setTimeout(r, ms));
function readTickers(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!j || !Array.isArray(j.tickers) || j.tickers.length < 1 || j.tickers.length > 40) throw new Error('bad-ticker-list');
  const seen = new Set(), out = [];
  for (const t of j.tickers) { if (typeof t !== 'string' || !TICKER_RE.test(t)) throw new Error('bad-ticker-list'); if (!seen.has(t)) { seen.add(t); out.push(t); } }
  return out;
}
async function getText(fetchFn, url, ua) {
  const res = await fetchFn(url, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': ua, 'Accept-Encoding': 'gzip, deflate' } });
  if (res.status === 403 || res.status === 429) return { halt: 'sec-http-' + res.status };
  if (res.status !== 200) return { fail: 'sec-http-' + res.status };
  const text = await res.text();
  if (text.length > MAX_BYTES) return { fail: 'sec-response-too-large' };
  return { text };
}
async function run(opts) {
  const { fetchFn, outDir, tickers, ua, now, sleep, log } = opts;
  const say = log || (() => {}), wait = sleep || sleepReal, stamp = (now || new Date()).toISOString();
  if (typeof ua !== 'string' || ua.length < 10 || ua.length > 200 || !/@/.test(ua) || /[\r\n]/.test(ua)) { say('ua-missing-or-invalid'); return { ok: false, reason: 'ua-missing-or-invalid', items: {} }; }
  fs.mkdirSync(outDir, { recursive: true });
  const items = {}; let halted = null, map = null;
  const m = await getText(fetchFn, MAP_URL, ua);
  if (m.halt) { halted = m.halt; } else if (m.fail) { halted = 'sec-ticker-map-failed'; } else {
    try { const raw = JSON.parse(m.text); map = {}; for (const k of Object.keys(raw)) { const r = raw[k]; if (r && typeof r.ticker === 'string' && cikOf(r.cik_str)) map[r.ticker.toUpperCase()] = cikOf(r.cik_str); } } catch (e) { halted = 'sec-ticker-map-failed'; }
  }
  for (const t of tickers) {
    if (halted) { items[t] = { ok: false, reason: halted, checkedAt: stamp }; continue; }
    const cik = map && map[t];
    if (!cik) { items[t] = { ok: false, reason: 'unknown-ticker', checkedAt: stamp }; continue; }
    await wait(GAP_MS);
    let r;
    try { r = await getText(fetchFn, 'https://data.sec.gov/api/xbrl/companyfacts/CIK' + cik.padStart(10, '0') + '.json', ua); } catch (e) { items[t] = { ok: false, reason: 'sec-fetch-failed', checkedAt: stamp }; continue; }
    if (r.halt) { halted = r.halt; items[t] = { ok: false, reason: r.halt, checkedAt: stamp }; continue; }
    if (r.fail) { items[t] = { ok: false, reason: r.fail, checkedAt: stamp }; continue; }
    let raw; try { raw = JSON.parse(r.text); } catch (e) { items[t] = { ok: false, reason: 'sec-bad-json', checkedAt: stamp }; continue; }
    if (!raw || cikOf(raw.cik) !== cik) { items[t] = { ok: false, reason: raw && raw.cik !== undefined ? 'sec-cik-mismatch' : 'sec-cik-missing', checkedAt: stamp }; continue; }
    const n = F.normalize(raw, { ticker: t });
    if (!F.validNormalized(n) && !(n && n.ok === false)) { items[t] = { ok: false, reason: 'sec-normalize-failed', checkedAt: stamp }; continue; }
    if (n.ok !== true) { items[t] = { ok: false, reason: String(n.reason || 'sec-normalize-failed').slice(0, 40), checkedAt: stamp }; continue; }
    const rec = { version: 1, ticker: t, cik, fetchedAt: stamp, source: 'SEC EDGAR companyfacts (https://data.sec.gov/api/xbrl/companyfacts/CIK' + cik.padStart(10, '0') + '.json)', verification: 'unverified', normalized: n, shares: V.extractShares(raw) };
    const tmp = path.join(outDir, t + '.json.tmp');
    fs.writeFileSync(tmp, JSON.stringify(rec)); fs.renameSync(tmp, path.join(outDir, t + '.json'));
    items[t] = { ok: true, fetchedAt: stamp, asOf: n.years[0] ? n.years[0].end : null };
  }
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ version: 1, updatedAt: stamp, halted: halted, items: items }, null, 1) + '\n');
  say('done ok=' + Object.values(items).filter(x => x.ok).length + ' failed=' + Object.values(items).filter(x => !x.ok).length + (halted ? ' halted=' + halted : ''));
  return { ok: !halted, reason: halted, items };
}
module.exports = { run, readTickers, GAP_MS };
if (require.main === module) {
  const root = path.join(__dirname, '..');
  (async () => {
    const r = await run({ fetchFn: fetch, outDir: path.join(root, 'data', 'fundamentals'), tickers: readTickers(path.join(root, 'data', 'fundamentals', 'tickers.json')), ua: process.env.SEC_USER_AGENT, log: console.log });
    process.exit(r.ok ? 0 : 1);
  })().catch(() => { console.log('fetch-sec-facts-failed'); process.exit(1); });
}
