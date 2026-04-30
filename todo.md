# TODO.md — 에스턴 워크스테이션
> 업데이트: 2026-04-30 | 브랜치: codex-google-workspace-expansion

---

## P0 Stabilization (즉시 해결 필요)

- [ ] **Yahoo Finance CORS 이슈 대응**
  - `query1.finance.yahoo.com` 브라우저 직접 호출이 차단될 수 있음
  - 서버 프록시 엔드포인트 추가: `/api/yahoo-proxy`
  - 한국주식/미국주식/선물 탭에 적용

- [ ] **Google Workspace 운영 준비**
  - Google Cloud 프로젝트에서 Sheets API, Drive API 활성화 확인
  - OAuth 재연결로 신규 스코프 및 refresh token 확보
  - Gmail · Calendar · Drive · Sheets 연결 진단 패널 추가

- [ ] **웹 채팅 end-to-end QA**
  - 단일 전송 검증: Enter · 전송버튼 · 빠른명령 · 음성입력
  - 대화 초기화 · 수정 · 삭제 · 검색 · 내보내기 · Telegram 동기화 후 회귀
  - 중복 메시지 억제 및 인텐트 폴백 회귀 테스트

- [ ] **Upbit 잔고 Telegram 응답 검증**
  - 서버 side 수정 완료 (exchangeConnector + intentService)
  - 텔레그램에서 "업비트 잔고" 실제 메시지 전송 후 응답 확인 필요

---

## P1 Core Modules (이번 주 처리)

- [ ] **intentService.ts 도메인별 분리** (CLAUDE.md §9)
  - 현재 900줄+ — 단일 파일 500줄 상한 위반
  - 분리 대상: `intent/trading.ts`, `intent/google.ts`, `intent/general.ts`
  - `IntentAction` 유니온 타입은 `intent/types.ts`로 이동
  - `parseXxxMessage()`/`formatXxx()`는 해당 도메인 모듈로 이동

- [ ] **Gemini Grounding 소스/인용 UI**
  - 임시 citation 텍스트를 구조화된 메시지 메타데이터로 이동
  - 답변 하단에 소스 칩/카드 렌더링
  - 서버 측 grounding 로그 유지 (감사/디버그용)

- [ ] **대시보드 실시간 데이터 정확도**
  - 홈 KPI 카드의 mock 값 → Gmail · Calendar · Telegram · 트레이딩 · PF 실제 카운트로 교체
  - 서비스별 로딩/에러/비활성 상태 표시

- [ ] **Telegram 운영 검증**
  - 현재 환경에서 webhook/polling 모드 확인
  - Telegram 상태 엔드포인트 추가 및 UI 뱃지
  - 최신 채팅 변경 이후 Web↔Telegram 왕복 테스트

- [ ] **Google Sheets 워크스페이스 스키마**
  - 필수 워크시트 정의: PF 딜, 트레이딩 알림, 워크스페이스 노트, 감사 로그
  - 누락 탭 자동 생성 후 로컬 워크스페이스 config에 탭명 저장
  - 모든 Sheets 읽기/쓰기를 저장된 탭명(quoted) 기준으로 정규화

- [ ] **TradingView 위젯 로딩 속도 개선**
  - 탭 전환 시 위젯 재로드 딜레이 최소화 방안 검토

---

## P2 Practical Automation (P0·P1 완료 후)

- [ ] **에러/복구 UX 개선**
  - provider 에러를 generic 토스트 대신 액션 카드로 통합
  - OAuth refresh · API 활성화 지연 · 네트워크 실패에 대한 재시도 액션 추가
  - 전역 토스트 중복 제거 규칙 검토

- [ ] **테스트 및 CI 강화**
  - 외부 Telegram 토큰 테스트를 기본 `npm test`에서 분리
  - Gemini grounding request payload 검증을 위한 mock 테스트 추가
  - 빌드 스모크 체크: `/` `/chat` `/google?tab=sheets` `/trading` `/real-estate-pf` `/monitoring` `/settings`

- [ ] **코인 탭 프리셋 확장**
  - SOL · BNB · XRP · DOGE 등 알트코인 추가 프리셋

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
