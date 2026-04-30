# CHANGELOG.md — 에스턴 워크스테이션
> 형식: 날짜 | 도구 | 작업 내용 | 수정 파일 | 검증 결과 | 남은 이슈

---

## 2026-04-30

### [Claude Code] CLAUDE.md 아키텍처 규칙·코딩 컨벤션 추가
- **작업**: CLAUDE.md에 섹션 6~9 신규 추가
  - **§6 아키텍처 규칙**: 도메인 분리(DDD) — trading/google/realestate/finance/intent/exchanges/_core 책임 명시, 도메인 간 직접 import 금지, intent→도메인 단방향 규칙
  - **§7 코딩 컨벤션**: 파일/함수/타입/상수 네이밍, 에러 처리(catch에 console.error + 사용자에는 한국어), fetch 직접 사용(exchangeConnector 미경유), 텔레그램 응답 포맷
  - **§8 테스트 규칙**: server/__tests__/ 위치, {모듈명}.test.ts 명명, vitest, 정상/에러 케이스 의무화
  - **§9 파일 크기 제한**: 500줄 상한, intentService.ts(900줄+) P1 분리 대상 명시
- **수정 파일**: `CLAUDE.md`
- **검증**: 문서 변경만 (빌드 불필요)
- **잔여이슈**: intentService.ts 도메인별 분리 작업 P1 큐에 추가 필요

### [Claude Code] parsePreCheckMessage 정규식 버그 수정
- **문제**: "BTC 숏 77000 손절 78500 목표 74000" 파싱 시 목표가가 7400으로 누락 가능
- **원인 1 (주요)**: `sideRe = new RegExp(template, "i")` 생성 시 `\\s*`가 `s*`(리터럴 s)로 변환 — `\s` 공백 클래스 소실, sideRe가 항상 null 반환
- **원인 2**: `m[m.length-1]` 방식으로 마지막 캡처 그룹 추출 — 그룹 수 변경 시 취약
- **수정 파일**: `server/trading/preCheckEngine.ts`
  - `sideRe`: `new RegExp(template)` → 정규식 리터럴 `/(숏|매도|short|sell|롱|매수|long|buy)\s*([0-9][0-9,\.]*)/i` 직접 사용
  - 그룹 참조: `m[m.length-1]` → `m[2]` (명시적 인덱스)
  - 디버그용 `console.log` 로그 추가 (Binance/Upbit 응답 raw + 파싱값)
  - 각 fetch catch 블록에 `console.error(e)` 추가
- **검증**: `npm run check` ✅ / `npm run build` ✅
- **잔여이슈**: 없음

## 2026-04-29

### [Claude Code] preCheckEngine 시장 데이터 N/A 수정
- **문제**: 현재가/펀딩비/거래량/김프가 모두 N/A로 표시됨
- **원인**: `exchangeConnector.getExchange("binance")` 경유 → Binance API 키 미설정 시 전부 실패
- **수정 파일**: `server/trading/preCheckEngine.ts`
  - `exchangeConnector` import 제거
  - `fetchBinanceCandles()`: ccxt → Binance 공개 klines API (`/api/v3/klines`) 직접 fetch로 교체
  - 현재가/거래량: `/api/v3/ticker/24hr` 직접 fetch
  - 펀딩비: `/fapi/v1/fundingRate` 직접 fetch
  - 김프(Upbit): `/v1/ticker` 직접 fetch
  - 에러 발생 시 영문 스택 대신 "일부 데이터를 가져오지 못했습니다" 한 줄 표시
- **검증**: `npm run check` ✅ / `npm run build` ✅
- **잔여이슈**: 없음

### [Claude Code] trading_pre_check 라우팅 버그 수정
- **문제**: "BTC 숏 77000 손절 78500 목표 74000" 메시지가 `trading_risk_calculate`로 잘못 라우팅
- **원인**:
  1. `trading_risk_calculate` 트리거에 "손절" 키워드가 포함돼 있어, 파서 실패 시 fallback으로 잡힘
  2. `parsePreCheckMessage()`가 한글 코인명("비트코인" 등)을 인식하지 못함
  3. `trading_pre_check` confidence 0.95가 동률 경쟁에서 우선순위 명확하지 않음
- **수정 파일**:
  - `server/intent/intentService.ts`
    - `trading_pre_check` 매칭 블록 confidence 0.95 → 0.98로 상향 (파서 매칭 시 무조건 우선)
    - 매칭 블록 위치는 변경 없음(이미 `fallbackIntent` 최상단), NOTE 주석 추가로 순서 의도 명시
    - `trading_risk_calculate` 트리거에서 "손절" 키워드 제거 → 이제 "포지션사이징"/"청산가"/"리스크계산"만 매칭
  - `server/trading/preCheckEngine.ts`
    - `KOREAN_TICKER_MAP` 추가: 비트코인/이더/솔라나/리플/도지/에이다/BNB 한글명 → 영문 티커
    - 영문 티커 미발견 시 한글 키워드로 폴백 매칭
- **매칭 동작**:
  - "숏/롱/매수/매도 + 숫자 + (손절|목표)" → `trading_pre_check` (confidence 0.98)
  - "숏/롱 + 숫자만" → `trading_pre_check` (SL/TP 자동 제안)
  - "포지션사이징"/"청산가"/"리스크계산" 키워드만 → `trading_risk_calculate`
- **응답**: `formatPreCheck()` 결과 텍스트만 반환, `data` 필드 미포함 → JSON preview 노출 없음
- **검증**: `npm run check` ✅ / `npm run build` ✅

### [Claude Code] AI 진입 전 점검 어시스턴트 (trading_pre_check)
- **작업**: 텔레그램에서 "BTC 숏 77000 손절 78500 목표 74000" 입력 시 30초 안에 진입 판단에 필요한 정보를 한 장으로 반환
- **추가 파일**:
  - `server/trading/preCheckEngine.ts` — `runPreCheck()`, `formatPreCheck()`, `parsePreCheckMessage()`
    - 손익비, 포지션 사이즈(계좌 2% 리스크), 진입가-현재가 괴리율
    - RSI 1h/4h, 볼린저밴드 위치 (taEngine 재사용)
    - Binance 펀딩비, 24h 거래량 변화율(1d 캔들 비교)
    - 김치프리미엄 (Upbit KRW-XXX vs Binance USDT × 1380)
    - Risk Guard 상태(오늘 손익, 연속 손실, 잠금)
    - 최종 판정: ✅ 진입 가능 / ⚠️ 주의(사유) / 🚫 진입 차단(사유)
    - SL/TP 미지정 시 ±2%/±4% 자동 제안
- **수정 파일**: `server/intent/intentService.ts`
  - `IntentAction`에 `trading_pre_check` 추가
  - `fallbackIntent()` 최상단에 `parsePreCheckMessage()` 매칭 추가 (confidence 0.95)
  - 핸들러 추가: `runPreCheck()` → `formatPreCheck()` 텍스트 응답, JSON 미반환
- **데이터 소스**: Binance 공개 API(현재가/펀딩비/거래량/캔들), Upbit 공개 ccxt fetchTicker, 기존 taEngine, riskGuard
- **검증**: `npm run check` ✅ / `npm run build` ✅
- **잔여이슈**: 텔레그램 실제 메시지 응답 운영 검증 필요. AI(Gemini) 최종 문구 생성은 미연결(룰 기반 판정만 사용)

### [Claude Code] Portfolio Summary Loading... 무한 표시 수정
- **작업**: Binance API 키 없을 때 "Loading..." 무한 표시 → 거래소별 조건부 렌더링으로 교체
- **원인**: retry 미설정(기본 3회 재시도) + `isError` 미활용으로 Binance 에러 시 UI가 로딩 상태 지속
- **수정 파일**:
  - `client/src/components/trading/PortfolioSummary.tsx`
    - Binance/Upbit 각각 `retry: false` 적용
    - Binance 키 없으면 Total Asset / Unrealized PnL / Open Positions 카드 숨김
    - Upbit 키 있으면 "총 자산 (Upbit)" / KRW 잔고 / 보유 코인 목록 표시 (`sm:col-span-3`)
    - 두 거래소 다 미설정 시 "거래소 API 키를 설정해주세요" 한 줄 표시
  - `client/src/components/trading/PositionTable.tsx`
    - `retry: false` 적용
    - Binance 에러 시 테이블 대신 "API 키를 설정하면 잔고/포지션을 확인할 수 있습니다" 한 줄로 대체
    - `{false ? ...}` 하드코딩 제거 → 정상 조건 분기로 교체
- **검증**: `npm run check` ✅ / `npm run build` ✅
- **잔여이슈**: 없음

### [Claude Code] CLAUDE.md "커밋" 명령어 규칙 수정
- **작업**: "커밋" 자동 명령어에서 "푸시는 하지 않음" → "커밋 후 반드시 git push origin 현재브랜치 실행"으로 교체
- **수정 파일**: `CLAUDE.md`
- **검증**: 문서 변경만, 빌드 불필요
- **잔여이슈**: 없음

### [Claude Code] 텔레그램 Google 계정 미연결 에러 근본 수정
- **작업**: 웹에서는 Google 연결되어 있으나 텔레그램에서만 미연결로 판단되는 버그 수정
- **원인**: 웹 로그인 시 토큰이 DB userId(`"4"`) 키로 저장되는데, 텔레그램은 고정값 `"1"`, `"anonymous"` 만 체크하여 항상 미연결 판단
- **수정 파일**:
  - `server/llm/session.ts` — `getAnyAuthenticatedGoogleUserId()` 공개 메서드 추가: `google-tokens.json`에 저장된 모든 userId 스캔, 유효한 토큰을 가진 첫 번째 userId 반환
  - `server/llm/telegram-bot.ts` — `getConnectedGoogleUserId()`: 디스크 스캔 우선, 고정 userId는 폴백으로 변경
  - `server/llm/telegram-bot.ts` — `setupMessageHandler()`: `isTradingIntent` 조건 → `isGoogleIntent` 조건으로 교체. `google_` 인텐트만 `handleWorkspaceCommand()` 호출, 나머지(trading_/analysis_/chat)는 Google 인증 체크 없이 `routeIntentMessage`로 직행
- **검증**: `npm run check` ✅ / `npm run build` ✅
- **잔여이슈**: 텔레그램에서 Google 명령("메일 확인", "캘린더 일정 추가") 실제 응답 운영 검증 필요

## 2026-04-28

### [Claude Code] CLAUDE.md 자동 명령어 섹션 추가
- **작업**: "작업준비" / "작업정리" / "커밋" 자동 명령어 규칙 문서화
- **수정 파일**: `CLAUDE.md`
- **검증**: 문서 변경만, 빌드 불필요
- **잔여이슈**: 없음

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
