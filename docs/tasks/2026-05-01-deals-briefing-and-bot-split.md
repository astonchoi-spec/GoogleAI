# 2026-05-01 딜 현황 모닝브리핑 통합 + telegram-bot.ts 분할

## 목표
- 모닝브리핑에 진행 중 딜 섹션을 추가한다.
- `server/llm/telegram-bot.ts`를 호환 re-export 파일로 줄이고 실제 구현을 `server/llm/telegramBot/` 하위 모듈로 분리한다.

## 구현
- `server/_core/briefingSources.ts`
  - `getDealsSection()` 추가.
  - `dealStore.listDeals()` 기반으로 completed/rejected 딜과 자료 0건 딜을 제외.
  - `updatedAt` 최신순 최대 10건 출력.
  - 어제 추가 자료 수는 카테고리 폴더 파일 mtime을 KST 어제 00:00-23:59 범위로 계산.
- `server/intelligence/briefing.ts`
  - 위키 메모 다음, Risk Guard 이전에 `📁 진행 중 딜` 섹션 추가.
  - 딜이 없으면 `진행 중 딜 없음` 표시.
- `server/llm/telegramBot/`
  - `index.ts`: 봇 초기화와 생명주기.
  - `commands.ts`: `/start`, `/engine`, `/model`, `/use`, `/status`, `/clear`.
  - `messageRouter.ts`: 일반 메시지, 딜 파일, intent routing, LLM fallback.
  - `callbackRouter.ts`: `kakao:`, `gmail:`, `dl:`, `approve:`, `reject:`, `detail:` callback 라우팅.
  - `workspaceCommands.ts`: Gmail/Calendar/Drive/Sheets 명령 처리.
  - `utils.ts`: BotContext, Google user 탐색, 응답 저장 유틸.
- `server/llm/telegram-bot.ts`
  - 기존 import 경로 호환을 위해 re-export 파일로 유지.

## 테스트
- `server/__tests__/briefing.test.ts`
  - 딜 섹션 출력, 위치, 빈 상태, 브리핑 데이터 조립 회귀.
- `server/__tests__/briefingSources.test.ts`
  - 딜 없음, 완료/거절/자료 0건 제외, KST 어제 mtime 카운트, 최신순 top 10/NotebookLM 표시.
- `server/llm/telegram-bot.test.ts`
  - legacy import 경로와 신규 index export 호환 확인.

## 검증
- `npm run check` 통과.
- `npm run build` 통과.
- `npm test` 통과: 276 passed, 7 skipped, 2 todo.

## 자율 결정
- 어제 추가 자료 수는 `_deal.json` 히스토리 추가 없이 실제 파일 mtime 기준으로 계산했다.
- `telegram-bot.ts`는 외부 import 경로를 보존하기 위해 re-export 파일로 유지했다.
- Workspace 명령 처리는 `messageRouter.ts` 라인 수를 낮추기 위해 별도 `workspaceCommands.ts`로 분리했다.
