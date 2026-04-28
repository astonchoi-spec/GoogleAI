# AGENTS.md
> Codex용 작업 원칙 | 에스턴 워크스테이션

---
## 자동 실행 규칙

모든 작업 요청을 받으면 코드 수정 전에 반드시 다음을 먼저 수행하라:
1. TODO.md 읽기
2. CHANGELOG.md 읽기
3. HANDOFF.md 읽기
4. AGENTS.md 읽기 (이 파일)

"작업준비" 또는 "작업:" 이라는 단어가 포함된 요청을 받으면 위 4개 파일을 자동으로 읽고 현재 상태를 한 줄로 요약한 뒤 작업을 시작하라.
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

## 5. Codex-specific Rules

- **작업 영역**: 백엔드 서버 로직, tRPC 라우터, 인텐트 서비스, 거래소 커넥터, 부동산 엔진
- **브랜치 전략**: `codex-[기능명]` 형식으로 생성
- 코드 변경 줄에는 `// MODIFIED: 이유` 주석을 추가한다
- Claude Code가 현재 작업 중인 파일은 HANDOFF.md를 확인 후 충돌 방지
- 작업 완료 후 HANDOFF.md의 "마지막 완료 작업" 섹션을 업데이트한다
- PR 생성 시 제목 형식: `codex: feat|fix|docs — 한글 설명`
- 자동화/스케줄링 레이어(OpenClaw 등)는 P0·P1 완료 후에만 착수한다
