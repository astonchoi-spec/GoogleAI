# Aston Workstation

회장 전용 한국어 Executive Command Center

`astonchoi-spec/GoogleAI`는 코드베이스명이고, 제품명은 `Aston Workstation`이다. 이 저장소는 회장 전용 업무 운영체계를 목표로 하며, 웹 대시보드와 `Telegram Bot`, `Google Workspace`, 멀티 LLM, `OpenClaw` 자동화를 한 서버에서 묶는다.

## 1. 무엇인가

`Aston Workstation`은 회장님의 PF 딜, 트레이딩, 메일/일정, 지식 저장, 에이전트 자동화를 한 화면과 한 명령 체계로 연결하는 업무 지휘본부다. `gemini`, `codex`, `claude`, `gemma4`를 선택적으로 사용하고, `Google Workspace`, `Telegram`, `OpenClaw`, `NotebookLM` 연계 경로를 포함한다. 상세 구조는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)를 기준 문서로 본다.

## 2. 앱 중심축

`Aston Workstation`의 중심은 `AI 채팅`이며, `NotebookLM`과 `Aston Wiki`가 지식 코어, 나머지 기능은 `AI 채팅`이 호출하는 실행 모듈이다.  
`1계층 Command Channel`은 `Web AI Chat`, `Telegram Chat Sync`, `Quick Command Buttons`, `Natural Language Intent Routing`으로 구성된다.  
`2계층 Knowledge Core`는 `NotebookLM`, `Aston Wiki`, `Aston-Deals Folder`, `Google Drive`, `Google Sheets`다.  
`3계층 Execution Modules`는 `Real Estate PF`, `Trading`, `Google Workspace`, `Agent Control`, `Monitoring`과 직원 에이전트들이다.  
모든 업무는 `1계층`에서 시작해 `2계층`에서 근거를 찾고 `3계층`이 처리한다.  
상세 구조는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)를 본다.

## 3. 핵심 기능

- PF 딜 관리: `Deal Folder`, 메타데이터, 자료 정리, `Google Sheets` 대시보드 동기화
- 자동 자료 수집: 카카오톡, Gmail, 다운로드 폴더 watcher 기반 분류
- `06:30` 모닝 브리핑: 딜, 위키, 에이전트 결과, 일정성 정보 집계
- Agent Control: `OpenClaw` 또는 시뮬레이션 fallback 기반 AI 직원 실행 큐
- RiskGuard: 거래 잠금, 손실 한도, 승인 기반 주문 통제
- NotebookLM 허브: 딜 자료와 연계한 조사/질의 진입점
- Aston Wiki: 회장 업무 메모와 운영 지식 저장소

## 4. 기술 스택

| 레이어 | 기술 |
|---|---|
| Frontend | `React` + `TypeScript` + `Vite` |
| Backend | `Node.js` + `Express` + `tRPC` |
| DB | `SQLite/libSQL` + `drizzle ORM` |
| LLM | `Gemini`, `OpenAI`, `Anthropic`, `Ollama` |
| Integration | `Google OAuth`, `Telegram Bot`, `OpenClaw` |

## 5. Quick Start

### 요구사항

- `Node.js >=24.14.1 <25`
- `npm >=11 <12`

### 실행 순서

```bash
git clone https://github.com/astonchoi-spec/GoogleAI.git
cd GoogleAI
npm install
copy .env.example .env
npm run dev
```

- `.env`는 `.env.example`을 기준으로 작성한다.
- 개발 서버는 `3000`부터 시작해서 사용 가능한 포트를 최대 20개 범위에서 자동 탐색한다.

## 6. 필수 환경 변수

- `JWT_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GEMINI_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `OWNER_TELEGRAM_CHAT_ID`
- `WIKI_ROOT`
- `DEALS_ROOT`

전체 목록은 [docs/ARCHITECTURE.md#17-환경-변수-전체](docs/ARCHITECTURE.md#17-환경-변수-전체)를 본다.

## 7. 주요 명령어

- `npm run dev`: 개발 서버 실행
- `npm run build`: 프론트 빌드 + 서버 번들 생성
- `npm run check`: 모듈 경계 검사 + `TypeScript` 타입 체크
- `npm test`: `vitest` 테스트 실행

## 8. 프로젝트 구조

- `client/`: `React` 프론트엔드와 UI 라우팅
- `server/`: `Express`, `tRPC`, 도메인 모듈, 외부 연동
- `data/`: 로컬 DB와 운영 메타데이터 저장
- `docs/`: 구조 문서, 작업 기록, 설계 메모
- `scripts/`: 점검, 탐지, 운영 보조 스크립트

자세한 구조는 [docs/ARCHITECTURE.md#5-프론트엔드-구조](docs/ARCHITECTURE.md#5-프론트엔드-구조), [docs/ARCHITECTURE.md#6-서버-구조](docs/ARCHITECTURE.md#6-서버-구조), [docs/ARCHITECTURE.md#13-도메인-모듈](docs/ARCHITECTURE.md#13-도메인-모듈)을 본다.

## 9. 문서 안내

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): 전체 기술 구조
- [AGENTS.md](AGENTS.md): Codex 운영 규칙
- [CLAUDE.md](CLAUDE.md): Claude 운영 규칙
- [CHANGELOG.md](CHANGELOG.md): 작업 변경 이력
- [HANDOFF.md](HANDOFF.md): 인수인계와 다음 작업
- [TODO.md](TODO.md): 우선순위와 남은 과제

## 10. 알려진 제약

- `admin` / `admin123` 로그인 하드코딩이 남아 있다.
- 초기 `4`개 라우트 중심 문맥과 현재 사이드바 `13`개 메뉴 운영 화면 사이 갭이 남아 있다.
- `server/intent/intentService.ts` 관련 파일 크기 제한 이슈가 문서상 후속 관리 대상이다.
- `OpenClaw`는 미탐지 또는 인증 실패 시 시뮬레이션 fallback으로 동작한다.

자세한 제약은 [docs/ARCHITECTURE.md#18-security-notes](docs/ARCHITECTURE.md#18-security-notes), [docs/ARCHITECTURE.md#19-known-weaknesses](docs/ARCHITECTURE.md#19-known-weaknesses)를 본다.

## 11. 라이선스 / 비공개 안내

- 저장소 메타데이터상 라이선스 표기는 `MIT`다.
- 다만 이 프로젝트는 회장 전용 운영 시스템 기준으로 관리되는 비공개 업무 저장소다.

갱신일: `2026-05-02`  
다음 갱신 예정: `master` 머지 후
