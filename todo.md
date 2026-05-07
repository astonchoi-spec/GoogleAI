# TODO.md — 에스턴 워크스테이션
> 업데이트: 2026-05-07 Phase B-1 | 브랜치: codex-google-workspace-expansion

---

## 2026-05-07 Phase B-1 마감 후속 (집에서 이어갈 작업 정리)

### 이번 세션 추가 완료
- ✅ TypeScript parameter property → 수동 declaration (PM2 강제 strip-types 호환)
- ✅ 캘린더 인텐트 LLM 필드명 미스매치 수정 (`summary`/`start` 양쪽 허용 + 응답에 시간 표시)
- ✅ `.env`에 `ASTON_WIKI_ROOT=G:\내 드라이브\Aston-Wiki` 추가 (운영용 G 드라이브 활성화)
- ✅ `/wiki` 페이지 실데이터 연결 (검색·카테고리·최근·폴더 열기)

### 회장님 운영 피드백 반영 결정
- **`/tg` 메모 명령은 over-engineering** — 코드는 보존, 사용은 선택
- **다음 우선순위는 `/nb` NotebookLM 회수** — 진짜 가치 있는 영역
  - 회장님 NotebookLM 30개+ 노트북에서 가치 있는 분석 결과를 Wiki로 회수
  - AI 채팅이 NotebookLM 분석을 컨텍스트로 활용하게 만드는 경로

### 집에서 이어갈 작업 (우선순위 순)
1. **NotebookLM 회수 경로 `/nb` 설계 + 구현** — 다음 CURRENT_TASK 작성 필요
   - 입력: `/nb hannam-644` + NotebookLM 답변 본문 붙여넣기 + 출처
   - 처리: Phase B-1 파이프라인 재사용 (TelegramAdapter처럼 NotebookLmAdapter 추가)
   - 저장: `projects/{project}/notebooklm/`
2. **`notebooklm-mapping.yaml`에 회장님 30개+ 노트북 매핑 채우기** (회장님 직접)
3. **회의록 어댑터** (수동 업로드 → 파이프라인)
4. **음성 어댑터** (텔레그램 음성 → STT → 파이프라인) — STT 엔진 결정 필요
5. **inbox/_suggested 키워드 힌트 자동 생성** (B-1 보완)
6. **일괄 재처리 CLI** `scripts/reprocess.ts` (Track B)

### 추가 미해결
- [ ] 잘못 만들어진 "새 일정" 이벤트 캘린더에서 회장님 직접 정리
- [ ] 텔레그램에서 새 캘린더 인텐트 동작 운영 검증 (`5월 22일 11:10 원준이 전화상담`)
- [ ] `/wiki` 페이지에서 검색·카테고리·폴더 열기 운영 검증
- [ ] OpenClaw gateway 1006 closure (서비스 가동 시 재진단)

---

## 2026-05-07 Phase B-1 — Knowledge Pipeline 완료

- ✅ Knowledge Core Phase A 확정 (Wiki=본진 / NotebookLM=분석실 / Workstation=작업환경)
- ✅ Phase B-0 인터페이스 명세 (8단계 파이프라인, 8종 어댑터)
- ✅ Phase B-1 CURRENT_TASK 12개 합의 + 구현 완료
- ✅ TelegramAdapter + 공통 파이프라인 7단계 + 이벤트 stub
- ✅ Token Dispatcher (정규식 금지, prefix 핸들러 등록 구조)
- ✅ LLM 실패 vs I/O 실패 분리 (partial 진행 / pending 큐)
- ✅ 멱등성 Track A (`reprocess_requested` 메타)
- ✅ 2단계 텔레그램 응답 (`📝 처리중...` + 결과)
- ✅ 검증: check / build / 492 tests passed (+59)

### 운영 검증 잔여 (회장님 직접)
- [ ] 텔레그램에서 `/tg 메모내용` → `inbox/telegram/` 저장 확인
- [ ] 텔레그램에서 `/tg #hannam-644 메모` → `projects/hannam-644/notes/` 저장 확인
- [ ] 동일 메시지 재전송 → skip 확인 (멱등성)
- [ ] `/tg` 응답 1차/2차 도착 확인 (5~15초 내 결과)
- [ ] 기존 `저장해 ...`이 회귀 없이 동작 확인
- [ ] `.env`에 `ASTON_WIKI_ROOT=G:\내 드라이브\Aston-Wiki` 설정 (운영 전환)

### Phase B-1 후속 (별도 작업 지시서 필요)
- [ ] `notebooklm-mapping.yaml`에 회장님 30개+ 노트북 매핑 채우기
- [ ] inbox/_suggested 키워드 힌트 자동 생성 (Phase B-1 보완)
- [ ] 일괄 재처리 CLI (`scripts/reprocess.ts`, Track B)
- [ ] 기존 `WIKI_ROOT/YYYY-MM-DD/` 데이터 마이그레이션 (별도 작업)

### Phase B-2 후보 (미착수)
- [ ] VoiceAdapter (음성 → STT → 파이프라인)
- [ ] GmailAdapter
- [ ] MeetingAdapter
- [ ] NotebookLmAdapter (`/nb` 회수)
- [ ] KakaoManualAdapter

---

## 2026-05-07 후속 세션 결과 (운영 환경 복구)

이번 세션 2개 커밋:
- ✅ wouter Link 중첩 `<a>` hydration 오류 7개 파일 수정 (커밋 58929f2)
- ✅ PM2 우선 실행 규칙 + SessionStart 점검 스크립트 (커밋 7de5869)

운영 복구 (gitignored, 커밋 없음):
- ✅ `.env` GOOGLE_CLIENT_ID 추가, GOOGLE_CLIENT_SECRET 변수명 정상화
- ✅ `.env` WORKSPACE_SPREADSHEET_ID, PORT=4000 추가
- ✅ `.claude/settings.json` 8개 권한 allowlist + 2개 훅 (PreToolUse, SessionStart)

신규 알려진 이슈:
- ⚠️ OpenClaw `loadGatewayCaller()` APPDATA 경로 조립 버그 (`openclawRuntime.ts:172`)

---

## 2026-05-07 일괄 정리 결과

이번 세션 7개 커밋으로 P0/P1/P2 코드 작업 정리 완료:
- ✅ 알려진 미해결 이슈 4건 (OpenClaw URL, Gate.io 가드, 웹 intent data, Telegram 라우팅 이중화)
- ✅ 진단서 §8 잔여 (chatSyncRouter ownership, 한남 PF 파싱)
- ✅ 홈 KPI today 의미 일치 + 활동 피드 mock 완전 제거
- ✅ Google 재인증 인라인 액션 버튼 (UX)
- ✅ TradingView 로딩 스켈레톤 (Perf)
- ✅ 빌드 스모크 검사 자동화 (CI)
- ✅ Telegram KPI mode 표시

검증: check ✅ / build ✅ / test 423 passed / smoke ✅

---

## P0 Stabilization (즉시 해결 필요)

- [x] **Yahoo Finance CORS 이슈 대응** (2026-05-06 완료)
  - `/api/yahoo-chart` 프록시에 User-Agent 헤더 추가

- [ ] **Google Workspace 운영 준비**
  - Google Cloud 프로젝트에서 Sheets API, Drive API 활성화 확인
  - OAuth 재연결로 신규 스코프 및 refresh token 확보
  - Gmail · Calendar · Drive · Sheets 연결 진단 패널 추가
  - **참고**: 채팅에서 "Google 재인증" 메시지 시 인라인 버튼 추가됨 (2026-05-07)

- [ ] **웹 채팅 end-to-end QA** (운영, 회장님 직접 확인 필요)
  - 단일 전송 검증: Enter · 전송버튼 · 빠른명령 · 음성입력
  - 대화 초기화 · 수정 · 삭제 · 검색 · 내보내기 · Telegram 동기화 후 회귀
  - 중복 메시지 억제 및 인텐트 폴백 회귀 테스트

- [x] **Upbit 잔고 Telegram 응답 검증** (2026-05-06 완료)
  - 서버 수정 완료, 텔레그램 응답 포맷 정상

---

## P1 Core Modules (이번 주 처리)

- [x] **intentService.ts 도메인별 분리** (CLAUDE.md §9) — 완료 2026-05-01
  - 1511줄 → 192줄 (intentService.ts), 6개 도메인 핸들러 + types/registry/fallback 분리
  - `server/intent/handlers/{trading,realestate,finance,google,intelligence,wiki}.ts`
  - 모든 신규 파일 500줄 이하, 160 tests passed

- [x] **Gemini Grounding 소스/인용 UI** (2026-05-06 완료, 커밋 e9f62a0)
  - `caller.ts`에서 sources 분리, UnifiedChatInterface 칩 렌더링

- [x] **대시보드 실시간 데이터 정확도** (2026-05-07 완료)
  - 홈 KPI 'today' 의미 일치 (calendar.getTodayEvents 신규)
  - 활동 피드 mock 6개 완전 제거 → 실데이터 동적 구성
  - Telegram KPI에 webhook/polling mode 표시

- [ ] **Telegram 운영 검증** (코드 완료, 운영 QA 대기)
  - [x] Telegram 상태 엔드포인트(`telegram.getStatus`) — mode/webhookUrl/botUsername 반환
  - [x] UI 뱃지 — 홈 KPI에 webhook/polling 모드 표시
  - [ ] 회장님 직접 텔레그램에서 라우팅 5종 + 회귀 시나리오 확인

- [ ] **Google Sheets 워크스페이스 스키마**
  - 필수 워크시트 정의: PF 딜, 트레이딩 알림, 워크스페이스 노트, 감사 로그
  - 누락 탭 자동 생성 후 로컬 워크스페이스 config에 탭명 저장
  - 모든 Sheets 읽기/쓰기를 저장된 탭명(quoted) 기준으로 정규화

- [x] **TradingView 위젯 로딩 속도 개선** (2026-05-07 완료)
  - 심볼 전환 시 즉시 로딩 스켈레톤 (cyan 펄스 도트), MutationObserver로 iframe 등장 감지 → 자동 페이드아웃

---

## P2 Practical Automation (P0·P1 완료 후)

- [ ] **에러/복구 UX 개선** (부분 완료)
  - [x] Google 재인증 메시지에 인라인 액션 버튼 (2026-05-07)
  - [ ] OAuth refresh · API 활성화 지연 · 네트워크 실패에 대한 재시도 액션 추가
  - [ ] 전역 토스트 중복 제거 규칙 검토

- [ ] **테스트 및 CI 강화** (부분 완료)
  - [x] 외부 Telegram 토큰 테스트는 이미 `describe.skip`으로 분리됨 (확인 완료)
  - [ ] Gemini grounding request payload 검증을 위한 mock 테스트 추가
  - [x] 빌드 스모크 체크 (2026-05-07, `scripts/smoke-routes.ts` + `npm run smoke:routes`)

- [x] **코인 탭 프리셋 확장** (이미 완료됨, 확인 결과)
  - BTC/ETH/SOL/BNB/XRP/DOGE 6종 모두 ChartArea.tsx에 등록됨

---

## P2 Intelligence System (Phase별 진행)

- [x] **Phase 1a — Aston Wiki 수동 저장·검색** (2026-04-30 완료)
  - `서버/wiki/wikiStore.ts`, `server/intent/wiki.ts`, 테스트 25개
  - 인텐트: `위키 저장 <내용> #태그`, `위키 검색 <키워드>`
  - 저장 경로: `WIKI_ROOT` 환경변수 (Google Drive 등 외부 경로)
- [ ] **Phase 1b — 모닝 브리핑** (다음)
  - `node-cron` + `briefing.ts` (기존 Bot API 활용, 07:00 자동 발송)
- [ ] **Phase 1c — Gemini 자동 분류**
  - `compiler.ts` (채널 메시지 → AI 요약 + 카테고리 분류)
- [ ] **Phase 1d — MTProto 채널 수집**
  - `collector.ts` (User API, 주의: 인터랙티브 인증 필요)

## Backlog (우선순위 낮음 / 향후)

- OpenClaw 자동화 레이어 (예약 포지션 요약, 주간 PF 리포트, 마켓 브리핑)
- NotebookLM 내부 모듈 연동
- 멀티모달 음성 입력 개선
- 모바일 앱 래퍼 (PWA or Capacitor)

## P1 완료 항목

- ✅ Aston Wiki Phase 1a (2026-04-30, 커밋 225acb0)
- ✅ 운영 체계 구축 (CURRENT_TASK.md, 자율 결정 원칙)
- ✅ PROJECT_BRIEFING.md 생성

## P1 진행 예정

- ⬜ Phase 1b: 모닝 브리핑 (범위 결정 대기)
- ⬜ Phase 1c: MTProto 텔레그램 수집기

---

## 완료 이력 (최근 → 오래된 순)

| 날짜 | 작업 | 도구 |
|------|------|------|
| 2026-04-29 | preCheckEngine 시장 데이터 N/A 수정 (Binance/Upbit 공개 API 직접 fetch, 에러 메시지 한국어화) | Claude Code |
| 2026-04-29 | trading_pre_check 라우팅 버그 수정 (손절 키워드 충돌 해소 + 한글 티커 매핑 + confidence 0.98) | Claude Code |
| 2026-04-29 | AI 진입 전 점검 어시스턴트 trading_pre_check (preCheckEngine + intentService) | Claude Code |
| 2026-04-29 | Portfolio Summary Loading... 무한 표시 수정 (PortfolioSummary + PositionTable) | Claude Code |
| 2026-04-29 | CLAUDE.md "커밋" 명령어 push 포함으로 수정 | Claude Code |
| 2026-04-29 | 텔레그램 Google 계정 미연결 근본 원인 수정 (session.ts + telegram-bot.ts) | Claude Code |
| 2026-04-28 | CLAUDE.md 자동 명령어 섹션 추가 (작업준비/작업정리/커밋) | Claude Code |
| 2026-04-28 | 텔레그램 trading_ 인텐트 Google 인증 우회 버그 수정 (telegram-bot.ts) | Claude Code |
| 2026-04-28 | Trading Risk Guard Phase 1 (riskGuard, riskStore, RiskGuardCard, 테스트 11개) | Claude Code |
| 2026-04-28 | Upbit 잔고 API 에러 처리 강화 (exchangeConnector + intentService) | Claude Code |
| 2026-04-28 | 4-탭 멀티 마켓 차트 (TradingView + Yahoo Finance, 한국/미국주식/선물) | Codex |
| 2026-04-28 | TradingView Advanced Chart 위젯 교체 | Codex |
| 2026-04-26 | 라이브 안정화 (Google OAuth 로그인, 채팅 중복 방지, Gemini Grounding) | Codex |
| 2026-04-26 | 모바일 QA 패스 및 레이아웃 수정 | Codex |
| 2026-04-25 | Aston UI 쉘 polish (Login, UnifiedChat) | Codex |
| 2026-04-25 | Phase 3 UI-백엔드 배선 완료 (Trading/PF 위젯) | Codex |
| 2026-04-24 | Execute-intent confirmation 플로우, LLM Adapter 도입 | Codex |
| 2026-04-24 | tRPC 라우터 통합 (trading/realestate/finance/intent) | Codex |
| 2026-04-24 | 알림 엔진, 리스크 계산기, PF 파이프라인, DART API 추가 | Codex |
| 2026-04-23 | Google Workspace 확장 (Calendar 월뷰, Drive 파일, Gmail UTF-8) | Codex |
| 2026-04-22 | MySQL → SQLite 전환, Web↔Telegram 동기화 복구 | Codex |
## 2026-04-30 Phase 1b 업데이트

### P1 버그 수정 완료
- ✅ Phase 1b 브리핑 인텐트 라우팅 충돌 수정 (`브리핑`, `브리핑 테스트`)

### P1 완료 항목
- ✅ Aston Wiki Phase 1a (2026-04-30, 커밋 225acb0)
- ✅ 운영 체계 구축 (CURRENT_TASK.md, 자율 결정 원칙)
- ✅ PROJECT_BRIEFING.md 생성

### P1 진행 예정
- ⬜ Phase 1b: 모닝 브리핑 (07:00 KST 자동 발송)
- ⬜ Phase 1c: MTProto 텔레그램 수집기
## 2026-05-01 Phase 1b 업데이트

### P1 버그 수정 완료
- [x] Phase 1b 브리핑 출력 품질 개선
  - `daily/` 하위 브리핑 파일 검색 가능
  - 위키 메모 섹션 다중 카테고리 중복 출력 제거
  - 이전 브리핑의 `#briefing` 항목 재노출 방지
  - 신규 브리핑 저장 frontmatter `categories: [briefing]` 보장

### P1 진행 예정
- [ ] 텔레그램 수동 QA: `위키 검색 briefing`, `브리핑 테스트`
- [ ] Phase 1c: MTProto 텔레그램 수집기
## 2026-05-01 마감 후 TODO

### 내일 즉시 확인
- [ ] `npm run dev`로 서버 기동
- [ ] 텔레그램 `위키 검색 briefing` → daily 브리핑 2건 반환 확인
- [ ] 텔레그램 `브리핑 테스트` → 시장/DART/위키/RiskGuard 섹션 1건 메시지 발송 확인
- [ ] 위키 메모 섹션에서 다중 카테고리 메모가 1번만 표시되는지 확인
- [ ] 이전 브리핑 본문이 위키 메모 섹션에 재노출되지 않는지 확인
- [ ] 07:00 KST cron 자동 발송 확인

### 다음 작업 후보
- [ ] Phase 1b 운영 QA에서 발견되는 오류 수정
- [ ] Phase 1c MTProto 텔레그램 수집기 작업 지시서 작성
- [x] `server/intent/intentService.ts` 도메인별 분리 (2026-05-01 완료)
- [x] Telegram 승인 모드 + Upbit 1탭 자동 체결 (2026-05-01 완료)
- [x] Telegram 승인 모드 → 검토 모드 전환 (2026-05-01 완료)
  - `ENABLE_REAL_ORDERS=false` 기본값으로 실주문 잠금
  - `검토 BTC`, `롱 검토 BTC 15배`, `매수 적합?`, `매수 시뮬 BTC 5만원` 리포트 지원
  - 멀티 타임프레임 수치 리포트 + 체크리스트 추가
- [ ] `server/llm/telegram-bot.ts` 도메인별 분리 (568줄, P1)
- [ ] preCheckEngine 자동 신호 → 승인 큐 연결
- [ ] Upbit 지정가 주문 지원
- [ ] Telegram 검토 모드 수동 QA (회장)
  - `검토 BTC`
  - `롱 검토 BTC 15배`
  - `매수 시뮬 BTC 5만원`
  - `매수 적합?`
  - 기존 승인 버튼 클릭 시 검토 모드 차단 메시지 확인
# 2026-05-01 Deal Folder Phase A 업데이트

- [x] 텔레그램 파일 기반 딜 자료 자동 정리 Phase A 완료
  - `DEALS_ROOT` 기반 딜 폴더 생성 및 `_deal.json` 메타 관리
  - `딜 추가/목록/상세/노트북/상태/저장` 명령 지원
  - 텔레그램 document/photo 저장 핸들러 분리
  - 테스트 38개 추가, `npm run check`, `npm run build`, `npm test` 통과
- [ ] Phase B 후보: Gmail 자동 분류, Downloads 감시, Wiki 판단 기록 연계는 별도 CURRENT_TASK로 진행

# 2026-05-01 Modular Monolith 업데이트

- [x] 모듈 독립성 원칙 문서화 완료
  - `AGENTS.md`, `CLAUDE.md`에 "모듈 독립성 원칙 (Modular Monolith)" 추가
  - `server/wiki`, `server/deals`, `server/trading`, `server/intelligence`, `server/google`, `server/finance`, `server/realestate`, `server/intent`, `server/_core` README 추가
  - `scripts/check-module-boundaries.ts` 추가 및 `npm run check` 통합
  - 실제 모듈 경계 위반 0건, 자동 수정 0건, 후속 분리 위반 0건
- [ ] 신규 도메인 모듈 추가 시 README와 `scripts/check-module-boundaries.ts` 도메인 목록을 함께 갱신

# 2026-05-01 Deal Routing 업데이트

- [x] 딜 인텐트 우선순위 수정 완료
  - `딜 ...` 명령을 `deals.deals_command`로 최우선 라우팅
  - `realestate.deals.*` / `realestate_deals_*` 잔존 제거
  - raw object JSON 응답 노출 차단
  - 신규 회귀 테스트 8개 추가, 전체 `npm test` 235 passed
- [ ] Telegram 실사용 화면에서 `딜 추가/목록/상세/노트북/저장` 5개 명령 최종 수동 확인

# 2026-05-01 Kakao Folder Watcher 업데이트

- [x] 카카오톡 받은 파일 폴더 감시 및 딜 자동/수동 분류 Phase B-1 완료
  - `KAKAO_DOWNLOAD_PATH` 감시, 무시 패턴, exact 자동 분류, partial/none 인라인 버튼 분류 추가
  - 카테고리 자동 추정: 계약/사업수지/법률/시장/공시/기타
  - 원본은 카톡 폴더에 유지하고 딜 폴더에는 복사 저장
  - 신규 테스트 18개, 전체 `npm test` 253 passed
- [ ] Telegram 실제 화면에서 카톡 인라인 버튼 2단계(딜 선택 → 카테고리 선택) 최종 확인
- [ ] 딜 목록이 8개를 넘을 때 검색/페이지네이션 UX 개선 검토

# 2026-05-01 Gmail/Download Watcher 업데이트

- [x] Gmail 자동 분류 + 다운로드 폴더 감시 Phase B-2/B-3 완료
  - `fileClassifier.ts` 공통 분류 엔진으로 카톡/Gmail/다운로드 중복 제거
  - Gmail `Aston-Deals` 라벨 + unread + attachment 폴링, 첨부 다운로드 후 분류
  - 다운로드 폴더 감시, `.crdownload`/이미지/1MB 미만 파일 무시
  - `kakao:`, `gmail:`, `dl:` 인라인 callback 통합
  - 신규 테스트 16개, 전체 `npm test` 269 passed
- [ ] 실제 Gmail inbox에서 `Aston-Deals` 라벨 메일 1건으로 운영 QA
- [ ] 실제 Telegram 화면에서 Gmail/다운로드 인라인 버튼 분류 최종 확인
- [ ] 딜 목록 8개 초과 시 검색/페이지네이션 UX 개선 검토

# 2026-05-01 Agent Control 골격 (Phase 2)

- [x] `server/agents/` 모듈 + 5개 템플릿 + 시뮬레이션 모드 완성
  - 큐(max 50, 30분 timeout, 동시 1), 텔레그램 5명령, HTTP API 4개, /agents UI
  - 검증: `npm run check`, `npm run build`, `npm test` 313 passed
- [ ] 텔레그램 수동 QA: 5개 명령 + 작업 시작/완료 알림
- [ ] `/agents` UI 수동 QA: 카드 → 모달 → 진행 표시
- [x] OpenClaw 자동 탐지 + 실제 API 연동 fallback (Phase 3, 2026-05-01)
- [x] 권한 단계 2 구현 (텔레그램 실행 승인, 5분 타임아웃)
- [ ] 권한 3단계 완전 자동 실행 운영 검증
- [x] 모닝브리핑에 어제 에이전트 결과 통합 (Phase 4, 2026-05-01)
  - 완료/실패 작업과 wiki fallback 스캔 통합
  - 신규/보강 테스트 10개, 전체 `npm test` 340 passed
  - 서버 재시작 후에도 `AGENT_WIKI_PATH` 파일명 기반으로 전일 결과 표시

# 2026-05-01 OpenClaw 자동 탐지 및 연동 (Phase 3)

- [x] `scripts/detect-openclaw.ts` 추가 및 `data/openclaw-discovery.json` 저장
- [x] `server/agents/openclawClient.ts` 추가: 인증/엔드포인트/payload/응답 포맷 자동 fallback
- [x] OpenClaw 미탐지 또는 호출 실패 시 시뮬레이션 결과 성공 fallback
- [x] `AGENT_PERMISSION_LEVEL=2` 기본값 + Telegram 승인/거부 callback 추가
- [x] `/api/agents/health` 및 `/agents` 상태 배지 추가
- [x] 테스트 17개 신규/보강, 전체 `npm test` 330 passed
- [ ] 실제 OpenClaw 실행 상태에서 재탐지 및 smoke test
- [x] 모닝브리핑에 전일 에이전트 결과 통합

# 2026-05-01 딜 마감일/이정표 관리 (Phase B-4)

- [x] DealMeta deadline/milestones 필드 + 자연어 날짜 파싱 + 모닝브리핑 D-day 표시
  - `server/deals/dateParser.ts` 76줄, 텔레그램 5개 명령 추가, 모닝브리핑 진행 중 딜 섹션 D-day 강조
  - 검증: `npm run check`, `npm run build`, `npm test` 292 passed
- [ ] 텔레그램 수동 QA: `딜 마감`, `딜 이정표 추가/완료/삭제`, 모닝브리핑 D-day 출력
- [ ] D-3/D-7 임박 자동 푸시 알림 (별 작업)
- [ ] 카톡/Gmail 첨부에서 마감일 자동 추출 (LLM)

# 2026-05-01 딜 브리핑 + Telegram Bot 분할 업데이트

- [x] 모닝브리핑에 `📁 진행 중 딜` 섹션 추가
  - 자료 0건, completed/rejected 딜 제외
  - KST 기준 어제 추가된 파일 수를 카테고리 폴더 mtime으로 계산
  - NotebookLM 연결 여부 표시
- [x] `server/llm/telegram-bot.ts` 분할
  - legacy 파일은 2줄 re-export로 유지
  - `telegramBot/index.ts`, `commands.ts`, `messageRouter.ts`, `callbackRouter.ts`, `workspaceCommands.ts`, `utils.ts` 추가
- [x] 검증 완료: `npm run check`, `npm run build`, `npm test` (276 passed)
- [ ] 실제 Telegram에서 `브리핑 테스트` 입력 후 딜 섹션 운영 화면 확인
- [ ] 실제 Telegram에서 딜/카톡/Gmail/다운로드 콜백/승인 콜백 각 1회 수동 QA
# 2026-05-02 PF Google Sheets Sync

- [x] 진행 중 PF 딜 Google Sheets 대시보드 동기화 구현 완료
  - `server/_core/googleSheets.ts` 추가
  - `server/deals/dealSheetSync.ts` 추가
  - 06:30 KST 스케줄러 등록
  - 딜 변경 시 fire-and-forget 동기화 트리거 연결
  - `딜 시트` 텔레그램 명령 추가
  - 실제 Google Sheets API 동기화 성공 확인
- [ ] 텔레그램 실사용 화면에서 `딜 시트` 응답 확인
- [ ] 시트 조건부 서식(D-day 색상) 필요 시 후속 Phase에서 추가
- [ ] 완료/거절 딜 분리 아카이브 시트는 다음 Phase로 보류

# 2026-05-02 Phase 6 D-day Conditional Format

- [x] Aston-Deals-Dashboard D-day 조건부 서식 자동 적용 완료
- [x] 헤더 회색 배경/흰 글씨/굵게, 컬럼 너비 자동 조정 적용
- [x] `data/google-sheets.json`에 `formatAppliedAt` 저장
- [x] `딜 시트 서식` 텔레그램 명령 추가
- [x] 실제 Google Sheets API 호출로 규칙 3개 + 헤더 서식 적용 확인
- [ ] 텔레그램 실사용 화면에서 `딜 시트 서식` 응답 QA
- [ ] 다음 Phase 후보 결정
  - 완료/거절 딜 아카이브 시트 분리
  - D-day 조건부 서식 색상 미세조정
  - 시트 역방향 동기화
# 2026-05-02 OpenClaw 실제 연동 활성화 (Phase 7)

- [x] OpenClaw 자동 재탐지 및 `data/openclaw-discovery.json` 갱신
- [x] `~/.openclaw/openclaw.json`에서 gateway token 자동 발견
- [x] `.env`에 `OPENCLAW_API_URL`, `OPENCLAW_API_KEY`, `OPENCLAW_REQUEST_TIMEOUT_MS=60000`, `AGENT_PERMISSION_LEVEL=2` 반영
- [x] `gateway-rpc` 기반 실제 연동 경로 구현 (`sessions.create -> sessions.send -> agent.wait -> chat.history`)
- [x] `/api/agents/health`에서 실연동 상태 노출 확인
- [x] 앱 재기동 후 live `/api/agents/health`가 `available=true`, `simulationMode=false` 응답
- [ ] OpenClaw 모델 응답 timeout 원인 추가 확인
- [ ] 실제 텔레그램 에이전트 요청 1건으로 60초 내 응답 완료 재검증

# 2026-05-02 OpenClaw 재탐지 + Gemini 재사용 보강

- [x] OpenClaw 재탐지/설정 파일 스캔/Smoke 결과 저장 구조 보강 완료
  - `data/openclaw-discovery.json`, `data/openclaw-smoke.json` 저장 구조 확장
  - `.openclaw/openclaw.json`, `.openclaw/config.json` 존재 여부와 모델 힌트 기록
  - 수동 URL 실패 시 자동 재탐지 재시도
- [x] Aston `GEMINI_API_KEY` 재사용 경로 보강 완료
  - OpenClaw HTTP payload에만 메모리 전달, 로그/텔레그램/UI/결과 파일 노출 금지
  - `GOOGLE_API_KEY`는 예비 fallback로만 확인
- [x] Agent Health / Telegram / Agent UI 상태 표시 보강 완료
- [x] NotebookLM `notebook-query` 템플릿 지시문 보강 완료
- [ ] OpenClaw 실제 실행 환경에서 인증 방식 정리
  - 현재 `.env`의 `OPENCLAW_API_URL=http://openclaw.local` 기준 `health 인증 확인 실패`
  - 실제 Gateway/HTTP auth 방식과 유효 URL 재확인 필요
- [ ] OpenClaw 실제 응답 성공 후 smoke 재실행
  - 1차 `1+1은?`
  - 2차 `한남동 부동산 시세를 한 줄로 요약해줘`

# 2026-05-02 문서화

- [x] `docs/ARCHITECTURE.md` 추가
  - 현재 코드 기준 전체 구조, Mermaid 5개, 요청서 대비 실제 구현 차이 반영
- [x] `README.md` 재정비
  - Aston Workstation 정체성, Quick Start, 명령어, 문서 링크, 제약 요약 반영
- [x] `Aston Workstation` 3계층 구조 문서 반영
  - `Command Channel` / `Knowledge Core` / `Execution Modules` 정의를 `docs/ARCHITECTURE.md`, `README.md`, `AGENTS.md`, `CLAUDE.md`에 동기화
- [x] `AI 채팅` 라우팅 점검
  - `docs/diagnostics/ai-chat-routing.md`에 웹/Telegram/빠른 명령 실제 코드 경로 진단 기록
- [ ] `Wiki` 검색 명령 연결
- [ ] `NotebookLM` 질의 명령 연결
- [ ] PF 분석 직원 1호 JD 작성
  - 대상 파일: `docs/employees/pf-analyst.md`
- [ ] 진단서 결과 기반 보완 작업 선정
  - `docs/diagnostics/ai-chat-routing.md`의 8절, 10절 기준으로 우선 보완 작업 확정


## 2026-05-02 Home ?? ?? ?? ??

- [x] ?? ?? ?? ???
  - `Home`? ?? ?? 5?? `prefill`? ?? ?? `/chat`?? ?? ????? ??
- [ ] `NotebookLM` ??? ??? ??
- [ ] `Sheets` ??? ??? ??
- [ ] `?? ?? ???` ??? ??
- [ ] `fallbackIntent` ?? ?? ??
- [ ] `Monitoring` ??? ??

## 2026-05-03 운영 문서 정리

- [x] 작업일지 / TODO / 인수인계 최신화
  - `Home` 빠른 명령 5개 즉시 실행화 작업을 기준으로 오늘 상태 재정리
- [x] `NotebookLM` 자연어 라우팅 연결 (2026-05-06)
- [x] `Sheets` 자연어 라우팅 연결 (2026-05-06, 읽기 액션 추가)
- [x] `오늘 일정 브리핑` 라우팅 수정 (2026-05-06, `google_today_events` 신규)
- [x] `fallbackIntent` 명시 규칙 정리 (2026-05-06, 메일 요약·Telegram 최근 메시지 명시 규칙 추가)
- [x] `Monitoring` 라우팅 연결 (2026-05-06, `monitoring_status` 신규)

## 2026-05-06 AI 채팅 라우팅 5종 보완 잔여

- [ ] 텔레그램 실사용 QA — 6개 명령 응답 확인
  - `노트북 한남동644 사업성 요약`
  - `시트 읽기` (또는 `시트 조회`)
  - `오늘 일정 브리핑`
  - `오늘 메일 요약`
  - `Telegram 최근 메시지` (웹 채팅)
  - `모니터링`
- [ ] `WORKSPACE_SPREADSHEET_ID` 환경변수 누락 시 사용자 안내 메시지 운영 확인
- [ ] NotebookLM MCP 서버 미가동 시 `노트북 ...` 응답 메시지 운영 확인
- [ ] 진단서 §8 잔여 이슈
  - `한남 PF 진행상황`에서 `한남` 개별 딜 파싱
  - 웹 `trpc.intent.route` 응답에서 `data` 포맷 누락(파일/메일/이벤트 목록) 보완
  - 웹/Telegram 라우팅 경로 통합 (`handleWorkspaceCommand` ↔ `routeIntentMessage` 이중화)
  - `chatSyncRouter.getMessages` ownership check TODO 처리

