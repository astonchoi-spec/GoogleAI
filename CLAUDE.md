# CLAUDE.md
> Claude Code용 작업 원칙 | 에스턴 워크스테이션

---
## 자동 실행 규칙

모든 작업 요청을 받으면 코드 수정 전에 반드시 다음을 먼저 수행하라:
1. TODO.md 읽기
2. CHANGELOG.md 읽기
3. HANDOFF.md 읽기
4. CLAUDE.md 읽기 (이 파일)

"작업준비" 또는 "작업:" 이라는 단어가 포함된 요청을 받으면 위 4개 파일을 자동으로 읽고 현재 상태를 한 줄로 요약한 뒤 작업을 시작하라.

---

## 자동 명령어

### "작업준비"
다음을 순서대로 자동 수행:
1. `git fetch origin` 실행 (원격 최신화)
2. `git log HEAD..origin/codex-google-workspace-expansion --oneline` 으로 원격에 새로 들어온 커밋 확인
3. 원격 신규 커밋이 있으면 `git pull --rebase origin codex-google-workspace-expansion` 실행 (충돌 시 사용자에게 보고 후 중단)
4. TODO.md, CHANGELOG.md, HANDOFF.md, CLAUDE.md 읽기
5. 현재 상태 요약 한 줄 출력 (브랜치, HEAD 커밋, 진행 중 작업, 다음 추천 작업)

### "작업정리"
다음을 자동 수행:
1. `git status` + `git log --oneline -5` 로 현재 변경분 파악
2. CHANGELOG.md에 오늘 날짜로 작업 내역 추가 (날짜 | 도구 | 작업 | 수정파일 | 검증결과 | 잔여이슈)
3. TODO.md에서 완료 항목 체크, 새로 발견된 이슈 추가
4. HANDOFF.md 갱신 (현재상태, 마지막완료, 진행중, 주의영역, 다음추천)
5. 결과 요약 출력

### "커밋"
작업정리 수행 후, 변경분을 논리적 단위로 나눠 커밋 (feat/fix/docs 프리픽스 사용). 커밋 후 반드시 git push origin 현재브랜치 실행.

### "현재작업"
다음을 순서대로 자동 수행:
1. 프로젝트 루트에 `CURRENT_TASK.md`가 존재하는지 확인한다.
   - **없으면 즉시 중단**: "CURRENT_TASK.md가 없습니다" 라고 보고하고 작업하지 않는다.
2. `CURRENT_TASK.md`를 읽고 작업 지시 내용을 파악한다.
3. `git fetch origin` 실행 후 `git log HEAD..origin/codex-google-workspace-expansion --oneline` 으로 원격 신규 커밋 확인. 있으면 `git pull --rebase` (충돌 시 보고 후 중단).
4. `TODO.md`, `CHANGELOG.md`, `HANDOFF.md`를 읽어 현재 상태를 확인한다.
5. `CURRENT_TASK.md`에 명시된 범위 내 작업만 수행한다. 범위 밖 작업은 하지 않는다.
6. 작업 완료 후 `npm run check && npm run build`를 실행한다.
7. `TODO.md`, `CHANGELOG.md`, `HANDOFF.md`를 갱신한다.
8. 변경분을 논리 단위로 커밋하고 `git push origin 현재브랜치`를 실행한다.
9. 결과만 요약 보고한다.

---

## CURRENT_TASK.md 운영 규칙

- `CURRENT_TASK.md`는 프로젝트 루트에 두는 **현재 작업 지시서**다.
- 작업 지시·범위·완료 조건을 명시한다.
- **"현재작업" 명령은 이 파일이 없으면 실행하지 않는다.**
- 작업이 끝나면 이 파일을 삭제하거나 내용을 비워 완료 상태임을 표시한다.
- `.gitignore`에 추가하지 않는다 — Codex·Claude Code 모두 공유해야 한다.

---

---

## 1. 프로젝트 정체성

**에스턴 워크스테이션(Aston Workstation)**은 한국어 우선 Executive Command Center다.
목적은 기능 과시가 아니라 회장님의 일상 업무 부담을 줄이는 것이다.

다루는 도메인:
- 가족 · 부동산 PF · 금융 트레이딩 · AI 워크스테이션
- 몽골 사업 · 회사 운영 · 법무/계약 · 리서치 · 개인 전략

이 앱은 코딩 실험이 아니라 **개인 비즈니스 운영체제**다.

---

## 2. 기술 스택

| 레이어 | 기술 |
|--------|------|
| 프론트엔드 | React + TypeScript + Vite |
| 백엔드 | Node.js + tRPC |
| 상태관리 | Redis (FSM 기반 세션) |
| AI | Gemini API (LLMAdapter 경유) |
| 인증 | Google OAuth 2.0 |
| 메시징 | Telegram Bot API (Webhook) |
| DB 대용 | Google Sheets API |

---

## 3. 핵심 파일 구조

```
server/_core/          → Redis, LLMAdapter, tRPC core
server/trpc/routers/   → 도메인별 tRPC 라우터
server/intent/         → 인텐트 파싱 및 실행 (intentService.ts)
server/exchanges/      → 거래소 커넥터 (Binance/Upbit/Gate/Bybit)
server/google/         → Google Workspace 연동
server/realestate/     → 부동산 PF 엔진
server/finance/        → DART API
client/src/components/UnifiedChatInterface.tsx  → 메인 AI 채팅 UI
.env                   → 환경변수 (절대 커밋 금지)
.env.example           → 환경변수 템플릿
```

---

## 4. 공통 작업 원칙 (AGENTS.md와 CLAUDE.md 공유)

### 절대 금지

- 새 기능을 남발하지 않는다
- P0 안정화가 끝나기 전 P2 고급 자동화로 넘어가지 않는다
- 기존 UI · 라우터 · 컴포넌트를 삭제하지 않는다
- 기존 다크 테마(배경 #0a0e27 계열)와 한국어 UI를 임의로 변경하지 않는다
- 새 디자인 시스템을 만들지 않는다
- 대규모 리팩토링을 하지 않는다
- 새 외부 의존성을 추가하지 않는다
- 비밀키 · 토큰 · 개인정보를 코드에 하드코딩하지 않는다
- NotebookLM과 Aston Wiki는 현재 별도 앱이 아니라 내부 모듈이다. 별도 앱으로 분리하지 않는다

### 필수 작업 규칙

1. 작업 시작 전 **TODO.md**와 **CHANGELOG.md**를 먼저 확인한다
2. 관련 파일을 먼저 읽고 수정한다
3. 요청 범위를 벗어나지 않는다
4. 한 번에 하나의 작업만 한다
5. **Codex와 Claude Code가 동시에 같은 파일을 수정하지 않는다** — HANDOFF.md 확인 필수
6. 완료 후 CHANGELOG.md와 HANDOFF.md를 갱신한다
7. 가능하면 `npm run check && npm run build`를 실행한다
8. 실패하면 실패 내용을 숨기지 말고 CHANGELOG.md에 기록한다
9. 작업은 작게, 검증 가능하게, 되돌릴 수 있게 한다

### 코드 수정 규칙

- 기존 파일을 삭제하거나 기능을 제거하지 않는다
- 기존 컴포넌트 수정 시 최소한의 변경만 한다
- tRPC 라우터는 `server/trpc/routers/`에 파일별 분리 후 appRouter에 등록
- Redis 인스턴스는 `server/_core/redis.ts`에서 import (새로 만들지 않는다)
- 새 환경변수 추가 시 `.env.example`에도 반드시 추가
- 모든 tRPC input은 zod로 검증
- TypeScript strict mode 준수

### Git 운영

- 중요한 작업 시작 전 현재 변경분을 먼저 커밋해 복구 지점을 만든다
- 큰 작업은 단계별로 쪼개서 커밋, 검증 결과를 커밋 메시지에 남긴다
- 커밋 전 `git status`로 포함 파일을 확인하고, 사용자 변경분을 임의로 되돌리지 않는다
- 커밋 메시지 형식: `feat|fix|docs|chore: 한글 설명`

---

## 5. Claude Code-specific Rules

### "현재작업"
1. git fetch origin 실행
2. git log HEAD..origin/현재브랜치 --oneline 으로 원격 변경 확인. 변경 있으면 git pull --rebase 실행.
3. CLAUDE.md, TODO.md, CHANGELOG.md, HANDOFF.md, docs/PROJECT_BRIEFING.md를 읽어 현재 상태 파악.
4. CURRENT_TASK.md 읽기. 상태가 "없음"이면 "CURRENT_TASK.md에 작업 지시 없음" 보고하고 종료.
5. CURRENT_TASK.md 지시서대로만 작업. 범위 밖 작업 절대 금지.
6. 자율 결정 원칙 적용 (아래 섹션 참조).
7. 완료 후 npm run check && npm run build 실행.
8. 완료된 지시서를 docs/tasks/YYYY-MM-DD-{slug}.md 로 아카이브.
9. CURRENT_TASK.md를 빈 템플릿으로 초기화 (상태: 없음).
10. TODO.md, CHANGELOG.md, HANDOFF.md 갱신.
11. 논리 단위로 커밋 + git push origin 현재브랜치.
12. 결과 요약 보고.

### "커밋"
작업정리 수행 후, 변경분을 논리 단위(feat/fix/docs)로 커밋. 커밋 후 반드시 git push origin 현재브랜치 실행.

## 자율 결정 원칙
구현 디테일(슬러그 규칙, 정규식, 변수명, 에러 문구, 정렬 순서, 파일 포맷 세부사항, frontmatter 필드, 충돌 처리 방식, 카테고리 매핑 초기 테이블 등)은 AI가 자율 결정한다. 회장에게 묻지 않는다.

회장에게 묻는 것은 전략 방향(저장 위치, 인터페이스, 작업 범위, 우선순위)뿐이다. 회장 시간을 디테일에 쓰지 않는다.

판단이 갈리는 디테일은 일반적인 베스트 프랙티스를 따른다. 결정 근거를 작업 보고서에 짧게 남긴다.

- **작업 영역**: 진단/디버깅, 문서 정리, 소규모 서버 수정, 빌드 검증, 인텐트 서비스 수정
- 작업 전 항상 HANDOFF.md를 읽어 Codex가 현재 작업 중인 파일을 확인한다
- 진단 명령(grep, curl, node -e) 결과를 그대로 보고하고, 지시 없이 추가 수정하지 않는다
- 사용자가 "다른 작업 하지 마라"고 하면 지시된 작업만 수행한다
- 완료 후 HANDOFF.md와 CHANGELOG.md를 갱신한다
- 보고는 한국어로 작성한다
- UI 화면에 영향을 주는 변경은 미리 알린다

---

## 6. 아키텍처 규칙

### 도메인 분리 (DDD)

| 도메인 디렉토리 | 책임 |
|----------------|------|
| `server/trading/` | 매매, 리스크(riskGuard/riskCalculator), 진입 점검(preCheckEngine), 기술적 분석, 거래일지 |
| `server/google/` | Gmail, Calendar, Drive, Sheets, OAuth |
| `server/realestate/` | 부동산 PF 엔진 (feasibility, dealPipeline) |
| `server/finance/` | DART API, 공시·주식 데이터 |
| `server/intent/` | 인텐트 파싱·라우팅 전용 (intentService.ts). **비즈니스 로직 금지** — 각 도메인 모듈을 호출만 한다 |
| `server/exchanges/` | 거래소 ccxt 커넥터(Binance/Upbit/Gate/Bybit). 인증 필요한 잔고/포지션/체결 전용 |
| `server/_core/` | Redis, LLMAdapter, tRPC core, intentRouter — 도메인 간 공통 인프라 |

**연결 규칙**:
- 도메인 간 직접 import 금지 (예: `trading/`이 `realestate/`를 import 금지)
- 공유가 필요하면 `server/_core/`를 거쳐 연결한다
- `intent/`는 모든 도메인을 호출할 수 있지만, 도메인은 `intent/`를 import하지 않는다 (단방향)

---

## 7. 코딩 컨벤션

- **파일명**: camelCase (예: `preCheckEngine.ts`, `riskGuard.ts`, `exchangeConnector.ts`)
- **함수명**: camelCase, 동사 시작 (예: `runPreCheck`, `formatPreCheck`, `getStatus`)
- **타입/인터페이스**: PascalCase (예: `PreCheckResult`, `RiskGuardState`, `IntentAction`)
- **상수**: SCREAMING_SNAKE_CASE (예: `KIMCHI_FX_RATE`, `KOREAN_TICKER_MAP`)
- **에러 처리**:
  - 외부 API/I/O 호출은 try-catch 필수
  - catch 블록에 `console.error("[모듈명] context:", e)` 필수 (디버깅용)
  - 사용자에게 노출되는 에러 메시지는 **한국어**만 (영문 스택 노출 금지, 예: "일부 데이터를 가져오지 못했습니다")
- **외부 API 호출**:
  - 공개 데이터(시세·펀딩·캔들 등)는 `fetch` 직접 사용 — `exchangeConnector` 경유 금지 (API 키 미설정 시 전부 실패)
  - 인증 필요한 데이터(잔고·포지션)만 `exchangeConnector` 사용
  - 각 fetch 호출은 독립적 try-catch (한 곳 실패가 다른 데이터 차단하지 않도록)
- **텔레그램 응답**:
  - `data` 필드 반환 금지 (JSON preview 노출됨)
  - 한국어 텍스트만 반환, 이모지로 시각 구분 (📋 📈 💰 🛡 ✅ ⚠️ 🚫 등)
  - `formatXxx()` 함수로 포맷 분리

---

## 8. 테스트 규칙

- **위치**: 모든 테스트는 `server/__tests__/` 한 곳에 모은다
- **파일명**: `{모듈명}.test.ts` (예: `riskGuard.test.ts`, `preCheckEngine.test.ts`)
- **신규 모듈 생성 시**: 테스트 파일 동시 생성 필수
- **최소 커버리지**: 핵심 함수의 정상 케이스 + 에러 케이스 (네트워크 실패, 잘못된 입력, 빈 응답)
- **테스트 도구**: vitest (`npm test`)
- **외부 의존(Telegram 토큰 등)**: 기본 `npm test`에서 분리 — 환경변수 가드로 skip 처리

---

## 9. 파일 크기 제한

- **단일 파일 500줄 초과 금지**. 초과 시 도메인/관심사별 분리 필수.
- **현재 위반 파일** (P1 분리 대상):
  - `server/intent/intentService.ts` — 900줄+ → `intent/trading.ts`, `intent/google.ts`, `intent/general.ts`로 분리 예정
- **분리 원칙**:
  - 핸들러는 도메인별 파일로
  - `IntentAction` 유니온 타입은 `intent/types.ts`에 모은다
  - `parseXxxMessage()`/`formatXxx()`는 해당 도메인 모듈로 이동
- **컴포넌트(client)도 동일 적용**: `UnifiedChatInterface.tsx`처럼 핵심 UI는 예외, 그 외는 500줄 초과 시 분리
