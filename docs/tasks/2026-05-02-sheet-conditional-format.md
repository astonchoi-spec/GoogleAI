# 2026-05-02 Phase 6 - 딜 시트 D-day 조건부 서식

## 목표
Aston-Deals-Dashboard 시트에 D-day 기반 조건부 서식을 자동 적용해 임박한 딜을 모바일과 PC에서 즉시 식별할 수 있게 한다.

## 구현 범위
- `server/_core/googleSheets.ts` 확장
  - `applyConditionalFormat(spreadsheetId, rules)` 추가
  - Dashboard 시트 기존 조건부 서식 삭제 후 재생성
  - 헤더 행 서식과 컬럼 너비 조정 포함
  - `data/google-sheets.json`을 문자열 호환 + 메타데이터 객체 저장으로 확장
- `server/deals/dealSheetSync.ts` 확장
  - 첫 동기화 시 1회 자동 서식 적용
  - `formatAppliedAt` 메타데이터 저장
  - `applyDealSheetFormatting()` 추가
  - 서식 실패 시 동기화는 성공 처리
- `server/deals/dealFileRouter.ts`
  - `딜 시트 서식` 명령 파싱 추가
- `server/deals/telegramDealFileHandler.ts`
  - `딜 시트 서식` 응답 추가
- 테스트 확장
  - `server/__tests__/googleSheets.test.ts`
  - `server/__tests__/dealSheetSync.test.ts`

## 적용 규칙
- D-30 이하: 노랑 배경
- D-7 이하: 주황 배경
- D-3 이하, D-DAY, 지연 딜: 빨강 배경 + 굵은 글씨
- 헤더: 회색 배경 + 흰 글씨 + 굵게
- 컬럼 너비: 딜명/폴더 경로/자료 건수 등 주요 컬럼 자동 조정

## 검증
- `npm run check` 통과
- `npm run build` 통과
- `npm test` 통과: 361 passed, 7 skipped, 2 todo
- 실제 Google Sheets API 호출로 조건부 서식 3개 + 헤더 서식 적용 확인
- 실제 시트 URL 재확인:
  - https://docs.google.com/spreadsheets/d/1kX_l2bQw8II4LZCwdS9_QEQ9JQ4HfpXYGpDoIF9F8b0/edit

## 자율 결정
- 기존 조건부 서식은 Dashboard 시트 기준 전부 삭제 후 재생성
- D+ 지연 딜은 긴급 빨강 규칙에 포함
- 컬럼 너비 자동 조정은 기본 적용

## 다음 Phase 후보
- 완료/거절 딜 아카이브 시트 분리
- 조건부 서식 색상 미세조정
- 시트 역방향 동기화
