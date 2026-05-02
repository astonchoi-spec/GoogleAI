# HANDOFF.md — 에스턴 워크스테이션
> 업데이트: 2026-04-30 | 브랜치: codex-google-workspace-expansion

---

## 현재 상태

| 항목 | 상태 |
|------|------|
| 서버 | 정상 기동 (포트 4000) |
| 빌드 | `npm run check` ✅ / `npm run build` ✅ (2026-05-01) |
| 테스트 | 330 passed, 7 skipped, 2 todo |
| 브랜치 | `codex-google-workspace-expansion` |
| Redis | 선택적 (없어도 부팅됨, BullMQ lazy init) |
| Google OAuth | 정상 연결 시 작동 |
| Upbit | ccxt 인스턴스 정상, KRW 잔고 조회 확인됨 |
| Gate.io | 400 에러 반복 중 (API 키 문제 또는 미지원 엔드포인트) |
| OpenClaw | 자동 탐지 실행 완료, 현재 미탐지 → 시뮬레이션 모드 유지 |

---

## 마지막 완료 작업

**2026-04-30 | Claude Code (Aston Intelligence System Phase 1a — Wiki 수동 저장·검색)**
- 신규: `server/wiki/wikiStore.ts` — writeWiki / searchWiki, 마크다운+frontmatter 기반
- 신규: `server/intent/wiki.ts` — wiki_save / wiki_search 인텐트, 한국어→영문 카테고리 매핑
- 신규: `server/__tests__/wiki.test.ts` — vitest 25개 통과
- 신규: `docs/superpowers/specs/2026-04-30-aston-wiki-phase1a-design.md`
- 수정: `server/intent/intentService.ts` (+12줄, wiki 분기 추가)
- 수정: `.env.example` (WIKI_ROOT 추가)
- 환경변수: `WIKI_ROOT=G:\내 드라이브\Aston-Wiki` — .env에 직접 설정 필요
- 검증: check ✅ / build ✅ / test 25 passed ✅
- 잔여: 실제 Google Drive 경로에서 운영 검증 필요

**2026-04-30 | Claude Code (CURRENT_TASK.md 운영 규칙 + "현재작업" 명령어 추가)**
- `AGENTS.md`: "자동 명령어" 섹션 신규 추가 — "현재작업" 명령어 + CURRENT_TASK.md 운영 규칙
- `CLAUDE.md`: "현재작업" 자동 명령어 + CURRENT_TASK.md 운영 규칙 섹션 추가
- CURRENT_TASK.md 없으면 즉시 중단("CURRENT_TASK.md가 없습니다" 보고) 규칙 명문화
- 검증: 문서 변경만

**2026-04-30 | Claude Code (preCheckEngine 디버그 로그 정리 + CLAUDE.md 작업준비 강화)**
- `server/trading/preCheckEngine.ts`: `[preCheck] console.log` 9건 제거 (Binance/Upbit raw·parsed·empty), `console.error` 7건은 유지
- `client/src/components/home/WorkspaceWidgets.tsx`: 점검만 — 디스크 상태 이상 없음 (vite 캐시 잔재였음), 코드 수정 없음
- `CLAUDE.md`: "작업준비" 절차에 git fetch + 원격 신규 커밋 확인 + 필요 시 pull --rebase 단계 추가
- 검증: check ✅ / build ✅

**2026-04-30 | Claude Code (AGENTS.md / TASKS.md 동기화)**
- `AGENTS.md`: §5 Codex 규칙 재구성(작업 시작 전 git fetch + 원격 커밋 확인 의무화, 도메인 경계, 텔레그램 응답, 커밋·push 절차)
- `AGENTS.md`: §6 아키텍처 규칙, §7 코딩 컨벤션, §8 테스트 규칙, §9 파일 크기 제한 추가 — CLAUDE.md와 동기화
- `TASKS.md`: 상단 아카이브 헤더 추가 — TODO.md가 권위 출처임을 명시, "작업준비" 명령에서 제외
- 검증: 문서 변경만

**2026-04-30 | Claude Code (CLAUDE.md 아키텍처 규칙·코딩 컨벤션 추가)**
- `CLAUDE.md`: §6 아키텍처 규칙(DDD), §7 코딩 컨벤션, §8 테스트 규칙, §9 파일 크기 제한 신규 섹션 추가
- 도메인 간 직접 import 금지, intent→도메인 단방향 규칙 명문화
- 외부 API 호출은 fetch 직접 사용(exchangeConnector 미경유), catch에 console.error 의무화
- 단일 파일 500줄 상한 — intentService.ts(900줄+) P1 분리 대상으로 TODO.md 등록
- 검증: 문서 변경만

**2026-04-30 | Claude Code (parsePreCheckMessage 정규식 버그 수정)**
- `server/trading/preCheckEngine.ts`: sideRe `new RegExp(template)` → 정규식 리터럴로 교체 (\\s→s 변환 버그 수정)
- `m[m.length-1]` → `m[2]` 명시적 그룹 참조로 변경
- 각 fetch에 console.log/console.error 디버그 로그 추가 (서버 재시작 후 로그에서 [preCheck] 확인 가능)
- 검증: check ✅ / build ✅

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
| Codex | `CURRENT_TASK.md`, `server/_core/googleSheets.ts`, `server/deals/dealSheetSync.ts`, `server/deals/*`, `server/intent/*`, `server/__tests__/*` | Phase 5 PF 구글시트 동기화 구현 중 |

## 2026-05-01 작업 종료 인수인계 (Codex)

- 오늘 완료: Phase 1 골격 ~ Phase 4 모닝브리핑 에이전트 통합까지 10개 작업 완료 (테스트 192 → 340)
- 마지막 커밋: `029b56b docs: 에이전트 브리핑 통합 기록`
- 내일 시작 작업: Phase 5 PF 구글시트 동기화 (지시서는 회장님 별도 보관)
- OpenClaw 상태: 미탐지, 시뮬레이션 모드 유지, 자동 재탐지 활성
- 현재 작업 지시서: `CURRENT_TASK.md` 상태 없음

> **Note**: Phase 1a 완료. Phase 1b(모닝 브리핑) 준비되면 CURRENT_TASK.md 작성 후 시작.

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

### 즉시 (운영 검증)
0. **.env에 `WIKI_ROOT=G:\내 드라이브\Aston-Wiki` 추가** — 서버 재시작 후 텔레그램에서 `위키 저장 테스트 #트레이딩` 전송해 동작 확인

### 즉시 (P0)
1. **Yahoo Finance CORS 프록시** — `server/routers/proxy.ts` 생성, `/api/yahoo-proxy` 엔드포인트 추가
   - 수정 파일: `server/routers/proxy.ts`, `server/routers.ts`
2. **Upbit 잔고 Telegram 검증** — 텔레그램에서 "업비트 잔고" 메시지 전송 후 응답 확인
   - 코드 수정 없음, 운영 테스트만 필요

### 이번 주 (P1)
3. **Telegram 운영 검증** — webhook 상태 엔드포인트 + UI 뱃지
4. **대시보드 실시간 KPI** — mock 값 → 실제 서비스 카운트

### Intelligence System 다음 Phase
5. **Phase 1b** — `node-cron` + `server/intelligence/briefing.ts` (07:00 모닝 브리핑, 기존 Bot API 활용)

---

## 알려진 이슈 (2026-04-30 기준)

| 이슈 | 심각도 | 상태 |
|------|--------|------|
| Yahoo Finance 브라우저 CORS 차단 가능성 | P0 | 미해결 |
| 텔레그램 Google 명령 실제 응답 운영 검증 필요 | P0 | 코드 수정 완료, 검증 대기 |
| Gate.io `trading.getBalance` 400 에러 | P1 | 미해결 (API 키 확인 필요) |
| Gemini Grounding 소스 UI 미구현 | P1 | 미해결 |
| 홈 KPI 카드 mock 데이터 | P1 | 미해결 |
| Telegram webhook/polling 상태 불명확 | P1 | 미해결 |

## 2026-04-30 업데이트

- Phase 1a 검증 완료: 텔레그램 5개 테스트 모두 통과, Google Drive .md 파일 2개 생성 확인
- 운영 체계 구축 완료: CURRENT_TASK.md, 자동 명령어, 자율 결정 원칙 반영
- docs/PROJECT_BRIEFING.md 생성 완료: 새 AI 세션용 영구 브리핑 보존
- 다음 작업: Phase 1b(모닝 브리핑) - 회장이 범위 결정 후 CURRENT_TASK.md 작성 예정
- Phase 1b 범위 선택지 미결정 상태
  - (가) 최소: Wiki 메모만 요약
  - (나) 확장: Wiki + 시장 데이터 + DART 공시 [참모 권장]
  - (다) 풀세트: 위에 + Gemini 종합 의견
- 모닝 브리핑 시간 미결정
## 2026-04-30 Phase 1b 인수인계

- Phase 1b 라우팅 버그 수정 완료: `브리핑`과 `브리핑 테스트`가 Google Calendar로 새지 않고 `intelligence_morning_briefing`으로 우선 매칭됨
- 검증 완료: `npm run check`, `npm run build`, `npm test`
- Phase 1a 검증 완료: 텔레그램 5개 시나리오 통과, Google Drive .md 파일 2개 생성 확인
- 운영 체계 구축 완료: CURRENT_TASK.md, 자동 명령어, 자율 결정 원칙 반영
- docs/PROJECT_BRIEFING.md 생성 완료: 새 AI 세션용 영구 브리핑
- Phase 1b 완료: 07:00 KST 모닝 브리핑 자동 발송, `브리핑 테스트` 수동 트리거, 위키 일일 아카이브 연결
- 다음 작업: Phase 1b 후속 점검 또는 Phase 1c 범위 결정
## 2026-05-01 업데이트

- Phase 1b 브리핑 출력 품질 개선 완료
- 위키 검색이 `WIKI_ROOT` 하위 디렉터리를 재귀 순회하도록 변경되어 `daily/` 브리핑 파일 검색 가능
- 기존 `category: [briefing]` 단수 frontmatter도 읽기 단계에서 `categories`로 호환 처리
- 어제 저장된 위키 메모 섹션은 메모별 1줄 + 인라인 카테고리로 출력되어 다중 카테고리 메모 중복 없음
- `#briefing` 및 `source: morning-briefing` 항목은 위키 digest에서 제외되어 브리핑 재귀 누적 방지
- 신규 브리핑 저장은 `categories: [briefing]` frontmatter로 기록
- 실제 `G:\내 드라이브\Aston-Wiki\daily\2026-04-30-briefing.md`는 기존 단수 `category: [briefing]` 형식임을 확인했고, 코드에서 호환 처리함
- 검증: 관련 vitest 통과, `npm run check` 통과
- 다음 확인: 텔레그램에서 `위키 검색 briefing`, `브리핑 테스트` 수동 실행
## 2026-05-01 마감 정리

- 오늘 완료
  - Phase 1b 모닝 브리핑 자동 발송 구현 완료 상태 유지
  - 브리핑 인텐트 라우팅 충돌 수정 완료
  - 브리핑 출력 품질 개선 완료
  - `위키 검색 briefing`이 실제 `G:\내 드라이브\Aston-Wiki\daily` 브리핑 파일 2건을 찾는 것 확인
  - 위키 digest에서 `#briefing` 및 `source: morning-briefing` 항목 제외 확인
  - 전체 검증 완료: `npm run check`, `npm run build`, `npm test`
- 현재 git 상태
  - 브랜치: `codex-google-workspace-expansion`
  - 최신 커밋: `3a0dbfa docs: Phase 1b 품질 수정 기록`
  - 원격 push 완료
  - 작업 트리 clean
- 내일 첫 확인 순서
  - 서버 실행: `npm run dev`
  - 텔레그램에서 `위키 검색 briefing` 입력, daily 브리핑 2건 반환 확인
  - 텔레그램에서 `브리핑 테스트` 입력, 4개 섹션 발송 확인
  - 브리핑 위키 메모 섹션에 같은 메모가 1번만 나오는지 확인
  - 브리핑 본문이 다음 브리핑의 위키 메모 섹션에 재노출되지 않는지 확인
  - 07:00 KST 자동 발송 여부 확인
- 다음 개발 후보
  - Phase 1b 운영 QA 결과 반영
  - Phase 1c MTProto 텔레그램 수집기 착수 전 CURRENT_TASK.md 작성
  - `intentService.ts` 도메인 분리

## 2026-05-01 intentService 분할 리팩토링 완료 (Claude Code)

### 완료 내용
- `server/intent/intentService.ts` 1511줄 → 192줄로 축소
- 도메인별 핸들러를 `server/intent/handlers/{trading,realestate,finance,google,intelligence,wiki}.ts`로 분리
- `types.ts` (타입+헬퍼+Google 인증), `fallbackIntent.ts` (키워드 매칭), `registry.ts` (핸들러 맵) 신규
- 모든 신규 파일 500줄 이하 (최대 fallbackIntent.ts 452줄, trading.ts 274줄)
- `classifyIntent`/`routeIntentMessage`/`formatIntentRouteMessage`/`normalizeIntent`/`IntentResult` 공개 API 보존 — 외부 import 경로 변경 없음
- 검증: `npm run check` / `npm run build` / `npm test` (160 passed, 7 skipped, 2 todo)
- 아카이브: `docs/tasks/2026-05-01-intent-service-split.md`

### 텔레그램 수동 회귀 QA 체크리스트 (운영 검증 대기)
- [ ] "위키 저장 테스트 #테스트"
- [ ] "위키 검색 테스트"
- [ ] "브리핑 테스트"
- [ ] "브리핑"
- [ ] "잔고 조회" / "업비트 잔고"
- [ ] "오늘 일정"
- [ ] "최근 메일"
- [ ] "BTC 숏 77000 손절 78500 목표 74000" (pre_check)
- [ ] "리스크 상태"

### 다음 작업 후보
- Phase 1b 운영 QA에서 발견되는 오류 수정
- Phase 1c MTProto 텔레그램 수집기 작업 지시서 작성
- Yahoo Finance CORS 프록시 (P0)

## 2026-05-01 Telegram 승인 모드 완료 (Claude Code)

### 완료 내용
- 신규: approvalQueue.ts, orderExecutor.ts (Upbit JWT 직접), handlers/approval.ts, 테스트 2종
- 수정: types/fallbackIntent/registry, telegram-bot.ts(callback handler 등록), .env.example(MAX_ORDER_KRW/MAX_DAILY_AUTO_TRADES/APPROVAL_TIMEOUT_MS)
- 검증: check/build/test 모두 통과, 183 passed (160 → +23)
- 아카이브: `docs/tasks/2026-05-01-telegram-approval-mode.md`

### 텔레그램 수동 검증 체크리스트
- [ ] "매수 시뮬 BTC 5만원" → 인라인 키보드 메시지 도착
- [ ] ✅ 승인 → Upbit 시장가 매수 → 평균가/체결량/주문 ID 메시지로 편집
- [ ] ❌ 거부 → "거부됨" 메시지로 편집
- [ ] 📊 상세 → 상세 정보 표시
- [ ] "승인 큐" → 큐 내 항목 목록
- [ ] OWNER_TELEGRAM_CHAT_ID 가 아닌 사용자가 클릭 → 차단됨 확인
- [ ] 5분 경과 후 클릭 → "이미 expired 상태입니다" 알림
- [ ] Risk Guard 잠금 상태에서 ✅ → 차단 메시지

⚠️ **실제 Upbit API 호출 활성화 상태** — 회장님이 소액(5,000~10,000원)으로 매수/매도 1회씩 실거래 검증 필요

### 알려진 이슈 (신규)
- `server/llm/telegram-bot.ts` 568줄로 500줄 룰 위반 (P1 분리 대상)

### 다음 작업 후보
- telegram-bot.ts 도메인별 분리
- preCheckEngine 자동 신호 → 승인 큐 연결 (수동 트리거 → 자동 트리거)
- 지정가 주문 지원
- Phase 1c MTProto 텔레그램 수집기

## 2026-05-01 Telegram 검토 모드 전환 완료 (Codex)

### 완료 내용
- 기본값 `ENABLE_REAL_ORDERS=false` 추가. false 상태에서는 `orderExecutor`가 실주문 fetch 전에 차단
- `매수 시뮬` / `매도 시뮬`은 검토 모드에서 승인 큐 대신 검토 리포트를 반환
- 기존 pending 승인 버튼을 클릭해도 false 상태에서는 `🔒 검토 모드: 실주문 비활성화 상태입니다.`로 차단
- 신규 `trading_review_report` 인텐트 추가
- `server/trading/reviewReport.ts` 신규: 1h/4h/1d RSI·볼린저, 1h/4h MACD, 거래량 스파이크, 펀딩비 평균, 김프 변화, Risk Guard 체크리스트
- 단위 파서 개선: `원/만원/억`, `BTC/ETH` 수량, `달러/$`, `배` 레버리지, 모호한 숫자는 KRW 가정 안내
- 검증: `npm run check` / `npm run build` / `npm test` 통과 (189 passed, 7 skipped, 2 todo)
- 아카이브: `docs/tasks/2026-05-01-review-mode-transition.md`

### 수동 QA 명령
- [ ] `검토 BTC`
- [ ] `롱 검토 BTC 15배`
- [ ] `숏 검토 ETH 5배`
- [ ] `매수 시뮬 BTC 5만원`
- [ ] `매수 적합?`
- [ ] 기존 승인 버튼 클릭 시 검토 모드 차단 메시지 확인

### 보안 상태
- 기본 운영은 검토 모드
- 실주문은 `.env`에 `ENABLE_REAL_ORDERS=true`를 명시해야만 활성화
- 실주문 활성화 시 `orderExecutor`가 경고 로그 출력

### 다음 작업 후보
- Telegram 검토 모드 수동 QA 결과 반영
- `server/llm/telegram-bot.ts` 도메인별 분리
- 실거래 재개 전 주문 단위/계좌 잔고 기반 사이징 별도 설계
## 2026-05-01 Deal Folder Phase A 완료 (Codex)

### 완료 내용
- `server/deals/` 신규 모듈로 딜 폴더/메타/파일 저장/텔레그램 파일 핸들러 분리 완료
- `server/intent/handlers/deals.ts` 및 registry/fallback 연결 완료
- `server/llm/telegram-bot.ts`는 파일 첨부 + `딜 저장` 캡션 감지 호출만 추가
- `.env.example`에 `DEALS_ROOT` 추가
- `docs/tasks/2026-05-01-deal-folder-phase-a.md` 아카이브 완료

### 검증
- `npm run check` 통과
- `npm run build` 통과
- `npm test` 통과: 227 passed, 7 skipped, 2 todo

### 다음 작업 후보
- Phase B Gmail 자동 분류
- Downloads 감시
- Aston Wiki 판단 기록 연계

## 2026-05-01 Modular Monolith 완료 (Codex)

### 완료 내용
- `AGENTS.md`, `CLAUDE.md`에 "모듈 독립성 원칙 (Modular Monolith)" 섹션 추가
- 9개 모듈 README 추가: wiki, deals, trading, intelligence, google, finance, realestate, intent, _core
- `scripts/check-module-boundaries.ts` 추가 및 `npm run check` 통합
- 의도적 위반 케이스 1건 감지 확인 후 제거
- 실제 모듈 경계 위반 0건, 자동 수정 0건, 후속 분리 위반 0건
- 아카이브: `docs/tasks/2026-05-01-modular-monolith.md`

### 검증
- `npm run check` 통과
- `npm run build` 통과
- `npm test` 통과: 227 passed, 7 skipped, 2 todo

### 다음 작업 후보
- 신규 도메인 모듈 추가 시 README와 `scripts/check-module-boundaries.ts` 도메인 목록 동시 갱신
- 기존 500줄 초과 파일(`server/trading/tradeJournal.ts`, `server/_core/intentRouter.ts` 등)은 별도 P1 분리 작업으로 유지

## 2026-05-01 Deal Routing Priority Fix 완료 (Codex)

### 완료 내용
- `딜 ...` 명령을 `deals.deals_command`로 최우선 라우팅하도록 고정
- `server/intent/handlers/realestate.ts`의 `realestate.deals.list` raw JSON 응답 제거
- `realestate_deals_list/create/update` 액션과 fallback 중복 제거
- raw object 응답 표시 차단 및 경고 로그 추가
- `[intent] matched: <domain>.<action> for input: <message>` 매칭 로그 정리
- `server/trading/orderExecutor.ts` parameter property 제거로 dev 서버 strip-types 오류 방지
- 신규 테스트: `server/__tests__/dealRouting.test.ts` 8개
- 아카이브: `docs/tasks/2026-05-01-deal-routing-priority-fix.md`

### 검증
- `npm run check` 통과
- `npm run build` 통과
- `npm test` 통과: 235 passed, 7 skipped, 2 todo
- 로컬 라우팅 스모크 통과: `딜 추가`, `딜 목록`, `딜 한남동644`, `딜 노트북`, PDF 저장
- 회귀 인텐트 확인: 미팅 추가, Drive 검색, Wiki 검색, 브리핑 테스트 정상 라우팅

### 다음 작업 후보
- Telegram 실제 화면에서 딜 5개 명령 최종 수동 QA
- Deal Folder Phase B: Gmail 자동 분류, Downloads 감시, Wiki 판단 기록 연계

## 2026-05-01 Kakao Folder Watcher Phase B-1 완료 (Codex)

### 완료 내용
- `server/deals/folderWatcher.ts`: `KAKAO_DOWNLOAD_PATH`를 chokidar로 감시, `awaitWriteFinish` 적용, 폴더 미존재/빈 값 시 비활성화
- `server/deals/dealMatcher.ts`: 딜명 exact/partial/none 매칭과 카테고리 추정 추가
- `server/deals/kakaoFileHandler.ts`: 무시 패턴, exact 자동 복사 저장, partial/none Telegram 인라인 분류 대기 Map 추가
- `server/intent/handlers/kakaoCallback.ts`: `kakao:` callback 권한 확인, 딜 선택 후 카테고리 선택 2단계 처리
- `server/_core/index.ts`: Telegram bot 초기화 후 watcher 시작, 종료 시 watcher close
- `server/llm/telegram-bot.ts`: `kakao:` callback 라우팅 추가, 최종 499줄로 500줄 이하 유지
- `.env.example`: `KAKAO_DOWNLOAD_PATH` 추가. 로컬 `.env`: `C:\Users\user\Documents\카카오톡 받은 파일` 설정

### 검증
- `npm run check` 통과
- `npm run build` 통과
- `npm test` 통과: 253 passed, 7 skipped, 2 todo
- 수동 스모크: watcher 로그, exact 2건 자동 저장, 모호 파일 pending, KakaoTalk 미디어 무시, 원본 파일 유지 확인

### 다음 작업 후보
- Telegram 실제 화면에서 인라인 버튼 2단계 분류 최종 QA
- 딜 목록 8개 초과 시 검색/페이지네이션 추가
- 네이버메일/Gmail 첨부 자동 분류는 별도 CURRENT_TASK로 진행

## 2026-05-01 Gmail/Download Watcher Phase B-2/B-3 완료 (Codex)

### 완료 내용
- `server/deals/fileClassifier.ts`: 카톡/Gmail/다운로드 공통 분류 엔진 추가
- `server/deals/gmailWatcher.ts`: `GMAIL_AUTO_LABEL` + unread + attachment 메일 폴링, 첨부 다운로드, processed 라벨/읽음 처리
- `server/deals/downloadWatcher.ts`: 다운로드 폴더 감시, 임시파일/이미지/1MB 미만 파일 무시
- `server/intent/handlers/fileCallback.ts`: `kakao:`, `gmail:`, `dl:` callback 통합
- `server/deals/kakaoFileHandler.ts`: 기존 API 유지 wrapper로 축소
- `server/llm/telegram-bot.ts`: callback 라우팅 통합 후 499줄 유지
- `_core/googleOAuth.ts`: Google OAuth 토큰 접근을 `_core` 경유로 제공해 도메인 직접 import 회피

### 검증
- `npm run check` 통과
- `npm run build` 통과
- `npm test` 통과: 269 passed, 7 skipped, 2 todo
- 수동 스모크:
  - `[kakao-watcher] watching: C:\Users\user\Documents\카카오톡 받은 파일`
  - `[download-watcher] watching: C:\Users\user\Downloads`
  - `[gmail-watcher] polling every 5min, label: Aston-Deals`
  - Gmail metadata 매칭 저장, 다운로드 PDF 저장, `.crdownload`/스크린샷 무시 확인

### Gmail OAuth 상태
- `data/google-tokens.json`에 userId=1 토큰 존재
- access/refresh token 모두 있음
- access token 만료 전: 2026-05-01 19:59:19 KST

### 다음 작업 후보
- 실제 Gmail inbox에서 `Aston-Deals` 라벨 메일 운영 QA
- Telegram 실제 화면에서 Gmail/다운로드 인라인 버튼 최종 QA
- 딜 후보 8개 초과 시 검색/페이지네이션 개선

## 2026-05-01 Agent Control 골격 완료 (Claude Code, Phase 2)

### 완료 내용
- `server/agents/` 모듈 신설(agentTypes/agentTemplates/agentQueue/agentExecutor/permissionGate/index)
- 5개 템플릿: pf-comprehensive, pf-version-compare, pf-legal-risk, trading-decision, notebook-query
- 인메모리 큐: max 50, 30분 타임아웃, 동시 1건, AbortController 취소
- 시뮬레이션 모드: OPENCLAW_API_URL 비면 자동 sim, 3-5초 sleep 후 더미 마크다운 + AGENT_WIKI_PATH 저장
- 텔레그램 명령 5개: `에이전트 목록 / 실행 <템플릿id> <대상> / 상태 / 결과 <id> / 취소 <id>`
- HTTP API: GET/POST/DELETE /api/agents/templates, /api/agents/tasks(/:id)
- 클라이언트 페이지 `/agents`: 권한 표시, 빠른 실행 카드 5개, 진행 중·완료 리스트, 입력 모달, 5초 폴링
- 텔레그램 알림: 시작/완료/실패 자동 push (chat_id = OWNER_TELEGRAM_CHAT_ID || TELEGRAM_CHAT_ID)
- 권한 게이트: AGENT_PERMISSION_LEVEL 1=read 전용 (실행 차단), 2=실행, 3=자동. 이번 Phase는 1단계 단독 검증

### 검증
- `npm run check` ✅ (모듈 경계 위반 0건, agents 도메인 추가)
- `npm run build` ✅
- `npm test` ✅ 313 passed (292 → +21 신규)

### 환경변수 추가
- `OPENCLAW_API_URL=` (비면 sim)
- `OPENCLAW_API_KEY=`
- `AGENT_PERMISSION_LEVEL=1`
- `AGENT_WIKI_PATH=G:\Aston-Wiki\agents`

### 텔레그램 수동 QA 체크리스트
- [ ] `에이전트 목록` → 5개 템플릿 + 권한 표시
- [ ] `에이전트 실행 pf-comprehensive 한남동644` → 등록 + 작업 시작 알림 + 4초 후 완료 알림
- [ ] `에이전트 상태` → 진행 중·최근 완료 표시
- [ ] `에이전트 결과 <id>` → 미리보기 + wiki 경로
- [ ] `에이전트 취소 <id>` → 취소 응답
- [ ] `/agents` 페이지에서 카드 클릭 → 모달 입력 → 실행 → 5초 폴링으로 진행 표시

### 다음 Phase에서 회장님이 준비할 정보
1. OpenClaw API URL (WSL2/Docker 호스트에서 접근 가능한 URL)
2. OpenClaw API Key
3. OpenClaw 엔드포인트 스펙 (Postman/curl 예제)
4. WSL2/Docker 네트워크: `curl <URL>/health` 200 확인
5. 권한 단계 결정 (2단계 승인 vs 3단계 자동)
6. NotebookLM 연동 방식 (OpenClaw 경유 vs 별도)

### 다음 작업 후보
- OpenClaw 실 API 연동 (Phase 3)
- D-3/D-7 임박 자동 푸시 (별 작업)
- 모닝브리핑에 어제 에이전트 결과 통합

## 2026-05-01 OpenClaw 자동 탐지 및 연동 완료 (Codex, Phase 3)

### 완료 내용
- `scripts/detect-openclaw.ts` 추가: localhost/127.0.0.1/host.docker.internal, 후보 포트 7개, health/root endpoint, Docker 컨테이너 포트 탐지
- `data/openclaw-discovery.json` 저장 로직 추가. 현재 탐지 결과는 미탐지이며 시뮬레이션 모드 유지
- `server/agents/openclawClient.ts`: 자동 탐지 결과 또는 환경변수 fallback 로드, 인증 방식 none/Bearer/X-API-Key 자동 감지, `/api/tasks`/`/v1/run`/`/execute` endpoint와 payload/응답 포맷 fallback
- `agentExecutor`: startup probe 1회, 실제 호출 우선, 실패 시 `⚠️` 표시가 붙은 시뮬레이션 결과로 성공 fallback
- 권한 2단계 구현: 기본값 `AGENT_PERMISSION_LEVEL=2`, 실행 전 텔레그램 승인 요청, `agent_approve:<task_id>`/`agent_reject:<task_id>`, 5분 미응답 자동 거부
- `/api/agents/health` 추가 및 `/agents` UI 상단에 OpenClaw 상태/권한/큐 상태 표시
- `notebook-query`: `_deal.json`의 `notebookUrl`을 파일 시스템으로 조회해 NotebookLM 웹 자동화 지시를 OpenClaw에 전달

### 탐지 결과
- 명령: `npx tsx scripts/detect-openclaw.ts`
- 결과: OpenClaw 미탐지
- 사유: 후보 포트와 Docker 컨테이너에서 OpenClaw 식별 응답 없음
- Docker CLI: `spawn docker ENOENT`
- 회장님 추가 작업: 없음. OpenClaw가 실행되면 서버 startup probe 또는 탐지 스크립트 재실행으로 자동 재탐지

### 검증
- `npm run check` ✅ (모듈 경계 위반 0건)
- `npm run build` ✅
- `npm test` ✅ 330 passed, 7 skipped, 2 todo
- 신규/보강 테스트 17개: detect/openclawClient/permissionGate/agentQueue/agentExecutor

### 다음 작업 후보
- 실제 OpenClaw 실행 상태에서 smoke test
- 모닝브리핑에 전일 에이전트 결과 통합
- Phase 1c MTProto 텔레그램 수집기
- PF Google Sheets 동기화

## 2026-05-01 모닝브리핑 에이전트 결과 통합 완료 (Codex, Phase 4)

### 완료 내용
- `server/agents/agentResultLoader.ts`: `AGENT_WIKI_PATH`의 `YYYY-MM-DD-<template>-<id>.md` 파일 스캔, 전일 KST 필터링, 핵심 지표/미리보기/시뮬레이션 여부 추출
- `server/agents/agentBriefing.ts`: 메모리 큐 결과와 wiki fallback 결과를 task id 기준 병합, 완료 최대 5건 + 실패 별도 표시 데이터 생성
- `server/intelligence/briefing.ts`: 딜 섹션 다음, Risk Guard 앞에 `🤖 어제 에이전트 작업` 섹션 삽입
- `server/agents/agentQueue.ts`: `getTasksByDate(dateISO)` 추가. 완료/실패/취소만 반환하고 진행 중 작업은 제외

### 검증
- `npm run check` ✅ (모듈 경계 위반 0건)
- `npm run build` ✅
- `npm test` ✅ (340 passed, 7 skipped, 2 todo)
- 임시 `AGENT_WIKI_PATH` 파일 기반 수동 스모크로 브리핑 내 에이전트 섹션 삽입 확인

### 자율 결정
- 완료 결과는 최대 5건 표시, 초과분은 `외 N건`으로 축약
- 시뮬레이션 결과는 템플릿 아이콘보다 `🧪`를 우선 표시
- 사용자가 취소한 작업은 브리핑에서 제외, 실패 작업은 `⚠️ 실패 N건`으로 같은 섹션 하단에 짧게 표시

### 다음 후보
- MTProto 텔레그램 수집기
- PF Google Sheets 동기화
- 주간/월간 에이전트 누적 보고

## 2026-05-01 딜 마감일/이정표 관리 완료 (Claude Code)

### 완료 내용
- DealMeta에 deadline/deadlineLabel/milestones 추가, Milestone 타입 신규
- 자연어 날짜 파싱: 절대(YYYY-MM-DD), 상대(M/D), 키워드(오늘/내일/모레/글피), N일·주·개월 후, 이번주/다음주 X요일 — KST 고정, 외부 의존성 0
- 텔레그램 명령: `딜 마감 <딜명> <날짜> [라벨]`, `딜 마감 해제 <딜명>`, `딜 이정표 <딜명> <라벨> <날짜>`, `딜 이정표 완료 <딜명> <라벨>`, `딜 이정표 삭제 <딜명> <라벨>`
- `딜 <딜명>` 상세 응답에 D-day(🚨3/⏰7/📌30/🗓) + 이정표 목록(완료/D-day) 표시
- 모닝브리핑 `📁 진행 중 딜` 섹션: 마감 ≤30일 D-day 라인 + 미완료 이정표 ≤30일 표시, 미설정 시 `(마감 미설정)`

### 신규 파일
- `server/deals/dateParser.ts` (76줄)
- `server/__tests__/dateParser.test.ts` (10개)
- `docs/tasks/2026-05-01-deal-deadline-management.md`

### 수정 파일
- `server/deals/dealTypes.ts`, `dealStore.ts`, `dealFileRouter.ts`, `telegramDealFileHandler.ts`, `index.ts`
- `server/_core/briefingSources.ts`, `server/intelligence/briefing.ts`
- `server/__tests__/dealStore.test.ts` (+6), `briefing.test.ts` (포맷 갱신)

### 검증
- `npm run check` ✅ (모듈 경계 위반 0건)
- `npm run build` ✅
- `npm test` ✅ 292 passed (276 → +16 신규)

### 텔레그램 수동 QA 체크리스트
- [ ] `딜 마감 한남동644 2026-06-30 사업협약 체결` → 등록 응답
- [ ] `딜 마감 한남동644 내일` → D-1 응답
- [ ] `딜 이정표 한남동644 인허가신청 2026-05-15` → 추가 응답
- [ ] `딜 이정표 완료 한남동644 인허가` → 완료 응답 (partial 매칭)
- [ ] `딜 이정표 삭제 한남동644 인허가` → 삭제 응답
- [ ] `딜 한남동644` → 상세에 마감 + 이정표 표시
- [ ] `브리핑 테스트` → 진행 중 딜 섹션에 D-day 표시
- [ ] `딜 마감 해제 한남동644` → 해제 응답

### 다음 작업 후보
- D-3/D-7 임박 시 자동 푸시 알림 (별도 cron)
- 카톡/Gmail 첨부에서 마감일 자동 추출 (LLM)
- Phase 1c MTProto 텔레그램 수집기
- `server/llm/telegram-bot.ts` 도메인별 추가 정리

## 2026-05-01 딜 브리핑 + Telegram Bot 분할 완료 (Codex)

### 완료 내용
- 모닝브리핑에 `📁 진행 중 딜` 섹션 추가
- 자료 0건, completed/rejected 딜은 제외하고 `updatedAt` 최신순 최대 10건 표시
- 어제 추가 자료 수는 KST 기준 전일 00:00-23:59에 수정된 카테고리 폴더 파일 mtime으로 계산
- NotebookLM 연결됨은 `🔗`, 미연결은 `⚠️ NotebookLM 미연결`로 표시
- `server/llm/telegram-bot.ts`를 2줄 re-export로 축소하고 실제 구현을 `server/llm/telegramBot/`로 분리
- 기존 import 경로 `server/llm/telegram-bot.ts` 호환 유지
- 아카이브: `docs/tasks/2026-05-01-deals-briefing-and-bot-split.md`

### 라인 수
- `server/llm/telegram-bot.ts`: 2줄
- `server/llm/telegramBot/index.ts`: 61줄
- `server/llm/telegramBot/commands.ts`: 134줄
- `server/llm/telegramBot/messageRouter.ts`: 133줄
- `server/llm/telegramBot/callbackRouter.ts`: 27줄
- `server/llm/telegramBot/workspaceCommands.ts`: 141줄
- `server/llm/telegramBot/utils.ts`: 38줄

### 검증
- `npm run check` 통과, 모듈 경계 위반 0건
- `npm run build` 통과
- `npm test` 통과: 276 passed, 7 skipped, 2 todo

### 다음 작업 후보
- 실제 Telegram 화면에서 `브리핑 테스트`로 딜 섹션 출력 확인
- 딜/카톡/Gmail/다운로드 콜백/승인 콜백 운영 QA 각 1회
## 2026-05-02 PF Google Sheets Sync 인수인계 (Codex)

- 완료:
  - `server/_core/googleSheets.ts`
  - `server/_core/agentResultLookup.ts`
  - `server/deals/dealSheetSync.ts`
  - `server/deals/dealStore.ts`
  - `server/deals/dealFileRouter.ts`
  - `server/deals/telegramDealFileHandler.ts`
  - `server/_core/index.ts`
  - `server/__tests__/googleSheets.test.ts`
  - `server/__tests__/dealSheetSync.test.ts`
  - `.env.example`
- 검증:
  - `npm run check` 통과
  - `npm run build` 통과
  - `npm test` 통과: 353 passed, 7 skipped, 2 todo
  - 실제 Google Sheets API 동기화 성공: 3건
  - 시트 URL: https://docs.google.com/spreadsheets/d/1kX_l2bQw8II4LZCwdS9_QEQ9JQ4HfpXYGpDoIF9F8b0/edit
- 현재 진행 작업:
  - 없음
- 다음 Phase 후보:
  - 완료/거절 딜 아카이브 시트 분리
  - 시트 조건부 서식(D-day 색상)
  - 시트 역방향 동기화
