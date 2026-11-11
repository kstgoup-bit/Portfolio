# Portfolio

## 단일 반영 후보 · 2026-11-11

현재 정리본은 [후보 보고서](docs/release-candidate/REPORT.md)와 [폰 확인 목록](docs/release-candidate/PHONE-CHECKLIST.md)을 따른다. GAS 일일기록·미검증 참고값·v5 FG 호환을 중복 적용 없이 보존한 독립 로컬 후보다. 아래 과거 문서의 이관 보류 기준은 현재 보고서의 범위 구분과 최신 결정 기록을 함께 읽는다. 배포·실자료 이관 완료를 뜻하지 않는다.

## 일일기록 후속 수정 · 2026-11-11

[후속 수정 및 직접 검증 보고서](docs/daily-followup/REPORT.md)를 참조하세요. 코스피200 ETF의 설정 GAS 이력 우선 경로와 보유 변화 시 미검증 참고 수익률 표시를 보완했습니다. 원본 기록·main·운영은 변경하지 않은 독립 로컬 개발본입니다. 아래 문서는 각 작성 시점의 기록입니다.

## 29단계 판단 보류와 기록 보호 보완 2026년 11월 9일

현재 독립 개발본은 [검증 보고서](docs/stage29-evidence/REPORT.md), [읽기 전용 근거 연결](docs/stage29-evidence/ADAPTER.md), [종가 출처와 확정 근거 계약](docs/close-evidence/CONTRACT.md), [클로 후속 검토 안내](docs/stage29-evidence/REVIEW-HANDOFF.md)를 참조하세요. 아래 항목과 기존 팀 보고서는 이전 시점 기록입니다.

클로 29단계 전체 트리를 보존하면서, 자료 부족을 비중 축소 근거로 쓰던 판단과 점검기록 일부 손상의 덮어쓰기를 막았습니다. 환호성 감지와 축소 판단을 분리하고, 기존 엔진에 합성 자료를 읽기 전용으로 연결했습니다. 실제 자료의 신뢰는 입력 선언만으로 승인하지 않습니다. GAS·투자원장·백업 형식은 그대로이며 main·운영에 반영하지 않았습니다.

## 동일 거래 세션 종가 비교 · 2026-11-09

최신 독립 보완은 [직접 검증 보고서](docs/close-comparison/REPORT.md), [종가 계약](docs/close-comparison/CONTRACT.md), [공식 일봉 자료의 한계](docs/close-comparison/DAILY-SOURCE-GAPS.md), [FX 별도 적합 기준](docs/close-comparison/FX-SUITABILITY.md)을 참조하세요.

기존 `has/kis-comparison-lab.html`에서 동일 시각과 동일 거래 세션 종가 모드를 명확히 나눴습니다. 둘 다 합성/선언 자료의 오프라인 숫자 비교이며 실제 시세·공식성·최신성·출처 독립성을 인증하지 않습니다. 운영 앱이나 투자기록에 연결되지 않았습니다.

## GAS + KIS 추가 대조 · 2026-11-09

최신 독립 작업은 [검증 보고서](docs/kis-complementary/REPORT.md), [기존 단계 대조와 다음 계획](docs/kis-complementary/PLAN-AND-OVERLAP.md), [공식 자료 확인 범위](docs/kis-complementary/OFFICIAL-SOURCES.md)를 참조하세요.

`has/kis-comparison-lab.html`은 키·네트워크·저장 기능이 없는 별도 합성 시험 화면입니다. GAS를 유지하고 KIS 자료가 추가로 제공됐을 때의 엄격한 비교 조건만 시험합니다. 운영 연결·실시간 시세·모바일 실기기 검증 완료를 뜻하지 않습니다.

## HAS 독립 보완본 · 2026-11-09

현재 개발 결과는 [보완 보고서](docs/boundary-progress/REPORT.md), [직접 실행 시험](docs/boundary-progress/TEST-RESULTS.md), [클로 검토 안내](docs/boundary-progress/REVIEW-HANDOFF.md)를 참조하세요. 과거 보고서는 당시 기록으로 남아 있으며, 현재 시험 수나 보안 보장으로 재사용하지 않습니다.

- [JSON 입력 경계](docs/market-json-input-boundary-20261109.md)
- [가림 비교시험과 숫자 정정](docs/boundary-progress/REDACTION-COMPARISON.md)
- [실제 연결 전 자료 준비도](docs/data-workbench/SOURCE-READINESS.md)

독립 로컬 연구·시험용입니다. 실제 시세/공시 연결, 운영 배포, 매매, 기존 투자기록 변경을 수행하지 않습니다.
