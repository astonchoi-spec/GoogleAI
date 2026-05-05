# CHANGELOG.md — 에스턴 워크스테이션
> 형식: 날짜 | 도구 | 작업 내용 | 수정 파일 | 검증 결과 | 남은 이슈

---

## 2026-05-06

### [Claude Code] AI 채팅 라우팅 5종 보완 (NotebookLM / Sheets / 오늘 일정 / fallback 규칙 / Monitoring)
- **작업**: `docs/diagnostics/ai-chat-routing.md` §6·§7·§8의 누락 라우팅 5종을 한 번에 연결
- **추가된 액션 6개**:
  - `notebooklm_query` (domain=intelligence) — `노트북 ...`, `노트북LM ...`, `NotebookLM ...` prefix
  - `google_read_sheet` (domain=google) — `시트 읽기/조회/보여줘`, `스프레드시트 ...`, `sheets read`
  - `google_today_events` (domain=google) — `오늘 일정 브리핑`, `오늘 일정/스케줄/미팅`, `today schedule`
  - `google_get_emails`(`newer_than:1d`) — `오늘 메일 요약`, `메일 요약` (기존 액션에 명시 규칙 추가)
  - `chat_telegram_recent` (domain=chat, 신규 핸들러 파일) — `Telegram 최근 메시지`, `텔레그램 최근`
  - `monitoring_status` (domain=intelligence) — `모니터링`, `시스템 상태`, `monitoring`, `system status`
- **수정 파일**:
  - `server/intent/types.ts` — IntentAction 6개 추가
  - `server/intent/fallbackIntent.ts` — 매처 7개 추가, `오늘 일정` 분기 분리
  - `server/intent/handlers/intelligence.ts` — NotebookLM, Monitoring 핸들러 추가
  - `server/intent/handlers/google.ts` — `readSheet`, `todayEvents` 핸들러 추가
  - `server/intent/handlers/chat.ts` — 신규 (Telegram 최근 메시지)
  - `server/intent/registry.ts` — chatHandlers 등록
- **신규 테스트**: 5개 파일, 34 케이스
  - `notebookLmRouting.test.ts` (7), `sheetsRouting.test.ts` (6), `todayEventsRouting.test.ts` (7), `fallbackIntentRules.test.ts` (8), `monitoringRouting.test.ts` (6)
- **검증**:
  - `npm run check` ✅ (모듈 경계 위반 0건)
  - `npm run build` ✅
  - `npm test` ✅ 403 passed (369 → +34), 7 skipped, 2 todo
- **자율 결정 기록**:
  - 새 도메인 추가 대신 `intelligence` / `google` / `chat` 기존 도메인에 액션 추가 — modular monolith 분리 비용 절감
  - 트리거 우선순위는 `오늘 일정 브리핑` > 일반 `오늘 일정` > `이번 주 일정`(기존 list_events) 순으로 정렬
  - `읽기` 매처가 `쓰기` 매처보다 먼저 평가되어 `시트 읽기` 충돌 회피
  - NotebookLM/Telegram-최근은 prefix 95~99% 우선순위로 일반 키워드 충돌 차단
- **잔여**:
  - 텔레그램·웹 채팅 실사용 QA (회장님 운영 검증)
  - `WORKSPACE_SPREADSHEET_ID` 미설정 시 read_sheet 안내 메시지 확인
  - NotebookLM MCP 서버 미가동 상태에서 `노트북 ...` 질의 응답 메시지 확인

## 2026-05-03

### [Codex] 작업일지 / TODO / 인수인계 정리
- **작업**: 최근 완료된 `Home` 빠른 명령 즉시 실행화 이후 운영 문서를 2026-05-03 기준으로 정리
- **수정 파일**:
  - `CHANGELOG.md`
  - `HANDOFF.md`
  - `TODO.md`
- **포함 내용**:
  - `HANDOFF.md` 현재 상태의 빌드/테스트 기준값 갱신
  - 현재 진행 작업 표를 `없음`으로 정리
  - 다음 우선 작업을 `NotebookLM` / `Sheets` 자연어 라우팅 보완 중심으로 재정렬
  - `TODO.md`에 오늘 기준 운영 문서 정리 섹션 추가
- **검증**:
  - 문서 변경만 수행
  - `git status` 기준 문서 3개만 변경

## 2026-04-30

### [Codex] 운영 체계 구축 + PROJECT_BRIEFING.md 신규 생성
- **작업**: `CURRENT_TASK.md` 운영 체계 구축, 자동 명령어 정리, 자율 결정 원칙 반영
- **작업**: `docs/PROJECT_BRIEFING.md` 신규 생성으로 새 AI 세션용 프로젝트 브리핑 영구 보존
- **작업**: `HANDOFF.md`, `TODO.md` 갱신으로 Phase 1a 완료 및 Phase 1b 대기 상태 반영
- **검증**: 문서 갱신 중심 작업, 코드 변경 없음

### [Claude Code] Aston Intelligence System Phase 1a — Wiki 수동 저장·검색
- **작업**: 텔레그램·웹채팅에서 손으로 메모를 wiki에 저장하고 검색할 수 있는 인프라 구축
- **신규 파일**:
  - `server/wiki/wikiStore.ts` (~130줄): 마크다운 파일 기반 저장소. `writeWiki()` + `searchWiki()` + frontmatter 정규식 파싱
  - `server/intent/wiki.ts` (~130줄): `wiki_save` / `wiki_search` 인텐트 매처·핸들러. 한국어→영문 카테고리 매핑 테이블
  - `server/__tests__/wiki.test.ts` (~230줄): vitest 25개 테스트 (저장·검색·충돌·정규화·에러 처리)
  - `docs/superpowers/specs/2026-04-30-aston-wiki-phase1a-design.md`: 설계 문서
- **수정 파일**:
  - `server/intent/intentService.ts`: wiki import 1줄 + `IntentAction` 유니온에 `wiki_save\|wiki_search` 추가 + fallbackIntent 최상단 wiki 매칭 + routeIntentMessage 핸들러 분기 (총 +12줄)
  - `.env.example`: `WIKI_ROOT` 환경변수 추가
- **설계 결정**:
  - 저장 위치: `WIKI_ROOT` 환경변수 (회장님: `G:\내 드라이브\Aston-Wiki`)
  - 파일 구조: 항목별 1파일 (`wiki/YYYY-MM-DD/HH-MM-SS-ms-슬러그.md`) + frontmatter
  - 카테고리: 한국어 해시태그 입력 (`#부동산 #서울`) → 영문 정규화 (`realestate, seoul`)
  - 검색: substring + 카테고리 필터 (`위키 검색 #부동산 신논현`) + date desc 상위 10건
  - 의존성: 0 (Node.js 내장 fs/path/os만 사용)
  - Phase 1b(브리핑)/1c(Gemini)/1d(MTProto)는 별도 Phase로 분리
- **검증**: `npm run check` ✅ / `npm run build` ✅ / `npm test` (25 passed) ✅
- **잔여이슈**: 실제 `WIKI_ROOT=G:\내 드라이브\Aston-Wiki` 경로에서 운영 검증 필요

### [Claude Code] CURRENT_TASK.md 운영 규칙 + "현재작업" 자동 명령어 추가
- **작업**: AGENTS.md와 CLAUDE.md에 공통 작업 파일 운영 규칙 추가
- **CLAUDE.md 변경**:
  - "현재작업" 자동 명령어 추가 (CURRENT_TASK.md 존재 확인 → git fetch → 상태 파악 → 범위 내 작업 → build → 문서 갱신 → 커밋·push → 요약 보고)
  - CURRENT_TASK.md 운영 규칙 섹션 추가 (파일 없으면 작업 중단 명시)
- **AGENTS.md 변경**:
  - "자동 명령어" 섹션 신규 추가
  - "현재작업" 자동 명령어 추가 (CLAUDE.md와 동일 내용)
  - CURRENT_TASK.md 운영 규칙 섹션 추가
- **수정 파일**: `AGENTS.md`, `CLAUDE.md`
- **검증**: 문서 변경만 (빌드 불필요)
- **잔여이슈**: 없음

### [Claude Code] preCheckEngine 디버그 로그 정리 + CLAUDE.md "작업준비" 강화
- **작업 1**: `server/trading/preCheckEngine.ts`에서 `[preCheck] console.log` 9건 제거 — Binance 24hr raw/parsed, fundingRate raw/parsed/empty, Upbit raw/parsed/empty
  - `console.error` 7건은 유지 (HTTP 에러, fetch 에러, fetchBinanceCandles 에러)
  - 디버그 끝난 진단 로그를 제거해 운영 로그 잡음 감소
- **작업 2**: `client/src/components/home/WorkspaceWidgets.tsx` FinanceSummaryWidget import 점검
  - 결과: 디스크 상태 이상 없음. `FinanceSummaryWidget.tsx`(40줄, /finance 링크 카드) 정상 존재, `WorkspaceWidgets.tsx`에는 import 없음 — 직전 vite 에러는 dev 서버 캐시 잔재로 확인. **코드 수정 없음.**
- **작업 3**: `CLAUDE.md` "작업준비" 자동 명령어 절차 강화
  - 단계 추가: ① `git fetch origin` ② `git log HEAD..origin/codex-... --oneline` 으로 원격 신규 커밋 확인 ③ 신규 있으면 `git pull --rebase` (충돌 시 사용자 보고 후 중단) ④ 4개 문서 읽기 ⑤ 상태 요약
- **수정 파일**: `server/trading/preCheckEngine.ts`, `CLAUDE.md`
- **검증**: `npm run check` ✅ / `npm run build` ✅
- **잔여이슈**: 없음

### [Claude Code] AGENTS.md / TASKS.md 동기화
- **작업**: CLAUDE.md §6~9 신규 섹션을 AGENTS.md에도 동일 반영, Codex 전용 규칙 강화, TASKS.md 아카이브 처리
- **AGENTS.md 변경**:
  - §5 Codex-specific Rules 재구성:
    - 작업 시작 전 의무 절차 추가: `git fetch` + `git log HEAD..origin/codex-...` 으로 원격 신규 커밋 확인 → CHANGELOG/HANDOFF/TODO 읽기 → HANDOFF "현재 진행 작업"에 본인 등록
    - 도메인 경계 명시: intentService.ts 라우팅 전용, 비즈니스 로직 금지, exchangeConnector 미경유, fetch 직접
    - 텔레그램 응답: data(JSON) 반환 금지, 한국어 텍스트 + 이모지만
    - 커밋 후 push 의무, 작업 완료 시 CHANGELOG/TODO/HANDOFF 3종 갱신
  - §6 아키텍처 규칙(DDD), §7 코딩 컨벤션, §8 테스트 규칙, §9 파일 크기 제한 신규 추가 — CLAUDE.md와 동일 내용
- **TASKS.md 변경**: 상단에 아카이브 헤더 추가 — TODO.md/HANDOFF.md/CHANGELOG.md가 권위 출처임을 명시, "작업준비" 명령은 TASKS.md 읽지 않음 명문화 (충돌 방지)
- **수정 파일**: `AGENTS.md`, `TASKS.md`
- **검증**: 문서 변경만 (빌드 불필요)
- **잔여이슈**: 없음

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
## 2026-04-30

- Phase 1b 라우팅 수정: `브리핑`/`브리핑 테스트`를 Google Calendar보다 먼저 `intelligence_morning_briefing`으로 매칭
- 라우팅 검증 로그 추가: `[intent] matched: <intent_name> for input: <message>`
- `server/__tests__/briefing.test.ts`에 브리핑 인텐트 우선순위 회귀 테스트 추가

- 운영 체계 구축: CURRENT_TASK.md, "현재작업" 자동 명령어, 자율 결정 원칙
- docs/PROJECT_BRIEFING.md 신규 생성
- Phase 1b 모닝 브리핑 자동 발송 기반 추가: node-cron, `브리핑 테스트` 수동 트리거, 위키 아카이브
- HANDOFF.md, TODO.md 갱신
## 2026-05-01

### [Codex] OpenClaw 자동 탐지 및 연동 (Phase 3)
- **작업**: `scripts/detect-openclaw.ts` 추가. localhost/127.0.0.1/host.docker.internal, 후보 포트, health/root endpoint, Docker `openclaw` 컨테이너 포트 탐지 후 `data/openclaw-discovery.json` 저장
- **작업**: `server/agents/openclawDiscovery.ts`, `server/agents/openclawClient.ts` 추가. 탐지 결과/환경변수 fallback, 인증 방식(none/Bearer/X-API-Key), 실행 endpoint(`/api/tasks`/`/v1/run`/`/execute`), payload/응답 포맷 자동 fallback 구현
- **작업**: `agentExecutor`가 startup probe 후 OpenClaw 실제 호출을 우선 사용하고, 미탐지/실패 시 `⚠️` 표시가 붙은 시뮬레이션 결과로 성공 fallback
- **작업**: 권한 2단계 구현. `AGENT_PERMISSION_LEVEL=2` 기본값, `awaiting_approval`/`rejected` 상태, 텔레그램 `agent_approve:<id>`/`agent_reject:<id>` 콜백, 5분 자동 거부
- **작업**: `/api/agents/health` 추가 및 `/agents` UI 상단 상태 배지에 OpenClaw/권한/큐 상태 표시
- **작업**: `notebook-query` 실행 시 `_deal.json`의 `notebookUrl`을 파일 시스템으로 조회해 OpenClaw에 NotebookLM 접속/질문/응답 추출 절차 전달
- **탐지 결과**: `npx tsx scripts/detect-openclaw.ts` 실행 결과 OpenClaw 미탐지. Docker CLI도 미탐지(`spawn docker ENOENT`). 시뮬레이션 모드 유지
- **검증**: `npm run check` ✅ / `npm run build` ✅ / `npm test` ✅ (330 passed, 7 skipped, 2 todo)
- **아카이브**: `docs/tasks/2026-05-01-openclaw-integration.md`

### [Claude Code] Agent Control 골격 (Phase 2 — 시뮬레이션 모드)
- **신규 모듈**: `server/agents/` (agentTypes/agentTemplates/agentQueue/agentExecutor/permissionGate/index + README) — 인메모리 큐(max 50, 30분 timeout, 동시 1건), 5개 템플릿(pf-comprehensive, pf-version-compare, pf-legal-risk, trading-decision, notebook-query), AGENT_WIKI_PATH에 결과 마크다운 저장
- **신규**: `server/intent/handlers/agents.ts`(129줄, 5개 텔레그램 명령), `server/routers/agents.ts`(68줄, GET/POST/DELETE /api/agents/*), `server/_core/agentNotifier.ts`(텔레그램 시작/완료/실패 알림)
- **신규 UI**: `client/src/pages/AgentControl.tsx`(240줄) — 권한 표시, 빠른 실행 카드 5개, 진행 중·완료 리스트, 입력 모달, 5초 폴링. Sidebar에 Bot 아이콘 추가
- **수정**: `intent/types.ts`(IntentDomain `agents` + agent_command), `fallbackIntent.ts`(^에이전트 prefix 0.99), `registry.ts`, `_core/index.ts`(setAgentNotifier + registerAgentRoutes), `App.tsx`(/agents 라우트), `Sidebar.tsx`, `scripts/check-module-boundaries.ts`(agents 추가), `.env.example`(OPENCLAW_API_URL/KEY, AGENT_PERMISSION_LEVEL/WIKI_PATH)
- **신규 테스트**: agentTemplates(3), permissionGate(5), agentQueue(7), agentExecutor(6) — 21개
- **검증**: `npm run check` ✅ / `npm run build` ✅ / `npm test` ✅ 313 passed (292 → +21)
- **자율 결정**: 큐는 Map+배열 조합, 알림자는 `_core/`에서 주입 — `server/agents/`는 텔레그램 의존 0, 시뮬 sleep 3-5초 랜덤, 권한 게이트는 단독 검증 후 다음 Phase에서 OpenClaw 호출 직전 적용
- **아카이브**: `docs/tasks/2026-05-01-agent-control-skeleton.md`
- **범위 밖**: OpenClaw 실제 API 연동, WSL2/Docker 검증, 권한 2·3단계 구현 — 다음 Phase

### [Claude Code] 딜 마감일/이정표 관리 (Phase B-4)
- **신규**: `server/deals/dateParser.ts` (76줄) — `parseDealDate`/`calcDday`/`formatKstShortDate`. KST, 절대(YYYY-MM-DD), 상대(M/D 자동 미래 보정), 키워드(오늘/내일/모레/글피), N일·주·개월 후, 이번주/다음주 X요일.
- **신규**: `server/__tests__/dateParser.test.ts` (10 케이스).
- **수정**: `dealTypes.ts`(Milestone 타입 + DealMeta 확장), `dealStore.ts`(setDealDeadline/clearDealDeadline/addMilestone/completeMilestone/removeMilestone), `dealFileRouter.ts`(트레일링 날짜 파서 + 5개 신규 액션), `telegramDealFileHandler.ts`(D-day 표시 + 이정표 블록 + 5개 핸들러), `_core/briefingSources.ts`(DealsBriefingItem 확장, urgentMilestones 30일 이하), `intelligence/briefing.ts`(딜 섹션 D-day 강조).
- **검증**: `npm run check` ✅ / `npm run build` ✅ / `npm test` ✅ (292 passed, 276 → +16 신규)
- **자율 결정**: 자연어 파싱 자체 구현, Milestone ID 6자 base64url, 과거 날짜 경고만, D-day 임계값 🚨3/⏰7/📌30/🗓.
- **아카이브**: `docs/tasks/2026-05-01-deal-deadline-management.md`

### [Codex] 딜 현황 모닝브리핑 통합 + telegram-bot.ts 분할
- **작업**: 모닝브리핑에 `📁 진행 중 딜` 섹션을 추가해 자료가 있는 진행 딜, 어제 추가 자료 수, NotebookLM 연결 여부를 표시
- **작업**: `server/llm/telegram-bot.ts`를 기존 import 호환 re-export 파일로 축소하고 `server/llm/telegramBot/` 하위 모듈로 봇 초기화/명령/메시지/콜백/Workspace 처리를 분리
- **수정 파일**: `server/_core/briefingSources.ts`, `server/intelligence/briefing.ts`, `server/llm/telegram-bot.ts`, `server/llm/telegramBot/*`
- **신규/보강 테스트**: 브리핑 딜 섹션과 TelegramBot legacy import 호환 테스트 추가
- **검증**: `npm run check` ✅ / `npm run build` ✅ / `npm test` ✅ (276 passed, 7 skipped, 2 todo)
- **아카이브**: `docs/tasks/2026-05-01-deals-briefing-and-bot-split.md`

### [Codex] Gmail 자동 분류 + 다운로드 폴더 감시 Phase B-2/B-3
- **작업**: 카톡/Gmail/다운로드 3채널이 공통 `fileClassifier`를 사용하도록 분류 엔진을 통합
- **신규 파일**:
  - `server/deals/fileClassifier.ts` (197줄) — 공통 무시/매칭/자동 저장/인라인 분류 대기 처리
  - `server/deals/gmailWatcher.ts` (149줄) — Gmail `Aston-Deals` 라벨 5분 폴링, 첨부 다운로드, 처리 라벨/읽음 처리
  - `server/deals/downloadWatcher.ts` (84줄) — 다운로드 폴더 chokidar 감시, 임시/이미지/1MB 미만 파일 무시
  - `server/intent/handlers/fileCallback.ts` (104줄) — `kakao:`, `gmail:`, `dl:` callback 통합
  - `server/_core/googleOAuth.ts` (31줄) — 도메인 경계 보존용 Google OAuth 클라이언트 브리지
- **수정 파일**: `dealMatcher.ts` extraText 매칭 추가, `kakaoFileHandler.ts` wrapper화, `telegram-bot.ts` callback 라우팅 통합(499줄 유지), `_core/index.ts` watcher 시작/종료 연결, `.env.example` 환경변수 추가
- **신규 테스트**: `fileClassifier.test.ts`, `gmailWatcher.test.ts`, `downloadWatcher.test.ts` 총 16개
- **검증**: `npm run check` ✅ / `npm run build` ✅ / `npm test` ✅ (269 passed, 7 skipped, 2 todo)
- **수동 스모크**: 카톡/다운로드/Gmail watcher 로그 확인, Gmail metadata 매칭 저장, 다운로드 PDF 저장, `.crdownload`/스크린샷 무시 확인
- **Gmail OAuth 상태**: `data/google-tokens.json`에 userId=1 토큰 존재, access/refresh 있음, 만료 전(`2026-05-01 19:59:19 KST`)
- **아카이브**: `docs/tasks/2026-05-01-gmail-download-watcher.md`

### [Codex] 카카오톡 받은 파일 폴더 감시 및 딜 분류 Phase B-1
- **작업**: `KAKAO_DOWNLOAD_PATH` 기반 카카오톡 받은 파일 폴더 감시를 추가하고 신규 파일을 딜 폴더로 복사 분류
- **신규 파일**:
  - `server/deals/folderWatcher.ts` (78줄) — chokidar 감시, `awaitWriteFinish` 적용, 폴더 미존재/비활성 경고
  - `server/deals/dealMatcher.ts` (77줄) — 딜명 exact/partial/none 매칭, 카테고리 키워드 추정
  - `server/deals/kakaoFileHandler.ts` (187줄) — 무시 패턴, 자동 저장, Telegram 인라인 분류 대기 Map
  - `server/intent/handlers/kakaoCallback.ts` (102줄) — `kakao:` callback 권한 확인, 딜/카테고리 선택 처리
- **수정 파일**: `server/_core/index.ts`, `server/llm/telegram-bot.ts`, `server/deals/index.ts`, `server/deals/README.md`, `server/intent/README.md`, `.env.example`, `package.json`, `package-lock.json`
- **신규 테스트**: `dealMatcher.test.ts`, `kakaoFileHandler.test.ts`, `folderWatcher.test.ts` 총 18개
- **검증**: `npm run check` ✅ / `npm run build` ✅ / `npm test` ✅ (253 passed, 7 skipped, 2 todo)
- **수동 스모크**: `C:\Users\user\Documents\카카오톡 받은 파일` watcher 로그 확인, `용인신대지구_사업계획서.pdf`→사업수지, `포항 해상케이블카_시장조사.pdf`→시장조사, `사업계획서_제1권.pdf`→인라인 분류 대기, `KakaoTalk_20260101_test.mp4`→무시 확인
- **아카이브**: `docs/tasks/2026-05-01-kakao-folder-watcher.md`

### [Codex] Phase 1b 브리핑 출력 품질 개선
- **작업**: `server/wiki/wikiStore.ts` 검색을 `WIKI_ROOT` 전체 재귀 순회로 변경하고 `daily/` 브리핑 파일 검색 회귀 테스트 추가
- **작업**: 기존 `category: [briefing]` frontmatter를 `categories`와 동일하게 인식하도록 하위 호환 처리
- **작업**: 브리핑 위키 메모 섹션을 메모별 1줄 + 인라인 카테고리 형식으로 변경해 동일 메모 중복 출력 제거
- **작업**: `#briefing` / `source: morning-briefing` 항목을 위키 digest에서 제외해 브리핑 재귀 누적 방지
- **작업**: 신규 브리핑 저장 frontmatter를 `categories: [briefing]`로 보장
- **검증**: 관련 vitest 통과, `npm run check` 통과
## 2026-05-01 마감

### [Codex] 작업일지 및 내일 인수인계 정리
- **작업**: `HANDOFF.md`에 Phase 1b 현재 상태, 원격 push 상태, 내일 첫 확인 순서 추가
- **작업**: `todo.md`에 내일 텔레그램 수동 QA와 07:00 KST cron 확인 항목 추가
- **상태**: 코드 변경 없음, 문서 정리만 수행

## 2026-05-01 intentService 분할 리팩토링

### [Claude Code] intentService.ts 도메인별 분할
- **작업**: 1511줄 단일 파일을 도메인별 핸들러로 분리하여 CLAUDE.md/AGENTS.md §9 "단일 파일 500줄 이하" 룰 준수
- **수정 파일**: `server/intent/intentService.ts` (1511줄 → 192줄)
- **신규 파일**:
  - `server/intent/types.ts` (171줄) — IntentDomain·Action·Result 타입, asString/asNumber/yyyymmdd 등 헬퍼, getGoogleAuth, GOOGLE_REAUTH_MSG
  - `server/intent/fallbackIntent.ts` (452줄) — 키워드 기반 1차 분류, 우선순위 보존
  - `server/intent/registry.ts` (16줄) — 도메인별 핸들러 맵 병합
  - `server/intent/handlers/trading.ts` (274줄) — balance/positions/TA/risk_*/pre_check/add_alert/analysis_*
  - `server/intent/handlers/realestate.ts` (201줄) — portfolio/feasibility/land_*/deals_*
  - `server/intent/handlers/google.ts` (197줄) — calendar/sheet/drive/gmail
  - `server/intent/handlers/finance.ts` (20줄) — DART
  - `server/intent/handlers/intelligence.ts` (20줄) — morning_briefing
  - `server/intent/handlers/wiki.ts` (17줄) — wiki.ts executor 래핑
- **공개 API 보존**: `classifyIntent`, `routeIntentMessage`, `formatIntentRouteMessage`, `normalizeIntent`, `IntentResult` 타입을 `intentService.ts`에서 동일 경로로 export. `wiki.ts`/`telegram-bot.ts`/`routers/intent.ts`/`routers/llm.ts`/`chat-dedup.test.ts`/`briefing.test.ts` import 변경 없음
- **자율 결정**:
  - registry 패턴 도입 (`Partial<Record<IntentAction, IntentHandler>>`) — 핸들러 맵 병합, action 키 조회로 디스패치
  - fallbackIntent는 단일 함수 유지 — 키워드 매칭 우선순위가 도메인 사이에 미묘하게 얽혀 있어 보존
  - types.ts에 helpers 통합 — 모든 도메인 공유 유틸을 분산하지 않음
- **검증**: `npm run check` ✅ / `npm run build` ✅ / `npm test` ✅ (160 passed, 7 skipped, 2 todo — 회귀 없음)
- **아카이브**: `docs/tasks/2026-05-01-intent-service-split.md`
- **잔여이슈**: 텔레그램 수동 회귀 체크리스트 9종 (위키 저장/검색, 브리핑, 잔고, 일정, 메일, pre_check, 리스크 상태) — 운영 검증 대기

## 2026-05-01 Telegram 승인 모드 (1탭 자동 체결)

### [Claude Code] 매매 신호 → 텔레그램 인라인 키보드 → 회장 1탭 승인 → Upbit 자동 주문
- **신규 파일**:
  - `server/trading/approvalQueue.ts` (159줄) — 승인 대기 큐, in-memory Map + TTL(기본 5분), 일일 체결 카운터(KST 자정 기준)
  - `server/trading/orderExecutor.ts` (225줄) — Upbit JWT(HS256) 서명 REST 직접 호출. ccxt 미사용. placeMarketBuy/placeMarketSell/getOrder + Upbit 에러 코드 한국어 매핑
  - `server/intent/handlers/approval.ts` (346줄) — trading_buy_signal/trading_sell_signal/trading_approval_list 핸들러 + Telegram callback_query 처리(handleApprovalCallback)
  - `server/__tests__/approvalQueue.test.ts` (141줄) — 12 케이스
  - `server/__tests__/orderExecutor.test.ts` (154줄) — 11 케이스, fetch 완전 모킹
- **수정 파일**:
  - `server/intent/types.ts` — IntentAction 에 trading_buy_signal/trading_sell_signal/trading_approval_list 추가
  - `server/intent/fallbackIntent.ts` (484줄) — "매수 시뮬"/"매도 시뮬"/"승인 큐" 매처 추가
  - `server/intent/registry.ts` — approvalHandlers 등록
  - `server/llm/telegram-bot.ts` (568줄, +22줄) — setupApprovalCallbacks() 추가, bot.action(/^(approve|reject|detail):(.+)$/) 핸들러
  - `.env.example` — MAX_ORDER_KRW, MAX_DAILY_AUTO_TRADES, APPROVAL_TIMEOUT_MS 추가
- **보안 제약 구현**:
  - 승인 클릭자가 OWNER_TELEGRAM_CHAT_ID 일치 검증 → 불일치 시 차단
  - Upbit API 키는 .env 에서만 로드, 코드/로그 노출 없음
  - 주문 실행 직전 Risk Guard 재검사 (잠금/손실 한도)
  - 단일 주문 한도 50만원 (신호 등록 + 승인 직전 이중 검사)
  - 일일 자동 매매 한도 5건 (KST 자정 기준)
  - pending 이 아닌 요청 재처리 차단
- **자율 결정**:
  - 승인 타임아웃 5분 (env 오버라이드)
  - 타임아웃 시 자동 거부 (재알림 없음)
  - 주문 실패 재시도 없음 (잔고 부족 등 재시도 무용)
  - callback_data: approve:<uuid> / reject:<uuid> / detail:<uuid>
  - 위키 자동 저장 (체결 후 #trading 태그)
  - Upbit JWT 서명: Node 내장 crypto HMAC HS256 (의존성 최소화)
- **검증**: `npm run check` ✅ / `npm run build` ✅ / `npm test` 183 passed (이전 160 → +23 신규), 회귀 0
- **수동 검증**: "매수 시뮬 BTC 5만원" → 인라인 키보드 → ✅ 탭 → Upbit 주문 → 결과 편집 + 위키 저장. 실제 체결은 회장 소액 테스트 진행
- **아카이브**: `docs/tasks/2026-05-01-telegram-approval-mode.md`
- **잔여이슈**:
  - telegram-bot.ts 568줄로 500줄 룰 위반(이전부터 위반, +22줄 추가). P1 분리 대상
  - 지정가 주문 미지원, 자동 신호 트리거(preCheckEngine + cron) 연결은 후속 과제

# 2026-05-01 모닝브리핑 에이전트 결과 통합

### [Codex] Phase 4 — 전일 에이전트 작업 요약 섹션 추가
- **작업**: `server/agents/agentResultLoader.ts` 신규 추가. `AGENT_WIKI_PATH`에서 `YYYY-MM-DD-<template>-<id>.md` 파일을 스캔하고 전일 KST 기준 결과, 핵심 지표, 미리보기, 시뮬레이션 여부를 추출
- **작업**: `server/agents/agentBriefing.ts` 신규 추가. 메모리 큐 결과와 wiki fallback 결과를 병합하고 완료/실패 표시 데이터를 생성
- **작업**: `server/agents/agentQueue.ts`에 `getTasksByDate(dateISO)` 추가. 완료/실패/취소 작업만 반환하고 진행 중 작업은 제외
- **작업**: 모닝브리핑에서 딜 섹션 다음, Risk Guard 앞에 `🤖 어제 에이전트 작업` 섹션 삽입
- **출력 정책**: 완료 최대 5건 표시, 초과분은 `외 N건`, 실패는 `⚠️ 실패 N건`, 시뮬레이션은 `🧪` 아이콘으로 구분
- **신규/보강 테스트**: `agentResultLoader.test.ts` 5개, `briefingSources.test.ts` 3개, `briefing.test.ts` 1개, `agentQueue.test.ts` 1개
- **검증**: `npm run check` ✅ / `npm run build` ✅ / `npm test` ✅ (340 passed, 7 skipped, 2 todo)
- **아카이브**: `docs/tasks/2026-05-01-briefing-agent-integration.md`

## 2026-05-01 Telegram 검토 모드 전환

### [Codex] 실주문 잠금 + 의사결정 리포트 강화
- **작업**: `ENABLE_REAL_ORDERS=false` 기본값을 추가하고, false 상태에서는 Upbit 실주문 실행 전 `🔒 검토 모드: 실주문 비활성화 상태입니다.`로 차단
- **작업**: `server/trading/reviewReport.ts` 신규 추가 — `검토 BTC`, `롱 검토 BTC 15배`, `숏 검토 ETH 5배`, `매수 적합?` 등 자연어/키워드 검토 리포트 생성
- **작업**: `매수 시뮬` / `매도 시뮬` 명령은 실주문 비활성 상태에서 승인 큐 대신 검토 리포트를 반환하도록 변경
- **작업**: 레버리지(`15배`), KRW(`원/만원/억`), 수량(`0.01BTC`), USD(`달러/$`) 단위 파서 추가. 단위 없는 숫자는 KRW 가정 안내 표시
- **작업**: 1h/4h/1d RSI·볼린저 위치, 1h/4h MACD, 거래량 스파이크, 펀딩비 평균, 김프 변화, Risk Guard 체크리스트 기반 종합 판정 추가
- **수정 파일**: `server/trading/orderExecutor.ts`, `server/intent/handlers/approval.ts`, `server/intent/handlers/trading.ts`, `server/intent/fallbackIntent.ts`, `server/intent/types.ts`, `.env.example`
- **신규 파일**: `server/trading/reviewReport.ts`, `server/__tests__/reviewReport.test.ts`, `README.md`, `docs/tasks/2026-05-01-review-mode-transition.md`
- **검증**: `npm run check` ✅ / `npm run build` ✅ / `npm test` ✅ (189 passed, 7 skipped, 2 todo)
- **잔여이슈**: 회장님 Telegram 수동 QA 필요. 실주문 재활성화는 `.env`에서 `ENABLE_REAL_ORDERS=true` 명시 필요
# 2026-05-01 Deal Folder Phase A

### [Codex] 텔레그램 파일 기반 딜 자료 자동 정리
- **작업**: `server/deals/` 신규 모듈 추가. 딜 폴더 6개 카테고리 생성, `_deal.json` 메타 관리, 파일 저장/충돌 처리, 부분 매칭 구현
- **작업**: `딜 추가`, `딜 목록`, `딜 한남동644`, `딜 노트북`, `딜 상태`, `딜 저장` 명령 파서와 인텐트 핸들러 추가
- **작업**: `telegram-bot.ts`에는 document/photo + `딜 저장` 캡션 감지 후 `telegramDealFileHandler.handleDealFile()` 호출만 추가
- **작업**: `.env.example`에 `DEALS_ROOT` 추가
- **신규 테스트**: `dealStore.test.ts`, `dealFileRouter.test.ts` 총 38개
- **검증**: `npm run check` 통과 / `npm run build` 통과 / `npm test` 통과 (227 passed, 7 skipped, 2 todo)
- **아카이브**: `docs/tasks/2026-05-01-deal-folder-phase-a.md`

# 2026-05-01 Modular Monolith

### [Codex] 모듈 독립성 원칙 문서화 및 경계 검사 추가
- **작업**: `AGENTS.md`, `CLAUDE.md`에 "모듈 독립성 원칙 (Modular Monolith)" 섹션 추가
- **신규 문서**: `server/wiki/README.md`, `server/deals/README.md`, `server/trading/README.md`, `server/intelligence/README.md`, `server/google/README.md`, `server/finance/README.md`, `server/realestate/README.md`, `server/intent/README.md`, `server/_core/README.md`
- **신규 도구**: `scripts/check-module-boundaries.ts` 추가. 도메인 모듈 간 직접 import 및 도메인→intent import를 검사
- **수정**: `package.json`의 `npm run check`에 모듈 경계 검사 통합
- **검증**: 의도적 위반 케이스 1건 감지 확인 후 제거, 실제 경계 위반 0건
- **검증**: `npm run check` 통과 / `npm run build` 통과 / `npm test` 통과 (227 passed, 7 skipped, 2 todo)
- **아카이브**: `docs/tasks/2026-05-01-modular-monolith.md`
- **잔여이슈**: 신규 도메인 모듈 추가 시 README와 검사 스크립트 도메인 목록을 함께 갱신 필요

# 2026-05-01 Deal Routing Priority Fix

### [Codex] 딜 인텐트 우선순위 수정 + JSON 노출 차단
- **작업**: `딜 ...` prefix 명령을 모든 도메인보다 먼저 `deals.deals_command`로 라우팅하도록 고정
- **작업**: `server/intent/handlers/realestate.ts`의 `realestate.deals.list` raw JSON 응답 핸들러와 `realestate_deals_*` 중복 액션 제거
- **작업**: `formatIntentRouteMessage()`에 raw object 차단 로직 추가. `{ method: ... }`, `{ files: ... }` 형태는 경고 로그 후 한국어 안내로 대체
- **작업**: `[intent] matched: <domain>.<action> for input: <message>` 형식의 매칭 로그 정리
- **작업**: `server/trading/orderExecutor.ts`의 parameter property를 일반 필드 할당으로 변경해 `npm run dev` strip-types 런타임 오류 방지
- **신규 테스트**: `server/__tests__/dealRouting.test.ts` 8개 추가
- **검증**: `npm run check` 통과 / `npm run build` 통과 / `npm test` 통과 (235 passed, 7 skipped, 2 todo)
- **수동 스모크**: `딜 추가`, `딜 목록`, `딜 한남동644`, `딜 노트북`, PDF 저장 핸들러 로컬 실행 및 `G:\내 드라이브\Aston-Deals\한남동644\01_계약서` 파일 생성 확인
- **아카이브**: `docs/tasks/2026-05-01-deal-routing-priority-fix.md`
- **잔여이슈**: 실제 Telegram 화면에서 동일 5개 명령 최종 확인 필요
## 2026-05-02 PF Google Sheets Sync

### [Codex] Phase 5 PF 딜 시트 동기화 완료
- `server/_core/googleSheets.ts` 추가: 시트 생성/재사용, `data/google-sheets.json` 저장, 401 재인증 재시도, 429 backoff
- `server/deals/dealSheetSync.ts` 추가: 활성 딜만 동기화, 헤더/행 업서트, NotebookLM/D-day/이정표/최근 에이전트 결과 표시
- `server/_core/agentResultLookup.ts` 추가: 모듈 경계 위반 없이 최근 에이전트 결과 브리지
- `server/deals/dealStore.ts` 수정: `createDeal`, `updateDealMeta`, `saveFile` 이후 비동기 동기화 트리거
- `server/deals/dealFileRouter.ts`, `server/deals/telegramDealFileHandler.ts` 수정: `딜 시트` 명령 추가
- `server/_core/index.ts` 수정: 06:30 KST 스케줄러 등록
- `.env.example` 수정: `GOOGLE_SHEETS_ENABLED`, `GOOGLE_SHEETS_SYNC_HOUR`, `GOOGLE_SHEETS_SYNC_MINUTE`, `GOOGLE_SHEETS_USER_ID`
- 테스트 추가: `dealSheetSync.test.ts` 7개, `googleSheets.test.ts` 6개
- 검증:
  - `npm run check` 통과
  - `npm run build` 통과
  - `npm test` 통과: 353 passed, 7 skipped, 2 todo
  - 실제 Google Sheets API 호출 성공: 3건 동기화
  - 시트 URL: https://docs.google.com/spreadsheets/d/1kX_l2bQw8II4LZCwdS9_QEQ9JQ4HfpXYGpDoIF9F8b0/edit

## 2026-05-02 Phase 6 딜 시트 조건부 서식

### [Codex] Aston-Deals-Dashboard D-day 조건부 서식 자동 적용
- **작업**: `server/_core/googleSheets.ts` 확장으로 조건부 서식, 헤더 서식, 컬럼 너비 조정, 기존 규칙 삭제 후 재생성 지원 추가
- **작업**: `server/deals/dealSheetSync.ts` 확장으로 첫 동기화 시 1회 자동 적용, `formatAppliedAt` 메타데이터 저장, 서식 실패 비차단 처리 추가
- **작업**: `server/deals/dealFileRouter.ts`, `server/deals/telegramDealFileHandler.ts` 수정으로 `딜 시트 서식` 명령 추가
- **작업**: `data/google-sheets.json` 메타데이터를 문자열 호환 + 객체 저장 방식으로 확장
- **테스트**: `server/__tests__/googleSheets.test.ts` 10개, `server/__tests__/dealSheetSync.test.ts` 11개로 확장
- **검증**:
  - `npm run check` 통과
  - `npm run build` 통과
  - `npm test` 통과: 361 passed, 7 skipped, 2 todo
  - 실제 Google Sheets API 호출 확인: 조건부 서식 3개 적용, 헤더 배경/굵기 적용 확인
  - 실제 시트 URL 재확인: https://docs.google.com/spreadsheets/d/1kX_l2bQw8II4LZCwdS9_QEQ9JQ4HfpXYGpDoIF9F8b0/edit
- **자율 결정**:
  - D-30 노랑, D-7 주황, D-3 및 D-DAY·지연 빨강으로 정렬
  - 컬럼 너비 자동 조정 포함
  - 기존 조건부 서식은 Dashboard 시트 기준 전부 삭제 후 재생성
- **후속 후보**: 완료/거절 딜 아카이브 시트 분리, 색상 미세조정, 시트 역방향 동기화
## 2026-05-02 OpenClaw 실제 연동 활성화

### [Codex] Phase 7 OpenClaw 실연동 전환
- `server/agents/openclawRuntime.ts` 추가: `~/.openclaw/openclaw.json`에서 gateway token/model 자동 탐색, `.env`의 `OPENCLAW_API_URL`, `OPENCLAW_API_KEY`, `OPENCLAW_REQUEST_TIMEOUT_MS`, `AGENT_PERMISSION_LEVEL` 자동 동기화
- `server/agents/openclawClient.ts` 전환: 기존 추정 HTTP task endpoint 우선 방식에서 `gateway-rpc` 우선 방식으로 변경
- 실제 연결 경로 확정:
  - URL: `http://127.0.0.1:8000`
  - 인증: Bearer token
  - 전송 패턴: `sessions.create -> sessions.send -> agent.wait -> chat.history`
- `scripts/detect-openclaw.ts` 확장: 탐지 성공 시 `.env` 자동 반영, `data/openclaw-discovery.json` 갱신
- `server/agents/openclawDiscovery.ts` 확장: 후보 포트에 `8002`, `52108` 추가
- `server/agents/agentExecutor.ts` 수정: 실연동 실패 시에만 시뮬레이션 fallback 판단
- 테스트 보강:
  - `server/__tests__/openclawClient.test.ts` 재작성
  - `server/__tests__/agentExecutor.test.ts` 갱신
- 검증:
  - `npm run check` 통과
  - `npm run build` 통과
  - `npm test` 통과: `359 passed, 7 skipped, 2 todo`
  - live `/api/agents/health` 확인: `available=true`, `simulationMode=false`, `transport=gateway-rpc`
- smoke test:
  - 실제 Gateway RPC 작업 수락까지 확인
  - `github-copilot/gpt-4.1` 응답은 60초 내 완료되지 않아 `OpenClaw 응답 timeout`
  - Aston 쪽은 실제 호출 후 timeout 시 시뮬레이션 fallback 유지

## 2026-05-02 OpenClaw 재탐지 + Gemini 재사용 보강

### [Codex] OpenClaw 재탐지, 상태 노출, NotebookLM 지시 보강
- `scripts/detect-openclaw.ts`, `scripts/smoke-openclaw.ts` 추가/보강
  - discovery 결과에 `candidates`, `configFiles`, `modelHint`를 함께 기록
  - 수동 `OPENCLAW_API_URL` 인증 실패 시 자동 재탐지를 다시 시도하도록 보강
  - smoke 결과를 `data/openclaw-smoke.json`에 `checkedAt`, `available`, `url`, `modelHint`, `responsePreview`, `errorReason`, `status`로 저장
- `server/agents/openclawRuntime.ts`, `openclawDiscovery.ts`, `openclawClient.ts` 보강
  - `.openclaw/openclaw.json`, `.openclaw/config.json` 존재 여부와 모델 힌트 스캔
  - Aston `GEMINI_API_KEY` 또는 `GOOGLE_API_KEY`를 OpenClaw HTTP payload의 `providerApiKey`로만 메모리 재사용
  - 키/토큰은 discovery JSON, smoke JSON, 텔레그램, UI 결과에 기록하지 않음
- `server/agents/agentHealth.ts`, `server/routers/agents.ts`, `server/intent/handlers/agents.ts`, `client/src/pages/AgentControl.tsx` 보강
  - `/api/agents/health`에 `openclawDetected`, `openclawUrl`, `simulationMode`, `modelHint`, `lastSmokeAt`, `lastSmokeStatus`, `permissionLevel`, `queueStatus` 포함
  - `/agents` 상단 상태 배지와 텔레그램 `에이전트 목록/상태` 응답에 OpenClaw, Gemini, 권한 상태 반영
- `server/agents/agentTemplates.ts` 보강
  - `notebook-query` 템플릿에 NotebookLM URL 진입, `dealStore.getDeal(dealName)` 참조, `notebookUrl` 미연결 안내, 출처 기록, Aston Wiki 저장, 시뮬레이션 fallback 유지 지시 추가
- 테스트
  - 신규/보강: `detect-openclaw.test.ts`, `openclawClient.test.ts`, `openclawRuntime.test.ts`, `agentHealth.test.ts`, `agentTemplates.test.ts`
  - 검증: `npm run check`, `npm test` (`365 passed, 7 skipped, 2 todo`), `npm run build`
- 실제 smoke
  - 결과: `OpenClaw health 인증 확인 실패`
  - 현재 저장값: `available=false`, `url=http://openclaw.local`, `modelHint=gpt-4`, `status=skipped`

## 2026-05-02 문서화

### [Codex] `docs/ARCHITECTURE.md` 신규 작성
- **작업**: 현재 코드 기준 전체 구조 문서 작성
- **신규 파일**: `docs/ARCHITECTURE.md`
- **포함 내용**:
  - 프론트엔드 실제 라우트와 사이드바 메뉴 구조
  - Express/tRPC/LLM/Google Workspace/DB/Chat Sync 구조
  - 작업 브랜치 추가 모듈(`agents`, `deals`, `intent`, `intelligence`, `_core`) 요약
  - Mermaid 다이어그램 5개
  - 요청서와 실제 코드의 불일치 항목 명시(App 라우트 수, appRouter 범위, RiskGuard 위치, data JSON 수)
- **검증**: 문서 외 코드 변경 없음 확인 예정, `npm run check` / `git diff --stat` 수행 예정

### [Codex] `README.md` 재정비
- **작업**: `Aston Workstation` 대외용 진입 문서 재작성
- **수정 파일**: `README.md`
- **포함 내용**:
  - 제품 정체성, 핵심 기능, 기술 스택, Quick Start
  - 필수 환경 변수, 주요 명령어, 최상위 디렉터리 구조
  - `docs/ARCHITECTURE.md`, `AGENTS.md`, `CLAUDE.md`, 운영 문서 링크
  - 현재 제약 요약과 비공개 운영 안내
- **검증**: `npm run check`, `npm run build`, `README.md` 줄 수 확인 예정

### [Codex] `Aston Workstation` 3계층 구조 정의 반영
- **작업**: `Command Channel` / `Knowledge Core` / `Execution Modules`를 기준 구조로 문서화
- **수정 파일**: `docs/ARCHITECTURE.md`, `README.md`, `AGENTS.md`, `CLAUDE.md`
- **포함 내용**:
  - `AI 채팅`을 단일 진입점으로 두는 3계층 정의 추가
  - `NotebookLM`, `Aston Wiki`, `Aston-Deals Folder`, `Google Drive`, `Google Sheets`를 `Knowledge Core`로 명시
  - 직원 구현보다 `1·2계층` 안정화를 우선한다는 운영 원칙 추가
- **검증**: `npm run check`, `npm run build`, 4개 문서 공통 키워드 확인 예정

### [Codex] `AI 채팅` 라우팅 진단서 작성
- **작업**: `1계층 Command Channel`의 실제 코드 흐름 진단 문서 작성
- **신규 파일**: `docs/diagnostics/ai-chat-routing.md`
- **포함 내용**:
  - `UnifiedChatInterface`, `Home` 빠른 명령, `Telegram` webhook의 실제 진입점 매핑
  - 빠른 명령 5개 입력 방식과 `intent` 라우팅 결과 진단
  - `1계층 → 2계층`, `1계층 → 3계층` 연결 현황과 누락 지점 기록
  - `chatSync`, `routeIntentMessage()`, `handleWorkspaceCommand()` 실제 흐름과 문제점 정리
- **검증**: `npm run check`, `npm run build`, `git diff --stat`로 문서 범위만 확인 예정

### [Codex] Home 빠른 명령 5개 즉시 실행화
- **작업**: `Home` 화면의 빠른 명령 5개를 `prefill` 전용에서 `한 번 클릭 → 즉시 실행` 흐름으로 변경
- **수정 파일**:
  - `client/src/pages/Home.tsx`
  - `client/src/components/UnifiedChatInterface.tsx`
  - `client/src/chat/quickCommand.ts`
  - `server/__tests__/quickCommandFlow.test.ts`
- **포함 내용**:
  - 빠른 명령 클릭 시 `/chat` 이동과 함께 자동 제출 query param 전달
  - `UnifiedChatInterface`에서 query param을 읽어 기존 전송 흐름으로 즉시 실행
  - `intent.route` 결과를 웹 채팅에서도 목록형 메시지까지 포맷해 일반 메시지처럼 표시
  - 라우팅 실패 시 채팅창에 사용자용 에러 메시지 추가
- **검증**:
  - `npm run check` ✅
  - `npm run build` ✅
  - `npm test` ✅ (`server/__tests__/quickCommandFlow.test.ts` 4개 포함)
