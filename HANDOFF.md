# HANDOFF.md — 에스턴 워크스테이션
> 업데이트: 2026-04-30 | 브랜치: codex-google-workspace-expansion

---

## 현재 상태

| 항목 | 상태 |
|------|------|
| 서버 | 정상 기동 (포트 4000) |
| 빌드 | `npm run check` ✅ / `npm run build` ✅ (2026-04-29) |
| 테스트 | 92 passed, 7 skipped |
| 브랜치 | `codex-google-workspace-expansion` |
| Redis | 선택적 (없어도 부팅됨, BullMQ lazy init) |
| Google OAuth | 정상 연결 시 작동 |
| Upbit | ccxt 인스턴스 정상, KRW 잔고 조회 확인됨 |
| Gate.io | 400 에러 반복 중 (API 키 문제 또는 미지원 엔드포인트) |

---

## 마지막 완료 작업

**2026-04-29 | Claude Code (preCheckEngine 시장 데이터 N/A 수정)**
- `server/trading/preCheckEngine.ts`: Binance/Upbit ccxt 의존 제거 → 공개 REST API 직접 fetch로 교체
- 현재가(`/api/v3/ticker/24hr`), 펀딩비(`fapi/v1/fundingRate`), 캔들(`/api/v3/klines`), 김프(`upbit /v1/ticker`)
- 에러 시 에러 메시지 대신 "일부 데이터를 가져오지 못했습니다" 한 줄 표시
- 검증: check ✅ / build ✅

**2026-04-29 | Claude Code (trading_pre_check 라우팅 버그 수정)**
- `server/intent/intentService.ts`: pre_check confidence 0.95 → 0.98 상향, risk_calculate 트리거에서 "손절" 제거
- `server/trading/preCheckEngine.ts`: 한글 코인명 → 영문 티커 매핑 추가(비트코인/이더/솔라나/리플/도지/에이다/BNB)
- 검증: check ✅ / build ✅

**2026-04-29 | Claude Code (AI 진입 전 점검 어시스턴트)**
- 신규: `server/trading/preCheckEngine.ts` — `runPreCheck()`/`formatPreCheck()`/`parsePreCheckMessage()`
- 수정: `server/intent/intentService.ts` — `trading_pre_check` 인텐트 매칭(confidence 0.95) + 핸들러 추가
- 입력 패턴: "BTC 숏 77000 손절 78500 목표 74000" → 손익비/포지션 사이즈/RSI 1h·4h/BB/펀딩비/거래량/김프/Risk Guard 한 장 응답
- 응답: 한국어 텍스트 포맷(JSON 미반환), 판정 ✅/⚠️/🚫
- 검증: check ✅ / build ✅
- 잔여: 실제 텔레그램 메시지 운영 검증 필요

**2026-04-29 | Claude Code (Portfolio Summary Loading... 수정)**
- `client/src/components/trading/PortfolioSummary.tsx`: retry:false 적용, Binance 키 없으면 Binance 카드 숨김, Upbit 키 있으면 KRW잔고+보유코인 표시, 둘 다 없으면 한 줄 안내
- `client/src/components/trading/PositionTable.tsx`: retry:false 적용, Binance 에러 시 테이블 대신 한 줄 안내
- 검증: check ✅ / build ✅

**2026-04-29 | Claude Code (텔레그램 Google 미연결 근본 수정)**
- **원인**: 웹 로그인 시 토큰이 DB userId(`"4"`) 키로 저장, 텔레그램은 `"1"`/`"anonymous"` 만 체크 → 항상 미연결
- `server/llm/session.ts`: `getAnyAuthenticatedGoogleUserId()` 추가 (디스크 전수 스캔)
- `server/llm/telegram-bot.ts`: `getConnectedGoogleUserId()` — 디스크 스캔 우선, 고정 ID는 폴백
- `server/llm/telegram-bot.ts`: `setupMessageHandler()` — `google_` 인텐트만 `handleWorkspaceCommand()` 호출, 나머지는 직행
- 검증: check ✅ / build ✅

**2026-04-29 | Claude Code (CLAUDE.md "커밋" 명령어 수정)**
- "커밋" 자동 명령어에 git push 포함으로 수정

**2026-04-28 | Claude Code (CLAUDE.md 자동 명령어 추가)**
- `CLAUDE.md`: "작업준비" / "작업정리" / "커밋" 자동 명령어 섹션 추가

**2026-04-28 | Claude Code (Telegram trading_ 인텐트 Google 인증 우회 버그 수정)**
- `server/llm/telegram-bot.ts`: `classifyIntent()` 선행 호출 추가
- 검증: check/build 모두 통과

**2026-04-28 | Claude Code (Trading Risk Guard Phase 1)**
- 신규: `server/trading/riskGuard.ts`, `server/trading/riskStore.ts`, `server/routers/tradingRisk.ts`, `client/src/components/trading/RiskGuardCard.tsx`, `server/__tests__/riskGuard.test.ts`
- 수정: `server/_core/index.ts` (라우트 등록), `server/intent/intentService.ts` (텔레그램 명령 4종), `client/src/pages/TradingPage.tsx` (카드 배치)
- 검증: check/build/risk tests 모두 통과
- 데이터: `data/risk-state.json` (자동 생성)

**2026-04-28 | Claude Code**
- `server/exchanges/exchangeConnector.ts`: `addExchangeFromEnv` try-catch 추가 (서버 종료 방지), 거래소 등록 성공 로그 추가
- `server/intent/intentService.ts`: `trading_balance` 핸들러에 upbit 잔고 시도 로그 + try-catch + 실제 에러 메시지 반환

**2026-04-28 | Codex**
- `client/src/components/trading/ChartArea.tsx`: 4-탭 멀티마켓 차트 (TradingView + Yahoo Finance)
- 커밋: `2f41e39`, `8e879a5`

---

## 현재 진행 작업

| 도구 | 작업 중인 파일 | 내용 |
|------|----------------|------|
| 없음 | — | 현재 진행 중인 작업 없음 |

> **Codex가 작업을 시작하려면**: 위 표에 파일명과 작업 내용을 추가한 후 시작한다.
> **Claude Code가 작업을 시작하려면**: 위 표에 파일명과 작업 내용을 추가한 후 시작한다.

---

## 건드리지 말아야 할 영역

| 영역 | 이유 |
|------|------|
| `client/src/components/UnifiedChatInterface.tsx` | 핵심 채팅 UI — 구조 변경 시 동기화/편집/검색 기능 깨짐 |
| `server/_core/trpc.ts` | tRPC core — 인증/에러 정규화 로직, 잘못 건드리면 전체 API 무너짐 |
| `server/_core/redis.ts` | Redis 싱글턴 — 새 인스턴스 생성 금지 |
| `drizzle/schema.ts` + `server/db.ts` | SQLite 스키마 — 마이그레이션 없이 수정 금지 |
| `.env` | 비밀키 — 코드에 하드코딩 금지, 커밋 금지 |
| `server/google/auth.ts` | OAuth 플로우 — 새 인증 로직 만들지 않는다 |
| `client/src/App.tsx` (라우팅) | 기존 라우트 삭제 금지 |

---

## 다음 추천 작업

### 즉시 (P0)
1. **Yahoo Finance CORS 프록시** — `server/routers/proxy.ts` 생성, `/api/yahoo-proxy` 엔드포인트 추가
   - 수정 파일: `server/routers/proxy.ts`, `server/routers.ts`
2. **Upbit 잔고 Telegram 검증** — 텔레그램에서 "업비트 잔고" 메시지 전송 후 응답 확인
   - 코드 수정 없음, 운영 테스트만 필요

### 이번 주 (P1)
3. **Telegram 운영 검증** — webhook 상태 엔드포인트 + UI 뱃지
4. **대시보드 실시간 KPI** — mock 값 → 실제 서비스 카운트

---

## 알려진 이슈

| 이슈 | 심각도 | 상태 |
|------|--------|------|
| Yahoo Finance 브라우저 CORS 차단 가능성 | P0 | 미해결 |
| 텔레그램 Google 명령 실제 응답 운영 검증 필요 | P0 | 코드 수정 완료, 검증 대기 |
| Gate.io `trading.getBalance` 400 에러 | P1 | 미해결 (API 키 확인 필요) |
| Gemini Grounding 소스 UI 미구현 | P1 | 미해결 |
| 홈 KPI 카드 mock 데이터 | P1 | 미해결 |
| Telegram webhook/polling 상태 불명확 | P1 | 미해결 |
