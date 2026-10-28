# 보호·검토 기록 — 2026-10-29

- stage4 대비 운영 HTML/구형 HTML/manifest/SW, backup 모듈, 매수 core와 universe/demo/eligibility/pilot 상태의 바이트 불변 확인. 새 저장 키/실제 보유 읽기 없음.
- 매도 모듈 및 Massive 오프라인 파서에서 storage/network 호출 부재 점검. 연구 페이지 CSP connect-src none, object-src none, 외부 script 없음. DOM textContent만 사용. 외부 네트워크0 및 합성 보존/XSS 시험 통과.
- 신규 모듈은 인증을 조회하지 않으며 파서는 원문 오류·next_url을 출력하거나 따라가지 않는다. https URL 근거의 query/userinfo/hash 차단. 기존 앱의 키/비밀번호 저장 방식은 이번 범위에서 변경하지 않았다.
- 합성 시험 안의 TEST-KEY 문자열은 가짜다. 사용자의 키·실제 기기 저장소는 읽지 않았다. 전체 ZIP은 기존 공개 저장소 source를 포함하므로 사용자가 별도로 추가한 투자 기록이나 자격증명을 복사해 넣지 않아야 한다.
- localStorage 멀티키 원자성/여러 탭 동시 쓰기 한계와 운영 SW의 기존 정책은 이전 보고서대로 남는다. 이번 결과는 침투시험이나 운영 보안 인증이 아니다.
- 매도 연구의 고정 날짜/합성 가정/한도/세금·기대수익액을 실데이터로 오인하지 않도록 화면에 명시한다. 실제 데이터 권리와 계좌 정책 승인이 없으므로 실제 매도 신호는 없다.
