# 7단계 적용·재현 안내

기준: `work/kst-investment-stage6-20261029` (`0c28f1e6ae68222aac184d5873e138b0134dd721`). 새 브랜치 `work/kst-kr-radar-stage7-20261029`. main·Pages·서비스워커·기존 PR #1, #2는 변경하지 않는다.

## 재현 (저장소 root, 운영 origin과 분리된 환경)
```sh
npm ci
npm test                       # 기준 211개 + 신규 48개
npx playwright install chromium
npm run test:mobile            # 기존 25묶음 회귀 (국장 레이더 화면은 없음)
node tools/review-universe.cjs 2026-10-29   # 미국장 적격성: 활성 0 / 보류 16 / 제외 0
node tools/kr-universe-audit.cjs            # 국장 후보 목록 감사 (읽기 전용)
```
상장목록 파일을 직접 가지고 있을 때만: `node tools/kr-universe-audit.cjs <상장목록.json>` (오프라인 대조, 파일은 저장하지 않음).

## 패치로 적용할 때
```sh
git switch -c work/kst-kr-radar-stage7-20261029 0c28f1e6ae68222aac184d5873e138b0134dd721
git apply --check /absolute/path/kst-radar-stage7-from-stage6.patch
git apply /absolute/path/kst-radar-stage7-from-stage6.patch
```
patch와 mbox를 함께 적용하지 않는다. 변경은 신규 파일만이라 되돌릴 때는 `git apply -R`로 충분하며 기존 투자 기록·site data를 지우지 않는다.

## 변경하지 않는 것
`portfolio_v5.html`, `portfolio.html`, `manifest.json`, `service-worker.js`, `backup/*`, `radar/*`, `sell/*`, `management/*`, `package.json`, `package-lock.json`, `tests/mobile.cjs` 및 기존 시험 파일 전부.
