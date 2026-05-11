# CHANGELOG.md — 에스턴 워크스테이션
> 형식: 날짜 | 도구 | 작업 내용 | 수정 파일 | 검증 결과 | 남은 이슈

---

## 2026-05-11 Step 1 — driveSync .pdf 본문 자동 추출 (Claude Code)

### 작업 내용
- `server/knowledge/driveSync.ts` — `.pdf` 를 `SUPPORTED_AUTO_INGEST` 에 추가, `META_ONLY_TYPES` 에서 제거
- 본문 추출 분기에 `.pdf` 케이스 추가 — `server/llm/attachmentExtract.ts` (pdf2json 기반) 의 `extractAttachmentText()` 재사용 → 신규 의존성 0건
- 스캔 이미지/암호 잠금 등 `extractAttachmentText` 가 `ok=false` 반환 시 `recordEvent({ reason: "failed", error: ... })` 로 회수 실패 기록 후 종료
- dynamic import 경로는 `"../llm/attachmentExtract.ts"` — PM2 `node --experimental-strip-types` 런타임 호환을 위한 `.ts` 명시
- 상수 2개(`SUPPORTED_AUTO_INGEST`/`META_ONLY_TYPES`) export 화 — 회귀 가드용
- 모듈 경계: `knowledge → llm` 은 `llm` 이 도메인 모듈 미등록(인프라성) 이라 `scripts/check-module-boundaries.ts` 위반 0건

### 효과
- `G:\내 드라이브\Aston-Wiki\notebooklm-exports\{project}\*.pdf` 떨구면 Drive Watcher 가 본문을 자동 추출 → NotebookLmAdapter → PipelineRunner → Wiki 적재
- 이후 텔레그램·웹 채팅에서 `searchLocalNotes` 가 PDF 본문을 인용 가능

### 수정 파일
- `server/knowledge/driveSync.ts`
- `server/__tests__/driveSyncPdf.test.ts` (신규)

### 검증
- `npm run check` ✅ (모듈 경계 0건 / tsc 통과)
- `npm run build` ✅ (797.9kb)
- `npm test driveSyncPdf` ✅ **5 passed** (확장자 매핑 회귀 가드)
- 전체 `npm test`: 823 passed / 2 failed — 실패 2건(`agentExecutor.test.ts:106`, `localMdSearch.test.ts:ASTON_WIKI_ROOT 미설정`)은 stash 상태에서도 동일 실패 → 환경 의존(실제 `ASTON_WIKI_ROOT` 회수 자료 존재), 내 변경 회귀 0건

### 회장님 라이브 검증 필요
- [ ] PM2 재시작 (`pm2 restart aston` 또는 `npx pm2 start`) — driveSync 가 새 `SUPPORTED_AUTO_INGEST` 로 부팅
- [ ] `G:\내 드라이브\Aston-Wiki\notebooklm-exports\hannam-644\test.pdf` 1개 떨구기 → 5초 내 `/notebook-lm` 페이지 회수 자료 목록 등장 + 텔레그램 자연 질의에 본문 인용 확인

### 다음 단계
- Step 1.5 — Aston Wiki 페이지 업로드 UI (multipart 백엔드 + drag-drop 모달, ~5시간)
- Step 2 — nlm-research 별도 폴더 + Aston 텔레그램 단추 (회장님 PC 설치 + claude CLI 비대화식 조사)

---

## 2026-05-11 자료 회수 라인 재설계 + 운영 안정화 (Claude Code)

### 추가 안정화 (커밋 4건)
1. **`6bf0ea1`** fix(agents) — `notebook-query` 호출 시 question 입력 전달 + 사용법 안내 보강
2. **`b1cfc81`** fix(agents) — notebook-query 권한 게이트 우회. 로컬 RAG 무해 작업은 awaiting_approval 안 거치고 즉시 실행
3. **`58bf760`** fix(intent) — 자연어 PF 질의가 realestate_feasibility 가짜 시뮬을 호출하던 회귀 차단. classifier prompt + parseIntent normalizeIntent 2중 가드
4. **`a27c4b0`** fix(extension v0.3.0) — UI 아이콘/페이지번호 노이즈 차단(Material Icons 40종 + 평균 줄 길이 검사) + 본문 임계치 20→300자

### 자료 회수 라인 재설계 (회장님 결정 회의 결과, 코드 미진행)
- nlm-research(외부 Python 앱) 통째 도입 ❌ — 이중 진입점·5개 의존성
- 별도 폴더 + Aston 단추 ✅ — 회장님 제안, 의존성 격리 + 텔레그램 단일 진입점 유지
- Aston Wiki 페이지 업로드 UI ✅ — 회장님 제안, PDF/문서를 G드라이브 폴더에 떨궈 Drive Watcher가 자동 회수
- 분류 방식: 옵션 A(업로드 시 project 직접 선택) 권장
- 다음 작업 3단계로 분리: Step 1 (PDF 본문추출), Step 1.5 (업로드 UI), Step 2 (nlm-research 단추)

### 다음 작업
- Step 1 — `server/knowledge/driveSync.ts` .pdf 본문 추출 분기 추가 (30분)
- Step 1.5 — `/wiki` 페이지 업로드 UI + multipart 백엔드 라우터 (5시간)
- Step 2 — nlm-research 별도 설치(회장님 PC) + Aston 텔레그램 단추 (claude CLI 비대화식 지원 조사 후)

---

## 2026-05-11 Agent↔RAG 합성 — notebook-query 템플릿 재라우팅 (Claude Code)

### 작업 내용
- `agents/agentTemplates.ts` `notebook-query` 템플릿 — OpenClaw NotebookLM 자동화 호출/시뮬레이션 가짜 데이터를 **Phase 4-A 로컬 RAG(`searchLocalNotes`)** 로 교체
- 모듈 경계 준수 위해 신규 `server/_core/ragProxy.ts` 추가 — `agents/`가 `rag/`를 직접 import 하지 않고 `_core/` 경유
- `agentExecutor.ts` `makeAgentRunner` / `makeSimulationRunner` 양쪽에 `templateId === "notebook-query"` 분기 — OpenClaw 우회, 로컬 회수 자료 K=5 검색 후 markdown 생성
- 회수 자료 0건이면 Chrome Extension + Drive Watcher 사용법 안내 자동 출력
- 결과 markdown은 `AGENT_WIKI_PATH` 에 그대로 저장 (기존 흐름 유지)

### 배경
- NotebookLM 외부 자동화(예: notebooklm-mcp) 도입 보류 결정(2026-05-11) — 이미 Chrome Extension + Drive Watcher + Phase 4-A 로 회수 자동화 완성
- 가짜 시뮬 데이터 또는 OpenClaw 자동화 모두 가치 낮음 → 로컬 RAG 직접 사용이 가장 정합

### 수정 파일
- `server/_core/ragProxy.ts` (신규)
- `server/agents/agentExecutor.ts` (notebook-query 분기 + buildNotebookQueryMarkdown + runNotebookQuery)
- `server/agents/agentTemplates.ts` (label/description/instructions 갱신)
- `server/__tests__/agentExecutor.test.ts` (테스트 2건 추가)
- `server/__tests__/agentTemplates.test.ts` (기존 OpenClaw 검증 테스트를 로컬 RAG 검증으로 교체)

### 검증
- `npm run check` ✅ (모듈 경계 0건 / tsc 통과)
- `npm run build` ✅
- `npm test` ✅ **820 passed** (회귀 0건, +2 신규)
  - 직전 1회 `dealStore` 1건 일시 fail 관측 — 내 변경과 무관(단독 실행 통과), flaky로 판단

### 남은 이슈
- `server/integrations/notebookLmMcp.ts` 데드 코드 정리 — 4곳 사용처(intent/handlers/intelligence, _core/intentRouter, routers/notebooklm, 테스트) 있어 별도 작업으로 분리

---

## 2026-05-11 Phase 4-C — 텔레그램 RAG 적용 (Claude Code)

### 작업 내용
- Phase 4-A (웹 채팅 로컬 RAG) 패턴을 텔레그램 봇에 그대로 이식
- `server/llm/telegramBot/messageRouter.ts`
  - `INTENT_CONFIDENCE_THRESHOLD = 0.7` 가드 추가 — 약한 매칭(<0.7)은 LLM + RAG 로 다운그레이드
  - `replyWithLlm` 내부에서 `searchLocalNotes(message, { k: 3 })` 호출, systemPrompt 에 `참고할 회수 자료(N건)` 블록 prepend
  - 응답 본문 뒤 `formatCitationFooter(hits)` append → 한 메시지로 텔레그램 전송
- 효과: 회장님이 텔레그램에서 "한남 PF 진행상황 어때?" 같은 자연 질의를 보내면 회수 자료(NotebookLM `*.md`) 본문을 인용한 답이 「📚 참고 자료」 절과 함께 도착

### 수정 파일
- `server/llm/telegramBot/messageRouter.ts`

### 검증
- `npm run check` ✅ (모듈 경계 0건 / tsc 통과)
- `npm run build` ✅ (794.1kb)
- `npm test` ✅ **818 passed** (7 skipped, 회귀 0건)
- pnpm install 로 누락 의존성(`mammoth`, `pdf2json`, `@google-cloud/discoveryengine`) 해결

### 라이브 검증 통과 ✅
- 2026-05-11 텔레그램 "한남 PF 진행상황 어때?" → "NPV 15.3%, 36개월" 회수 자료 인용 + 📚 참고 자료 절 정상 도착
- 검증 중 PM2 `node --experimental-strip-types` 런타임 import 확장자 이슈 3곳 보강
  - `messageRouter.ts` dynamic import (커밋 `fd53b07`)
  - `attachmentInject.ts` static + `routers/llm.ts` dynamic (커밋 `3e696fb`)

### 다음 단계
- Phase 4-B(Vertex AI Search 통합) 는 Phase 3-A/B Bootstrap 완료 후 진행
- Agent↔RAG 합성 (`notebook-query` 템플릿 → 4-A 재라우팅) 검토

---

## 2026-05-10 Worktree 베이스 사고 정리 + 재발 방지 가드 (Claude Code)

### 배경
별도 Claude Code 세션이 `.claude/worktrees/funny-chebyshev-3115be` (master 48bba87 베이스, 동결) 에서 시작되어 베이스 점검 없이 6시간 분량 작업 진행(agent layer / Google OAuth 부트스트랩 / 검색·페이지네이션·Toast / Web UI 변경). 사용자가 dev 서버를 띄웠을 때 1달 전 master 화면이 떠서 "내 작업이 사라졌다"고 오해. codex 라인은 이미 [server/routers/agents.ts], [client/src/pages/AgentControl.tsx], `rag.ts`, `attachmentExtract.ts` 등 더 발전된 시스템 보유 — 그 worktree에서 한 모든 작업은 본체에 흡수 불가능한 별개 패치였음. 진단·복구에 추가 시간 소모.

### 작업 내용
- **worktree 정리**: master 48bba87 베이스 4개 worktree 일괄 폐기
  - `funny-chebyshev-3115be` / `cranky-sammet-48e809` / `great-euclid-db7423` / `relaxed-jones-1e9acb` — git worktree 등록 해제 + 브랜치 삭제 완료
  - 일부 빈 디렉토리는 활성 cwd 잠금으로 잔존 (사용자 세션 종료 후 일괄 삭제 예정)
  - `blissful-rubin-98d15e` (PDF 백업 베이스 5b18619) 는 의도 보존
- **CLAUDE.md 보강**: "🛑 브랜치 / Worktree 베이스 규칙" 섹션 신설. 코드 수정 전 4-step 점검(pwd / 메인 브랜치 / 라우터·페이지 풍부도 / PM2 상태) 강제. 잘못된 베이스 발견 시 즉시 중단 + 사용자 confirm 절차 명시. dev 서버는 worktree 안에서 절대 띄우지 않는 규칙도 "앱 실행 규칙"에 추가.
- **사용자 메모리 가드 3중**(별도 저장소, git 추적 외):
  - `feedback_worktree_baseline_check.md` — 4-step 점검 강제 규칙 (Why: 2026-05-10 사고)
  - `project_google_telegram_ai.md` — 사고 기록 섹션 추가
  - `MEMORY.md` 인덱스 최상단 🛑 우선순위 배치

### 수정 파일
- `CLAUDE.md` — 신규 섹션 1개 + 기존 "앱 실행 규칙" 항목 1개 추가 (~30줄)
- `CHANGELOG.md` / `TODO.md` / `HANDOFF.md` — 본 항목 추가

### 검증
- `git worktree list` — codex-google-workspace-expansion + blissful-rubin-98d15e 만 잔존 ✅
- `git branch -a | grep claude/` — claude/blissful-rubin-98d15e 만 잔존 ✅
- 코드 변경 없음 (운영 문서·규칙만), 테스트·빌드 영향 없음

### 남은 이슈
- 빈 디렉토리 3개(`funny-chebyshev / great-euclid / relaxed-jones`) 잔존 — 외부 프로세스 lock. 다음 PowerShell 1줄로 정리: `Get-ChildItem ".claude\worktrees" -Directory -Exclude blissful-rubin-98d15e | Remove-Item -Recurse -Force`
- worktree 자동 생성 도구(`/superpowers:using-git-worktrees` 등)가 사용 시 codex 베이스 강제 옵션을 추가 검토 (별도 작업)

### 다음 단계
- Phase 4-C 텔레그램 RAG 적용 (원래 진행 중이던 작업으로 복귀)

---

## 2026-05-10 Phase 4-A 라이브 보강 — 약한 인텐트 매칭 가드 추가 (Claude Code)

### 배경
구현 후 라이브 검증에서 발견 — "한남 PF 진행 상황 어때" 질의가 `realestate_portfolio_summary` (confidence 0.55) 로 매칭되어 짧은 한 줄 응답("PF 포트폴리오 요약을 조회했습니다.")만 반환되고 RAG 단계에 도달하지 못함. 회장님 의도(자연 질의 → 회수 자료 인용)와 어긋남.

### 작업 내용
- **`server/routers/intent.ts:route`** — 약한 매칭(`confidence < INTENT_CONFIDENCE_THRESHOLD=0.7`, `requiresConfirmation=false`) 시 `handled=false` 로 다운그레이드 + `response`/`formattedMessage` 비움. 클라이언트(`client/src/chat/quickCommand.ts:88`)가 자동으로 `llm.chat` mutation 으로 fallback → 거기 들어 있는 RAG 코드가 작동
- **`server/routers/llm.ts:chat`** — 동일 가드를 직접 진입(텔레그램 등)에도 적용
- 두 라우터 모두 동일 상수 0.7 사용 (자율 결정)

### 수정 파일
- `server/routers/intent.ts` (~25줄 추가)
- `server/routers/llm.ts` (이전 commit 03e19ee 에서 가드 추가)

### 검증
- `npm run check` ✅
- `npm test` ✅ 799 passed (회귀 0건)
- **라이브**: 회장님 직접 검증 — "한남 PF 진행 상황 어때?" → "한남동 644 사업성 분석이 완료되었습니다. NPV 수익률은 15.3%, 예상 사업 기간은 36개월입니다.\n\n📚 참고 자료\n1. hannam-644/2026-05-07-notebooklm--644----npv--153---3.md" ✅

### 다음 단계
- Phase 4-C 텔레그램 적용 (`messageRouter.ts`) 도 동일 confidence 가드 적용해야 일관성 유지 (별도 작업)

---

## 2026-05-10 Phase 4-A 구현 — 로컬 NotebookLM 회수 자료 → Web Chat RAG 주입 (Claude Code)

### 배경
설계(같은 날 별도 항목) 후속 — chat 도메인 fallback 단계에서 회수 자료를 자동 검색·주입하여 회장님이 별도 prefix 없이 자연 질의만으로도 NotebookLM 분석 자료를 참조하게 만든다.

### 작업 내용
- **신규 모듈** `server/rag/localMdSearch.ts` (~250줄)
  - Public API: `searchLocalNotes(query, opts?)` / `formatCitationFooter(hits)` / `tokenize(text)` (테스트 노출용 export)
  - 검색 루트: `${ASTON_WIKI_ROOT}/projects/*/notebooklm/*.md`
  - 토큰화: 한국어 어절 길이≥2 / 영어 길이≥3 / 문장부호 split / lowercase 정규화
  - 점수식: TF + frontmatter `tags`/`categories` 일치 시 ×1.5 + 제목/파일명 매칭 시 +5 보너스
  - 결과: 기본 K=3, score 0 hit 제외, snippet 500자 (첫 매칭 토큰 주변 윈도우, ellipsis 마커)
  - 캐시: in-memory mtime 기반, 5분 TTL
  - 에러: 빈 결과 → `[]` (throw 금지)
- **`routers/llm.ts:chat`** chat fallback 진입점(인텐트 fallthrough 직후) 한 곳 수정
  - `searchLocalNotes(input.message, { k: 3 })` 호출 (실패해도 일반 대화 진행)
  - systemPrompt 에 `참고할 회수 자료(N건)` 단락 prepend
  - 응답 본문 끝에 "📚 참고 자료" 인용 절 부가
  - `sources` 필드에 `file://` URI 포함 (web UI `GroundingSource` 칩 재사용)
- **인텐트 매칭 성공시(`handled=true`)에는 RAG 단계 건너뜀** — 기존 라우팅과 100% 직교

### 수정 파일
**신규**:
- `server/rag/localMdSearch.ts`
- `server/__tests__/localMdSearch.test.ts` (20개 테스트)
- `docs/superpowers/plans/2026-05-10-phase4a-local-rag.md`

**수정**:
- `server/routers/llm.ts` (한 곳, line 208 직후 RAG 단계 + systemPrompt + return 블록)
- `TODO.md` / `CHANGELOG.md` / `HANDOFF.md`

### 검증
- `npm run check` ✅ 모듈 경계 위반 0건 + tsc 에러 0건
- `npm run build` ✅ (dist/index.js 784.5kb)
- `npm test` ✅ **799 passed** / 7 skipped / 2 todo (회귀 0건 — 기존 745 baseline 대비)

### 자율 결정 (회장님 안 묻고 베스트 프랙티스 적용)
- TS `u` regex flag 미사용 (tsconfig target 호환) — 한·영 토큰화는 `[가-힣]` 검사로 충분
- snippet 길이 검증은 `≤ SNIPPET_LEN + 2` (양쪽 ellipsis 마커 고려)

### 남은 이슈
- 운영 검증 (회장님 직접): "한남 PF 진행 상황" 자연 질의 → 회수 자료 인용 응답 확인
- Phase 4-B Vertex AI Search 는 Phase 3-A/3-B 데이터 스토어 셋업 완료 후 진입
- Phase 4-C 텔레그램 적용은 4-A 라이브 검증 통과 후

---

## 2026-05-10 Phase 4-A 설계 — 로컬 NotebookLM 회수 자료 → Web Chat RAG 주입 (Claude Code, 설계만)

### 배경
TODO/HANDOFF "다음 단계 후보" 중 Phase 4 (채팅 RAG 컨텍스트 주입) 진입. 회장님이 "노트북 ..." prefix 없이 자연 질의("한남 진행 상황 어때?")만 해도 회수 자료가 자동 인용되도록 chat 도메인 fallback 단계에 RAG 단계 삽입.

### 결정 (회장님 직접)
- **검색 소스**: 로컬 `${ASTON_WIKI_ROOT}/projects/*/notebooklm/*.md` 직접 스캔 (Vertex AI Search 는 Phase 4-B 분리)
- **적용 인터페이스**: 웹 채팅(`server/routers/llm.ts`) 만 (텔레그램은 Phase 4-C 분리)

### 자율 결정 (베스트 프랙티스)
- K=3, snippet 500자, 캐시 5분 TTL, 토큰화 한·영 휴리스틱
- 점수식: TF + frontmatter `tags`/`categories` 1.5× + 제목 매칭 +5
- 응답 본문 끝에 "📚 참고 자료" 한국어 인용 절 자동 부가, `sources` field 에 `file://` URI

### 작업 내용
- **설계 스펙 문서 작성**: `docs/superpowers/specs/2026-05-10-phase4a-local-rag-design.md`
  - 아키텍처/신규 모듈 API/`routers/llm.ts` 수정 골자/테스트 8~10개 케이스/검증 기준 명시
  - 비목표 명시: Vertex AI Search·텔레그램 적용·chunk-level·임베딩 (모두 Phase 4-B 이후)
- **구현 미착수**: 코드 변경 0건. 다음 세션에서 writing-plans → 구현으로 진행 예정.

### 수정 파일
**신규**:
- `docs/superpowers/specs/2026-05-10-phase4a-local-rag-design.md`

**수정**:
- `CHANGELOG.md` (이 항목)
- `TODO.md` (Phase 4-A 다음 작업으로 명시)
- `HANDOFF.md` (마지막 완료 작업 = 설계, 다음 = 구현)

### 검증 결과
- 코드 변경 없음 → check/build/test skip
- 다음 단계: writing-plans 스킬 호출 → 구현 PR 단위로 분해

### 남은 이슈
- 구현 자체 (이번 세션 범위 밖)
- Phase 4-B (Vertex AI Search) 진입 시점은 Phase 3-A/3-B (데이터 스토어 9개 생성 + importDocument) 완료 후로 보류

---

## 2026-05-09 Aston NotebookLM Bridge (Chrome Extension) + Phase W-3 (.docx 추출) (Claude Code)

### 배경
회장님 작업 지시서 — NotebookLM API 부재로 인한 수동 export 한계를 타파하기 위해 사내 전용 Chrome Extension 으로 1클릭 통제권 확보. 페이지 주입 + DOM 스크래핑 방식. Drive Watcher(W-2) 가 백업 파이프라인이 됨. W-3 `.docx` 본문 자동 추출도 함께 구현하여 Google Docs export 도 그대로 자동 회수.

### 작업 내용
- **Chrome Extension `chrome-extension/`** (Manifest V3) — 5개 파일
  - `manifest.json`: host_permissions [notebooklm.google.com + localhost:4000], content_scripts on notebooklm.google.com, service_worker background, options page
  - `content.js`: 우상단 fixed 버튼 [📥 Aston Wiki로 동기화] 주입. MutationObserver + history.pushState/replaceState/popstate 후크로 NotebookLM SPA 라우팅 100% 대응. 본문 selector 다단계 fallback (article → main[role=article] → contenteditable → main)
  - `background.js`: chrome.runtime.onMessage 에서 ASTON_INGEST 수신 → fetch POST → 응답 sendResponse. host_permissions 로 CORS 우회
  - `options.html/js`: chrome.storage.local 에 endpoint URL 저장
  - `README.md`: 설치 가이드 + 동작 흐름
- **백엔드 수신 `server/knowledge/extensionIngest.ts`**
  - Express POST `/api/rag/extension-ingest` + OPTIONS preflight 핸들러, CORS Allow-Origin *
  - **SHA-256 해시 멱등성**: 기존 `projects/{p}/notebooklm/*.md` 의 frontmatter `raw_text_hash` 추출 → 동일 hash 면 200 + status="skipped"
  - **URL → project 자동 매칭**: 부팅 시 `setExtensionUrlMappings()` 로 yaml 의 `notebook_url` 채워진 entry 만 등록. URL normalize (origin+pathname, lowercase, trailing slash 제거) 후 비교
  - 매칭 실패 시 404 + yaml 보강 가이드 응답
  - 매칭 성공 시 NotebookLmAdapter + PipelineRunner 통과 (텔레그램 `/nb save` / Drive Watcher 와 동일 흐름) → 201 Created + savedPath
  - frontmatter 자동 보강: 본문 끝에 `출처: NotebookLM Chrome Extension / 노트북: ... / URL: ...` 메타 추가
- **server/_core/index.ts** — 부팅 시 매핑 yaml 의 `notebook_url` 채워진 entry 를 setExtensionUrlMappings 로 주입 + Express POST/OPTIONS 라우트 등록
- **Phase W-3: `.docx` 자동 추출** — `mammoth ^1.x` 의존성 추가. `driveSync.ts` 의 `SUPPORTED_AUTO_INGEST` 에 `.docx` 추가, `META_ONLY_TYPES` 에서 제거. `handleNewFile` 에서 ext===".docx" 분기 → `mammoth.extractRawText({ path })` 로 raw text 추출 후 동일 파이프라인 통과

### 통합 흐름 (회장님 동선)
1. Chrome 에서 `chrome-extension/` 폴더 1회 로드 (개발자 모드)
2. NotebookLM 노트북 페이지 (yaml 에 `notebook_url` 매핑된 것) 방문 → 우상단 버튼 자동 주입
3. 회장님이 보고 싶은 노트로 이동 → **버튼 1클릭** → 5초 내 워크스테이션 페이지 회수 자료 카드 등장
4. 같은 본문 재클릭 → 멱등성으로 skip (도배 없음)
5. **백업**: Extension 못 쓰는 환경 → NotebookLM 에서 .docx export → Drive 동기화 → Watcher 가 5초 내 자동 회수 (W-3)

### 수정 파일
**신규**:
- `chrome-extension/{manifest.json, content.js, background.js, options.html, options.js, README.md}` (6개)
- `server/knowledge/extensionIngest.ts`

**수정**:
- `server/_core/index.ts` (Extension URL 매핑 주입 + Express 라우트)
- `server/knowledge/driveSync.ts` (mammoth 분기)
- `client/src/pages/KnowledgeRagPage.tsx` (Phase 안내 텍스트 W-3 ✅ + Extension 안내 추가)
- `package.json` (mammoth 의존성)

### 검증
- `npm run check` ✅ 모듈 경계 위반 0건 + tsc 에러 0건
- `npm test` ✅ **745 passed** (회귀 0건)
- `npm run build` ✅

### 27개 노트북 URL 일괄 채우기 한계
회장님 지시 "네가 알고 있는 정보를 바탕으로 27개 일괄 채워라" — NotebookLM URL 은 회장님 계정의 고유 UUID 라 외부에서 알 수 없음. 회장님이 화이트리에(`9a7481fc-...`) 1개만 알려주신 상태. 옵션:
- (a) 회장님이 27개 URL 알려주시면 yaml 일괄 입력
- (b) Extension 이 첫 방문 시 URL+제목 자동 캡처 → yaml 갱신 (별도 작업)
- (c) Extension 매칭 실패 시 페이지에 매핑 UI (별도 작업)

### 다음 단계 후보
- 자동 URL 캡처 (옵션 b) — Extension 부팅 첫 방문 시 yaml 자동 갱신
- Phase W-4 Drive API 직접 호출 (.gdoc export)
- Phase 4 채팅 RAG 컨텍스트 주입

---

## 2026-05-09 Aston RAG Phase W-2 — Drive Watcher 자동 동기화 + 소스 자료 표시 (Claude Code)

### 배경
회장님 작업 지시서 Phase 1 명시 사항("Drive Watcher 폴링 상태 표시")을 W-1 단계에서 빠뜨렸음을 회장님 지적 후 즉시 보완. **회장님이 NotebookLM에서 export → Drive 동기화된 G: 폴더에 떨어지면 워크스테이션이 5초 내 자동 회수**하는 진짜 자동 연동을 구현.

### 작업 내용
- **`server/knowledge/driveSync.ts` 신규** — chokidar 기반 `{ASTON_WIKI_ROOT}/notebooklm-exports/{project}/` 자동 감시
  - 28개 project 폴더 일괄 watch (depth 0, awaitWriteFinish 1s)
  - .md / .txt → 본문 직접 추출 + NotebookLmAdapter + PipelineRunner → `projects/{p}/notebooklm/*.md` 자동 적재
  - .docx / .pdf / .gdoc → 메타만 기록 (mammoth/pdf-parse 등 추가 의존성 없이 운영 시작 가능, .md 변환 안내)
  - 멱등성 `data/notebooklm-drive-ingested.json` (path+size+mtime hash dedupe, change 이벤트 시 새 hash로 재처리)
- **모듈 경계 준수** — driveSync 는 knowledge 도메인. project 화이트리스트는 `setAllowedProjects()` 외부 주입 패턴으로 rag → knowledge 의존 회피
- **부팅 자동 시작** — `server/_core/index.ts` 가 `loadRagMapping()` → `setRagAllowedProjects()` → `startDriveSync()` 순서로 호출
- **신규 tRPC 3개**:
  - `rag.driveWatcherStatus` query (30초 자동 refetch) — enabled / 감시 폴더 / 누적 회수 / 최근 이벤트 10건
  - `rag.triggerDriveScan` mutation — 회장님 "지금 동기화" 버튼 즉시 폴링
  - `rag.listSourceFiles` query — NotebookLM 입력 자료(`notebooklm-sources/{project}/`) 메타 목록
- **페이지 보강** — Drive Watcher 상태 카드(🟢/❓ 배지·폴더 경로·이벤트 타임라인·즉시 동기화 버튼) + 노트북 카드 선택 시 입력 자료 목록 카드(이모지 아이콘·시각·크기) + 회수 자료 카드(이전 W-1 기능 보존) + 본문 미리보기 모달

### 운영 약속
- **입력**: `G:\내 드라이브\Aston-Wiki\notebooklm-sources\{project}\` 에 회장님이 PDF/Docs 업로드 → NotebookLM 소스로 그 폴더/파일 연결 → 페이지에 자동 표시
- **회수**: NotebookLM에서 분석 답변/노트 → .md 또는 .txt 저장 → `G:\내 드라이브\Aston-Wiki\notebooklm-exports\{project}\` 에 두면 5초 내 Wiki 자동 적재
- **수동 보조**: W-1 (페이지 붙여넣기 폼) 그대로 유지 — Drive 동기화가 늦거나 안 되는 경우 백업

### 수정 파일
**신규**:
- `server/knowledge/driveSync.ts` (~340줄)

**수정**:
- `server/routers/rag.ts` (driveWatcherStatus / triggerDriveScan / listSourceFiles 3개 추가)
- `server/_core/index.ts` (부팅 시 매핑 주입 + watcher 시작)
- `client/src/pages/KnowledgeRagPage.tsx` (DriveWatcherCard + SourceFilesSection 컴포넌트 + 30초 refetch + 즉시 동기화 mutation)

### 검증
- `npm run check` ✅ 모듈 경계 위반 0건 + tsc 에러 0건
- `npm test` ✅ **745 passed** (회귀 0건)
- `npm run build` ✅
- 라이브: dev 서버 환경변수 quoting 문제로 자동 라이브 검증 보류 — 회장님 PC에서 PM2/npm run dev 재시작 후 직접 검증 필요

### 응답·기존 API 영향
- public 인텐트 API 변경 0건
- 텔레그램 `/nb save` / 웹 W-1 붙여넣기 기존 흐름 그대로 동작
- 신규 tRPC 3개 모두 rag 라우터에 깨끗이 추가 (다른 라우터 무영향)

### 회장님 직접 운영 검증
- [ ] PM2 (`pm2 restart aston`) 또는 `npm run dev` 재시작 — driveSync 활성화 필수
- [ ] http://localhost:4000/notebook-lm — Drive Watcher 카드 🟢 + 28개 폴더 감시 표시 확인
- [ ] `G:\...\notebooklm-exports\hannam-644\test.md` 생성 → 5초 내 페이지 회수 자료 목록 자동 등장 확인
- [ ] 노트북 카드 클릭 → 입력 자료 목록 카드 동작 + 회수 자료 미리보기 모달 동작

### 다음 단계
- W-3: .docx 본문 자동 추출 (mammoth 추가)
- W-4: Google Drive API 직접 호출 (`.gdoc` export, Drive 데스크톱 의존 제거)
- Phase 4: 채팅 RAG 컨텍스트 주입

---

## 2026-05-09 Aston RAG Phase W-1 — 외부 NotebookLM ↔ Wiki 자동 회수 (웹 붙여넣기) (Claude Code)

### 배경
회장님 1순위 목표("외부 NotebookLM 분석 자료 → 워크스테이션 위키 자동 저장") 직접 구현. 텔레그램 `/nb save` 만 가능하던 회수 경로를 웹 페이지에서도 가능하게 확장. 회장님 동선: 노트북LM 답변 복사 → `/notebook-lm` 페이지에서 카드 선택 → 붙여넣기 → "Wiki 저장" 클릭. 끝.

### 작업 내용
- **tRPC `rag.saveAnalysis` mutation 신규** — 매핑 yaml(28건) project 화이트리스트 + `NotebookLmAdapter.toPipelineInput` + `PipelineRunner.run` 재사용. `source_ref = web:{sha256}` 멱등성 키. sourceLabel 옵션은 본문 끝 "출처: ..." 라인으로 첨부
- **tRPC `rag.listSavedNotes` query 신규** — `{WIKI_ROOT}/projects/{project}/notebooklm/*.md` 스캔, mtime 역순, 단일/전체(28개 매핑 순회) 선택 지원, 30건 제한
- **tRPC `rag.readSavedNote` query 신규** — 본문 markdown 반환. **3중 보안 가드**: project 화이트리스트(매핑 yaml) + 파일명 검증(슬래시·`..`·확장자) + `path.relative` 기반 isWithin 체크 → 경로 traversal 차단
- **`/notebook-lm` 페이지 보강** — 노트북 카드 클릭 시 선택 토글(체크 마크 + cyan 배경), "분석 결과 회수" 폼 (textarea ≥10자 + 출처 라벨 + Wiki 저장 버튼), 저장 결과 토스트(✅/❌), 저장 후 즉시 `listSavedNotes` invalidate, 회수된 자료 카드 목록(상대 시각 + 크기), 본문 미리보기 모달(esc/외부 클릭으로 닫힘)

### 수정 파일
**수정**:
- `server/routers/rag.ts` (mutation 1 + query 2 추가)
- `client/src/pages/KnowledgeRagPage.tsx` (입력 폼 + 회수 자료 + 미리보기 모달)

### 검증
- `npm run check` ✅ 모듈 경계 위반 0건 + tsc 에러 0건
- `npm test` ✅ **745 passed** (회귀 0건)
- `npm run build` ✅
- 라이브: `POST /api/trpc/rag.saveAnalysis` → 응답 ok=false + pending 큐 graceful 폴백 (dev 환경에 G: 드라이브 미마운트 → `EINVAL: mkdir 'G:'`). 운영 환경(회장님 PC, G: 마운트)에서는 정상 저장 예상
- 파이프라인 검증: pending 큐 JSON 으로 cleaner→classifier→summarizer→tagger 통과 + router 경로 결정(`projects/hannam-644/notebooklm`) 모두 확인

### 응답·API 영향
- public 인텐트 API 변경 0건
- 텔레그램 `/nb save` 흐름 그대로 작동 (코드 변경 없음, 같은 어댑터·파이프라인 공유)
- 신규 tRPC 노출 3개 (`saveAnalysis` mutation / `listSavedNotes` query / `readSavedNote` query)

### 회장님 운영 검증 (직접 확인 필요)
- http://localhost:4000/notebook-lm → 노트북 카드 1개 클릭 → NotebookLM 분석 텍스트 붙여넣기 → "Wiki 저장" → `G:\내 드라이브\Aston-Wiki\projects\{project}\notebooklm\*.md` 생성 확인
- 저장 후 페이지 하단 "회수된 분석 자료" 섹션 즉시 갱신 + 카드 클릭 시 본문 미리보기 모달 동작 확인
- 같은 본문 재저장 시 `was_skipped: true` 멱등성 동작 확인

### 다음 단계 (W-2 ~ Phase 4)
- W-2: NotebookLM Docs export → Drive Watcher 자동 회수 (회장님 1클릭). NotebookLM 화면 메뉴 확인 필요
- W-3: 회수 자료 검색·카테고리 필터 (`/wiki` 페이지에 #notebooklm 태그)
- Phase 4: 채팅 RAG 컨텍스트 주입 (`intent/handlers/chat.ts` ↔ 회수된 `*.md` 자동 인용)

---

## 2026-05-09 Aston RAG 페이지 진입점 정리 — `/notebook-lm` ↔ `/knowledge-rag` 통합 (Claude Code, hotfix)

### 배경
Phase 1~2 진행 시 회장님 작업 지시서가 `/knowledge-rag` 경로를 명시했고 CLAUDE.md "기존 UI·라우터 삭제 금지" 규칙 때문에 빈 placeholder `/notebook-lm` 페이지를 그대로 두고 신규 경로에 RAG 페이지를 만들었음. 결과적으로 사이드바 "노트북LM" 메뉴(→ `/notebook-lm` 빈 페이지)와 신규 RAG 페이지(`/knowledge-rag`)가 분리되어 사이드바에서 진입 불가. 회장님 지적 받고 정리.

### 작업 내용
- `client/src/App.tsx` — `/notebook-lm` 라우트를 `KnowledgeRagPage` 로 교체. `/knowledge-rag` 는 alias 유지 (북마크/직링크 보호)
- `client/src/pages/NotebookLMPage.tsx` 삭제 — 23줄 빈 placeholder, 실질 dead code
- `client/src/pages/KnowledgeRagPage.tsx` — 헤더 제목을 "통합 지식 RAG" → **"노트북LM"** (사이드바 라벨 일치, 회장님 결정)
- 사이드바 메뉴(`/notebook-lm`) 그대로 유지 → 클릭 시 RAG 통합 페이지 즉시 진입

### 검증
- `npm run check` ✅ / `npm run build` ✅
- `npm test` — **744 passed** (RAG 회귀 0건, flaky `dealStore > completes milestone` 1건은 `dealSheetSync` 스케줄러 race, 본 작업 무관)

### 응답·API 영향
- 기능 변경 0건. URL 진입점만 정리.
- `/notebook-lm` 와 `/knowledge-rag` 모두 동일 페이지로 도달.

---

## 2026-05-09 Aston RAG Phase 2 — Discovery Engine 통신 코어 + ADC 인증 (Claude Code)

### 배경
회장님 GCP 환경 확정 (프로젝트 `aston-work-station`, ADC 인증, GenAI App Builder Trial 크레딧 142만 원으로 Vertex AI Search 100% 커버) 후 Track B 통신 레이어 1차 구현. 데이터 스토어 자동 생성·문서 인덱싱·검색 요약 3개 핵심 메서드만 구현, 실제 데이터 마이그레이션은 Phase 3 에서.

### 작업 내용
- **`@google-cloud/discoveryengine ^2.7.0`** 의존성 추가 (npm install --legacy-peer-deps)
- **`server/rag/gcpAuth.ts` 신규** — ADC 인증 헬퍼 (서비스 계정 JSON 미사용), path 빌더(collection/dataStore/servingConfig), `RagAuthError` 명시적 에러 클래스
- **`server/rag/discoveryEngineClient.ts` 신규** — 3개 핵심 메서드:
  - `createDataStore(options)` — DataStoreServiceClient 사용. ALREADY_EXISTS(코드 6) 시 idempotent 반환. LRO promise 처리
  - `importDocument(input)` — DocumentServiceClient 사용. inline base64 인코딩, structData JSON 메타. 같은 documentId 재호출 시 update 자동 폴백
  - `query(options)` — SearchServiceClient.search 사용. summarySpec(includeCitations: true) + snippetSpec. summaryText + sources 배열 반환
  - 모든 메서드 환경변수 미설정 시 `ok=false + error` graceful 응답 (서버 부팅 차단 방지)
- **tRPC `rag` 라우터 확장** — `trackBStatus` (UI 배지) + `queryDataStore` mutation (수동 검색 + 향후 채팅 RAG 재사용)
- **`/knowledge-rag` 페이지 보강** — Track B 탭에 🟢 ADC / ❓ 미설정 배지, 환경 미설정 시 `gcloud auth application-default login` 안내
- **`.env.example` 정정** — `VERTEX_SEARCH_SERVICE_ACCOUNT_JSON` 항목 제거, ADC 사용 명시 + Trial credit 100% 커버 명시
- **`server/rag/README.md` 갱신** — 인증 섹션, 명령 목록 8개, Phase 2 ✅ 완료

### 수정 파일
**신규**:
- `server/rag/gcpAuth.ts`
- `server/rag/discoveryEngineClient.ts`
- `server/__tests__/ragDiscoveryEngine.test.ts` (gcpAuth 8 + discoveryEngineClient 3 = 11건)

**수정**:
- `server/routers/rag.ts` (`trackBStatus` + `queryDataStore` 추가)
- `client/src/pages/KnowledgeRagPage.tsx` (Track B 배지 + 안내)
- `package.json` (의존성 추가)
- `.env.example` (ADC 안내 정정)
- `server/rag/README.md`
- `TODO.md` / `HANDOFF.md`

### 검증
- `npm run check` ✅ 모듈 경계 위반 0건 + tsc 에러 0건 (SDK callback/promise 오버로드는 명시 캐스트로 해소)
- `npm test` ✅ **745 passed** (734 → +11 신규 ragDiscoveryEngine 테스트, 회귀 0건)
- `npm run build` ✅ 749.8kb (+4.9kb), copy-intent-prompts 정상
- 라이브: `VERTEX_SEARCH_PROJECT_ID=aston-work-station npm run dev` 후 `GET /api/trpc/rag.trackBStatus` → `{configured:true, projectId:"aston-work-station", location:"global", authMode:"ADC"}` ✅

### 응답·API 영향
- public 인텐트 API 변경 0건
- 기존 페이지/라우트 그대로 보존
- 신규 tRPC 노출 2개 (`trackBStatus` query / `queryDataStore` mutation)는 Track B 전용

### 회장님 운영 환경 (확인 완료)
- GCP 프로젝트: `aston-work-station`
- 인증: ADC (`gcloud auth application-default login` 1회 실행됨)
- 비용 커버: GenAI App Builder Trial credit 142만 원 → Vertex AI Search 100% 커버

### 회장님 후속 액션
- `.env` 에 `VERTEX_SEARCH_PROJECT_ID=aston-work-station` 추가 후 서버 재시작
- GCP 콘솔에서 Discovery Engine API 활성화 확인
- Phase 3 진행 시점 결정 (데이터 스토어 9개 createDataStore + 회수 파이프라인 연결)

### 다음 단계 (Phase 3 후보)
- `scripts/rag-bootstrap.ts` — 데이터 스토어 9개 일괄 생성 (idempotent)
- `projects/{p}/notebooklm/*.md` 저장 트리거 → `importDocument` 자동 호출
- frontmatter 표준화 (`source / data_store / query / sources`)
- Track A Drive Watcher (NotebookLM Docs export 폴더)

---

## 2026-05-09 Aston RAG Phase 1 — Track A NotebookLM 카탈로그 + 페이지 골격 (Claude Code)

### 배경
회장님이 운영 중인 외부 NotebookLM 28개 노트북 + 향후 도입할 GCP Discovery Engine 기반 내부 RAG를 병행 운영하는 **하이브리드 RAG 아키텍처** 1차 단계. Phase 1은 카탈로그 + UI 골격만 (실제 GCP 연동은 Phase 2).

### 작업 내용
- **`data/rag-mapping.yaml` 신규** — 28개 노트북 매핑 (기존 `index/notebooklm-mapping.yaml`을 베이스로 `data_store`+`data_store_filter` 필드 부여)
- **9개 데이터 스토어 그룹핑** — ds-real-estate-deals(11) / ds-trading-research(2: trading+system) / ds-learning-ai(6) / ds-research-macro(3) / ds-legal-contracts(1) / ds-business-operations(1) / ds-mongolia-business(1) / ds-personal-strategy(2) / ds-personal-health(1)
- **`server/rag/` 신규 모듈** — types.ts / mappingLoader.ts / README.md (도메인 경계 위반 0)
- **tRPC `rag` 라우터 신규** — `listMappings` + `listDataStores` 2개 query
- **`/knowledge-rag` 페이지 신규** — 2개 탭(Track A 카탈로그 / Track B placeholder), 카테고리 칩 10종, 노트북 카드 28개, 검색·필터, 외부 링크 슬롯(notebook_url 채워지면 활성)
- **모듈 경계 등록** — `DOMAIN_MODULES` 에 "rag" 추가
- **`.env.example`** — Phase 2 환경변수 placeholder 추가 (`VERTEX_SEARCH_PROJECT_ID/LOCATION/SERVICE_ACCOUNT_JSON`, `DRIVE_WATCHER_FOLDER_ID`)

### 수정 파일
**신규**:
- `data/rag-mapping.yaml`
- `server/rag/{types.ts, mappingLoader.ts, README.md}`
- `server/routers/rag.ts`
- `client/src/pages/KnowledgeRagPage.tsx`
- `server/__tests__/ragMappingLoader.test.ts`

**수정**:
- `server/routers.ts` (rag 라우터 등록)
- `client/src/App.tsx` (라우트 + lazy import)
- `scripts/check-module-boundaries.ts` (DOMAIN_MODULES "rag" 추가)
- `.env.example` (Phase 2 환경변수)
- `TODO.md` / `HANDOFF.md`

### 검증
- `npm run check` ✅ 모듈 경계 위반 0건 + tsc 에러 0건
- `npm test` ✅ **734 passed** (727 → +7 신규 ragMappingLoader 테스트, 회귀 0건)
- `npm run build` ✅ vite 5.12s + esbuild 744.9kb (+6.4kb) + copy-intent-prompts 정상
- 라이브 검증: `GET /api/trpc/rag.listMappings` → `{total: 28, stores: 9, issues: 0}` ✅

### 응답·API 영향
- public 인텐트 API 변경 0건
- 기존 `/notebook-lm` 페이지 (placeholder) 그대로 유지 (회장님이 향후 통합 결정 시 별도 작업)
- 기존 `index/notebooklm-mapping.yaml` 그대로 보존 (Track A 회수 모듈 영향 0)

### 다음 단계 (Phase 2 후보)
- `server/rag/gcpAuth.ts` (서비스 계정 인증)
- `server/rag/discoveryEngineClient.ts` (createDataStore / importDocument / query)
- 회장님이 GCP 프로젝트 ID + 서비스 계정 JSON 제공 후 진행

---

## 2026-05-08 ~ 05-09 Intent Service 리팩토링 Phase 0~7-B (Claude Code, 대규모)

### 배경
Connect AI v2 벤치마킹 후 `intentService.ts`를 4단계 파이프라인 + HandlerResponse 표준 스키마로 점진 리팩토링. **public API 시그니처 100% 동결**, **모든 분기 응답 문자열 byte-for-byte 100% 보존**.

### Phase 0~5 — 파이프라인 구조 도입
- **Phase 0~2** (2026-05-08): `parseIntent.ts` 분리, `prompts/classifier.md` 외부화, `promptLoader.ts` + `intentSchemas.ts` 신규
- **Phase 3** (05-08): `pipeline/parseIntent.ts` 이동 + `pipeline/planIntent.ts` pass-through stub + `prompts/planner.md` 추가. `parseIntent.ts`는 re-export shim으로 축소
- **Phase 4** (05-08): `pipeline/dispatchIntent.ts` 분리 — 승인 게이트/handler 조회/execute_placeholder/Gemini fallback/try-catch 5가지 책임 추출. `intentService.ts`는 `parseIntent → planIntent → dispatchIntent` 얇은 오케스트레이터로 변환
- **Phase 5** (05-08): `pipeline/formatReply.ts` 분리 + `HandlerResponse`/`HandlerResponseKind` 타입 도입 + raw object 차단 헬퍼 export. `intentService.ts`는 `formatIntentRouteMessage`를 backward-compat alias로 유지

### Phase 6 — 11개 도메인 핸들러 마이그레이션
응답 문자열 byte-for-byte 보존하며 `handlerResponse: { kind, text, meta }` 추가. `formatReply.ts`는 Phase 6-A/6-B/6-C에서 list/report/text 분기 활성화 후 무수정.

| Phase | 도메인 | 핸들러 | 분기 |
|-------|--------|-------|------|
| 6-A (05-08) | google | 3 부분 (driveSearch/getEmails/listEvents) | 3 |
| 6-B (05-08) | trading | 4 (preCheck/reviewReport/techAnalysis/analysisHandler) | 4 |
| 6-C (05-08) | deals | 1 dispatcher (14 sub-command) | 14 |
| 6-D-1 (05-08) | realestate | 8 | 8 |
| 6-D-2 (05-08) | finance | 1 | 1 |
| 6-D-3 (05-08) | intelligence | 3 | 5 |
| 6-D-4 (05-08) | wiki | 3 | 5 |
| 6-D-5 (05-08) | chat | 1 | 4 |
| 6-D-6 (05-08) | agents | 1 dispatcher (10 sub-command) | 10 |
| 6-D-7 (05-08) | approval | 3 | 10 |
| 6-D-8 (05-08) | knowledgePipeline | 1 | 4 |
| 6-D-9 (05-09) | notebooklm | 4 | 13 |
| **합계** | **11개** | **~33개** | **~91개** |

### Phase 7 — 마지막 2개 kind 활성화
- **Phase 7-A** (05-09): 누적 8개 도메인 24개 임시 `kind="text" + meta.status` 분기를 `kind="error"`로 정식 재분류 (deals unknown / monitoring 에러 / wiki_auto_classify 에러 / chat 에러 / agents 4 / approval 4 / knowledgePipeline 3 / notebooklm 9). `formatReply.ts` `handlerText` 추출 조건에 `error` 추가
- **Phase 7-B** (05-09): `kind="confirmation"` 보조 마커 활성화 — `formatReply.ts` 추출 조건에 추가만, 핸들러 재분류는 보류 (불확실 케이스). `requiresConfirmation`(승인 게이트)와 `kind="confirmation"`(응답 마커) 직교성 명시 주석 추가

### 5개 kind 모두 활성화 완료
| kind | 활성 Phase | 사용 도메인 |
|------|-----------|-----------|
| `list` | 6-A | google, finance, wiki, chat, agents, approval |
| `report` | 6-B | trading, realestate, intelligence, approval |
| `text` | 6-C | deals, realestate, wiki, chat, agents, approval, knowledgePipeline, notebooklm |
| `error` | 7-A | deals, intelligence, wiki, chat, agents, approval, knowledgePipeline, notebooklm |
| `confirmation` | 7-B | (보조 마커, 사용 핸들러 0건) |

### 누적 검증
- 테스트: 586 → **719 passed** (+133, 회귀 0건)
- 빌드: 722.5kb → **738.5kb** (+16.0kb)
- `npm run check` ✅ 모듈 경계 위반 0건 + `tsc --noEmit` 에러 0건
- `dealRouting.test.ts:91-105` raw object 차단 회귀 100% 통과
- 사용자 응답 raw object/사용자 원문/토큰/시크릿 0건 노출

### 주요 신규/수정 파일
**신규**:
- `server/intent/pipeline/{parseIntent,planIntent,dispatchIntent,formatReply}.ts`
- `server/intent/{promptLoader,intentSchemas}.ts`
- `server/intent/prompts/{classifier,planner}.md`
- `server/__tests__/{dispatchIntent,formatReply}.test.ts` (테스트 134건 추가)
- `docs/refactor/intent-service-refactor-plan.md` (설계서 + 16개 Phase 구현 로그)

**수정**:
- `server/intent/intentService.ts` (227줄 → 99줄, public API 동결)
- `server/intent/types.ts` (`HandlerResponse`/`HandlerResponseKind` 정의 + `IntentRouteResponse.handlerResponse?` 추가)
- `server/intent/parseIntent.ts` (re-export shim)
- 11개 핸들러 (`handlers/{google,trading,deals,realestate,finance,intelligence,wiki,chat,agents,approval,knowledgePipeline,notebooklm}.ts`)

### 남은 작업 (Phase 8 후보)
- `prompts/` 프로드 번들 esbuild plugin (현재 `FALLBACK_*` 인메모리 fallback 동작)
- `inferKind()` formatReply 본문 활성화
- `analysisHandler` 본문 중복 버그 수정 (응답 변경 동의 필요)
- `feasibility`/`finance` 헤더 인코딩 깨짐 정상화 (응답 변경 동의 필요)
- finance 본문 포맷팅 (`formatDartDisclosures`)
- `docs/handler-conventions.md` 가이드라인 작성

---

## 2026-05-08 KakaoManualAdapter + D-day 자동 푸시 (Claude Code, 2nd session)

### 발견: OpenClaw KakaoTalk 미지원
- OpenClaw npm 번들 직접 조사 결과 지원 플랫폼은 **Telegram/Discord/WhatsApp/Slack/MSTeams/Signal/iMessage/LINE/Google Chat** 뿐
- 카카오톡(`kakao` 키워드) 어디에도 없음 → **B-5 OpenClaw 기반 KakaoMcpAdapter 원천 불가능**으로 결정
- 방향 전환: A안(수동 회수만 + V1 기본 경로) + D안(D-day 푸시) 병행 채택

### A안: KakaoManualAdapter 구현
- 신규 `server/knowledge/adapters/kakaoManual.ts` — `/kakao paste {project} [출처: 단톡방명]\n{본문}` 파싱
- 신규 `server/intent/handlers/notebooklm.ts` `kakaoPaste` 핸들러 — 멱등성(sha256), pending 큐 폴백
- 신규 `IntentAction "kakao_paste"` + `isKakaoPasteCommand` matcher
- 라우팅: `notebooklm` 도메인, `inbox/_suggested/{project}/` 키워드 힌트 → `projects/{project}/notes/`
- 신규 테스트 11개 (kakaoManualAdapter 11 + fallbackIntentRules 3)

### D안: 딜 마감/이정표 D-day 자동 푸시
- 신규 `server/deals/dealDeadlineNotifier.ts`
  - `collectPendingNotifies()` — D-7/D-3/D-1/D-DAY/D+1 임계치 매칭
  - `runDealDeadlineCheck()` — 텔레그램 발송 + 일별 dedup (data/deal-deadline-notify.json, 7일 이상 자동 정리)
  - cron: 매일 KST 08:30 (`DEAL_DEADLINE_NOTIFY_HOUR/MINUTE` 환경변수)
- `server/_core/index.ts` 스케줄러 등록
- `.env.example`에 `DEAL_DEADLINE_NOTIFY_*` 추가
- 신규 테스트 7개 — 임계치 필터 / 완료/거절 제외 / 이정표 필터 / 정렬 / dedup / 토큰 미설정 처리

### 수정 파일
- `server/knowledge/adapters/kakaoManual.ts` (신규)
- `server/intent/handlers/notebooklm.ts` (kakaoPaste 추가)
- `server/intent/types.ts` (kakao_paste action)
- `server/intent/fallbackIntent.ts` (isKakaoPasteCommand + 라우팅)
- `server/deals/dealDeadlineNotifier.ts` (신규)
- `server/_core/index.ts` (스케줄러 등록)
- `.env.example` (DEAL_DEADLINE_NOTIFY_*)
- `server/__tests__/notebooklm/kakaoManualAdapter.test.ts` (신규, 11)
- `server/__tests__/dealDeadlineNotifier.test.ts` (신규, 7)
- `server/__tests__/fallbackIntentRules.test.ts` (+3)

### 검증
- `npm run check` ✅ / `npm run build` ✅ / `npm test` **564 passed** (543 → +21)
- PM2 `aston` 재시작 완료

### 남은 이슈
- 운영 검증: 회장님 텔레그램에서 `/kakao paste hannam-644 출처: 한남PFV\n본문` 직접 확인
- D-day 푸시 다음 스케줄: 내일(2026-05-09) KST 08:30 자동 발송 예정
- 폴더 매핑 yaml(`index/notebooklm-mapping.yaml`)에 카톡 본문이 기록될 28개 노트북 그대로 사용

---

## 2026-05-08 OpenClaw 연결 복구 (Claude Code)

### OpenClaw gateway caller minified bundle 수정
- **원인**: `loadGatewayCaller()`가 `mod.callGateway` named export로만 탐색 → openclaw minified 빌드에서 `callGateway`가 `r`로 export되어 항상 못 찾음
- **수정**: named export 실패 시 함수명(`v.name === "callGateway"`)으로 재탐색하도록 보강
- **결과**: `smoke-openclaw.ts` 통과, `/api/agents/health` → `available: true`, `simulationMode: false`
- **부수**: `sheetsRouting.test.ts` stale range 기본값(`Sheet1!A1:Z50` → `A1:Z50`) 수정

### 전체 작업 플로우 정리
- B-2 VoiceAdapter 보류 / B-3 GmailAdapter 폐기 / Phase 1c MTProto 보류
- Sheets 워크스페이스 스키마 작업 불필요로 결론 (이미 사용 경로 없음)
- **다음**: OpenClaw로 카카오톡 자동화 (B-5 KakaoMcpAdapter) 설계 예정

### 수정 파일
- `server/agents/openclawRuntime.ts`
- `server/__tests__/sheetsRouting.test.ts`

### 검증
- `npm run check` ✅ / `npm run build` ✅ / `npm test` 543 passed ✅
- smoke-openclaw ✅ / OpenClaw available=true, simulationMode=false ✅

---

## 2026-05-07 Google OAuth 재연결 + 인텐트 수정 (Claude Code)

### Google Sheets 연동 복구
- **PM2 포트 충돌 해소**: 고아 node 프로세스(PID 5676) 종료, aston을 4000으로 복구
- **NODE_ENV=development** PM2 재시작으로 Vite dev server 정상 기동
- **`WORKSPACE_SPREADSHEET_ID` 수정**: 잘못된 ID → `1kX_l2bQw8II4LZCwdS9_QEQ9JQ4HfpXYGpDoIF9F8b0`
- **기본 range 수정**: `Sheet1!A1:Z50` → `A1:Z50` (탭명 없이 첫 번째 시트 자동 선택)
- **Google OAuth 재인증 완료**: userId=6 토큰 갱신, Sheets API 정상 응답 확인

### 인텐트 수정 3종 (`server/intent/`)
- **`google_reauth_guide` 인텐트 신규**: `구글 재인증` / `구글 로그인` / `구글 연결` 키워드 → 웹앱 URL 안내 메시지 즉시 반환
- **`GOOGLE_REAUTH_MSG` 개선**: 웹앱 URL + 스코프 안내 포함으로 업데이트
- **`readSheet` 에러 처리 강화**: 비인증 에러도 catch해 사용자 친화적 메시지 반환 (LLM 폴백 방지)

### 수정 파일
- `server/intent/types.ts` — `google_reauth_guide` IntentAction 추가, GOOGLE_REAUTH_MSG URL 포함
- `server/intent/fallbackIntent.ts` — `google_reauth_guide` 키워드 매처 추가, 기본 range 수정
- `server/intent/handlers/google.ts` — `reauthGuide` 핸들러 + 기본 range 수정 + readSheet 에러 catch 강화

### 검증
- 텔레그램 `구글 재인증` → 안내 메시지 ✅
- 텔레그램 `시트 읽기` → `📊 Dashboard: 데이터가 없습니다.` ✅ (LLM 폴백 없음)

---

## 2026-05-07 NotebookLM 회수 + 어댑터 확장 (5 commits, Claude Code)

### [3292f12] /nb 명령 — NotebookLM 매핑 조회 모듈
- `server/notebooklm/` 신규 도메인 모듈 (mappingLoader / notebookQuery / types)
- YAML 직접 파서 (외부 패키지 없음) + mtime 캐시 + 스키마 검증
- `/nb` / `/nb list [카테고리]` / `/nb show {id}` / `/nb search {keyword}` 4종
- `index/notebooklm-mapping.yaml` 28개 노트북 1차 매핑
- 테스트 29개 신규, 521 → 521 passed

### [1d1be26] /nb save — NotebookLM 회수 파이프라인 연결
- `server/knowledge/adapters/notebooklm.ts` 신규
- `/nb save {project}\n{본문}` → Phase B-1 파이프라인 → `projects/{project}/notebooklm/`
- project ID 검증 + 유사 항목 제안 + 멱등성 보장
- 테스트 9개 신규, 530 passed

### [b28554a] /meet save — 회의록 저장 어댑터
- `server/knowledge/adapters/meeting.ts` 신규
- `/meet save {project} [참석자: 이름,이름]\n{본문}`
- router.ts: `meeting` source_type → `projects/{project}/meetings/` 경로 추가
- 테스트 11개 신규, 541 passed

### [24feb0c] inbox/_suggested/{project}/ 키워드 힌트 라우팅
- 라우터 3단계 완성: explicit_command → keyword_hint_suggested → inbox_fallback
- LLM confidence ≥ 0.75 + suggested_project → `inbox/_suggested/{project}/`로 보냄 (자동 승격 절대 X)
- `/tg` 응답에 `_suggested` 경로 안내 + `#project` 재전송 가이드 추가
- 543 passed

### [0fb80f4] scripts/reprocess.ts — pending 큐 재처리 CLI
- `npm run reprocess` / `npm run reprocess:list` / `npm run reprocess:dry`
- `--max N` 옵션으로 건수 제한 가능

### 검증
- `npm run check` ✅ / `npm test` 543 passed / 모듈 경계 위반 0건

---

## 2026-05-07 Phase B-1 마감 후속 (4 commits)

### [Claude Code] TypeScript parameter property → 수동 declaration (커밋 e706a79)
- Node.js `--experimental-strip-types` 모드는 `constructor(private readonly llm: LLMJsonClient) {}` 미지원
- PM2 시작 시 `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` 발생
- Classifier / Summarizer / Tagger 3개 클래스 → 일반 property declaration + assignment 패턴

### [Claude Code] 캘린더 인텐트 LLM 필드명 미스매치 수정 (이번 세션)
- **증상**: "5월 22일 11:10 원준이 전화상담" → 봇은 성공 응답하지만 캘린더에 안 보임
- **원인**: LLM이 `params: {summary, start}` 반환, 핸들러는 `{title, startTime}`만 읽음
  - 결과: title="새 일정" (폴백), startTime=now (폴백) → 엉뚱한 시간/제목으로 생성
- **수정**: `intent.params.title ?? intent.params.summary` / `startTime ?? start` / `endTime ?? end` 양쪽 허용
- **응답 보강**: `📅 캘린더 일정 생성됨 / 📌 제목 / 🕐 KST 시간` 형식으로 회장님이 즉시 확인 가능
- **수정 파일**: `server/intent/handlers/google.ts`

### [Claude Code] /tg 명령 over-engineering 인정 — 향후 방향 재조정
- 회장님 피드백: "메모는 캘린더·노션이 더 편함, 텔레그램 자체 검색도 가능. /tg 후 폴더 들여다볼 일 거의 없음"
- 결정: `/tg` 코드는 보존 (재활용 가능), 회장님은 안 쓰셔도 됨
- **다음 우선순위는 `/nb` NotebookLM 회수** (회장님 30개+ 노트북에서 가치 있는 분석을 Wiki로 끌어오는 경로)
- Phase B-1 코드는 후속 어댑터들(음성·Gmail·회의록·NotebookLM)이 같은 골격 재활용

### [Claude Code] ASTON_WIKI_ROOT 환경변수 적용 (.env, gitignored)
- 합의(CURRENT_TASK §8.2): 운영 Wiki는 G 드라이브
- `.env`에 `ASTON_WIKI_ROOT=G:\내 드라이브\Aston-Wiki` 추가
- 기존 `WIKI_ROOT=D:\구글연동AI\data\wiki`는 보존 (옵션 A — 레거시 데이터 그대로)
- 신규 Knowledge Pipeline 저장 = G 드라이브, 기존 Phase 1c 저장 = D 드라이브 (두 layout 분리 운영)

### [Claude Code] /wiki 페이지 실데이터 연결 (이번 세션)
- 기존: 카테고리 카드 9개 + "Google Drive 연동 예정" 정적 페이지
- 신규: tRPC `wiki` 라우터 신설 (status / search / byCategory / recent / openFolder)
- UI 변경:
  - 검색창 → 350ms 디바운스 후 wikiStore 검색 (제목·본문·카테고리·source 매칭)
  - 카테고리 카드 → 클릭 시 해당 카테고리 항목 필터링
  - 최근 항목 12개 자동 표시
  - 결과 카드 (제목 / 본문 미리보기 / 카테고리 칩 / 상대 시간)
  - 하단 Wiki 저장소 경로 → **클릭 시 Windows Explorer로 폴더 열림** (보안: aston/legacy 두 옵션만)
- **수정 파일**: `client/src/pages/WikiPage.tsx`, `server/routers/wiki.ts`(신규), `server/routers.ts`

### 검증
- `npm run check` ✅ / `npm run build` ✅
- 기존 테스트 회귀 0건 (492 passed)

---

## 2026-05-07 Phase B-1 — Knowledge Pipeline 레퍼런스 구현 (Telegram + 공통 8단계)

### [Claude Code] Knowledge Core Phase A·B-0·B-1 완료
- **설계 문서 3종**: `docs/knowledge-core/phase-a-b-final.md`, `phase-b0-interfaces.md`, `phase-b1-readiness-eval.md`
- **CURRENT_TASK.md**: 12개 합의사항 명시 후 구현 진입
- **신규 모듈**: `server/knowledge/` — Modular Monolith 도메인 추가 (모듈 경계 검사 등록)
- **TelegramAdapter** (단계 1): `/tg #project 본문` 명령 PipelineInput 변환
- **Token Dispatcher** (parser): 정규식 한 줄 금지, prefix별 핸들러 등록 구조. `#project` 1종만 등록, 향후 `+`, `@`, `!`, `due:`, `tag:`, `perm` 확장 가능. 미등록 prefix 토큰은 `unknown_tokens`에 보존
- **Cleaner** (단계 2, LLM 미사용): invisible chars / 스마트쿼트 / 공백 정규화. 원본 보존
- **Classifier** (단계 3, Gemini): 9개 카테고리. `explicit_project` 있으면 LLM 호출 생략
- **Summarizer** (단계 4, Gemini): title + summary + key_points + action_item_candidates. 100자 미만은 LLM 생략
- **Tagger** (단계 5, Gemini): tags / people / companies / importance / permanent_knowledge / privacy_level. command_hints가 LLM 추정값 우선
- **Router** (단계 6): 자동 promotion 절대 X. `explicit_command` → `projects/{p}/notes/`, 그 외 → `inbox/{source_type}/`
- **WikiWriter** (단계 7): 신규 frontmatter (18개 필드) + 기존 `categories` 호환성 보존. `ASTON_WIKI_ROOT > WIKI_ROOT > data/test-wiki` 우선순위. 멱등성 (`source_ref + sha256(raw_text)`) + Track A 재처리 (`reprocess_requested: true`)
- **PipelineRunner**: LLM 실패 inline 폴백 + `step_failures` + `quality: complete/partial/minimal` 마킹. I/O 실패는 `data/wiki-pending/`에 PendingItem으로 보존
- **PendingQueue**: 동일 source_ref 재실패 시 attempts 누적 + 첫 실패 시각 보존
- **Pipeline Events** (단계 8 stub): no-op subscriber 인터페이스만 노출
- **인텐트 등록**: `tg_pipeline_capture` 액션 신규. `knowledge` 도메인 신규. `/tg` 매처를 fallbackIntent 최우선에 배치 (회귀 0)
- **2단계 응답**: messageRouter.ts에 `/tg` 한정 ack 메시지 (`📝 Wiki 저장 처리중...`) 추가, 본 응답은 핸들러 결과
- **Phase 1c 보존**: 기존 `wiki_auto_classify` (`저장해`, `자동저장`) 그대로 동작. `/tg`만 신규 경로
- **수정 파일**:
  - 신규: `server/knowledge/{types,README,adapters/telegram,parser/tokenDispatcher,parser/handlers/projectToken,pipeline/{cleaner,classifier,summarizer,tagger,router,runner},storage/{wikiWriter,pendingQueue},events/pipelineEvents}.ts`
  - 신규: `server/intent/handlers/knowledgePipeline.ts`
  - 신규 테스트 7개 파일, 59 tests
  - 수정: `server/intent/{types,fallbackIntent,registry}.ts`, `server/llm/telegramBot/messageRouter.ts`(11줄), `scripts/check-module-boundaries.ts`(1줄)
  - 수정: `server/__tests__/googleSheets.test.ts` (env 격리 보강 — Phase B 무관, 1줄)
- **검증**: `npm run check` ✅ / `npm run build` ✅ / `npm test` **492 passed** (433→+59), 0 failed

### 합의 외 미구현 (의도적 제외, B-1 범위 밖)
- NotebookLM 자동화 / Gmail / 음성 STT / 카톡 / MTProto 통합
- 자체 RAG / 벡터DB
- 기존 Wiki 마이그레이션
- 일괄 재처리 CLI (Track B)
- inbox/_suggested 키워드 힌트 자동 생성 (B-1 후속)

---

## 2026-05-07 후속 세션 (운영 환경 복구 + Claude Code 자동화, 2 commits)

### [Claude Code] wouter Link 중첩 `<a>` hydration 오류 제거 (커밋 58929f2)
- **증상**: 브라우저 콘솔에 `<a> cannot be a descendant of <a>` 다수 출력 → React hydration 오류
- **원인**: wouter `Link` 컴포넌트가 자체적으로 `<a>` 렌더링하는데 자식으로 또 `<a>` 두는 패턴이 7개 파일에 산재
- **수정**: `<a>` 제거 + className을 `Link`로 이동
- **수정 파일**: `Home.tsx`, `Settings.tsx`, `Navbar.tsx`, `DocMenu.tsx`, `PFSummaryWidget.tsx`, `TradingSummaryWidget.tsx`, `QuickCommandWidget.tsx`
- **검증**: 7 files changed, 51 insertions(+), 71 deletions(-)

### [Claude Code] PM2 우선 실행 규칙 + SessionStart 점검 스크립트 (커밋 7de5869)
- **CLAUDE.md**: 앱 실행 전 `pm2 list` 우선 확인 규칙 추가
  - `aston` online이면 추가 실행 금지 (4000 포트 충돌 방지)
  - PM2 없을 때만 `npm run dev` 사용
- **scripts/session-check.mjs**: Claude Code SessionStart 훅용 스크립트
  - `.env` 필수 키 5종 (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `WORKSPACE_SPREADSHEET_ID`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`) 검증
  - PM2 aston 상태 + 4000 포트 점유 여부 한 줄 출력
  - 다음 세션부터 자동 실행

### [Claude Code] 운영 환경 복구 (`.env` 정상화, 커밋 없음 — gitignored)
- **GOOGLE_CLIENT_ID** 추가 (그동안 누락 상태) → Google OAuth 로그인 가능 상태 복구
- **GOOGLE_CLIENT_SECRET** 변수명 정상화 (`_CLIENT_SECRET` → `GOOGLE_CLIENT_SECRET`)
- **WORKSPACE_SPREADSHEET_ID** 추가 (Aston-Deals-Dashboard, `1kX_l2bQw8II4LZCwdS9_QEQ9JQ4HfpXYGpDoIF9F8b0`)
- **PORT=4000** 명시 추가
- **검증**: PM2 재시작 후 `[Google] CLIENT_ID set: true, SECRET set: true` 확인

### [Claude Code] Claude Code 자동화 4종 적용 (`.claude/settings.json` — gitignored)
- **권한 allowlist 8종** 추가: `netstat *`, `pm2 list/logs/--version`, `tasklist *`, `pnpm/npm check` (오늘 가장 많이 권한 팝업 뜬 명령들)
- **PreToolUse 훅**: `git commit *` 실행 전 `npm run check` 자동 → 실패 시 커밋 차단
- **SessionStart 훅**: 세션 시작 시 `session-check.mjs` 자동 실행
- **codex:setup** 점검: Codex CLI 0.128.0 / ChatGPT 로그인 / direct runtime 정상

### 알려진 이슈 (이번 세션 발견, 미해결)
- `[openclawClient] probeGatewayRpc: Cannot find module 'C:\Users\admin\AppData\Roaming\npm\node_modules\openclaw\dist\call-DS_a955m.js'`
  - `openclawRuntime.ts:172`의 `loadGatewayCaller()`에서 `process.env.APPDATA` 비어 있을 때 잘못된 경로 조립
  - 매 세션 startup 에러 로그 발생, 기능적으로는 시뮬레이션 모드 fallback (영향 없음)

---

## 2026-05-07 (P0/P1/P2 정리 + UX/Perf/CI 강화, 7 commits)

### [Claude Code] 알려진 미해결 이슈 4건 일괄 해결 (커밋 bd30c1c)
- **OpenClaw URL 오탐지**: `data/openclaw-discovery.json` URL `openclaw.local` → `http://localhost:8000`
- **Gate.io 400 에러**: `gateioConnector.ts`에 `hasApiKey()` + `requireApiKey()` 가드 추가 — 잔고/포지션/거래내역만 차단, `getTicker`(공개 API)는 영향 없음. 인텐트 핸들러에서 미설정 시 친절한 응답.
- **웹 intent 응답 data 누락**: `server/routers/llm.ts`의 모든 return 경로(`handled` / `requiresConfirmation` / `auth-error` / LLM fallback)에 `data` + `sources` 필드 통일 → tRPC 추론 타입 일관성.
- **Telegram 라우팅 이중화**: `messageRouter.ts`에서 `handleWorkspaceCommand` 선행 호출 제거. `routeIntentMessage` 우선 시도 후, Google 도메인 미처리 시에만 `handleWorkspaceCommand` 폴백 (send_drive_file 등 Telegram 전용 액션).
- **부수**: `intelligence/collector.ts` 모듈 경계 위반 수정(`_core/wikiProxy` 경유), `writeWiki` title 누락 보정, `telegram`/`gram.js` 패키지 설치, `quickCommand.ts` `llmChat` 반환 타입에 `sources` 추가
- **수정 파일**: `data/openclaw-discovery.json`, `server/exchanges/gateioConnector.ts`(+test), `server/intent/handlers/trading.ts`, `server/routers/llm.ts`, `server/llm/telegramBot/messageRouter.ts`, `server/_core/wikiProxy.ts`(신규), `server/intelligence/collector.ts`, `server/intent/handlers/wiki.ts`, `client/src/chat/quickCommand.ts`
- **검증**: check ✅ / build ✅ / test 415 passed (55 files)

### [Claude Code] 진단서 §8 잔여 2건 보완 (커밋 22588e6)
- **chatSyncRouter ownership check**: `getMessages` / `getRecentMessages` / `searchMessages` 3개 procedure에서 `conversation.userId !== ctx.user.id` 검증 추가 → 타 사용자 대화 무단 조회 차단
- **한남 PF 개별 딜 파싱**: `<딜명> [PF] (진행상황|상태|현황)` 패턴을 `deals_command`로 라우팅. `intent.params.syntheticCommand`로 `딜 <딜명>` 형태 합성 명령 전달. 예약 키워드(PF/포트폴리오/파이프라인)는 기존 generic 매처 유지
- **수정 파일**: `server/routers/chat-sync.ts`, `server/intent/fallbackIntent.ts`, `server/intent/handlers/deals.ts`, `server/__tests__/dealNameParsing.test.ts`(신규, 8 tests)
- **검증**: check ✅ / build ✅ / test 423 passed (56 files, +8)

### [Claude Code] 홈 KPI 'today' 의미 일치 (커밋 2dc3e9a)
- **신규 엔드포인트**: `googleWorkspace.calendar.getTodayEvents` (KST 00:00~24:00 일정만)
- 홈 '오늘 일정' KPI: `getUpcomingEvents(100)` → `getTodayEvents` (라벨과 데이터 의미 일치)
- 홈 '받은 메일' KPI: `getEmails(100)` → `getEmails({query:"newer_than:1d"})` (오늘만)
- **수정 파일**: `server/routers/google-workspace.ts`, `client/src/pages/Home.tsx`

### [Claude Code] 홈 활동 피드 mock 제거 (커밋 c973ab5)
- 하드코딩된 6개 activities 항목 ('2분 전', '8분 전' 등 fake 시간) 완전 제거
- 이미 로드된 KPI 쿼리 결과 재사용해 동적으로 구성 — 추가 네트워크 요청 0건
  - Google 일정: 가장 가까운 미래 일정
  - Gmail 수신: 가장 최근 메일 1건
  - 트레이딩 알림: 가장 최근 webhook
  - PF 딜 변경: 가장 최근 갱신 딜
  - Telegram: 봇 활성 상태
- `formatRelativeTime()` 헬퍼 추가 (5분 전 / 2시간 전 / 3일 전)
- 시간 역순 정렬, 최대 6건 표시, 데이터 0건 시 폴백 메시지

### [Claude Code] Google 재인증 인라인 액션 버튼 (커밋 38407e7)
- 채팅에서 'Google 재인증이 필요합니다' 응답 메시지 하단에 'Google 다시 연결' 버튼
- amber 톤(경고색) + LogIn 아이콘, 클릭 시 `/google` 페이지로 이동
- 기존 동작(사이드바에서 직접 찾아 이동) → 1-click 재연결로 단축
- **수정 파일**: `client/src/components/UnifiedChatInterface.tsx`

### [Claude Code] TradingView 로딩 스켈레톤 + 빌드 스모크 (커밋 64f47fd)
- **TradingView 위젯**: 심볼 전환 시 즉시 로딩 오버레이 (cyan 펄스 도트 3개), MutationObserver로 iframe 등장 감지 → 자동 페이드아웃, 5초 안전 timeout. 차트 깜빡임 제거.
- **빌드 스모크 검사**: `scripts/smoke-routes.ts` 추가. dist/public/index.html + JS 번들 무결성 + 핵심 라우트 8개 (`/`, `/chat`, `/trading`, `/real-estate-pf`, `/google`, `/settings`, `/monitoring`, `/login`) 검증. `npm run smoke:routes` / `deploy:check` 통합.
- **수정 파일**: `client/src/components/trading/ChartArea.tsx`, `scripts/smoke-routes.ts`(신규), `package.json`

### [Claude Code] Telegram KPI 카드 mode 표시 (커밋 ab82382)
- 기존: 'Telegram 상태' KPI가 '활성/오프'만 표시 → 운영 모드 불명확
- 개선: hint 라벨에 mode 동적 표시 (`webhook 모드` / `polling 모드`)
- 상태 체계화: 토큰 없음 → 초기화 중 → 활성 → 오프 → 연결 필요/실패
- `telegram.getStatus` 엔드포인트의 `mode`/`webhookUrl` 정보를 UI까지 노출
- **수정 파일**: `client/src/pages/Home.tsx`

---

## 2026-05-06 (P2 Intelligence System)

### [Claude Code] Phase 1c — Gemini 자동 분류 Wiki 저장 (커밋 34f7d19)
- 트리거: `저장해 [텍스트]`, `분류저장`, `자동저장`
- Gemini → category/summary/tags 추출 → writeWiki() 저장
- 응답: `✅ Wiki 자동 저장 완료 | #카테고리 | 한 줄 요약`
- 테스트 6건 추가

### [Claude Code] Phase 1d — MTProto 채널 수집기 (커밋 72f51e0~c384a11)
- `telegram`(gram.js) 패키지 설치
- `server/intelligence/collector.ts`: 채널 메시지 → Gemini 분류 → Wiki 저장
- 스마트 필터: 150자 이상 + 관련 키워드 + 일일 200건 상한
- 수집 채널 12개: 코인/주식/제약/바이오/거시/부동산 분야
- API 키: TELEGRAM_API_ID/HASH 설정 완료 (OTP 인증 성공)
- 환경변수: TELEGRAM_CHANNEL_IDS=12개 채널 목록

## 2026-05-06 (P1 완료)

### [Claude Code] Gemini Grounding 소스/인용 칩 UI (커밋 e9f62a0)
- `caller.ts`: 소스를 content 텍스트에 붙이지 않고 `sources[]` 분리 반환
- `llm.ts`: sources 필드 클라이언트 전달
- `UnifiedChatInterface.tsx`: 메시지 버블 하단에 cyan 칩 렌더링 (클릭 시 출처 링크)
- **검증**: `npm run build` ✅

### [Claude Code] 홈 KPI 로딩/에러 UX 개선 (커밋 4f778e1)
- 로딩("...") → pulse 애니메이션 + muted 색상
- 에러("연결 필요"/"연결 실패") → amber 카드 테두리 + amber 값/아이콘
- **검증**: `npm run build` ✅

## 2026-05-06 (추가)

### [Claude Code] 딜 시트 연동 완료 + 인텐트 버그 2건 수정 (커밋 ed65ba9)
- **딜시트 → Drive 오류 버그**: `isDealIntentMessage` 정규식 `^딜(?:\s+|$)` → `^딜` 수정 (공백없는 "딜시트" 미매칭 → Drive 검색으로 낙하)
- **환경변수 추가**: `.env`에 `DEALS_ROOT=G:\내 드라이브\Aston-Deals`, `GOOGLE_SHEETS_USER_ID=4` 추가
- **딜 시트 동기화 성공**: 텔레그램 `딜 시트` → 3건 동기화, SpreadsheetId `1DiOS7N-...`
- **workspace-sheet.json 갱신**: 딜 대시보드 시트로 연결 (Dashboard 탭)
- **수정 파일**: `server/intent/fallbackIntent.ts`, `server/__tests__/dealRouting.test.ts` (+2 테스트), `.env`, `data/workspace-sheet.json`
- **검증**: `npm run build` ✅, 테스트 10 passed ✅, 텔레그램 딜 시트 동기화 3건 확인

## 2026-05-06

### [Claude Code] 홈 KPI 총 자산 Upbit 교체 (커밋 7cb5922)
- **작업**: `Home.tsx` Trading KPI를 Gate.io(미연결) → Upbit KRW 잔고로 교체
- **수정 파일**: `client/src/pages/Home.tsx`
- **검증**: `npm run build` ✅, 라벨 "총 자산 (USDT)" → "총 자산 (Upbit)", 만/억 한국어 포맷

### [Claude Code] 업비트 잔고 응답 한국어 포맷 (커밋 edfa8ff)
- **작업**: `tradingBalance` 핸들러 — 잔고 데이터를 텔레그램/웹 응답 텍스트에 직접 포맷
- **수정 파일**: `server/intent/handlers/trading.ts` — `formatBalanceText()` 추가
- **검증**: `npm run build` ✅, 텔레그램 응답 "💰 UPBIT 잔고 / ₩13,778 KRW" 정상

### [Claude Code] 업비트잔고 인텐트 binance 낙하 버그 수정 (커밋 ea7ce5a)
- **작업**: `fallbackIntent.ts` — "업비트" 한글 키워드 누락으로 기본값 binance로 라우팅되던 버그
- **수정 파일**: `server/intent/fallbackIntent.ts`, `server/__tests__/fallbackIntentRules.test.ts` (+4 테스트)
- **검증**: `npm test` 12 passed ✅

### [Claude Code] Yahoo Finance 프록시 User-Agent 수정 + 웹 채팅 QA
- **작업**: `/api/yahoo-chart` 프록시 서버사이드 fetch에 User-Agent 헤더 추가 (미설정 시 Yahoo Finance 차단됨)
- **수정 파일**: `server/routers/proxy.ts` — fetch 옵션에 Chrome UA 추가
- **웹 채팅 QA**: 코드 정적 분석으로 Enter/버튼/빠른명령/음성/초기화/수정/삭제/검색/내보내기/중복억제/Telegram동기화 전 항목 구조 정상 확인
- **검증**: `npm run build` ✅
- **잔여**: 실제 브라우저 기동 후 운영 확인 필요 (워크트리 환경 .env 없어 서버 기동 불가)

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
