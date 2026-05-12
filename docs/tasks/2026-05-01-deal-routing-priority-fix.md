# 딜 인텐트 우선순위 수정

날짜: 2026-05-01  
도구: Codex  
상태: 완료

## 목표

`딜 ...` 명령이 realestate, Google Calendar, Google Drive 인텐트보다 먼저 `deals` 도메인으로 라우팅되도록 고정하고, raw JSON 응답 노출을 차단했다.

## 완료 내용

- `server/intent/fallbackIntent.ts`
  - `isDealIntentMessage()` 추가
  - `^딜\s+` 계열 명령을 `deals.deals_command`로 최우선 라우팅
  - `realestate_deals_*` 중복 fallback 제거
  - 중복 Google 약한 fallback 제거로 파일 500줄 이하 유지
- `server/intent/handlers/realestate.ts`
  - `realestate.deals.list` raw JSON 응답을 반환하던 중복 핸들러 제거
- `server/intent/types.ts`
  - 사용하지 않는 `realestate_deals_list/create/update` 액션 제거
- `server/intent/intentService.ts`
  - 콘솔 로그를 `[intent] matched: <domain>.<action> for input: <message>` 형식으로 정리
  - formatter에서 `{ method: ... }`, `{ files: ... }` 형태 raw object 표시 차단
- `server/__tests__/dealRouting.test.ts`
  - 딜 명령 우선순위, realestate/Google 회귀, JSON 차단 테스트 추가
- `server/trading/orderExecutor.ts`
  - Node `--experimental-strip-types`가 처리하지 못하는 parameter property 문법을 일반 필드 할당으로 변경

## 검증

- `npm run check` 통과
- `npm run build` 통과
- `npm test` 통과: 235 passed, 7 skipped, 2 todo
- `npx vitest run server/__tests__/dealRouting.test.ts` 통과: 8 passed
- `server/intent/`에서 `realestate.deals` / `realestate_deals_*` 검색 결과 0건

## 로컬 라우팅 스모크

- `딜 추가 한남동644` → `deals.deals_command`
- `딜 목록` → `deals.deals_command`
- `딜 한남동644` → `deals.deals_command`
- `딜 노트북 한남동644 <NotebookLM URL>` → `deals.deals_command`
- PDF 첨부 캡션 `딜 저장 한남동644 계약서` → 계약서 폴더에 저장 확인

## 회귀 확인

- `내일 오후 3시 미팅 추가` → `google.google_create_event`
- `구글 드라이브 검색 보고서` → `google.google_drive_search`
- `위키 검색 briefing` → `wiki.wiki_search`
- `브리핑 테스트` → `intelligence.intelligence_morning_briefing`

## 잔여 이슈

- 실제 Telegram UI에서 동일 명령을 한 번 더 수동 확인하면 운영 검증 완료.
