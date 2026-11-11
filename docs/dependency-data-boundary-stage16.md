# 의존성·데이터 경계 도식 (16단계 작업 A)

```
portfolio_v5.html (운영 앱, 16단계에서 바이트 동일)
   └─ localStorage v5_* , 백업 v6 (backup/core.js)         ← 읽지도 쓰지도 않음
        ╳  (연결 없음 — 실험실은 앱을 참조하지 않음)

mobile-lab/invest.html  (실험실, CSP connect-src 'none')
   ├─ bundle.js         ← kr-radar/*.js (순수 모듈: 네트워크·저장소·타이머 금지, 정적 검사)
   │      price-normalizers / watch-display / mobile-status / pricefeed
   ├─ invest-bundle.js  ← invest/format, ledger, risk, backtest, draft-store
   └─ 저장소: kst.lab.s16.draft 1개 키만(명시적 저장 클릭 시)

invest/ledger.js   : 거래 → 손익·평단(입력만 받음, 부작용 없음)
invest/risk.js     : 보유 → 집중도·최악 시나리오(ledger 결과 사용)
invest/backtest.js : 합성 가격 → 곡소리/환호성 규칙 시험(연구용 표시)
```
데이터 종류 경계: **합성 / 캐시 / 실조회**는 `mobile-status.classify` 등급으로 분리, 활성 감시 = 실조회 + 가격검증 + 유효기간 내 + 오류 없음.
