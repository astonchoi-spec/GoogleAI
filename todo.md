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

## Work Log - 2026-04-24

- [x] 작업 11. 알림 엔진
  - `server/alerts/alertEngine.ts` 추가
  - BullMQ `alerts` 큐와 10초 반복 Worker 구성
  - Redis `active:alerts` 기반 알림 저장/조회/삭제
  - 가격, RSI, 펀딩비, 김프 알림 조건 체크
  - Telegram 발송 연동 및 1회 발동 후 비활성화 처리
  - 커밋: `1be11d8 feat: add alert engine`

- [x] 작업 12. 선물 리스크 계산기
  - `server/trading/riskCalculator.ts` 추가
  - 롱/숏 청산가, 손절가, 1R/2R/3R 목표가, 최대손실 계산
  - AI 채팅 출력용 한국어 리스크 리포트 포맷 추가
  - 커밋: `5e776c5 feat: add futures risk calculator`

- [x] 작업 13. 사업성 분석 엔진
  - `server/realestate/feasibilityEngine.ts` 추가
  - PF 개발사업 수입, 비용, 사업이익, IRR, DSCR, 손익분기 분양률 계산
  - 사업성 판정: 사업성 양호 / 보통 / 미흡
  - AI 채팅 출력용 한국어 사업성 보고서 포맷 추가
  - 커밋: `a33699f feat: add real estate feasibility engine`

- [x] 작업 14. 공공데이터 API 연동
  - `server/realestate/publicDataAPI.ts` 추가
  - 토지이용규제, 건축물대장, 실거래가 조회 함수 추가
  - `DATA_GO_KR_API_KEY` 환경변수 추가
  - JSON/XML 응답 및 API 오류 처리
  - 커밋: `55b0fe4 feat: add public data api client`

- [x] 작업 15. PF 딜 파이프라인
  - `server/realestate/dealPipeline.ts` 추가
  - Google Sheets `PF딜관리` 시트 기반 딜 CRUD 일부 구현
  - 단계 변경, 포트폴리오 요약, Calendar 마일스톤 이벤트 생성
  - 커밋: `f29715a feat: add pf deal pipeline`

- [x] 작업 16. DART 공시 API 연동
  - `server/finance/dartAPI.ts` 추가
  - 공시 목록, 재무제표, 회사 기본정보 조회 함수 추가
  - `DART_API_KEY` 환경변수 추가
  - DART `status/message` 오류 처리
  - 커밋: `76d8505 feat: add dart api client`

- [x] 검증
  - 각 작업 후 `npm.cmd run check` 통과
  - 각 작업 후 `npm.cmd run build` 통과
  - 신규 모듈 import 및 API 키 누락 경로 확인

## Phase 3 Workflow - 통합 연결

### 목표

- Phase 2에서 만든 독립 백엔드 모듈을 기존 tRPC, AI 채팅, UI에 연결한다.
- 기존 홈 / AI 채팅 / Google Workspace 동작은 유지한다.
- 조회성 기능과 실행성 기능을 분리해서 실사용 중 오동작 위험을 줄인다.

### 작업 17. tRPC 라우터 등록

- [ ] `server/trpc/routers/trading.ts` 생성
  - 거래소 잔고 조회
  - 포지션 조회
  - 기술적 분석 조회
  - 선물 리스크 계산
  - 알림 목록/추가/삭제

- [ ] `server/trpc/routers/realestate.ts` 생성
  - PF 딜 목록/추가/단계 변경/요약
  - 사업성 분석 실행
  - 토지조회/건축물대장/실거래가 조회

- [ ] `server/trpc/routers/finance.ts` 생성
  - DART 공시 조회
  - DART 재무제표 조회
  - DART 회사 검색

- [ ] `appRouter`에 신규 라우터 등록
  - 모든 input은 zod 검증
  - API 키 누락, Google Auth 누락, Redis 미연결 오류 메시지 정리

### 작업 18. AI 의도 파싱 라우터

- [ ] `server/trpc/routers/intent.ts` 또는 기존 LLM 라우터 확장
  - Gemini로 자연어 의도 분류
  - intent: trading / realestate / finance / google / chat
  - action: 조회 / 분석 / 생성 / 수정 / 삭제 구분

- [ ] 조회성 액션 먼저 연결
  - 잔고 조회
  - 포지션 확인
  - BTC 기술적 분석
  - 선물 리스크 계산
  - PF 현황 요약
  - 사업성 분석
  - DART 공시 조회

- [ ] 실행성 액션은 확인 단계 추가
  - 알림 추가
  - PF 딜 추가
  - PF 단계 변경
  - Calendar 이벤트 생성
  - Sheets 저장

- [ ] AI 응답 포맷 통일
  - 성공: 요약 + 주요 수치 + 다음 액션
  - 실패: 원인 + 필요한 설정값 + 재시도 방법

### 작업 19. UI ↔ 백엔드 연결

- [ ] 트레이딩 페이지 연결
  - 대시보드: 잔고, 포지션, 김프, 기술적 분석
  - 매매일지: Sheets 기반 거래내역/통계
  - 알림설정: 알림 목록/추가/삭제

- [ ] 부동산PF 페이지 연결
  - 딜 파이프라인: Sheets 기반 딜 목록/단계 변경
  - 사업성분석: 입력값 → tRPC → 결과 카드
  - 토지조회: 공공데이터 API 결과 표시

- [ ] 홈 위젯 연결
  - 트레이딩 요약 실데이터
  - PF 포트폴리오 요약 실데이터
  - 빠른 AI 명령 → AI 채팅 자동 실행

- [ ] AI 채팅 확장 연결
  - 퀵 액션 버튼을 intent 라우터로 연결
  - 마이크 입력 자동 전송 유지
  - TTS는 AI 최종 응답만 읽도록 유지

### Phase 3 체크포인트

## 2026-04-24 Update

- [x] Finance DART tRPC router added
- [x] Finance page added and routed at `/finance`
- [x] Home sidebar and top navigation include Finance entry

- [ ] `npm.cmd run check` 통과
- [ ] `npm.cmd run build` 통과
- [ ] `npm.cmd run dev` 실행 확인
- [ ] `/`, `/chat`, `/trading`, `/real-estate-pf`, `/google` 라우트 확인
- [ ] 기존 Google Workspace 기능 회귀 확인
- [ ] API 키가 없는 상태의 에러 UI 확인
- [ ] Redis가 없는 상태의 에러 메시지 확인
- [ ] Google OAuth가 없는 상태의 에러 메시지 확인

## 2026-04-24 Smoke Test Update

- [x] `pnpm run check`
- [x] `pnpm run build`
- [x] `pnpm run test`
- [x] `/`, `/chat`, `/trading`, `/real-estate-pf`, `/google`, `/finance` routes smoke-tested
- [ ] Google Workspace feature completeness
- [ ] API missing-state UI review
- [ ] Redis missing-state UI review
- [ ] Google OAuth missing-state UI review
