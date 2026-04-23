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

## Telegram ↔ Web Chat Synchronization (Session 4)

- [x] Database schema for unified conversations
  - conversations table created and migrated
  - messages table created and migrated
  - Link Telegram chat_id to user account

- [x] Backend message sync API
  - Save messages from both sources to unified table
  - Retrieve conversation history
  - Real-time message polling (2-second interval)

- [x] Telegram bot integration
  - Forward user messages to database ✓
  - Forward AI responses back to Telegram ✓
  - Messages linked to conversations table ✓

- [x] Frontend real-time updates
  - Polling for live messages (2-second interval)
  - Show message source indicator (Web/Telegram icons)
  - Unified chat interface component created

- [x] Testing
  - All 57 tests passing ✓
  - Telegram bot integration verified ✓
  - Database sync verified ✓
  - Message persistence confirmed ✓

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

- [x] Fix session isolation bug (web ↔ Telegram shared state)
  - llm.ts was creating its own `new SessionManager()` instance
  - Changed to import the singleton `sessionManager` from session.ts
  - Web engine/model changes now apply to Telegram bot too (same in-memory store)

- [x] Fix model switch not applying (UI)
  - Added "적용" button to settings panel in UnifiedChatInterface
  - Engine change auto-resets model to first available
  - Success feedback shown after apply

- [x] Fix system prompt hardcoded model identity
  - Was always saying "저는 Google Gemini 2.5 Flash 모델입니다"
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

- [x] Fix Telegram ↔ Web conversation sync (conversation ID mismatch)
  - Telegram bot was using Telegram user ID as DB userId → separate conversations
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

- [x] Diagnose Telegram ↔ Web 양방향 동기화 불가 원인
  - MySQL이 설치/실행되지 않아 DB 자체가 ECONNREFUSED 상태
  - 텔레그램 봇은 in-memory 세션으로 작동 중이었으나 메시지가 DB에 저장 안 됨
  - Web 폴링(getRecentMessages)이 conversationId를 얻지 못해 비활성화 상태

- [x] MySQL → SQLite(libsql) 전환
  - @libsql/client 패키지 설치
  - drizzle/schema.ts: mysql-core → sqlite-core 전환 (mysqlTable, mysqlEnum 등 모두 교체)
  - server/db.ts: mysql2 드라이버 → libsql 드라이버, onDuplicateKeyUpdate → onConflictDoUpdate
  - server/db-chat.ts: insertId → .returning() 방식으로 전환 (SQLite 호환)
  - drizzle.config.ts: dialect mysql → sqlite
  - .env: DATABASE_URL을 file:./data/chat.db 로 변경
  - data/chat.db: SQLite 파일 DB 자동 생성 (서버 실행 시 별도 설치 불필요)

- [x] Web → Telegram 포워딩 구현 (기존 미구현 방향)
  - server/telegram-service.ts: 봇 인스턴스 싱글턴 서비스 신규 생성
  - server/llm/telegram-bot.ts: 생성자에서 registerTelegramBot() 호출
  - server/routers/chat-sync.ts: forwardToTelegram tRPC mutation 추가
    (conversationId로 telegramChatId 조회 → 유저 메시지 + AI 응답 Telegram 전송)
  - client/UnifiedChatInterface.tsx: AI 응답 수신 후 forwardToTelegramMutation 호출

- [x] 최종 양방향 동작 확인
  - Telegram → Web: 텔레그램 메시지 → DB 저장 → 웹 2초 폴링 표시 ✅
  - Web → Telegram: 웹 메시지 → AI 응답 → 텔레그램 양쪽 동시 표시 ✅

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
  - [x] Conversation export (PDF/JSON)
  - [x] Conversation pinning/favorites

- [ ] User profile and settings
  - User preference management
  - Theme customization (dark/light mode)
  - Notification preferences
  - Privacy settings

- [ ] Analytics and monitoring
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

- [ ] Production deployment
  - Environment configuration for production
  - Database backup strategy
  - Error monitoring and logging
  - Security audit
  - Performance testing
  - Final QA testing
