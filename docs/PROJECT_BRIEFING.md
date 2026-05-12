# Aston Workstation – 전체 프로젝트 브리핑

> 이 문서는 모든 새 AI 세션의 진입점입니다. 작업 시작 전 반드시 읽으십시오.
> 최종 갱신: 2026-04-30 / Phase 1a 완료 시점

## 1. 프로젝트 개요
Aston Workstation은 100억~1000억 규모 부동산 PF(프로젝트 파이낸싱) 및 암호화폐 투자를 운영하는 회장이 사용하는 통합 AI 업무 허브입니다. 웹 대시보드와 텔레그램 봇 두 채널로 접근하며, 하나의 Node.js 서버가 모든 기능을 처리합니다.

## 2. 기술 스택
- 프론트엔드: React + TypeScript + Vite (localhost:4000)
- 백엔드: Node.js + Express + tRPC
- AI: Google Gemini API (요약, 분류, 채팅)
- 메시징: Telegram Bot API (polling 방식)
- 거래소: Upbit (API key 인증), Binance (public REST API, fetch 직접 호출)
- 구글 연동: OAuth 2.0 -> Gmail, Calendar, Drive
- 외부 데이터: DART API (공시), Yahoo Finance
- 빌드: npm run check -> npm run build -> npm run dev
- 브랜치: codex-google-workspace-expansion (main/master 미병합)

## 3. 디렉토리 구조

aston-workstation/
├─ client/src/
│   ├─ pages/           # 웹 페이지 (Home, Trading, Wiki, NotebookLM, Settings 등)
│   └─ components/      # UI 컴포넌트 (둥근 모서리 카드, lucide-react 아이콘)
├─ server/
│   ├─ intent/
│   │   └─ intentService.ts   # 텔레그램 메시지 -> 인텐트 라우팅 (>900줄, 분리 필요)
│   ├─ trading/
│   │   ├─ preCheckEngine.ts   # 트레이딩 사전점검 (RSI, BB, 펀딩비, 김프, Risk Guard)
│   │   └─ riskGuard.ts        # 리스크 가드 (-3% 일일손실, 3연패 잠금)
│   ├─ google/                 # Gmail, Calendar, Drive 연동
│   ├─ finance/                # Yahoo Finance, 시세 조회
│   ├─ realestate/             # DART 공시
│   ├─ wiki/                   # Phase 1a 완료 (저장/검색)
│   ├─ intelligence/           # [Phase 1b/1c 예정] 자동 수집·요약·브리핑
│   ├─ llm/
│   │   └─ telegram-bot.ts     # 텔레그램 봇 메인
│   ├─ exchanges/              # Upbit API 연동
│   ├─ _core/                  # 도메인 간 공유 유틸
│   └─ __tests__/              # vitest 테스트
├─ wiki/                       # 미사용 (외부 G:\내 드라이브\Aston-Wiki\ 사용)
├─ docs/
│   ├─ PROJECT_BRIEFING.md    # 이 문서
│   ├─ tasks/                  # 완료된 CURRENT_TASK 아카이브
│   └─ superpowers/specs/      # 설계 문서
├─ CLAUDE.md                   # Claude Code 규칙
├─ AGENTS.md                   # Codex 규칙 (CLAUDE.md와 동기화)
├─ TODO.md                     # 우선순위별 작업 목록 (권위 출처)
├─ CHANGELOG.md                # 변경 이력
├─ HANDOFF.md                  # 세션 간 인수인계
├─ CURRENT_TASK.md             # 단일 작업 지시서
└─ .env                        # API 키 (git 제외)

## 4. 완성된 기능

### 4-1. 트레이딩 사전점검 (Pre-Check Engine)
텔레그램에서 "BTC 숏 77000 손절 78500 목표 74000" 입력 시, 서버가 자동으로 Binance/Upbit API를 fetch로 직접 호출하여 RSI(1h/4h), 볼린저 밴드, 펀딩비, 24시간 거래량, 김치프리미엄, Risk Guard 상태를 계산하고, 손익비와 함께 ✅/⚠️/🚫 판정을 텔레그램으로 응답. exchangeConnector(ccxt)는 완전히 제거되고 모든 외부 API는 fetch로 직접 호출.

### 4-2. Risk Guard
일일 -3% 손실 도달 시 거래 중지, 3연속 손절 시 자동 잠금. 상태는 data/risk-state.json에 저장. 11개 vitest 테스트 통과.

### 4-3. Google Workspace
텔레그램에서 "메일 확인" -> 최근 5개 Gmail 요약, "일정 추가 내일 3시 회의" -> Google Calendar 이벤트 생성. OAuth 2.0 인증 완료.

### 4-4. 텔레그램 봇
intentService.ts가 메시지를 파싱하여 인텐트(trading_pre_check, google_mail, google_calendar, wiki_save, wiki_search 등)로 라우팅. 신뢰도 기반 매칭(0.95 이상). 응답은 한국어 텍스트 + 이모지만 허용, JSON 반환 금지.

### 4-5. 웹 대시보드
KPI 카드(일정, 메일, 텔레그램, 자산, PF, 알림), Trading 페이지(TradingView 위젯, lightweight-charts, Risk Guard 카드, 포트폴리오), 모니터링(메시지 통계, 응답 시간, Web/Telegram 비율). UI는 둥근 모서리 카드/버튼, 호버 시 cyan 효과, lucide-react SVG 아이콘으로 통일.

### 4-6. Aston Wiki Phase 1a (2026-04-30 완료, 커밋 225acb0)
텔레그램에서 "위키 저장 {본문} #카테고리" 입력 시 Google Drive(WIKI_ROOT)에 마크다운 파일로 저장. "위키 검색 {질의}" 또는 "위키 검색 #카테고리 {질의}"로 substring 검색. 한->영 카테고리 매핑 (#부동산->realestate, #서울->seoul). 25개 vitest 테스트 통과. 검증 완료(텔레그램 5개 시나리오 전부 통과, Google Drive .md 파일 생성 확인).

## 5. 미구현 기능 (우선순위순)

### P1 - 이번 주 내

**Phase 1b: 모닝 브리핑 (다음 작업)**
node-cron으로 매일 오전 정해진 시각에 텔레그램으로 자동 브리핑 발송. 범위 결정 대기 중:
- (가) 최소 - Wiki 메모만 요약
- (나) 확장 - Wiki + 시장 데이터(BTC/RSI/펀딩비/김프) + DART 공시 [참모 권장]
- (다) 풀세트 - 위에 + Gemini 종합 의견

**Phase 1c: MTProto 텔레그램 방 수집**
회장이 참여한 ~20개 전문가 그룹의 메시지를 수집 -> Gemini 요약/분류/중요도 채점 -> Aston Wiki 저장 -> 모닝 브리핑에 포함. OTP 인증·세션 관리 리스크가 있어 1b 이후 진행.

**기타 P1**
- TradingView 웹훅 수신 서버
- NotebookLM 페이지 (프롬프트 템플릿 + 외부 링크 모음, 복잡한 통합 안 함)
- intentService.ts 도메인 분리 (>900줄 -> 500줄 이하로)

### P2 - 이번 주~다음 주
- 텔레그램 승인 모드 (웹훅 -> AI 판단 -> ✅/❌ 버튼)
- 자동 주문 실행 (ccxt -> Upbit)
- 부동산 PF Google Sheets 연동
- 트레이딩 일지 자동 기록
- Puppeteer 텔레그램 스크린샷

### P3 - 추후
- VPS 배포 (AWS Lightsail), PM2, 도메인 + HTTPS
- 모니터링 알림
- Obsidian 마크다운 export 연동

## 6. 아키텍처 규칙 (CLAUDE.md / AGENTS.md 공통)
- 도메인 분리: server/trading, server/google, server/realestate, server/finance, server/intelligence, server/wiki, server/intent(라우팅만)
- 도메인 간 직접 import 금지 -> server/_core/ 경유
- 컨벤션: 파일명 camelCase, 함수명 camelCase 동사, 타입 PascalCase, try-catch 필수 + console.error, 사용자 메시지 한국어만
- 파일 크기: 500줄 초과 금지
- 외부 API: fetch 직접 호출 (exchangeConnector/ccxt 사용 금지)
- 텔레그램 응답: 한국어 텍스트 + 이모지만, JSON 반환 금지
- 테스트: server/__tests__/{module}.test.ts, vitest

## 7. 운영 체계
- **CURRENT_TASK.md**: 단일 작업 지시 파일. "현재작업" 명령으로 실행 -> 완료 후 docs/tasks/로 아카이브 -> 빈 템플릿으로 초기화
- **자율 결정 원칙**: 디테일은 AI 자율 결정, 회장에게 전략만 묻기
- **자동 명령어**: 작업준비 / 작업정리 / 커밋 / 현재작업
- **개발 도구**: Claude Code(CLAUDE.md), OpenAI Codex(AGENTS.md) 병행 사용

## 8. 환경변수 (.env)

UPBIT_ACCESS_KEY=
UPBIT_SECRET_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
GEMINI_API_KEY=
TELEGRAM_API_ID=       # MTProto (Phase 1c)
TELEGRAM_API_HASH=     # MTProto (Phase 1c)
TELEGRAM_PHONE=        # MTProto (Phase 1c)
TELEGRAM_CHANNEL_IDS=  # 수집 대상 채널 목록
WIKI_ROOT=G:\내 드라이브\Aston-Wiki   # Windows
# WIKI_ROOT=/var/aston/wiki           # VPS

## 9. 현재 Git 상태
- 브랜치: codex-google-workspace-expansion
- 최신 커밋: 225acb0 (Phase 1a 완료, 2026-04-30)
- main/master 미병합
- 빌드: 정상

## 10. 새 AI 세션 시작 시 가이드

1. 이 문서를 먼저 읽는다.
2. CLAUDE.md 또는 AGENTS.md (자기 도구 기준) 규칙을 읽는다.
3. TODO.md, HANDOFF.md, CHANGELOG.md로 현재 상태 파악.
4. CURRENT_TASK.md를 읽고 지시 사항대로 작업.
5. 자율 결정 원칙에 따라 디테일은 스스로 결정.
6. 완료 후 작업정리 + 커밋 + push.
