'use strict';
/* 24단계 제1과제: main 대비 변경 파일(316개)의 원인·분류·운영 영향·최소 변경 집합을 git 기록에서 계산해 마크다운으로 만든다. 파일을 삭제하거나 되돌리지 않는다(읽기 전용).
   사용법: node tools/diff-analysis-stage24.cjs [origin/main] [출력.md] */
const { execSync } = require('child_process'), fs = require('fs'), path = require('path');
const sh = c => execSync(c, { encoding: 'utf8', maxBuffer: 1e9 }).trim(), BASE = process.argv[2] || 'origin/main', OUT = process.argv[3];
const files = sh(`git diff --name-only ${BASE}..HEAD`).split('\n').filter(Boolean), numstat = {};
sh(`git diff --numstat ${BASE}..HEAD`).split('\n').forEach(l => { const [a, d, f] = l.split('\t'); numstat[f] = [+a || 0, +d || 0]; });
const size = f => { try { return fs.statSync(f).size; } catch { return 0; } };
// 단계 구분은 커밋 이력(커밋 메시지의 단계 번호)을 사람이 확인해 만든 표다. 목록에 없는 새 커밋은 24단계로 센다.
const STAGE_BY_COMMIT = { '730007c': '2~5', '0c28f1e': '6', d678c15: '7', '1a0b337': '8', fbd710b: '9', a09dd47: '10', '48b47b5': '11', '97707df': '12', '0480f27': '13', '39be6e0': '14', '39e3a41': '15', aea7c3a: '16', '61e1964': '17', '6c4f420': '18', '138537e': '19',
  fe65dfb: '20', f3565ef: '20', bb1eb21: '20', '301b846': '20', '11549e1': '20', '48b54c9': '20', '5227928': '21(연도별 합계)', '5b7b8fd': '21(KIS)', '67f985d': '21(KIS)', '3b3f416': '21(KIS)', '650f0df': '21(KIS)', b89ff7d: '21(KIS)', fa9cdcc: '23', f121973: '23' };
const first = {}, commits = [];
sh(`git log --reverse --name-status --format="@%h|%s" ${BASE}..HEAD`).split('\n').reduce((h, l) => { if (l[0] === '@') { h = l.slice(1); commits.push(h); return h; } const m = l.match(/^[AM]\t(.+)/); if (m && !(m[1] in first)) first[m[1]] = h.split('|')[0]; return h; }, '');
const subj = {}; commits.forEach(c => { const [h, s] = c.split('|'); subj[h] = s; });
const stageOf = h => STAGE_BY_COMMIT[h] || '24';
const cat = f => /^(portfolio_v5\.html|manifest\.json|service-worker\.js)$/.test(f) ? '1 운영 앱 본체(기존 파일 수정)' : /\.(png|jpg|gif)$/.test(f) || /^docs\/(evidence|screenshots|stage15-screens)/.test(f) ? '8 캡처·증빙 이미지/요약' : /^docs\//.test(f) ? '7 문서' : /^tests\/(fixtures|lib)/.test(f) ? '6 시험 고정자료·도구' : /^tests\//.test(f) ? '5 시험 코드' : /^tools\//.test(f) ? '4 PC 도구(앱이 읽지 않음)' : /^(kr-radar|radar)\/.*data\//.test(f) ? '9 데이터 스냅샷(JSON)' : /^(radar|backup|invest|has)\/.*\.(js|css|html)$/.test(f) ? '2 앱 모듈(has·radar·backup·invest; 일부만 앱이 불러옴)' : /^kr-radar\//.test(f) ? '3 국장 레이더 모듈(앱이 읽지 않음)' : '0 기타(설정·시험도구)';
const html = fs.readFileSync('portfolio_v5.html', 'utf8'), loaded = new Set([...html.matchAll(/<(?:script|link)[^>]*(?:src|href)="([^":]+)"/g)].map(m => m[1]));
const g = {}; files.forEach(f => { const c = cat(f); g[c] = g[c] || { n: 0, a: 0, d: 0, b: 0, ex: [] }; g[c].n++; g[c].a += numstat[f][0]; g[c].d += numstat[f][1]; g[c].b += size(f); if (g[c].ex.length < 3) g[c].ex.push(f); });
const byStage = {}; files.forEach(f => { const s = stageOf(first[f] || ''); byStage[s] = (byStage[s] || 0) + 1; });
const runtime = files.filter(f => loaded.has(f)), runtimeBytes = runtime.reduce((s, f) => s + size(f), 0);
const notLoadedModules = files.filter(f => /^(radar|backup|invest|has|kr-radar)\/.*\.(js|css|html)$/.test(f) && !loaded.has(f));
const big = files.filter(f => size(f) > 100000).map(f => [f, size(f)]).sort((a, b) => b[1] - a[1]);
const rows = Object.keys(g).sort().map(k => `| ${k.slice(2)} | ${g[k].n} | +${g[k].a}/-${g[k].d} | ${(g[k].b / 1024).toFixed(0)} KB | ${g[k].ex.map(x => '`' + x + '`').join(', ')} |`).join('\n');
const stageRows = Object.entries(byStage).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]) || a[0].localeCompare(b[0])).map(([k, v]) => `| ${k}단계 | ${v} |`).join('\n');
const doc = `# HAS 24단계 — main 대비 변경 ${files.length}개 파일 원인 분석

생성: \`node tools/diff-analysis-stage24.cjs\` (git 기록만 읽음 · 파일 삭제·되돌림 없음) · 기준 ${BASE} → HEAD ${sh('git rev-parse --short HEAD')} · 총 변경 ${files.length}개, +${Object.values(numstat).reduce((s, x) => s + x[0], 0)}/-${Object.values(numstat).reduce((s, x) => s + x[1], 0)}줄

## 1. 결론 먼저
1. **지시서의 316개(23단계 보고 시점; 보고서 커밋 포함 지금은 ${files.length}개)는 23단계 신규 변경이 아니라 2~23단계가 main에 한 번도 병합되지 않고 쌓인 누적 결과입니다.** 23단계가 처음 추가·수정한 파일은 ${byStage['23'] || 0}개(보고서 포함)입니다. (main은 아직 fd25993 그대로)
2. 운영 앱이 **실제로 불러오는 파일**은 ${runtime.length}개(${(runtimeBytes / 1024).toFixed(0)} KB)뿐이고, 나머지 ${files.length - runtime.length}개는 문서·시험·PC 도구·증빙·데이터·앱 미연결 모듈입니다. 운영 영향은 변경 개수가 아니라 **앱 본체 2개(portfolio_v5.html, manifest.json)와 그것이 불러오는 파일**로 판단해야 합니다.
3. 투자 원장·백업에 영향을 주는 변경은 **백업 v6 모듈(backup/core.js, backup/ui.js)과 portfolio_v5.html의 내보내기·복원 함수 교체**입니다(§4). 이것이 운영 반영에서 가장 위험한 부분입니다.
4. 임의로 파일을 삭제하거나 기능을 되돌리지 않았습니다.

## 2. 단계별 최초 추가 파일 수 (커밋 메시지 기준)
| 단계 | 최초 추가·수정 파일 수 |
|---|---|
${stageRows}

## 3. 기능별 분류
| 분류 | 파일 | 줄(추가/삭제) | 크기 | 예 |
|---|---|---|---|---|
${rows}

운영 앱이 불러오는 파일(${runtime.length}개): ${runtime.map(f => '`' + f + '`').join(', ')}
앱이 읽지 않는 모듈(시험·합성 화면 등, ${notLoadedModules.length}개): ${notLoadedModules.slice(0, 40).map(f => '`' + f + '`').join(', ')}${notLoadedModules.length > 40 ? ' …' : ''}

## 4. 기존 투자 원장·백업·복원에 영향을 주는 변경
| 변경 | 위치 | 영향 | 위험 평가 |
|---|---|---|---|
| 내보내기·복원 함수 교체 | portfolio_v5.html 의 exportData/importData 본문(-109줄 대부분) → backup/core.js·ui.js 가 덮어씀 | **백업 파일 형식이 새 v6로 바뀜**(구버전 v4/v5는 읽기 호환). 복원은 미리보기→사본 보관→적용→되돌리기 | **높음** — 실제 기록 복원 경로 변경. 합성 시험은 통과했으나 실제 백업 파일 복원 리허설 0회 |
| 저장 키 | 없음 | v5_* 키 이름·형식 변경 없음, 새 키 \`kst.portfolio.restoreJournal\` 만 복원 시 추가 | 낮음 |
| 원장 시범·연도별 합계 | has/ledger-*.js | 읽기 전용(연도별 합계는 renderLedger 를 감싸 표시만 추가), 시범은 별도 키 미사용 | 낮음 |
| 가격 신뢰 띠 | has/price-trust*.js | 표시 전용 | 낮음 |
| 위험 조회 버튼 문구 | portfolio_v5.html | "미검증 출처" 표기만 변경 | 낮음 |
| 앱 이름·제목 | portfolio_v5.html, manifest.json | 홈 화면 아이콘 이름·제목 변경(사용자가 눈으로 바로 보는 변화) | 중간(기록 영향 없음) |
| 신규 탭 2개 | portfolio_v5.html | 곡소리 레이더·원장 시범(합성) | 낮음, 운영에는 불필요 |

## 5. 불필요한 생성물·시험 산출물 포함 여부
- 캡처·증빙 이미지/요약 ${g['8 캡처·증빙 이미지/요약'] ? g['8 캡처·증빙 이미지/요약'].n : 0}개(${g['8 캡처·증빙 이미지/요약'] ? (g['8 캡처·증빙 이미지/요약'].b / 1024).toFixed(0) : 0} KB), 데이터 스냅샷 JSON ${g['9 데이터 스냅샷(JSON)'] ? g['9 데이터 스냅샷(JSON)'].n : 0}개(${g['9 데이터 스냅샷(JSON)'] ? (g['9 데이터 스냅샷(JSON)'].b / 1024).toFixed(0) : 0} KB)는 **운영 앱에 불필요**합니다. 문서 ${g['7 문서'] ? g['7 문서'].n : 0}개도 마찬가지입니다.
- 100 KB 초과 파일: ${big.length ? big.map(([f, s]) => '`' + f + '` ' + (s / 1024).toFixed(0) + 'KB').join(', ') : '없음'}
- 비밀값 검사: \`node tools/scan-secrets.cjs\` 결과 findings 0 (24단계 실행 시점).
- 참고(기존 사항): portfolio_v5.html 에는 main 에도 있는 기본 비밀번호 상수(PW_DEFAULT)가 있습니다. 이번 변경이 만든 것이 아니며 값은 이 문서에 적지 않습니다.

## 6. 운영 앱에 필요한 최소 변경 집합 제안 (적용은 별도 승인)
| 단계 | 내용 | 변경 | 위험 | 비고 |
|---|---|---|---|---|
| A | 연도별 합계 카드(읽기 전용) | has/ledger-years.js + script 태그 1줄 | 낮음 | 사용자가 요청한 기능. 이름·탭·백업 변경 없이 단독 반영 가능 |
| B | 가격 신뢰 띠·가독성 | has/price-trust*.js, has/readability.css + 태그 | 낮음 | 표시 전용 |
| C | 백업 v6 | backup/core.js, backup/ui.js, 내보내기·복원 교체 | **높음** | 사용자의 실제 백업 파일로 복원 리허설을 먼저. 별도 승인 |
| D | 이름·아이콘 변경 | title·manifest·헤더 문구 | 중간 | 선택 사항 |
| E | AI 참모(읽기 전용 연결) | has/advisor-bridge 등 + 화면 | 낮음~중간 | 합성 단계. 실제 시세·키 없이는 '판단 보류'만 나옴 |
| 제외 | 곡소리 레이더·원장 시범 탭, kr-radar, tools, docs, tests, 증빙, 데이터 JSON | — | — | 운영 불필요 |

권장 순서: A → B → (사용자 백업으로 리허설 후) C. 한 번에 316개를 병합하는 것은 권하지 않습니다.
`;
if (OUT) fs.writeFileSync(OUT, doc); else console.log(doc);
