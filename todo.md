# Project TODO

## Bug Fixes - Session 2

- [x] Fix model identity mismatch (Gemini 2.5 Flash vs 1.5 Pro)
  - Added current date/time to system prompt
  - Added explicit model identification in system prompt
  - Updated both web chat and Telegram bot prompts
  
- [x] Fix Telegram bot webhook integration
  - Removed `launch()` call that fails in sandbox
  - Switched to webhook-only mode
  - Bot now initializes successfully and awaits webhook updates
  
- [x] Write tests for LLM router enhancements
  - Added 5 new tests for system prompt validation
  - All 44 tests passing

## New Features - Session 3

- [x] Create API Settings management UI
  - Settings page/modal for managing API keys
  - Support for Gemini, OpenAI, Anthropic, Ollama
  - User-friendly form with secure input fields
  - Save/update/delete API keys
  
- [x] Implement real chat functionality
  - Connect web chat to actual LLM responses via user API keys
  - LLMCaller.setApiKeys() method for dynamic key injection
  - Error handling and user feedback
  
- [x] API key validation
  - Validate keys before saving
  - Test API connectivity for each provider
  - Show validation status to user
  
- [x] Database schema for API settings
  - apiSettings table created and migrated
  - Per-user API key storage
  
- [x] Backend API router
  - getAll, save, delete, validate procedures
  - Protected routes with user authentication
  
- [x] Frontend UI integration
  - ApiSettingsModal component
  - API settings button in chat interface
  - Real-time validation feedback

## Security & Quality Fixes - Session 3

- [x] Encrypt API keys in database
  - AES-256-GCM encryption utility created
  - Encrypt on save, decrypt on use
  - Per-user, per-provider storage
  
- [x] Fix authentication flow
  - Changed chat to protectedProcedure
  - Requires login to save/use API keys
  - Per-request isolation
  
- [x] Fix LLM caller isolation
  - Create per-request LLMCaller instances
  - Prevent API key leakage across users
  - Thread-safe operation
  
- [x] Add user feedback
  - Modal has loading states and validation feedback
  - Toast notifications ready for integration

## Deployment Ready

- [x] All tests passing (57/57)
- [x] TypeScript compilation successful
- [x] Dev server running
- [x] Security fixes completed
  - Database unique constraint added
  - ENCRYPTION_KEY environment variable required
  - Encryption tests passing
- [x] Ready to publish to production

## Telegram ??Web Chat Synchronization (Session 4)

- [x] Database schema for unified conversations
  - conversations table created and migrated
  - messages table created and migrated
  - Link Telegram chat_id to user account

- [x] Backend message sync API
  - Save messages from both sources to unified table
  - Retrieve conversation history
  - Real-time message polling (2-second interval)

- [x] Telegram bot integration
  - Forward user messages to database ??
  - Forward AI responses back to Telegram ??
  - Messages linked to conversations table ??

- [x] Frontend real-time updates
  - Polling for live messages (2-second interval)
  - Show message source indicator (Web/Telegram icons)
  - Unified chat interface component created

- [x] Testing
  - All 57 tests passing ??
  - Telegram bot integration verified ??
  - Database sync verified ??
  - Message persistence confirmed ??

## UI/UX Improvements - Session 5

- [x] Fix MySQL database compatibility issues
  - Fixed .returning() method not supported in MySQL
  - Fixed WHERE clause SQL syntax errors
  - Fixed insertId BigInt type handling
  - All 57 tests passing

- [x] Improve chat interface layout
  - Moved input area from bottom to top (fixed position)
  - Input field always visible and accessible
  - Settings panel integrated into top section
  - Better visual hierarchy and user experience

## Bug Fixes - Session 6

- [x] Fix session isolation bug (web ??Telegram shared state)
  - llm.ts was creating its own `new SessionManager()` instance
  - Changed to import the singleton `sessionManager` from session.ts
  - Web engine/model changes now apply to Telegram bot too (same in-memory store)

- [x] Fix model switch not applying (UI)
  - Added "?곸슜" button to settings panel in UnifiedChatInterface
  - Engine change auto-resets model to first available
  - Success feedback shown after apply

- [x] Fix system prompt hardcoded model identity
  - Was always saying "???Google Gemini 2.5 Flash 紐⑤뜽?낅땲??
  - Now uses `currentModel?.name` from actual session state

- [x] Fix API settings modal not opening
  - `isOpen` prop was missing in UnifiedChatInterface
  - Fixed to pass `isOpen={showApiSettings}`

- [x] Fix engines dropdown React render error
  - engines data is `{name, models}[]` not `string[]`
  - Fixed to use `engine.name` as key and value

- [x] UI: input to bottom, info panels to empty state
  - Moved message input from top to bottom
  - Info panels (engines/services/commands) shown only in empty state
  - Chat page changed to full-height layout (no overlap)

## Bug Fixes & UX - Session 7

- [x] Fix Telegram ??Web conversation sync (conversation ID mismatch)
  - Telegram bot was using Telegram user ID as DB userId ??separate conversations
  - Fixed: bot now finds conversation by telegramChatId, or links to admin(userId=1) conversation
  - Web and Telegram now share the same conversation row

- [x] Fix Telegram bot system prompt hardcoding
  - Was hardcoded to "Google Gemini 2.5 Flash"
  - Now uses getModel(session.engine, session.modelKey) dynamically

- [x] Add ENCRYPTION_KEY to .env
  - Required for API key encryption (AES-256-GCM)
  - Was missing, causing crash on API key save

- [x] Add login notice banner to Chat page
  - Shows amber warning when not authenticated
  - Direct link to /login page
  - Telegram sync requires login to work

- [x] Add AI Chat link to Sidebar navigation
  - Desktop and mobile sidebars both updated
  - Quick access from Home page to /chat

## Google Workspace Expansion - Session 9 (2026-04-23)

- [x] Monthly Google Calendar view
  - Added month grid UI with today/current selection state
  - Merged personal events with Korean holiday calendar
  - Added day detail panel with delete actions

- [x] Drive file workflow
  - Added folder listing and upload endpoint
  - Added file download/export support for Telegram delivery
  - Supports Google Docs, Sheets, and Slides exports

- [x] Gmail reliability
  - Encoded email subject headers as UTF-8 Base64
  - Improved compatibility for non-ASCII subjects

- [x] Telegram Google Workspace command bridge
  - Added intent parsing for Gmail, Calendar, Drive, and Sheets actions
  - Executes Workspace commands before falling back to normal chat replies

- [x] Navigation and UX polish
  - Added persistent navbar outside the home page
  - Added toast feedback for engine switching and message send failures

- [x] Runtime and callback fixes
  - Fixed static asset path resolution for source and built server runs
  - Changed Google OAuth callback to redirect back into the app

## Critical Bug Fix - Session 8 (2026-04-22)

- [x] Diagnose Telegram ??Web ?묐갑???숆린??遺덇? ?먯씤
  - MySQL???ㅼ튂/?ㅽ뻾?섏? ?딆븘 DB ?먯껜媛 ECONNREFUSED ?곹깭
  - ?붾젅洹몃옩 遊뉗? in-memory ?몄뀡?쇰줈 ?묐룞 以묒씠?덉쑝??硫붿떆吏媛 DB?????????
  - Web ?대쭅(getRecentMessages)??conversationId瑜??살? 紐삵빐 鍮꾪솢?깊솕 ?곹깭

- [x] MySQL ??SQLite(libsql) ?꾪솚
  - @libsql/client ?⑦궎吏 ?ㅼ튂
  - drizzle/schema.ts: mysql-core ??sqlite-core ?꾪솚 (mysqlTable, mysqlEnum ??紐⑤몢 援먯껜)
  - server/db.ts: mysql2 ?쒕씪?대쾭 ??libsql ?쒕씪?대쾭, onDuplicateKeyUpdate ??onConflictDoUpdate
  - server/db-chat.ts: insertId ??.returning() 諛⑹떇?쇰줈 ?꾪솚 (SQLite ?명솚)
  - drizzle.config.ts: dialect mysql ??sqlite
  - .env: DATABASE_URL??file:./data/chat.db 濡?蹂寃?
  - data/chat.db: SQLite ?뚯씪 DB ?먮룞 ?앹꽦 (?쒕쾭 ?ㅽ뻾 ??蹂꾨룄 ?ㅼ튂 遺덊븘??

- [x] Web ??Telegram ?ъ썙??援ы쁽 (湲곗〈 誘멸뎄??諛⑺뼢)
  - server/telegram-service.ts: 遊??몄뒪?댁뒪 ?깃????쒕퉬???좉퇋 ?앹꽦
  - server/llm/telegram-bot.ts: ?앹꽦?먯뿉??registerTelegramBot() ?몄텧
  - server/routers/chat-sync.ts: forwardToTelegram tRPC mutation 異붽?
    (conversationId濡?telegramChatId 議고쉶 ???좎? 硫붿떆吏 + AI ?묐떟 Telegram ?꾩넚)
  - client/UnifiedChatInterface.tsx: AI ?묐떟 ?섏떊 ??forwardToTelegramMutation ?몄텧

- [x] 理쒖쥌 ?묐갑???숈옉 ?뺤씤
  - Telegram ??Web: ?붾젅洹몃옩 硫붿떆吏 ??DB ???????2珥??대쭅 ?쒖떆 ??
  - Web ??Telegram: ??硫붿떆吏 ??AI ?묐떟 ???붾젅洹몃옩 ?묒そ ?숈떆 ?쒖떆 ??

## Remaining Features (To Do)

- [x] Message search functionality
  - Search conversations by keyword
  - Filter by date range
  - Filter by source (web/telegram)
  - Search UI component

- [x] Toast notifications system
  - New message alerts
  - API key save/delete confirmations
  - Error notifications
  - Success feedback

- [x] Advanced chat features
  - [x] Message editing capability
  - [x] Message deletion
  - [x] Conversation export (JSON)
  - [x] Conversation pinning/favorites

- [x] User profile and settings
  - User preference management
  - Theme customization (dark/light mode)
  - Notification preferences
  - Privacy settings

- [x] Analytics and monitoring
  - Message count statistics
  - API usage tracking
  - Response time metrics
  - User activity logs

- [x] Mobile responsiveness
  - Optimize layout for mobile devices
  - Touch-friendly buttons and inputs
  - Mobile-specific UI adjustments

- [x] Performance optimization
  - Message pagination (load older messages on scroll)
  - Lazy loading for images/media
  - Database query optimization
  - Caching strategy

- [x] Production deployment
  - Environment configuration for production
  - Database backup strategy
  - Error monitoring and logging
  - Security audit
  - Performance testing
  - Final QA testing

## Work Log - 2026-04-24

- [x] ?묒뾽 11. ?뚮┝ ?붿쭊
  - `server/alerts/alertEngine.ts` 異붽?
  - BullMQ `alerts` ?먯? 10珥?諛섎났 Worker 援ъ꽦
  - Redis `active:alerts` 湲곕컲 ?뚮┝ ???議고쉶/??젣
  - 媛寃? RSI, ??⑸퉬, 源???뚮┝ 議곌굔 泥댄겕
  - Telegram 諛쒖넚 ?곕룞 諛?1??諛쒕룞 ??鍮꾪솢?깊솕 泥섎━
  - 而ㅻ컠: `1be11d8 feat: add alert engine`

- [x] ?묒뾽 12. ?좊Ъ 由ъ뒪??怨꾩궛湲?  - `server/trading/riskCalculator.ts` 異붽?
  - 濡???泥?궛媛, ?먯젅媛, 1R/2R/3R 紐⑺몴媛, 理쒕??먯떎 怨꾩궛
  - AI 梨꾪똿 異쒕젰???쒓뎅??由ъ뒪??由ы룷???щ㎎ 異붽?
  - 而ㅻ컠: `5e776c5 feat: add futures risk calculator`

- [x] ?묒뾽 13. ?ъ뾽??遺꾩꽍 ?붿쭊
  - `server/realestate/feasibilityEngine.ts` 異붽?
  - PF 媛쒕컻?ъ뾽 ?섏엯, 鍮꾩슜, ?ъ뾽?댁씡, IRR, DSCR, ?먯씡遺꾧린 遺꾩뼇瑜?怨꾩궛
  - ?ъ뾽???먯젙: ?ъ뾽???묓샇 / 蹂댄넻 / 誘명씉
  - AI 梨꾪똿 異쒕젰???쒓뎅???ъ뾽??蹂닿퀬???щ㎎ 異붽?
  - 而ㅻ컠: `a33699f feat: add real estate feasibility engine`

- [x] ?묒뾽 14. 怨듦났?곗씠??API ?곕룞
  - `server/realestate/publicDataAPI.ts` 異붽?
  - ?좎??댁슜洹쒖젣, 嫄댁텞臾쇰??? ?ㅺ굅?섍? 議고쉶 ?⑥닔 異붽?
  - `DATA_GO_KR_API_KEY` ?섍꼍蹂??異붽?
  - JSON/XML ?묐떟 諛?API ?ㅻ쪟 泥섎━
  - 而ㅻ컠: `55b0fe4 feat: add public data api client`

- [x] ?묒뾽 15. PF ???뚯씠?꾨씪??  - `server/realestate/dealPipeline.ts` 異붽?
  - Google Sheets `PF?쒓?由? ?쒗듃 湲곕컲 ??CRUD ?쇰? 援ы쁽
  - ?④퀎 蹂寃? ?ы듃?대━???붿빟, Calendar 留덉씪?ㅽ넠 ?대깽???앹꽦
  - 而ㅻ컠: `f29715a feat: add pf deal pipeline`

- [x] ?묒뾽 16. DART 怨듭떆 API ?곕룞
  - `server/finance/dartAPI.ts` 異붽?
  - 怨듭떆 紐⑸줉, ?щТ?쒗몴, ?뚯궗 湲곕낯?뺣낫 議고쉶 ?⑥닔 異붽?
  - `DART_API_KEY` ?섍꼍蹂??異붽?
  - DART `status/message` ?ㅻ쪟 泥섎━
  - 而ㅻ컠: `76d8505 feat: add dart api client`

- [x] 寃利?  - 媛??묒뾽 ??`npm.cmd run check` ?듦낵
  - 媛??묒뾽 ??`npm.cmd run build` ?듦낵
  - ?좉퇋 紐⑤뱢 import 諛?API ???꾨씫 寃쎈줈 ?뺤씤

## Phase 3 Workflow - ?듯빀 ?곌껐

### 紐⑺몴

- Phase 2?먯꽌 留뚮뱺 ?낅┰ 諛깆뿏??紐⑤뱢??湲곗〈 tRPC, AI 梨꾪똿, UI???곌껐?쒕떎.
- 湲곗〈 ??/ AI 梨꾪똿 / Google Workspace ?숈옉? ?좎??쒕떎.
- 議고쉶??湲곕뒫怨??ㅽ뻾??湲곕뒫??遺꾨━?댁꽌 ?ㅼ궗??以??ㅻ룞???꾪뿕??以꾩씤??

### ?묒뾽 17. tRPC ?쇱슦???깅줉

- [x] `server/trpc/routers/trading.ts` ?앹꽦
  - 嫄곕옒???붽퀬 議고쉶
  - ?ъ???議고쉶
  - 湲곗닠??遺꾩꽍 議고쉶
  - ?좊Ъ 由ъ뒪??怨꾩궛
  - ?뚮┝ 紐⑸줉/異붽?/??젣

- [x] `server/trpc/routers/realestate.ts` ?앹꽦
  - PF ??紐⑸줉/異붽?/?④퀎 蹂寃??붿빟
  - ?ъ뾽??遺꾩꽍 ?ㅽ뻾
  - ?좎?議고쉶/嫄댁텞臾쇰????ㅺ굅?섍? 議고쉶

- [x] `server/trpc/routers/finance.ts` ?앹꽦
  - DART 怨듭떆 議고쉶
  - DART ?щТ?쒗몴 議고쉶
  - DART ?뚯궗 寃??
- [x] `appRouter`???좉퇋 ?쇱슦???깅줉
  - 紐⑤뱺 input? zod 寃利?  - API ???꾨씫, Google Auth ?꾨씫, Redis 誘몄뿰寃??ㅻ쪟 硫붿떆吏 ?뺣━

### ?묒뾽 18. AI ?섎룄 ?뚯떛 ?쇱슦??
- [x] `server/trpc/routers/intent.ts` ?먮뒗 湲곗〈 LLM ?쇱슦???뺤옣
  - Gemini濡??먯뿰???섎룄 遺꾨쪟
  - intent: trading / realestate / finance / google / chat
  - action: 議고쉶 / 遺꾩꽍 / ?앹꽦 / ?섏젙 / ??젣 援щ텇

- [x] 議고쉶???≪뀡 癒쇱? ?곌껐
  - ?붽퀬 議고쉶
  - ?ъ????뺤씤
  - BTC 湲곗닠??遺꾩꽍
  - ?좊Ъ 由ъ뒪??怨꾩궛
  - PF ?꾪솴 ?붿빟
  - ?ъ뾽??遺꾩꽍
  - DART 怨듭떆 議고쉶

- [x] ?ㅽ뻾???≪뀡? ?뺤씤 ?④퀎 異붽?
  - ?뚮┝ 異붽?
  - PF ??異붽?
  - PF ?④퀎 蹂寃?  - Calendar ?대깽???앹꽦
  - Sheets ???
- [x] AI ?묐떟 ?щ㎎ ?듭씪
  - ?깃났: ?붿빟 + 二쇱슂 ?섏튂 + ?ㅼ쓬 ?≪뀡
  - ?ㅽ뙣: ?먯씤 + ?꾩슂???ㅼ젙媛?+ ?ъ떆??諛⑸쾿

### ?묒뾽 19. UI ??諛깆뿏???곌껐

- [x] ?몃젅?대뵫 ?섏씠吏 ?곌껐
  - ??쒕낫?? ?붽퀬, ?ъ??? 源?? 湲곗닠??遺꾩꽍
  - 留ㅻℓ?쇱?: Sheets 湲곕컲 嫄곕옒?댁뿭/?듦퀎
  - ?뚮┝?ㅼ젙: ?뚮┝ 紐⑸줉/異붽?/??젣

- [x] 遺?숈궛PF ?섏씠吏 ?곌껐
  - ???뚯씠?꾨씪?? Sheets 湲곕컲 ??紐⑸줉/?④퀎 蹂寃?  - ?ъ뾽?깅텇?? ?낅젰媛???tRPC ??寃곌낵 移대뱶
  - ?좎?議고쉶: 怨듦났?곗씠??API 寃곌낵 ?쒖떆

- [x] ???꾩젽 ?곌껐
  - ?몃젅?대뵫 ?붿빟 ?ㅻ뜲?댄꽣
  - PF ?ы듃?대━???붿빟 ?ㅻ뜲?댄꽣
  - 鍮좊Ⅸ AI 紐낅졊 ??AI 梨꾪똿 ?먮룞 ?ㅽ뻾

- [x] AI 梨꾪똿 ?뺤옣 ?곌껐
  - ???≪뀡 踰꾪듉??intent ?쇱슦?곕줈 ?곌껐
  - 留덉씠???낅젰 ?먮룞 ?꾩넚 ?좎?
  - TTS??AI 理쒖쥌 ?묐떟留??쎈룄濡??좎?

### Phase 3 泥댄겕?ъ씤??
- [x] `npm.cmd run check` ?듦낵
- [x] `npm.cmd run build` ?듦낵
- [x] `npm.cmd run dev` ?ㅽ뻾 ?뺤씤
- [x] `/`, `/chat`, `/trading`, `/real-estate-pf`, `/google` ?쇱슦???뺤씤
- [x] 湲곗〈 Google Workspace 湲곕뒫 ?뚭? ?뺤씤
- [x] API ?ㅺ? ?녿뒗 ?곹깭???먮윭 UI ?뺤씤
- [x] Redis媛 ?녿뒗 ?곹깭???먮윭 硫붿떆吏 ?뺤씤
- [x] Google OAuth媛 ?녿뒗 ?곹깭???먮윭 硫붿떆吏 ?뺤씤

<!-- MODIFIED: 2026-04-24 progress update for Phase 3 routing + UI integration -->
## Work Log - 2026-04-24 (Evening)

- [x] Added `trading`, `realestate`, `finance` routers and registered in `appRouter`
- [x] Added `intent` router (`classify`, `route`) with query-action execution path
- [x] Connected web chat to `intent.route` first, with fallback to `llm.chat`
- [x] Applied same intent routing in Telegram bot flow (before generic LLM fallback)
- [x] Connected Trading UI to live tRPC data
  - `BalanceCards`: `trading.getBalance`
  - `PositionTable`: `trading.getPositions`
- [x] Connected Real Estate UI to live tRPC data
  - `DealPipeline`: `realestate.getDeals`, `realestate.getPortfolioSummary`
  - `FeasibilityForm`: `realestate.runFeasibility`
  - `FeasibilityResult`: renders live analysis output
- [x] Validation passed
  - `pnpm run check`
  - `pnpm run build`

## Architecture Decision - 2026-04-24

- [x] Keep the real-time app core on the current controlled path:
  - Web/Telegram -> tRPC -> intent/domain routers -> LLM adapter
- [x] Do not put OpenClaw in front of the app core during Phase 3.
- [x] Reserve OpenClaw for a later automation layer after Phase 3:
  - scheduled position summaries
  - weekly PF reports
  - market briefing jobs
  - multi-channel delivery
- [x] Add `LLMAdapter` first so Gemini/OpenAI/Claude/local models can be switched without rewiring the app.

## Next TODO - LLM Adapter Track

- [x] Add `server/_core/llmAdapter.ts`
- [x] Move intent classification away from hardcoded `gemini/flash`
- [x] Move Telegram Workspace command parsing away from hardcoded `gemini/flash`
- [x] Add LLM adapter environment variables to `.env.example`
- [ ] Add future adapter implementations only when needed:
  - `OpenRouterAdapter`
  - `HermesAdapter`
  - OpenClaw automation client/skill bridge

<!-- MODIFIED: 2026-04-24 late-night stabilization pass -->
## Work Log - 2026-04-24 (Late Night)

- [x] Stabilized dev boot without local Redis by deferring BullMQ creation in alert scheduler
  - Updated `server/alerts/alertEngine.ts`
  - Queue/worker now initialize only on `startAlertScheduler()` call
  - Result: app bootstrap no longer fails just because Redis is unavailable at startup
- [x] Added normalized Redis connection error message
  - Updated `server/_core/redis.ts`
  - Connection failures now surface actionable message instead of raw low-level errors
- [x] Runtime verification
  - `pnpm run check` passed
  - `pnpm run build` passed
  - `pnpm run dev` served successfully on `http://localhost:4000`
  - Route checks passed: `/`, `/chat`, `/trading`, `/real-estate-pf`, `/google`
- [x] Unified user-facing error messages in tRPC core
  - Updated `server/_core/trpc.ts`
  - Added centralized normalization for:
    - missing Google OAuth connection
    - missing API key configuration
    - missing `WORKSPACE_SPREADSHEET_ID`
    - Redis connection failure
  - Result: frontend now receives actionable messages instead of provider/raw low-level text
- [x] Google Workspace regression smoke check (no-auth baseline)
  - `googleWorkspace.getAuthUrl` responded `200`
  - `googleWorkspace.isAuthenticated` responded `200` with `authenticated:false`
  - `googleWorkspace.gmail.getEmails` (unauthenticated state) returns normalized actionable OAuth message
- [x] Unified intent response format across channels
  - Added shared formatter `formatIntentRouteMessage` in `server/intent/intentService.ts`
  - `server/routers/intent.ts` now returns `formattedMessage` for web clients
  - Web chat (`UnifiedChatInterface`) now renders server-provided formatted intent output
  - Telegram bot now uses the same shared formatter (same structure as web)

- [x] Query-intent fallback mapping stabilized
  - Updated `server/intent/intentService.ts`
  - Repaired fallback keyword matching for 7 query actions:
    - balance, positions, technical analysis, risk calc, PF summary, feasibility, DART disclosures
  - Replaced broken fallback literals with valid Korean/English keyword checks
- [x] Execute confirmation payload enhanced (foundation)
  - `IntentRouteResponse` now includes optional `confirmation` payload
  - execute-intent without approval now returns structured `action/domain/params`
  - formatter now includes compact parameter preview and next-step hint

- [x] Execute-intent confirmation + execution wiring
  - Updated `server/intent/intentService.ts`
  - Added execute actions:
    - `trading_add_alert`
    - `realestate_add_deal`
    - `realestate_update_deal_stage`
    - `google_create_event`
    - `google_write_sheet`
  - `allowExecute=false`: returns structured `confirmation` payload for approval step
  - `allowExecute=true`: runs real execution path for each action
- [x] Phase 3 UI-backend wiring finalized (Task 19)
  - Updated `client/src/pages/TradingPage.tsx`
    - connected dashboard quick-action buttons to `/chat?command=...`
    - normalized tab labels/text to readable Korean UI
  - Updated `client/src/components/home/PFSummaryWidget.tsx`
    - cleaned widget text and preserved live tRPC-based counters
  - Updated `client/src/components/home/QuickCommandWidget.tsx`
    - aligned quick commands with current intent-router actions
  - Marked Task 19 checklist items complete in TODO

## Final Wrap-up - 2026-04-25

- [x] Phase 3 backend integration completed
  - domain routers: trading / realestate / finance
  - intent router + shared intent service connected to web and Telegram flows
  - LLM adapter scaffold (`direct`) introduced and hardcoded Gemini intent parsing removed
- [x] Runtime stabilization completed
  - Redis dependency no longer crashes dev bootstrap (lazy BullMQ queue init)
  - Redis/user-facing error messages normalized
  - OAuth/API key/env error messages normalized in tRPC core
- [x] UI-backend wiring completed
  - trading dashboard widgets, PF widgets, quick commands connected to live tRPC and intent flow
  - dashboard quick-action buttons now route to AI chat commands
- [x] Execute-intent confirmation flow added
  - `allowExecute=false`: confirmation payload and preview
  - `allowExecute=true`: real execution wiring for alert/PF/calendar/sheets paths
- [x] Validation history
  - repeated `pnpm run check` pass
  - repeated `pnpm run build` pass
