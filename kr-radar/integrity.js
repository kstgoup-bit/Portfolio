/* KST (stage10): tamper / fake-file detection for listing packages. Pure; the caller supplies the original CSV text and its SHA-256. */
'use strict';
const P = require('./pack.js');
const MARKERS = /(예시|시험|공식\s*아님|샘플|sample|example|test|dummy|가상)/i;
function verifyPackageAgainstCsv(csvText, pkg, fileSha256) {
  const errors = [];
  if (!pkg || !pkg.provenance || !Array.isArray(pkg.rows)) return { ok: false, errors: ['패키지 형식 오류'], official: false };
  if (fileSha256 !== pkg.provenance.sha256) errors.push('원본 CSV 해시가 패키지 provenance.sha256과 다름(변조 또는 다른 파일)');
  const rebuilt = P.buildPackage(csvText, { provider: pkg.provenance.provider || 'x', datasetName: pkg.provenance.datasetName || 'x', sourceUrl: pkg.provenance.sourceUrl || 'x', queriedAt: pkg.provenance.queriedAt, licenseNote: pkg.provenance.licenseNote || 'x' }, { fileSha256 });
  if (!rebuilt.ok) errors.push('CSV 재해석 실패: ' + rebuilt.errors.join('; '));
  else {
    if (JSON.stringify(rebuilt.pkg.rows) !== JSON.stringify(pkg.rows)) errors.push('패키지 행이 원본 CSV와 다름');
    if (rebuilt.pkg.provenance.baseDate !== pkg.provenance.baseDate) errors.push('기준일이 원본 CSV와 다름');
    if (rebuilt.pkg.provenance.rowCount !== pkg.provenance.rowCount) errors.push('행 수가 원본 CSV와 다름');
  }
  const text = [pkg.provenance.provider, pkg.provenance.datasetName, pkg.provenance.sourceUrl, pkg.provenance.licenseNote].join(' ');
  const official = !MARKERS.test(text) && /^https:\/\/(www\.)?data\.go\.kr\//.test(pkg.provenance.sourceUrl || '') ;
  return { ok: errors.length === 0, errors, official, officialNote: official ? '출처 표기가 공공데이터포털(data.go.kr) https 주소이고 시험·예시 표식이 없음 — 실제 원본 여부는 사람이 확인' : '공식 데이터로 인정하지 않음(예시·시험 표식 또는 data.go.kr 출처 아님)' };
}
module.exports = { MARKERS, verifyPackageAgainstCsv };
