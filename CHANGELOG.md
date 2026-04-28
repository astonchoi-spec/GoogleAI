# CHANGELOG.md — 에스턴 워크스테이션
> 형식: 날짜 | 도구 | 작업 내용 | 수정 파일 | 검증 결과 | 남은 이슈

---

## 2026-04-28

### [Claude Code] 텔레그램 trading_ 인텐트 Google 인증 체크 우회 버그 수정
- **작업**: "리스크 상태" 등 trading_ 계열 명령이 Google 계정 미연결 에러로 차단되는 버그 수정
- **원인**: `handleWorkspaceCommand()`가 항상 먼저 실행되어 LLM이 trading 명령을 Workspace 명령으로 오분류할 경우 Google 인증 체크에서 차단됨
- **수정 파일**: `server/llm/telegram-bot.ts`
  - `classifyIntent` 임포트 추가
  - `setupMessageHandler()`: `classifyIntent()` 선행 호출 후 `trading_*`/`analysis_*` 인텐트는 `handleWorkspaceCommand()` 자체를 건너뜀
  - `google_*` 계열이거나 chat(분류 실패) 일 때만 Google 인증 체크 수행
- **검증**: `npm run check` ✅ / `npm run build` ✅

### [Claude Code] Trading Risk Guard (Phase 1)
- **작업**: 실거래 주문 전 룰 기반 리스크 게이트 도입. AI는 차단 결정에 관여하지 않음(설명 문구만).
- **추가 파일**:
  - `server/trading/riskStore.ts` — `JsonRiskStore`/`MemoryRiskStore`, KST 일자 롤오버, `data/risk-state.json` 영속화
  - `server/trading/riskGuard.ts` — `RiskGuard.checkRisk(orderIntent)`, `executeOrderWithGuard`, `mockOrderExecutor`, `EventBlockProvider` 인터페이스(이벤트 차단은 mock)
  - `server/routers/tradingRisk.ts` — `GET /api/trading/risk/status`, `POST /api/trading/risk/{check,lock,unlock,settings,record-trade}`
  - `client/src/components/trading/RiskGuardCard.tsx` — Trading 대시보드 카드(손익률/한도/연속 손실/잠금/레버리지 상한/잠금 토글)
  - `server/__tests__/riskGuard.test.ts` — 11 테스트(allow/warn/block, 일일 한도, 연속 손실 2/3, 레버리지, manual lock, 이벤트 차단, executor 통합)
- **수정 파일**:
  - `server/_core/index.ts` — `registerTradingRiskRoutes(app)` 등록
  - `server/intent/intentService.ts` — Telegram/채팅 인텐트 추가: `trading_risk_status`/`_lock`/`_unlock`/`_settings_update` ("리스크 상태", "오늘 거래 중지", "거래 재개", "리스크 한도 변경 …")
  - `client/src/pages/TradingPage.tsx` — 대시보드 탭에 `RiskGuardCard` 배치
- **결정 규칙**: `block`이면 주문 실행 불가, `warn`이면 텔레그램 승인 필요, `allow`만 진행. 사유는 모두 한국어 reason 배열로 반환.
- **검증**: `npm run check` ✅ / `npm run build` ✅ / `vitest run server/__tests__/riskGuard.test.ts` ✅ 11 passed
- **남은 이슈**: 이벤트 차단 provider는 mock(NoopEventBlockProvider). Google Calendar 연동 시 실제 캘린더 기반 provider로 교체 필요.

### [Claude Code] Upbit 잔고 API 에러 처리 강화
- **작업**: exchangeConnector 등록 실패 시 서버 종료 방지 + 인텐트 서비스 에러 메시지 개선
- **수정 파일**:
  - `server/exchanges/exchangeConnector.ts` — `addExchangeFromEnv` try-catch 추가, `addExchange` 성공 로그 추가
  - `server/intent/intentService.ts` — `trading_balance` 핸들러에 upbit 잔고 시도 로그 + try-catch + 실제 에러 메시지 반환
- **검증**: `npm run check` 통과, `npm run build` 통과
- **남은 이슈**: 텔레그램에서 "업비트 잔고" 실제 응답 검증 미완료 (P0)

### [Claude Code] 진단 작업
- upbit ccxt 인스턴스 직접 테스트 → KRW 잔고 13,777.76 확인
- gate exchange 400 에러 반복 확인 (서버 로그)
- intentService.ts trading_balance 라우팅 경로 확인

---

### [Codex] 4-탭 멀티 마켓 차트 확장
- **작업**: [코인] [한국주식] [미국주식] [선물/지수] 탭 추가
- **수정 파일**: `client/src/components/trading/ChartArea.tsx`
- **검증**: `npm run check` 통과, `npm run build` 통과, `npm test` 통과 (92 passed, 7 skipped)
- **커밋**: `2f41e39`
- **남은 이슈**: Yahoo Finance CORS 차단 가능성 (P0)

### [Codex] TradingView Advanced Chart 위젯 교체
- **작업**: lightweight-charts + 수동 RSI/MACD/BB 제거, TradingView embed 위젯 도입
- **수정 파일**: `client/src/components/trading/ChartArea.tsx`
- **검증**: `npm run check` 통과, `npm run build` 통과
- **커밋**: `8e879a5`

---

## 2026-04-26

### [Codex] 라이브 안정화 패스
- **작업**: Google OAuth 로그인 복구, 채팅 중복 전송 방지, Gemini Google Search Grounding 활성화
- **수정 파일**: `server/google/auth.ts`, `client/src/components/UnifiedChatInterface.tsx`, `server/llm/`
- **검증**: `npm run check` 통과, `npm run build` 통과
- **남은 이슈**: Grounding 소스 UI 미구현 (P1)

### [Codex] 모바일 QA 패스
- **작업**: 390px 너비 전 페이지 검증, Settings/GoogleAuthCard/GmailPanel 모바일 레이아웃 수정
- **수정 파일**: `client/src/pages/Settings.tsx`, `client/src/components/GoogleWorkspace/GoogleAuthCard.tsx`, `client/src/components/GoogleWorkspace/GmailPanel.tsx`
- **검증**: `npm run check` 통과, `npm run build` 통과

### [Codex] Dev boot warning 정리
- **작업**: `NODE_ENV=production` 일 때만 운영 준비 경고 출력
- **수정 파일**: `server/_core/index.ts`
- **검증**: `npm run check` 통과, `npm run build` 통과

---

## 2026-04-25

### [Codex] Aston UI 쉘 polish
- **작업**: Login 페이지 다크 패널 스타일 적용, UnifiedChatInterface Aston 패널 토큰 적용
- **수정 파일**: `client/src/pages/Login.tsx`, `client/src/components/UnifiedChatInterface.tsx`
- **검증**: `npm run check` 통과, `npm run build` 통과

### [Codex] Phase 3 UI-백엔드 배선 완료
- **작업**: TradingPage 대시보드 버튼 연결, PFSummaryWidget/QuickCommandWidget 정리
- **수정 파일**: `client/src/pages/TradingPage.tsx`, `client/src/components/home/PFSummaryWidget.tsx`, `client/src/components/home/QuickCommandWidget.tsx`
- **검증**: `npm run check` 통과, `npm run build` 통과

### [Codex] Execute-intent confirmation 플로우 + LLM Adapter
- **작업**: allowExecute 플래그 기반 확인/실행 분리, LLMAdapter scaffold 도입
- **수정 파일**: `server/intent/intentService.ts`, `server/_core/llmAdapter.ts`
- **검증**: `npm run check` 통과, `npm run build` 통과

---

## 2026-04-24

### [Codex] tRPC 라우터 통합 + 인텐트 라우터
- **작업**: trading/realestate/finance/intent 라우터 생성 및 appRouter 등록, 웹/텔레그램에 intent 라우팅 연결
- **수정 파일**: `server/trpc/routers/trading.ts`, `server/trpc/routers/realestate.ts`, `server/trpc/routers/finance.ts`, `server/intent/intentService.ts`, `server/routers/intent.ts`
- **검증**: `npm run check` 통과, `npm run build` 통과

### [Codex] 백엔드 엔진 추가
- **작업**: 알림 엔진, 리스크 계산기, PF 파이프라인, 공공데이터 API, DART API
- **수정 파일**: `server/alerts/alertEngine.ts`, `server/trading/riskCalculator.ts`, `server/realestate/feasibilityEngine.ts`, `server/realestate/publicDataAPI.ts`, `server/realestate/dealPipeline.ts`, `server/finance/dartAPI.ts`
- **검증**: `npm run check` 통과, `npm run build` 통과

---

## 2026-04-23

### [Codex] Google Workspace 확장 (Session 9)
- **작업**: Calendar 월뷰, Drive 파일 워크플로우, Gmail UTF-8 헤더, Telegram Workspace 커맨드 브리지
- **수정 파일**: `server/google/`, `client/src/pages/Google.tsx`, `server/llm/telegram-bot.ts`
- **검증**: `npm run check` 통과, `npm run build` 통과

---

## 2026-04-22

### [Codex] MySQL → SQLite 전환 + Web↔Telegram 동기화 복구 (Session 8)
- **작업**: DB 엔진 교체, Telegram↔Web 대화 동기화 수리
- **수정 파일**: `drizzle/schema.ts`, `server/db.ts`, `server/db-chat.ts`, `drizzle.config.ts`, `.env`
- **검증**: `npm run check` 통과, `npm run build` 통과
