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

- [x] **intentService.ts 도메인별 분리** (CLAUDE.md §9) — 완료 2026-05-01
  - 1511줄 → 192줄 (intentService.ts), 6개 도메인 핸들러 + types/registry/fallback 분리
  - `server/intent/handlers/{trading,realestate,finance,google,intelligence,wiki}.ts`
  - 모든 신규 파일 500줄 이하, 160 tests passed

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
