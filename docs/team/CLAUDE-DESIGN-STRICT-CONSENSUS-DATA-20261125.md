# 합의 근거 엄격 데이터 계약 (제안 · 설계 종료안)

STATUS: PROPOSAL — 순태씨 승인 전 구현·연결 없음
ORDER-ID: GPT-REVIEW-postmerge-queue-20261125-1530 CR-F1
작성: 클로, 2026-11-25 16시대 KST

## 0. 결론
- Markdown 검토서에서 기계 판독 영역을 뽑는 방식은 **종료**한다. raw HTML(`<pre>` 등)·펜스·주석 등 Markdown 문맥을 완전히 판별할 수 없고, 예외를 늘리는 반복은 끝이 없다(지피 1530 권고 수용).
- `tools/consensus-evidence.cjs`는 **진단·합성 연구용**으로만 남긴다. `--publish`는 모든 검사를 돌리지만 결과와 무관하게 `PUBLISH-DISABLED`·종료 3(코드 상수 `PUBLISH_ENABLED = false`). agreed 발행 경로는 지금 **없다**.
- 사람용 설명(Markdown)과 기계용 근거(엄격 JSON)를 **별도 파일**로 분리하는 아래 계약을 제안한다. 순태씨 승인 전에는 파일 생성·07:45 아침 절차·카드 스키마·예약 어느 것도 바꾸지 않는다.

## 1. 파일
| 파일 | 작성자 | 용도 |
|---|---|---|
| `docs/team/consensus/GPT-EVIDENCE-YYYYMMDD.json` | 지피 | 그날 클로 원판단에 대한 AGREE/DISAGREE |
| `docs/team/consensus/CLAUDE-ACCEPT-YYYYMMDD.json` | 클로 | 지피 이견 중 클로가 수락한 것만(없으면 파일 없음 아님 — 빈 배열 파일) |
| `reviews/YYYY-MM-DD.json` | 클로 | 원판단(기존). 근거 파일은 이 파일의 커밋 SHA를 가리킨다 |
사람용 설명은 기존 GPT-REVIEW-*.md에 자유롭게 쓴다. 그 안의 어떤 글도 근거가 아니다.

## 2. 문법 (전체 파일이 데이터, 설명·주석·코드 예시·HTML 없음)
GPT-EVIDENCE:
```
{"schema":"has-consensus-evidence/1","reviewDate":"YYYY-MM-DD","status":"FINAL",
 "claudeSource":{"path":"reviews/YYYY-MM-DD.json","commit":"<40자리>","blobSha256":"<64자리>"},
 "items":[{"ticker":"005930","market":"KR","claudeVerdict":"sell-review","decision":"AGREE"},
          {"ticker":"AAPL","market":"US","claudeVerdict":"hold-long","decision":"DISAGREE","propose":"trim-review"}]}
```
CLAUDE-ACCEPT:
```
{"schema":"has-consensus-accept/1","reviewDate":"YYYY-MM-DD","status":"FINAL",
 "gptSource":{"path":"docs/team/consensus/GPT-EVIDENCE-YYYYMMDD.json","commit":"<40자리>","blobSha256":"<64자리>"},
 "items":[{"ticker":"AAPL","market":"US","accept":"trim-review"}]}
```
규칙(하나라도 어기면 **파일 전체 실패 → 그날 합의 발행 보류**, 부분 채택 없음):
- `JSON.parse` 엄격 + 재직렬화 비교 없이도 **중복 키 금지**(직접 토크나이저로 검사), 미지 필드 금지, 필드 누락 금지, 타입 정확.
- `schema`·`status:"FINAL"` 정확히 일치. `reviewDate`는 실제 날짜이고 파일명 날짜와 같음.
- `ticker`·`market`(KR|US) 쌍은 items 안에서 유일. 판단 값은 6종 목록만. `DISAGREE`일 때만 `propose`(≠ claudeVerdict), AGREE에 `propose` 있으면 실패.
- 크기 상한(예: 64KB, items 200개) 초과 실패. BOM·NUL 금지.

## 3. 발행 관문 (승인 후 구현할 완료 조건 — 지피 1530 §3)
1. 세 원문을 각각 **고정 커밋**에서 읽는다: 클로 원판단, 지피 근거, (있으면) 클로 수락. 작업 트리 금지. ref는 commit 객체만, 조회 장애 ≠ 부재(장애는 보류).
2. 지피 근거의 `claudeSource.commit`·`blobSha256`이 실제 그 커밋의 `reviews/YYYY-MM-DD.json`과 일치. 각 item의 `claudeVerdict`가 원판단 카드의 판단과 일치(종목·시장·날짜 포함). 불일치 1건이면 전체 보류.
3. 클로 수락의 `gptSource`가 2의 지피 근거 파일 커밋·해시와 일치, `accept` = 지피 `propose`.
4. 발행할 카드 JSON은 이 검사 결과로부터 **만든다**(손으로 쓴 consensus 필드를 검사하지 않음). 발행 직전 바이트와 검사한 바이트의 SHA-256 동일성 확인.
5. 결과: agreed / disagree / no-response. **0건 통과는 허가가 아님**(근거 없음). no-response는 그날 지정한 고정 커밋에서 파일 부재가 '확인'된 경우만 — 임의 과거 SHA로 오늘 무응답 확정 금지.
6. 세 커밋이 같아도 되는가, 작성자(커밋 author) 구분을 요구하는가는 **순태씨 결정**. 이 검사는 계약 형식 증명이지 두 AI가 썼다는 출처 증명이 아니다(GitHub 계정이 하나이므로).

## 4. 합성 검증 계획 (구현 시 시험)
- 문법: 중복 키·미지 필드·누락·타입·대소문자·후행 쉼표·주석·BOM·NUL·크기 초과·파일명 날짜 불일치·중복 종목 → 전부 실패.
- 결합: claudeSource 커밋/해시 틀림, claudeVerdict ≠ 원판단, 종목 누락, 수락의 gptSource 불일치, accept ≠ propose → 보류.
- 조회: 임시 git 저장소로 부재 vs 객체 손상 vs 비커밋 ref 구분.
- 출력: 검사 바이트 = 발행 바이트, 하나라도 실패면 consensus 필드 없는 카드(solo)만.
- 회귀: 기존 Markdown 반례(펜스·주석·`<pre>`)는 새 경로에서 아예 읽지 않으므로 무관함을 시험으로 고정.

## 5. 지금 상태(비활성 근거)
- `tools/consensus-evidence.cjs`: `PUBLISH_ENABLED = false`, `--publish` → `PUBLISH-DISABLED`·종료 3. 시험 `tests/postmerge-crf.test.cjs`(지피 `<pre>` 반례 포함, 0건도 종료 3, 원문에 발행 허가 출력 없음).
- 앱(`has/review-cards.js`)은 카드 JSON의 consensus만 표시. 07:45 아침 절차·예약·reviews 스키마는 변경 없음 → 지금 agreed 카드를 만드는 경로 없음.

## 6. 순태씨 결정 필요
1. 이 별도 JSON 계약 방향 채택 여부(채택 시 클로가 검사기·시험을 브랜치에서 구현, 지피 검토 후 승인 요청).
2. 세 원문 SHA 고정·원판단 대조를 발행 필수 관문으로 할지, 같은 커밋 허용 여부.
3. 그 전까지 AI 검토 카드는 '지피 합의' 표시 없이 클로 단독(solo)으로만 둔다 — 현재 상태 유지.
