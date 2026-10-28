/* KST (stage9): wrap a USER-SUPPLIED official listing CSV into the package format that listing.js verifies. Pure; fail-closed.
   Header names follow the response items documented on the data portal page (기준일자, 단축코드, ISIN코드, 시장구분, 종목명). No guessing of values. */
'use strict';
const { nonEmpty, day } = require('./common.js');
const HEADERS = Object.freeze({ baseDate: '기준일자', code: '단축코드', isin: 'ISIN코드', market: '시장구분', name: '종목명' });
function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  const t = String(text).replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); if (row.some(x => x !== '')) rows.push(row); }
  return rows;
}
const dateOf = s => { const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec((s || '').trim()); return m ? m[1] + '-' + m[2] + '-' + m[3] : null; };
function buildPackage(csvText, meta, { fileSha256 } = {}) {
  const errors = []; const rows = parseCsv(csvText);
  if (rows.length < 2) return { ok: false, errors: ['행 없음'], pkg: null };
  const idx = {}; for (const [k, h] of Object.entries(HEADERS)) { idx[k] = rows[0].map(x => x.trim()).indexOf(h); if (idx[k] < 0 && k !== 'isin') errors.push('헤더 누락: ' + h); }
  if (!meta || !nonEmpty(meta.provider) || !nonEmpty(meta.datasetName) || !nonEmpty(meta.sourceUrl) || !day(meta.queriedAt) || !nonEmpty(meta.licenseNote)) errors.push('meta(provider/datasetName/sourceUrl/queriedAt/licenseNote) 필요');
  if (!/^[0-9a-f]{64}$/.test(fileSha256 || '')) errors.push('원본 파일 SHA-256 필요');
  if (errors.length) return { ok: false, errors, pkg: null };
  const out = []; const bases = new Set();
  for (const r of rows.slice(1)) {
    const bd = dateOf(r[idx.baseDate]); if (!bd) { errors.push('기준일자 형식 오류: ' + r[idx.baseDate]); continue; } bases.add(bd);
    out.push({ code: (r[idx.code] || '').trim(), name: (r[idx.name] || '').trim(), market: (r[idx.market] || '').trim(), isin: idx.isin >= 0 ? (r[idx.isin] || '').trim() || null : null });
  }
  if (bases.size !== 1) errors.push('기준일자가 하나가 아님: ' + [...bases].join(','));
  if (errors.length) return { ok: false, errors, pkg: null };
  // market labels and code shapes are NOT translated here; listing.js rejects anything outside KOSPI/KOSDAQ/KONEX and 6-char codes.
  return { ok: true, errors: [], pkg: { provenance: { provider: meta.provider, datasetName: meta.datasetName, sourceUrl: meta.sourceUrl, baseDate: [...bases][0], queriedAt: meta.queriedAt, sha256: fileSha256, licenseNote: meta.licenseNote, rowCount: out.length }, rows: out } };
}
module.exports = { HEADERS, parseCsv, buildPackage };
