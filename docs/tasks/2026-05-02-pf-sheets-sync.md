# 2026-05-02 PF Google Sheets Sync

상태: 완료

목표:
- 진행 중 PF 딜을 Google Sheets 대시보드로 자동 동기화
- 매일 06:30 KST 스케줄 실행
- 딜 변경 시 비동기 즉시 동기화
- 텔레그램 `딜 시트` 명령 추가

구현:
- `server/_core/googleSheets.ts`
  - 시트 생성/재사용
  - `data/google-sheets.json`에 `deals-dashboard` 저장
  - 401 재인증 재시도, 429 exponential backoff
- `server/deals/dealSheetSync.ts`
  - 활성 딜만 동기화
  - 헤더/행 업서트
  - NotebookLM, D-day, 이정표 진행률, 최근 에이전트 결과 표시
  - 실패 시 텔레그램 1시간 중복 방지 알림
- `server/deals/dealStore.ts`
  - `createDeal`, `updateDealMeta`, `saveFile` 이후 비동기 동기화 트리거
- `server/deals/dealFileRouter.ts`
  - `딜 시트` 명령 파싱
- `server/deals/telegramDealFileHandler.ts`
  - 즉시 동기화 후 URL 응답
- `server/_core/index.ts`
  - 06:30 KST 스케줄러 등록
- `.env.example`
  - `GOOGLE_SHEETS_*` 환경변수 추가

검증:
- `npm run check` 통과
- `npm run build` 통과
- `npm test` 통과
- 실제 Google Sheets API 호출 성공
  - URL: https://docs.google.com/spreadsheets/d/1kX_l2bQw8II4LZCwdS9_QEQ9JQ4HfpXYGpDoIF9F8b0/edit
  - 동기화 건수: 3

자율 결정:
- 시트 키는 `Aston-Deals-Dashboard -> deals-dashboard` 고정 매핑
- 최근 에이전트 결과는 오늘/어제 기준 첫 매칭 템플릿명만 표시
- 완료/거절 딜은 이번 Phase에서 제외
