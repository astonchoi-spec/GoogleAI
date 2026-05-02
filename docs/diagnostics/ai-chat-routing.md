# AI 채팅 라우팅 진단서

## 1. 개요

- 작성일: `2026-05-02`
- 진단 대상: `1계층 Command Channel`
- 진단 목적: 회장님 명령이 어느 코드 경로로 흐르는지 확정

## 2. 진입점 매핑

### 진입점 1: 웹 AI 채팅 입력창

- 파일: `client/src/components/UnifiedChatInterface.tsx`
- 화면 진입: `client/src/pages/Chat.tsx`
- 입력 함수: `sendMessageText()`
- 1차 호출: `trpc.intent.route.useMutation()`
- 2차 호출: `trpc.llm.chat.useMutation()`
- 실제 흐름
  1. 사용자가 입력창 또는 `QuickActions` 버튼으로 텍스트를 만든다.
  2. `sendMessageText()`가 `trpc.intent.route`를 먼저 호출한다.
  3. `handled` 또는 `requiresConfirmation`이면 그 응답을 그대로 사용한다.
  4. 아니면 `trpc.llm.chat`로 fallback 한다.
  5. 로그인 상태이면 `trpc.chatSync.saveWebMessage`로 웹 메시지를 저장하고, `trpc.chatSync.forwardToTelegram`로 Telegram에 전달한다.

### 진입점 2: Telegram 메시지

- 파일: `server/webhooks/telegram.ts`
- 라우트 경로: `POST /api/webhooks/telegram`
- 실제 처리기: `server/llm/telegramBot/messageRouter.ts`
- 실제 흐름
  1. `server/_core/index.ts`가 `app.use("/api/webhooks", telegramRouter)`로 webhook를 등록한다.
  2. `initializeTelegramBot()`가 `TelegramBot`을 생성하고 `setupMessageRouter()`를 연결한다.
  3. `POST /api/webhooks/telegram`이 들어오면 `bot.handleUpdate(update)`로 전달한다.
  4. `bot.on("message")`가 실행되어 `persistUserMessage()`로 DB 저장을 시도한다.
  5. `classifyIntent()`를 먼저 호출한다.
  6. `preIntent.action.startsWith("google_")`이면 `handleWorkspaceCommand()`가 먼저 실행된다.
  7. 그 외에는 `routeIntentMessage()`를 호출한다.
  8. 둘 다 처리하지 못하면 `replyWithLlm()`로 LLM 일반 대화로 fallback 한다.

### 진입점 3: Home 화면 빠른 명령 버튼

- 파일: `client/src/pages/Home.tsx`
- 버튼 데이터: `quickCommands`
- 버튼 동작: `navigate(\`/chat?command=...\`)`
- 실제 효과
  - 버튼 클릭은 서버 호출을 하지 않는다.
  - `client/src/components/UnifiedChatInterface.tsx`의 `useEffect()`가 `command` 쿼리스트링을 읽어서 `setInput(command)`만 수행한다.
  - 따라서 버튼 클릭만으로는 실행되지 않고, `/chat` 입력창이 자동 채워진 뒤 사용자가 다시 전송해야 한다.

## 3. 빠른 명령 버튼 5개 작동 진단

| 버튼 라벨 | 클릭 시 입력되는 실제 텍스트 또는 호출 함수 | 라우팅 결과 | 작동 여부 |
|---|---|---|---|
| `오늘 메일 요약` | `navigate("/chat?command=오늘 메일 요약")` → `setInput("오늘 메일 요약")` | 직접 라우팅 없음. 전송 후에는 `fallbackIntent()` 명시 규칙에 없어서 `classifyIntent()`의 LLM 분류 결과에 의존 | ⚠️ |
| `BTC 포지션 확인` | `navigate("/chat?command=BTC 포지션 확인")` → `setInput("BTC 포지션 확인")` | 전송 시 `fallbackIntent()`가 `trading_positions`로 분류, `server/intent/handlers/trading.ts`의 `tradingPositions` 호출 | ⚠️ |
| `한남 PF 진행상황` | `navigate("/chat?command=한남 PF 진행상황")` → `setInput("한남 PF 진행상황")` | 전송 시 `fallbackIntent()`가 `pf` 키워드만 보고 `realestate_portfolio_summary`로 분류. `한남` 개별 딜 식별 로직은 없음 | ⚠️ |
| `오늘 일정 브리핑` | `navigate("/chat?command=오늘 일정 브리핑")` → `setInput("오늘 일정 브리핑")` | 전송 시 `isBriefingTestMessage()` 조건과 일치하지 않는다. `fallbackIntent()`는 `오늘 일정` 규칙으로 `google_list_events`로 분류 | ⚠️ |
| `Telegram 최근 메시지` | `navigate("/chat?command=Telegram 최근 메시지")` → `setInput("Telegram 최근 메시지")` | 전송 시 `fallbackIntent()`와 등록 핸들러에서 대응 action을 찾지 못한다. 결과적으로 `chat` 또는 LLM 분류 fallback | ⚠️ |

정리:
- 버튼 클릭 즉시 실행: `0`
- 입력창 자동 채움만 수행: `5`
- 전송 후 명시적으로 라우팅이 확인되는 버튼: `3` (`BTC 포지션 확인`, `한남 PF 진행상황`, `오늘 일정 브리핑`)
- 전송 후에도 정적 코드 기준 확정이 어려운 버튼: `2` (`오늘 메일 요약`, `Telegram 최근 메시지`)

## 4. 자연어 의도 라우팅 흐름

### `server/intent/intentService.ts` 요약

- 현재 줄 수: `205`
- 구조
  1. `classifyIntent(message)`
  2. `fallbackIntent(message)` 우선 실행
  3. `confidence >= 0.5`면 즉시 반환
  4. 아니면 `llmAdapter.parseJson()`으로 LLM 분류
  5. `routeIntentMessage()`가 `handlerRegistry[intent.action]`를 찾아 실행
  6. 핸들러가 없으면 `handled: false`로 반환하고 상위 호출자가 LLM 일반 대화로 fallback

### 의도 분류 카테고리

- 도메인: `trading`, `realestate`, `finance`, `google`, `wiki`, `intelligence`, `deals`, `agents`, `chat`
- 타입: `query`, `execute`

### 액션 → 핸들러 매핑

| 도메인 | 액션 | 연결 핸들러 |
|---|---|---|
| `trading` | `trading_balance`, `trading_positions`, `trading_technical_analysis`, `trading_risk_calculation`, `trading_risk_calculate`, `trading_risk_status`, `trading_risk_lock`, `trading_risk_unlock`, `trading_risk_settings_update`, `trading_pre_check`, `trading_review_report`, `trading_add_alert`, `analysis_indicators`, `analysis_rsi`, `analysis_macd`, `analysis_bollinger` | `server/intent/handlers/trading.ts` |
| `realestate` | `realestate_portfolio_summary`, `realestate_simple_feasibility`, `realestate_land_use`, `realestate_land_price`, `realestate_real_transaction`, `realestate_feasibility`, `realestate_add_deal`, `realestate_update_deal_stage` | `server/intent/handlers/realestate.ts` |
| `finance` | `finance_dart_disclosures` | `server/intent/handlers/finance.ts` |
| `google` | `google_create_event`, `google_write_sheet`, `google_drive_search`, `google_get_emails`, `google_send_email`, `google_list_events` | `server/intent/handlers/google.ts` |
| `wiki` | `wiki_save`, `wiki_search` | `server/intent/handlers/wiki.ts` |
| `intelligence` | `intelligence_morning_briefing` | `server/intent/handlers/intelligence.ts` |
| `deals` | `deals_command` | `server/intent/handlers/deals.ts` |
| `agents` | `agent_command` | `server/intent/handlers/agents.ts` |
| `chat` | `chat` | 핸들러 없음. 상위에서 LLM fallback |

### LLM 호출 분기 시점

- 웹 채팅
  - 1차: `trpc.intent.route` 내부의 `classifyIntent()`에서 `fallbackIntent()` 실패 시 LLM 분류
  - 2차: `handled=false`면 `trpc.llm.chat`
  - 3차: `trpc.llm.chat` 내부에서도 다시 `routeIntentMessage()`를 먼저 시도한 뒤, 그래도 안 맞으면 `LLMCaller.call()`
- Telegram
  - 1차: `classifyIntent()`에서 `fallbackIntent()` 실패 시 LLM 분류
  - 2차: Google 명령으로 보이면 `handleWorkspaceCommand()`가 자체 `llmAdapter.parseJson()`로 한 번 더 분류
  - 3차: `routeIntentMessage()` 미처리 시 `replyWithLlm()`에서 `LLMCaller.call()`

## 5. 채팅 ↔ Telegram 동기화 흐름

### `chatSyncRouter` 동작 방식

- 파일: `server/routers/chat-sync.ts`
- 역할
  - 웹 대화 생성: `getConversation`
  - 메시지 조회: `getMessages`, `getRecentMessages`, `searchMessages`
  - 저장: `saveWebMessage`, `saveTelegramMessage`
  - 보조: `updateTitle`, `togglePinned`, `exportConversation`, `deleteMessage`, `clearConversation`, `linkTelegramChat`, `getConversationByTelegramId`, `forwardToTelegram`

### 웹 → Telegram

1. `UnifiedChatInterface.sendMessageText()`
2. `saveWebMessage`로 사용자 메시지 저장
3. `intent.route` 또는 `llm.chat`로 응답 생성
4. `saveWebMessage`로 어시스턴트 메시지 저장
5. `forwardToTelegram` mutation 호출
6. `chatSyncRouter.forwardToTelegram`
7. `getConversationById()`로 `telegramChatId` 확인
8. `telegram-service.ts`의 `forwardToTelegram()`으로 `👤`, `🤖` 메시지 전송

### Telegram → 웹

1. `POST /api/webhooks/telegram`
2. `TelegramBot`의 `bot.on("message")`
3. `persistUserMessage()`가 `getConversationByTelegramChatId()` 또는 `getOrCreateTelegramConversation()` 사용
4. `saveMessage(..., "telegram")`로 DB 저장
5. 응답도 `saveAssistantMessage()`로 같은 conversation에 저장
6. 웹 채팅 화면은 `chatSync.getRecentMessages` polling으로 새 Telegram 메시지를 가져온다

### 동기화 실패 처리

- 웹 → Telegram
  - `conversation.telegramChatId`가 없으면 `{ sent: false, reason: "Telegram chat not linked yet" }`
  - 실제 전송 실패는 `telegram-service.ts`가 `false`를 반환하고 경고 로그만 남긴다
- Telegram → 웹
  - `persistUserMessage()` 저장 실패 시 경고 로그만 남기고 대화 자체는 계속 처리한다
- 추가 상태
  - `autoMergeTelegramConversations()`가 서버 시작 시 ghost conversation(`userId=1`)을 실제 웹 사용자로 병합 시도한다

## 6. 1계층에서 2계층(`Knowledge Core`)으로의 연결 현황

| 항목 | 상태 | 근거 |
|---|---|---|
| AI 채팅 → `Aston Wiki` 검색 | ✅ | `fallbackIntent()`의 `matchWikiSearch()` → `server/intent/handlers/wiki.ts` → `server/intent/wiki.ts` → `server/wiki/wikiStore.ts` |
| AI 채팅 → `NotebookLM` 질의 | ❌ | `server/routers/notebooklm.ts`는 존재하지만 `server/intent/types.ts`, `fallbackIntent.ts`, `registry.ts`에 `notebooklm` action이 없다 |
| AI 채팅 → `Aston-Deals Folder` 조회 | ✅ | `fallbackIntent()`의 `isDealIntentMessage()` → `deals_command` → `server/intent/handlers/deals.ts` → `server/deals/telegramDealFileHandler.ts` |
| AI 채팅 → `Google Drive` 조회 | ✅ | `fallbackIntent()`의 `google_drive_search` 또는 LLM 분류 → `server/intent/handlers/google.ts`의 `driveSearch()` |
| AI 채팅 → `Google Sheets` 조회 | ❌ | AI 채팅 intent 경로에는 `google_write_sheet`만 있고 읽기 action이 없다. `read_sheet`는 `server/llm/telegramBot/workspaceCommands.ts`에만 있다 |

정리: `✅ 3 / ⚠️ 0 / ❌ 2`

## 7. 1계층에서 3계층(`Execution Modules`)으로의 연결 현황

| 항목 | 상태 | 근거 |
|---|---|---|
| AI 채팅 → `Real Estate PF` | ✅ | `realestate_*` action → `server/intent/handlers/realestate.ts` |
| AI 채팅 → `Trading` | ✅ | `trading_*`, `analysis_*` action → `server/intent/handlers/trading.ts` |
| AI 채팅 → `Google Workspace`(`메일`/`일정`) | ✅ | 웹은 `server/intent/handlers/google.ts`, Telegram은 여기에 더해 `server/llm/telegramBot/workspaceCommands.ts` 우회 경로 존재 |
| AI 채팅 → `Agent Control` | ✅ | `에이전트 ...` prefix → `agent_command` → `server/intent/handlers/agents.ts` |
| AI 채팅 → `Monitoring` | ❌ | `server/intent`와 `handlerRegistry`에 `monitoring` 또는 `analytics` action이 없다 |

정리: `✅ 4 / ⚠️ 0 / ❌ 1`

## 8. 발견된 문제점

1. `Home` 빠른 명령 5개는 모두 클릭 즉시 실행이 아니라 `/chat` 입력창 prefill만 수행한다.
2. `오늘 메일 요약`, `Telegram 최근 메시지`는 `fallbackIntent()`의 명시 규칙이 없어 정적 코드 기준 라우팅을 확정할 수 없다.
3. `오늘 일정 브리핑`은 이름상 브리핑이지만 실제 `fallbackIntent()`에서는 `google_list_events`로 분기된다. `isBriefingTestMessage()`와 일치하지 않는다.
4. `한남 PF 진행상황`은 `한남` 개별 딜을 파싱하지 않고 `pf` 키워드만 보고 `realestate_portfolio_summary`로 간다.
5. 웹 채팅의 `trpc.intent.route`는 `formatIntentRouteMessage()`를 쓰지 않고 `routed.response`만 반환한다. 따라서 파일 목록, 메일 목록, 이벤트 목록 같은 `data` 포맷 결과가 웹 채팅에서는 누락될 수 있다.
6. Telegram은 `handleWorkspaceCommand()`와 `routeIntentMessage()` 두 경로를 함께 사용한다. 같은 Google Workspace 계열 명령이 웹과 Telegram에서 서로 다른 파서를 타게 된다.
7. `chatSyncRouter.getMessages()`에는 `TODO: Add ownership check`가 남아 있다.
8. `chatSyncRouter.saveTelegramMessage`는 정의되어 있지만, 실제 Telegram webhook 경로는 이 router를 거치지 않고 `db-chat.ts`를 직접 호출한다.
9. `Monitoring`은 화면 라우트와 `appRouter.analytics`는 있지만 AI 채팅 intent 진입점은 없다.
10. `NotebookLM`은 별도 `notebooklmRouter`와 MCP 연동 파일이 존재하지만, AI 채팅 자연어 라우팅에는 아직 연결되지 않았다.

## 9. Mermaid 다이어그램 — 1계층 실제 흐름도

```mermaid
flowchart TD
  A["Web AI 채팅 입력창<br/>`UnifiedChatInterface.sendMessageText()`"] --> B["`trpc.intent.route`"]
  A --> C["미처리 시 `trpc.llm.chat`"]
  D["Telegram 메시지<br/>`POST /api/webhooks/telegram`"] --> E["`TelegramBot.handleUpdate()`"]
  E --> F["`bot.on('message')`"]
  F --> G["Google 계열이면 `handleWorkspaceCommand()`"]
  F --> H["그 외 `routeIntentMessage()`"]
  G --> I["Gmail / Calendar / Drive / Sheets"]
  H --> J["`handlerRegistry`"]
  B --> J
  C --> J
  C --> K["미처리 시 `LLMCaller.call()`"]
  J --> L["`wiki_*` → `Aston Wiki`"]
  J --> M["`deals_command` → `Aston-Deals Folder`"]
  J --> N["`google_*` → `Drive/Gmail/Calendar/Sheets(write)`"]
  J --> O["`trading_*` / `analysis_*`"]
  J --> P["`realestate_*`"]
  J --> Q["`agent_command`"]
  F --> R["`saveMessage(..., 'telegram')`"]
  A --> S["`saveWebMessage`"]
  S --> T["`forwardToTelegram`"]
```

## 10. 다음 작업 권고

1. `웹/Telegram 라우팅 경로 통합`
   - 이유: Google Workspace 명령이 `handleWorkspaceCommand()`와 `routeIntentMessage()`로 이중화되어 있다
   - 예상 범위: `4~6`파일, `120~220`줄, `2~4시간`
2. `Home 빠른 명령 5개 실제 실행화 또는 명시적 prefill 표기`
   - 이유: 현재는 버튼 클릭 즉시 실행이 아니어서 관제탑 UX와 이름이 어긋난다
   - 예상 범위: `2~4`파일, `40~100`줄, `1~2시간`
3. `NotebookLM 질의 명령을 AI 채팅 intent에 연결`
   - 이유: `notebooklmRouter`는 있으나 `1계층 → 2계층` 자연어 경로가 없다
   - 예상 범위: `4~7`파일, `80~180`줄, `2~3시간`
4. `Wiki / Deals / Telegram 최근 메시지 / 메일 요약 명령 보강`
   - 이유: 현재 빠른 명령 중 일부는 명시 규칙이 없거나 개별 딜 파싱이 약하다
   - 예상 범위: `3~6`파일, `80~160`줄, `2~3시간`
5. `chatSync` 보안 보강
   - 이유: `getMessages()` ownership check TODO와 `saveTelegramMessage` 미사용 경로가 남아 있다
   - 예상 범위: `2~4`파일, `40~120`줄, `1~2시간`

우선순위 판단:
- `intentService.ts` 자체는 이미 `205`줄로 줄어들었으므로, 이번 시점의 최우선은 `500줄 위반 해소`가 아니라 `라우팅 누락 보완`과 `웹/Telegram 경로 정합화`다.
