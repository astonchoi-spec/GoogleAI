# HANDOFF.md — 에스턴 워크스테이션
> 업데이트: 2026-05-12 Step 2 코드 골격 완료 (research_run 인텐트 + 핸들러) — 회장님 PC 설치/활성화만 남음 | 브랜치: codex-google-workspace-expansion

---

## 🏠 다음 작업 (Step 2 회장님 PC 설치 / 활성화)

### Step 2 — ✅ 2026-05-12 코드 골격 완료 (Claude Code)

**구현**
- `server/intent/types.ts` — `IntentAction "research_run"` 신규
- `server/intent/handlers/researchRun.ts` (신규, ~200줄)
  - env 가드 (NLM_RESEARCH_ENABLED + NLM_RESEARCH_ROOT) — 회장님 PC 외 자동 차단
  - 활성 시 `spawn("claude", ["-p", "/research run \"<topic>\" --auto", "--add-dir <root>", ...])` fire-and-forget
  - 비활성 시 워크스테이션 콘솔 명령어 안내 메시지 출력
- `server/intent/registry.ts` / `fallbackIntent.ts` / `classifier.md` 라우팅 등록
- `.env.example` — NLM_RESEARCH_* 4종 + 활성화 조건 주석
- 사전 조사 결과: `claude -p` + `--add-dir` + `--max-budget-usd` 등 비대화식 옵션 활용 가능

**검증**
- `npm run check` ✅ / `npm run build` ✅ (809.4 → 815.6kb, +6.2kb)
- `npx vitest run researchRun` ✅ **10 passed** (매칭 4 / 비활성 3 / 검증 3)

**활성화 보류** (2026-05-12 결정) — 설치 타당성 검토 결과:
- 비공식 NotebookLM API 의존(보안·합법성·차단 리스크)
- 현재 4채널 회수 라인 이미 작동 (한계 효용 작음)
- 회장님 사용 빈도 미확정 (자동화 ROI 회수 기준 불명)
- `NLM_RESEARCH_ENABLED=false` 기본값 — 텔레그램 `리서치 ...` 는 수동 안내만 출력 (무해)
- 코드 골격은 보존 — 재활성화 조건(repo URL 신뢰 + 주 3+ 노트북 + 차단 위험 감수) 충족 시 즉시 사용 가능
- 동선·재활성화 조건 상세: TODO.md "Step 2" 참조

---

### Step 1.5 — ✅ 2026-05-12 구현 완료 (Claude Code)

**구현**
- 백엔드: `server/knowledge/wikiUpload.ts` (Express handler, base64-in-JSON, 신규 의존성 0)
  - POST `/api/wiki/upload` + GET 헬스체크 + OPTIONS CORS
  - project 화이트리스트(yaml 28 + research-inbox + _unmapped) / 확장자 7종 / 35MB / 경로 traversal 차단 / 충돌 시 `(2)` rename
- tRPC: `rag.listUploadProjects` — 모달 드롭다운용 (displayName + isSpecial 플래그)
- 부팅: `setUploadAllowedProjects(projectList)` 를 `server/_core/index.ts` 의 매핑 yaml 로드 분기에 추가
- 클라이언트: `client/src/components/WikiUpload.tsx` (drag-drop + 모달 + XHR 진행률)
- 통합: `client/src/pages/WikiPage.tsx` 헤더 우측 [📤 Wiki 자료 업로드] 버튼

**검증**
- `npm run check` ✅ (모듈 경계 0건 / tsc 통과)
- `npm run build` ✅ (797.9kb → 805.4kb, +7.5kb)
- `npx vitest run server/__tests__/wikiUpload.test.ts` ✅ **11 passed** (화이트리스트/저장경로/rename/path-traversal/data-URL prefix/research-inbox/이미지 willAutoIngest=false)
- 전체 `npx vitest run`: 832 passed / 4 failed — 실패 4건 모두 격리 실행 시 27/27 통과 (전체 suite 동시 실행 시 5s 타임아웃 초과하는 사전 존재 flaky 테스트). 내 변경 회귀 0건

**회장님 라이브 검증 필요**
- [ ] PM2 재시작 (`pm2 restart aston`) — 부팅 로그에 `[wiki/upload] 허용 project 30개 등록` 확인
- [ ] http://localhost:4000/wiki 우상단 [📤 Wiki 자료 업로드] 클릭 → 모달 등장 + project 드롭다운에 28+research-inbox+_unmapped 표시
- [ ] PDF 1개 drag-drop → 업로드 → `${ASTON_WIKI_ROOT}/notebooklm-exports/{project}/` 에 저장 확인
- [ ] 5초 내 Drive Watcher 가 회수 → `/notebook-lm` 페이지 회수 자료 목록 등장
- [ ] 텔레그램 자연 질의 → 업로드한 PDF 본문 인용 확인

---

### Step 1 — ✅ 2026-05-11 코드 / 2026-05-12 라이브 검증 완료
- driveSync `.pdf` 본문 자동 추출 활성화 (`extractAttachmentText` 재사용, 신규 의존성 0)
- `npm run check` / `npm run build` / `npm test driveSyncPdf` 전부 통과
- 2026-05-12 회장님 라이브 검증 통과 — PM2 재시작 후 `[rag/driveSync] 🚀 시작: 29 폴더 감시` 부팅, PDF 회수·인용 동작 확인

### Step 1.5 — Aston Wiki 페이지 업로드 UI (다음 작업, ~5시간)
- 백엔드: `server/routers/wikiUpload.ts` (또는 기존 라우터 확장) — POST `/api/wiki/upload` multipart
- project 화이트리스트(28+research-inbox+_unmapped) + 50MB + 확장자 화이트리스트
- 클라이언트: `client/src/components/WikiUpload.tsx` drag-drop + 모달
- 저장 경로: `${ASTON_WIKI_ROOT}/notebooklm-exports/{project}/{원본파일명}` → 자동으로 Drive Watcher 가 회수 (Step 1 효과)

### Step 2 — nlm-research 별도 폴더 + Aston 텔레그램 단추 (Step 1.5 후)
- 회장님 PC 1회 설치(`uv tool install notebooklm-mcp-cli yt-dlp` + `nlm login`)
- mklink: `~/research-output` → `${ASTON_WIKI_ROOT}/notebooklm-exports/research-inbox/`
- 사전 조사: `claude` CLI 비대화식 skill 실행 옵션 존재 여부 → 결과에 따라 인텐트 `research_run` 핸들러 ~50줄

---

## 마지막 완료 작업 (Step 1 — driveSync .pdf 본문 자동 추출)

**2026-05-11 driveSync 에 PDF 본문 추출 분기 추가 | Claude Code**

### 구현
- `server/knowledge/driveSync.ts` — `.pdf` 를 `SUPPORTED_AUTO_INGEST` 에 추가, `META_ONLY_TYPES` 에서 제거
- 본문 추출 분기: `.docx` 옆에 `.pdf` 분기 — `await import("../llm/attachmentExtract.ts")` 로 `extractAttachmentText(filePath)` 호출(pdf2json 재사용, 신규 의존성 0)
- 스캔 이미지·암호 잠금 등 `ok=false` 케이스는 `recordEvent({ reason: "failed", error })` 후 회수 스킵
- dynamic import `.ts` 확장자 명시 — PM2 `node --experimental-strip-types` 호환
- 상수 2개 export 화 + 회귀 가드 테스트 (`server/__tests__/driveSyncPdf.test.ts`, 5 passed)

### 검증
- `npm run check` ✅ (모듈 경계 0건 — `llm` 은 도메인 모듈 미등록, `knowledge → llm` 허용)
- `npm run build` ✅ (797.9kb)
- `npm test driveSyncPdf` ✅ 5 passed
- 전체 `npm test` 823 passed / 2 failed — 두 실패 모두 **stash 상태(내 변경 제거)에서도 동일 실패** → 환경 의존(실제 `ASTON_WIKI_ROOT` 회수 자료 존재), 내 변경 회귀 0건

### 회장님 라이브 검증 — ✅ 2026-05-12 통과
- [x] PM2 `aston` 재기동 — driveSync 가 새 `SUPPORTED_AUTO_INGEST` (`.pdf` 포함) 로 부팅 (`🚀 29 폴더 감시`)
- [x] PDF 회수·인용 동작 확인 (회장님 직접)

---

## 이전 완료 작업 (Agent↔RAG 합성 — notebook-query 재라우팅)

**2026-05-11 notebook-query 템플릿 → Phase 4-A 로컬 RAG 재라우팅 | Claude Code**

### 구현
- `server/_core/ragProxy.ts` 신규 — `searchLocalNotes`/`formatCitationFooter` re-export (모듈 경계 우회)
- `server/agents/agentExecutor.ts` — `runAgent`/`runSimulation` 양쪽에 `templateId === "notebook-query"` 분기 추가 → `searchLocalNotes(question, { k: 5 })` 호출 → markdown 생성 → `AGENT_WIKI_PATH` 저장
- `server/agents/agentTemplates.ts` — label `NotebookLM 회수 자료 검색`, instructions를 외부 자동화 미사용으로 갱신
- 회수 자료 0건 케이스: Chrome Extension + Drive Watcher 사용법 안내 자동 포함

### 배경
- NotebookLM 외부 자동화(notebooklm-mcp 등) 도입 보류 결정(2026-05-11)
- 이미 Chrome Extension + Drive Watcher + Phase 4-A 로 회수 자동화 완성된 상태 — 가짜 시뮬·OpenClaw 자동화는 가치 낮음

### 검증
- `npm run check` ✅ / `npm run build` ✅ / `npm test` ✅ **820 passed** (회귀 0건, +2 신규)
- `dealStore.test.ts` 1건 일시 fail 관측 — 내 변경과 무관 (단독 실행 통과, flaky)

### 회장님 운영 검증 필요
- [ ] 텔레그램에서 `에이전트 실행 notebook-query 한남동644 NPV 수익률은?` → 회수 자료 발췌(NPV 15.3% 등) 도착 확인
- [ ] 빈 프로젝트 키로 실행 → "회수 자료 없음" + Chrome Extension 가이드 출력 확인

### 다음 단계 후보
- `notebookLmMcp.ts` 데드 코드 정리 (4곳 사용처 — intent/handlers/intelligence, _core/intentRouter, routers/notebooklm, 테스트)
- Phase 3-A `rag-bootstrap.ts` (Vertex AI 데이터스토어 초기화)

---

## 이전 완료 작업 (Phase 4-C — 텔레그램 RAG 적용)

**2026-05-11 Phase 4-C — 텔레그램에 로컬 NotebookLM RAG 주입 | Claude Code**

### 구현
- Phase 4-A(웹 채팅) 패턴을 `server/llm/telegramBot/messageRouter.ts` 에 그대로 이식
- `INTENT_CONFIDENCE_THRESHOLD = 0.7` — `routeIntentMessage` 결과의 약한 매칭(`handled && confidence < 0.7`)을 LLM + RAG 로 다운그레이드
- `replyWithLlm` 내부에 `searchLocalNotes(message, { k: 3 })` 삽입 → systemPrompt 에 `참고할 회수 자료(N건)` 블록 prepend
- 응답 본문 뒤 `formatCitationFooter(hits)` append → 텔레그램 1메시지로 전송
- 회수 자료가 없으면(`hits=0`) 인용 절 없이 평소대로 응답 (4-A 동일)

### 검증
- `npm run check` ✅ / `npm run build` ✅ (794.1kb) / `npm test` ✅ **818 passed** (회귀 0건)
- pnpm install 로 사전 누락 의존성(`mammoth`, `pdf2json`, `@google-cloud/discoveryengine`) 해결

### 회장님 운영 검증 결과
- ✅ **2026-05-11 라이브 검증 통과** — 텔레그램 "한남 PF 진행상황 어때?" → "NPV 15.3%, 36개월" 회수 자료 인용 + 📚 참고 자료 절 정상 출력
- [ ] (선택) 광범위 키워드 자연 질의 → 약한 매칭 다운그레이드 → RAG 응답 확인
- [ ] (선택) 회수 자료 없는 일반 질의 → 인용 절 없이 정상 응답

### 라이브 검증 중 발견·수정
- `server/llm/telegramBot/messageRouter.ts` `await import("../attachmentInject")` → `.ts` 확장자 명시 (커밋 `fd53b07`)
- `server/llm/attachmentInject.ts` `./attachmentExtract` → `.ts` 확장자 명시 (커밋 `3e696fb`)
- `server/routers/llm.ts` `../llm/attachmentInject` → `.ts` 확장자 명시 (동일 위험 선제 차단, 커밋 `3e696fb`)
- 원인: PM2 `node --experimental-strip-types` 런타임에서 dynamic/static import 확장자 누락 시 모듈 해석 실패

### 다음 단계 후보
- Phase 3-A `rag-bootstrap.ts` (Vertex AI 데이터스토어 초기화)
- Phase 4-B 로컬 → Vertex AI Search 전환 (3-A/B 완료 후)
- Agent↔RAG 합성 (`notebook-query` 템플릿을 4-A 로 재라우팅)

---

## 이전 완료 작업 (Worktree 사고 정리 + 재발 방지 가드)

**2026-05-10 Worktree 베이스 사고 정리 + 가드 설치 | Claude Code**

### 사고 요약
별도 Claude Code 세션이 master 48bba87 베이스 worktree(`funny-chebyshev-3115be`)에서 시작되어 베이스 점검 없이 6시간 분량 작업(agent layer / Google OAuth 부트스트랩 / 메시지 검색·페이지네이션·Toast / Web UI 변경) 진행. 사용자가 dev 서버 띄웠을 때 1달 전 master 화면이 떠 "내 작업이 사라졌다"고 오해. codex 라인은 이미 [agents.ts], [AgentControl.tsx], [rag.ts], [attachmentExtract.ts] 등 더 발전된 시스템 보유 — 그 worktree에서 한 모든 작업은 본체에 흡수 불가.

### 정리 결과
- master 48bba87 베이스 worktree 4개 폐기: `funny-chebyshev-3115be / cranky-sammet-48e809 / great-euclid-db7423 / relaxed-jones-1e9acb` — git worktree 등록 해제 + 브랜치 삭제 ✅
- `blissful-rubin-98d15e` (5b18619, PDF 백업 베이스)는 의도 보존 ✅
- 빈 디렉토리 3개 잔존(file lock) — 사용자 세션 종료 후 1줄로 정리

### 재발 방지 가드 (영구 설치)
- **CLAUDE.md** — "🛑 브랜치 / Worktree 베이스 규칙" 섹션 신설(코드 수정 전 4-step 점검 강제) + "앱 실행 규칙"에 "worktree 안에서 dev 금지" 추가. 모든 새 Claude Code 세션이 자동 로드.
- **사용자 메모리 가드 3중** (홈 디렉토리, git 추적 외):
  - `feedback_worktree_baseline_check.md` (신규) — 4-step 점검 hard rule + 사고 사례
  - `project_google_telegram_ai.md` — 사고 기록 섹션 추가
  - `MEMORY.md` 인덱스 최상단 🛑 우선순위 배치

### 검증
- `git worktree list` → codex-google-workspace-expansion + blissful-rubin-98d15e 만 잔존 ✅
- `git branch -a | grep claude/` → claude/blissful-rubin-98d15e 만 잔존 ✅
- 코드 변경 없음(운영 문서·규칙만) → check/build/test 영향 없음

### 다음 단계
- Phase 4-C 텔레그램 RAG 적용 (`server/llm/telegramBot/messageRouter.ts` 동일 패턴 — confidence 가드 + RAG 호출)으로 복귀

---

## 이전 완료 작업 (Phase 4-A 구현 + 라이브 검증)

**2026-05-10 Phase 4-A — 로컬 NotebookLM 회수 자료 → Web Chat RAG 주입 (라이브 검증 통과) | Claude Code**
- 신규 `server/rag/localMdSearch.ts` (~250줄) — `${ASTON_WIKI_ROOT}/projects/*/notebooklm/*.md` 스캔, TF + frontmatter 1.5× + 제목/파일명 +5 점수식, 5분 mtime 캐시, top-K=3, 500자 매칭 윈도 snippet
- `formatCitationFooter()` — "📚 참고 자료" 한국어 인용 절
- `routers/llm.ts:chat` — 인텐트 fallthrough 직후 RAG 단계 삽입 + systemPrompt 주입 + sources(file://)
- **라이브 보강 (검증 중 발견·수정)**: `routers/intent.ts:route` 와 `routers/llm.ts:chat` 양쪽에 confidence<0.7 가드 추가. 약한 매칭이 자연 질의를 가로채던 문제(예: "한남 PF" → realestate_portfolio_summary confidence 0.55) 해결. 약한 매칭은 handled=false 로 다운그레이드 → 클라이언트가 llm.chat 으로 fallback → RAG 작동
- 검증: check ✅ / build ✅ (784.5kb) / **799 passed** (회귀 0건)

### 라이브 검증 결과 ✅
- 웹 채팅 "한남 PF 진행 상황 어때?" → 응답: "한남동 644 사업성 분석이 완료되었습니다. **NPV 수익률은 15.3%, 예상 사업 기간은 36개월**입니다.\n\n📚 참고 자료\n1. hannam-644/2026-05-07-notebooklm--644----npv--153---3.md"
- 회수 자료의 실제 데이터(NPV 15.3%, 36개월)가 응답에 인용됨 — RAG 정상 동작 확인

### 다음 단계 (Phase 4-B/4-C/4-D)
- Phase 4-B: Vertex AI Search 통합 (Phase 3-A `rag-bootstrap.ts` + 3-B `importDocument` 완료 후)
- Phase 4-C: 텔레그램 적용 (`messageRouter.ts` 동일 패턴 — confidence 가드 + RAG 호출)
- Phase 4-D: chunk-level 검색 + 임베딩 (먼 후순위)

### 다음 단계 (Phase 4-B/4-C/4-D)
- Phase 4-B: Vertex AI Search 통합 (Phase 3-A `rag-bootstrap.ts` + 3-B `importDocument` 완료 후)
- Phase 4-C: 텔레그램 적용 (`messageRouter.ts` 동일 패턴)
- Phase 4-D: chunk-level 검색 + 임베딩 (먼 후순위)

---

## 이전 완료 작업 (Phase 4-A 설계)

**2026-05-10 Phase 4-A 설계 — 로컬 NotebookLM 회수 자료 → Web Chat RAG 주입 | Claude Code**
- 회장님 결정 확정 — 검색 소스=로컬 `*.md` 직접 스캔 / 적용 범위=웹 채팅만
- 설계 스펙 문서 — `docs/superpowers/specs/2026-05-10-phase4a-local-rag-design.md`
- 자율 결정 — K=3, snippet 500자, TF+frontmatter 1.5×+제목 +5, "📚 참고 자료" 한국어 인용 절

---

## 이전 완료 작업 (Chrome Extension + W-3 .docx)

**2026-05-09 Aston NotebookLM Bridge + Phase W-3 | Claude Code**
- **Chrome Extension** `chrome-extension/` (Manifest V3) — NotebookLM 페이지 우상단에 [📥 Aston Wiki로 동기화] 버튼 자동 주입 (MutationObserver + SPA 라우팅 후크)
- **백엔드** `server/knowledge/extensionIngest.ts` — Express POST `/api/rag/extension-ingest` + SHA-256 멱등성 + URL→project 자동 매칭
- **W-3 mammoth** — `.docx` 본문 자동 추출 (Drive Watcher 도 .docx 자동 회수)
- 검증: check ✅ / build ✅ / **745 passed** (회귀 0건)

### 회장님 직접 작업 (필수)
- [ ] `chrome://extensions` → 개발자 모드 ON → "압축해제된 확장 프로그램 로드" → `chrome-extension/` 폴더 선택
- [ ] PM2 재시작 (`pm2 restart aston`) — 새 Express 라우트 + Extension URL 매핑 적용
- [ ] 화이트리에 노트북 페이지 방문 → 우상단 버튼 1클릭 → 워크스테이션 페이지에 회수 자료 등장 확인

### 27개 URL 한계
- NotebookLM URL 은 계정 고유 UUID — 외부에서 알 수 없음
- 화이트리에 1개만 yaml 매핑됨, 나머지 27개는 회장님이 알려주시거나 Extension 자동 캡처 기능 추가 필요

### 다음 단계 후보
- Extension 자동 URL 캡처 (yaml 자동 갱신)
- Phase W-4 Drive API 직접 호출 (.gdoc)
- Phase 4 채팅 RAG 컨텍스트 주입

---

## 이전 완료 (Phase W-2 — Drive Watcher)

**2026-05-09 Aston RAG Phase W-2 | Claude Code**
- 회장님 작업 지시서 Phase 1의 "Drive Watcher 폴링 상태" 명시 누락 보완
- chokidar 기반 `{ASTON_WIKI_ROOT}/notebooklm-exports/{project}/` 자동 감시 — 28개 project 폴더 일괄 watch
- 신규 .md/.txt 파일 → 5초 내 NotebookLmAdapter + PipelineRunner → Wiki 자동 적재 (멱등성 보장)
- `server/knowledge/driveSync.ts` (~340줄) — 모듈 경계 준수 (project 화이트리스트 외부 주입)
- 신규 tRPC: `driveWatcherStatus` / `triggerDriveScan` / `listSourceFiles`
- 페이지 — Drive Watcher 상태 카드 + 노트북 선택 시 입력 자료 목록 + 회수 자료 목록 + 미리보기 모달
- 검증: check ✅ / build ✅ / **745 passed** (회귀 0건)

### 회장님 직접 운영 검증 (필수)
- [ ] **PM2 또는 npm run dev 재시작** — driveSync 활성화에 필수
- [ ] http://localhost:4000/notebook-lm 접속 → Drive Watcher 카드 🟢 + 28개 감시 폴더 표시
- [ ] `G:\내 드라이브\Aston-Wiki\notebooklm-exports\hannam-644\test.md` 생성 → 5초 내 페이지에 자동 등장
- [ ] 노트북 카드 클릭 → 입력 자료 + 회수 자료 양쪽 표시 확인

### 운영 약속
- **입력**: `G:\내 드라이브\Aston-Wiki\notebooklm-sources\{project}\` 에 PDF/Docs → NotebookLM 소스 연결
- **회수**: NotebookLM 답변 .md/.txt → `G:\내 드라이브\Aston-Wiki\notebooklm-exports\{project}\` → 자동 Wiki 저장

### 다음 단계
- W-3: .docx 본문 자동 추출 (mammoth)
- W-4: Drive API 직접 호출 (.gdoc export)
- Phase 4: 채팅 RAG 컨텍스트 주입

---

## 이전 단계 (Phase W-1 — 수동 붙여넣기, 보조 경로)

**2026-05-09 Aston RAG Phase W-1 | Claude Code**
- 회장님 1순위 ("외부 NotebookLM 분석 → Wiki 자동 저장") 웹에서 동작 가능
- tRPC `rag.saveAnalysis` mutation + `rag.listSavedNotes`/`rag.readSavedNote` query (3중 경로 보안 가드)
- `/notebook-lm` 페이지 — 노트북 카드 선택 → 붙여넣기 폼 → 즉시 회수 자료 갱신 → 본문 미리보기 모달
- 텔레그램 `/nb save` 흐름과 동일한 `NotebookLmAdapter` + `PipelineRunner` 재사용 (회귀 0건)
- 검증: check ✅ / build ✅ / **745 passed** / 라이브 mutation API 응답 정상
- dev 환경 한계: G: 드라이브 미마운트로 실제 파일 쓰기는 pending 큐 폴백. 회장님 PC(G: 마운트)에서 운영 검증 필요

### 회장님 운영 검증
- [ ] http://localhost:4000/notebook-lm → 카드 클릭 → 텍스트 붙여넣기 → 저장 → `G:\내 드라이브\Aston-Wiki\projects\{p}\notebooklm\*.md` 생성 확인
- [ ] 회수 자료 목록 즉시 갱신 + 본문 미리보기 모달 동작
- [ ] 동일 본문 재저장 시 멱등성(was_skipped) 확인

### 다음 단계
- W-2 NotebookLM Docs export → Drive Watcher (회장님 1클릭) — NotebookLM 메뉴 확인 후 진행
- Phase 4 채팅 RAG 컨텍스트 주입

---

## 이전 완료 (RAG 페이지 진입점 정리)

**2026-05-09 Aston RAG 페이지 진입점 통합 | Claude Code (hotfix)**
- 사이드바 "노트북LM" 메뉴(`/notebook-lm`)가 빈 placeholder 페이지를 가리키고 있던 문제 해결
- `/notebook-lm` 라우트를 `KnowledgeRagPage` 로 교체, `/knowledge-rag` 는 alias 유지
- 빈 `NotebookLMPage.tsx` 23줄 삭제 (dead code)
- 페이지 헤더 제목을 "노트북LM"으로 통일 (회장님 결정 — 사이드바 라벨 일치)
- 검증: `npm run check` ✅ / `npm run build` ✅ / 744 passed (회귀 0, flaky 1)

---

## Aston RAG Phase 2 (이전 단계)

**2026-05-09 Aston RAG Phase 2 | Claude Code**
- `@google-cloud/discoveryengine ^2.7.0` 의존성 추가
- `server/rag/gcpAuth.ts` 신규 — ADC 인증 + path 빌더 (서비스 계정 JSON 미사용)
- `server/rag/discoveryEngineClient.ts` 신규 — `createDataStore` / `importDocument` / `query` 3개 핵심 메서드
- tRPC `rag.trackBStatus` (UI 배지) + `rag.queryDataStore` (검색·향후 채팅 RAG 재사용)
- `/knowledge-rag` 페이지 보강 — Track B 탭에 🟢 ADC / ❓ 미설정 배지 + 환경 안내
- 검증: `npm run check` ✅ / `npm run build` ✅ 749.8kb (+4.9kb) / **745 passed** (+11 신규)
- 라이브: `VERTEX_SEARCH_PROJECT_ID=aston-work-station` 환경 + `GET /api/trpc/rag.trackBStatus` → `{configured:true, authMode:"ADC"}` ✅

### 회장님 운영 환경 (확인 완료)
- GCP 프로젝트: `aston-work-station`
- 인증: ADC (`gcloud auth application-default login`)
- 비용: GenAI App Builder Trial credit 142만 원 → Vertex AI Search 100% 커버

### 회장님 후속 액션 (Phase 3 진입 전)
- [ ] `.env` 에 `VERTEX_SEARCH_PROJECT_ID=aston-work-station` 추가 후 서버 재시작
- [ ] GCP 콘솔에서 Discovery Engine API 활성화 확인
- [ ] Phase 3 진행 시점 결정 (데이터 스토어 9개 createDataStore 트리거)

### 다음 단계 (Phase 3 후보)
- `scripts/rag-bootstrap.ts` — 데이터 스토어 9개 일괄 생성
- 회수 자료 → `importDocument` 자동 트리거
- frontmatter 표준화 + Track A Drive Watcher

---

## 2026-05-09 Aston RAG Phase 1 (이전 완료, 참조용)
- `data/rag-mapping.yaml` 28개 노트북 매핑
- `server/rag/{types,mappingLoader,README}.ts`
- tRPC `rag.listMappings` + `rag.listDataStores`
- `/knowledge-rag` 페이지 골격 (2개 탭 + 카테고리 필터)
- 727 → 734 passed (+7), 738.5 → 744.9kb (+6.4kb)

---

## 현재 상태

| 항목 | 상태 |
|------|------|
| 서버 | ✅ `npm run dev` 백그라운드 (포트 4000) — `VERTEX_SEARCH_PROJECT_ID=aston-work-station` 환경 적용 |
| 빌드 | `npm run build` ✅ (2026-05-09, `dist/index.js` 749.8kb, +4.9kb) |
| 테스트 | **745 passed** (2026-05-09, Phase 2 RAG +11 / Phase 1 RAG +7 / Phase 8-A +8 / Phase 0~7-B +133, 회귀 0건) |
| **Aston RAG Phase 1** | ✅ 28개 카탈로그 + `/knowledge-rag` 페이지 + tRPC 라우터 |
| **Aston RAG Phase 2** | ✅ Discovery Engine 클라이언트 + ADC 인증 + `trackBStatus` + `queryDataStore` |
| **Aston RAG Phase W-1** | ✅ 보조 — 웹 붙여넣기 회수 (수동) |
| **Aston RAG Phase W-2** | ✅ Drive Watcher 자동 동기화 (.md/.txt/.docx) |
| **Aston RAG Phase W-3** | ✅ mammoth 기반 `.docx` 본문 자동 추출 |
| **Aston NotebookLM Bridge** | ✅ Chrome Extension — 1클릭 NotebookLM 페이지 → Wiki 적재 (SHA-256 멱등성) |
| **Aston RAG Phase W-4** | ⬜ 대기 (.gdoc Drive API export / 채팅 RAG 주입) |
| 브랜치 | `codex-google-workspace-expansion` |
| **Intent 파이프라인** | ✅ `parseIntent → planIntent → dispatchIntent → formatReply` 4단계 분리 완료 |
| **HandlerResponse 5개 kind** | ✅ list/report/text/error/confirmation 모두 활성 |
| **11개 도메인 핸들러 마이그레이션** | ✅ google/trading/deals/realestate/finance/intelligence/wiki/chat/agents/approval/knowledgePipeline/notebooklm |
| **public API 동결** | ✅ `routeIntentMessage`/`formatIntentRouteMessage` 시그니처 byte-for-byte 보존 |
| **OpenClaw** | ✅ **available=true, simulationMode=false** (2026-05-08 수정) |
| **카톡 자동화** | ❌ OpenClaw 미지원 확정 → 수동 회수(`/kakao paste`)만 제공 |
| **D-day 푸시** | ✅ 매일 KST 08:30 자동 (D-7/D-3/D-1/D-DAY/D+1) |
| OpenClaw URL | `http://localhost:3000` (model: gpt-5-mini, /health 정상) |
| **카톡 자체 릴레이** | ❌ 진행 안 함 — `/kakao paste`로 충분, k.tess.dev 등 외부 릴레이는 불필요 (2026-05-08 결정) |
| /nb 조회 | ✅ list/show/search/help + 28개 노트북 매핑 |
| /nb save | ✅ NotebookLmAdapter → `projects/{p}/notebooklm/` |
| /meet save | ✅ MeetingAdapter → `projects/{p}/meetings/` |
| reprocess CLI | ✅ `npm run reprocess` pending 큐 재처리 |
| Redis | 선택적 (없어도 부팅됨) |
| Google OAuth | ✅ 재인증 완료 (userId=6, Sheets API 정상) |
| Upbit | ✅ 잔고 조회 정상 |
| Gate.io | ✅ API 키 미설정 시 명확한 에러 반환 |
| Yahoo Finance | ✅ 프록시 User-Agent 수정 완료 |
| Sheets UI | ✅ Aston-Deals-Dashboard 연결 완료 |
| DEALS_ROOT | ✅ G:\내 드라이브\Aston-Deals 설정 완료 |
| 홈 대시보드 | ✅ 모든 KPI/활동 피드 실데이터 |

---

## 마지막 완료 작업

**2026-05-08 ~ 05-09 Intent Service 리팩토링 Phase 0~7-B | Claude Code (대규모 리팩토링)**
- Connect AI v2 벤치마킹 후 `intentService.ts` 4단계 파이프라인 + HandlerResponse 표준 스키마 점진 도입
- **public API 시그니처 100% 동결** — `routeIntentMessage`/`formatIntentRouteMessage` byte-for-byte 보존
- **응답 문자열 100% 보존** — 11개 도메인 ~91개 분기 모두 byte-for-byte 동일
- **5개 kind 모두 활성화** — list (Phase 6-A) / report (6-B) / text (6-C) / error (7-A) / confirmation (7-B)
- 신규 파일: `pipeline/{parseIntent,planIntent,dispatchIntent,formatReply}.ts`, `intentSchemas.ts`, `promptLoader.ts`, `prompts/{classifier,planner}.md`
- 수정: `intentService.ts` 227 → 99줄, `types.ts`(HandlerResponse 정의), 11개 도메인 핸들러
- 신규 단위 테스트 134건 (`dispatchIntent.test.ts` + `formatReply.test.ts`)
- 설계서 `docs/refactor/intent-service-refactor-plan.md` (16개 Phase 구현 로그)
- 검증: `npm run check` ✅ / `npm run build` ✅ / **719 passed** (586 → +133)
- raw object/사용자 원문/토큰/시크릿 0건 노출 (단위 테스트로 검증)

### 다음 작업 후보 (Phase 8 cleanup)
- `prompts/` 프로드 번들 esbuild plugin (현재 인메모리 fallback)
- `inferKind()` formatReply 본문 활성화
- `analysisHandler` 본문 중복 버그 수정 (응답 변경 동의 필요)
- `feasibility`/`finance` 헤더 인코딩 정상화 (응답 변경 동의 필요)
- finance 본문 포맷팅 (`formatDartDisclosures`)
- `docs/handler-conventions.md` 가이드라인 작성

---

**2026-05-08 KakaoManualAdapter + D-day 푸시 | Claude Code (2nd session)**
- **OpenClaw 카톡 미지원 발견** — npm 번들 조사 결과 지원: Telegram/Discord/WhatsApp/Slack/MSTeams/Signal/iMessage/LINE/Google Chat. 카카오 없음
- **B-5 KakaoMcpAdapter 폐기** → A안(수동 회수) + D안(D-day 푸시) 병행 채택
- **A안 — `/kakao paste {project} [출처: 단톡방명]\n{본문}`**
  - `server/knowledge/adapters/kakaoManual.ts` 신규
  - `server/intent/handlers/notebooklm.ts` kakaoPaste 핸들러 추가 (멱등성 + pending 큐)
  - 저장 경로: `projects/{project}/notes/` (회의록과 동일)
- **D안 — 딜 마감/이정표 D-day 자동 푸시**
  - `server/deals/dealDeadlineNotifier.ts` 신규 (cron 08:30 KST, dedup state JSON)
  - 임계치: D-7/D-3/D-1/D-DAY/D+1 (지난 일정 제외)
  - completed/rejected 딜 제외, 이정표는 미완료만
  - `DEAL_DEADLINE_NOTIFY_HOUR/MINUTE/ENABLED` 환경변수 추가
- 검증: `npm run check` ✅ / `npm run build` ✅ / **564 passed** (+21)
- PM2 재시작 완료

**2026-05-08 OpenClaw gateway caller 수정 | Claude Code (1 commit)**
- `openclawRuntime.loadGatewayCaller()` — minified 번들 `callGateway` 함수명 탐색으로 수정
- smoke-openclaw 통과, available=true 확인
- 전체 플로우 재정리: B-3 폐기, B-2/1c 보류, 다음은 B-5 KakaoMcpAdapter
- **PM2 재시작 필요**: `pm2 restart aston`

**2026-05-07 NotebookLM·Meeting 어댑터 + 라우터 완성 | Claude Code (5 commits)**
- `/nb` 조회 모듈 (`server/notebooklm/`) — 28개 노트북 매핑 조회, 4종 서브커맨드
- `/nb save {project}` — NotebookLmAdapter → B-1 파이프라인 → `projects/{project}/notebooklm/`
- `/meet save {project}` — MeetingAdapter → `projects/{project}/meetings/` (참석자 힌트 포함)
- 라우터 3단계 완성: explicit_command / keyword_hint_suggested / inbox_fallback
- `scripts/reprocess.ts` pending 큐 CLI (list/dry-run/max N)
- 테스트 541→543 passed, 모듈 경계 위반 0건

**2026-05-07 Phase B-1 마감 후속 | Claude Code**
- **TypeScript parameter property → 수동 declaration** (커밋 `e706a79`)
  - PM2 `--experimental-strip-types` 모드는 `private readonly` constructor 단축 미지원
  - Classifier / Summarizer / Tagger 3개 클래스 수정
- **캘린더 인텐트 LLM 필드명 미스매치 수정** (이번 세션)
  - LLM 반환 `{summary, start}` ↔ 핸들러 `{title, startTime}` 불일치
  - 양쪽 필드명 허용으로 수정 + 응답에 KST 시간/제목 명시
  - 수정 파일: `server/intent/handlers/google.ts`
- **`.env` ASTON_WIKI_ROOT 적용** (gitignored)
  - `ASTON_WIKI_ROOT=G:\내 드라이브\Aston-Wiki` 추가
  - 기존 `WIKI_ROOT=D:\구글연동AI\data\wiki`는 보존
  - 신규 Knowledge Pipeline → G 드라이브, 기존 Phase 1c → D 드라이브 (분리 운영)
- **`/wiki` 페이지 실데이터 연결**
  - 신규 tRPC `wiki` 라우터 (status / search / byCategory / recent / openFolder)
  - WikiPage UI: 디바운스 검색, 카테고리 클릭 필터, 최근 항목 12건, **하단 경로 클릭 시 Windows 탐색기 자동 열림**
  - 보안: openFolder는 `aston`/`legacy` 두 옵션만 (임의 경로 차단)
  - 수정 파일: `server/routers.ts`, `client/src/pages/WikiPage.tsx`, `server/routers/wiki.ts`(신규)
- **운영 피드백 반영**: `/tg` 메모는 over-engineering → 코드 보존, 다음 우선순위는 `/nb` NotebookLM 회수

검증: `npm run check` ✅ / `npm run build` ✅ / 기존 492 tests 회귀 0건

---

**2026-05-07 Phase B-1 | Claude Code (Knowledge Pipeline 레퍼런스 구현)**
- **설계 문서 3종**: `docs/knowledge-core/{phase-a-b-final, phase-b0-interfaces, phase-b1-readiness-eval}.md`
- **CURRENT_TASK.md §8**: 12개 합의사항 명시 (회장님 확정 후 진입)
- **신규 모듈**: `server/knowledge/` (Modular Monolith 도메인 추가)
  - `adapters/telegram.ts`, `parser/tokenDispatcher.ts` + `handlers/projectToken.ts`
  - `pipeline/{cleaner,classifier,summarizer,tagger,router,runner}.ts`
  - `storage/{wikiWriter,pendingQueue}.ts`, `events/pipelineEvents.ts`
- **인텐트**: `tg_pipeline_capture` 신규 (`knowledge` 도메인). `/tg` prefix 매처 최우선
- **2단계 응답**: `messageRouter.ts`에 `/tg` 한정 ack 메시지 추가 (11줄)
- **Phase 1c 보존**: 기존 `wiki_auto_classify` 그대로 — 회귀 0
- **테스트**: 신규 7개 파일 / 59건 통과
- 검증: `npm run check` ✅ / `npm run build` ✅ / `npm test` **492 passed** (433→+59)

**2026-05-07 후속 | Claude Code (운영 환경 복구 + Claude Code 자동화)**
- **wouter Link 중첩 `<a>` hydration 오류 제거** (커밋 `58929f2`)
  - 7개 파일에서 `<Link>` 안의 `<a>` 패턴 일괄 정리
  - className을 `Link`로 이동, 내부 `<a>` 제거
  - 브라우저 콘솔 hydration 오류 해소
- **PM2 우선 실행 규칙 + SessionStart 점검 스크립트** (커밋 `7de5869`)
  - `CLAUDE.md`: 앱 실행 전 `pm2 list` 우선 확인 규칙 추가
  - `scripts/session-check.mjs`: `.env` 필수 키 5종 + PM2 aston + 4000 포트 자동 점검
- **`.env` 운영 복구** (gitignored)
  - `GOOGLE_CLIENT_ID` 추가 (그동안 누락 → Google 로그인 불가)
  - `_CLIENT_SECRET` → `GOOGLE_CLIENT_SECRET` 변수명 정상화
  - `WORKSPACE_SPREADSHEET_ID=1kX_l2bQw8II4LZCwdS9_QEQ9JQ4HfpXYGpDoIF9F8b0` 추가
  - `PORT=4000` 명시 추가
- **Claude Code 자동화 4종** (`.claude/settings.json`, gitignored)
  - 권한 allowlist 8종 (`netstat`, `pm2 list/logs/--version`, `tasklist`, `npm/pnpm check`)
  - PreToolUse 훅: `git commit *` 전 `npm run check` 실행 → 실패 시 차단
  - SessionStart 훅: 매 세션 자동 환경 점검
  - codex:setup 점검: Codex CLI 0.128.0 / ChatGPT 로그인 정상

검증: 코드 변경 7개 파일 hydration 수정만, `npm run check` 미실행 (다음 작업과 병합 가능)

⚠️ **신규 알려진 이슈**: `openclawRuntime.ts:172` `loadGatewayCaller()`에서 `process.env.APPDATA` 비어 있을 때 잘못된 경로 조립 — 매 세션 startup 에러 로그, 기능 영향 없음 (시뮬레이션 fallback)

---

**2026-05-07 | Claude Code (P0/P1/P2 정리 7건 + Telegram 모드 표시)**
- **알려진 미해결 이슈 4건 해결** (커밋 `bd30c1c`)
  - OpenClaw discovery JSON URL `openclaw.local` → `localhost:8000`
  - Gate.io `hasApiKey()` 가드 추가 — 인증 메서드만 차단, getTicker 영향 없음
  - 웹 `intent.route` 응답에 `data` + `sources` 필드 통일 (모든 return 경로)
  - Telegram 라우팅 이중화 제거 — `routeIntentMessage` 우선, `handleWorkspaceCommand` 폴백
  - 부수: `intelligence/collector.ts` 모듈 경계 위반 수정 (`_core/wikiProxy` 경유), `writeWiki` title 누락 보정, `telegram` 패키지 설치
- **진단서 §8 잔여 2건 보완** (커밋 `22588e6`)
  - `chatSyncRouter` ownership check (`getMessages` / `getRecentMessages` / `searchMessages`)
  - `한남 PF 진행상황` 개별 딜 파싱 — `<딜명> [PF] (진행상황|상태|현황)` → `deals_command` synthetic command
- **홈 KPI 의미 일치 + mock 제거** (커밋 `2dc3e9a`, `c973ab5`, `ab82382`)
  - `googleWorkspace.calendar.getTodayEvents` 신규 엔드포인트 (KST 00:00~24:00)
  - 홈 '오늘 일정' / '받은 메일' KPI를 진짜 today 단위로 교체
  - 활동 피드 6개 하드코딩 mock 제거 → 실제 데이터 동적 구성 (Calendar/Gmail/Trading/Deal/Telegram)
  - Telegram KPI에 webhook/polling mode 표시
- **UX + Perf + CI** (커밋 `38407e7`, `64f47fd`)
  - "Google 재인증" 메시지에 인라인 'Google 다시 연결' 버튼 (1-click 재연결)
  - TradingView 위젯 로딩 스켈레톤 (심볼 전환 깜빡임 제거, MutationObserver 기반)
  - `scripts/smoke-routes.ts` 빌드 스모크 검사 (라우트 8개 + 산출물 무결성)
  - `npm run smoke:routes` / `deploy:check` 통합

검증: `npm run check` ✅ / `npm run build` ✅ / `npm test` 423 passed (56 files) / `npm run smoke:routes` ✅

**2026-05-06 | Claude Code (P0 버그 수정 4건 + 홈 KPI 개선)**
- 업비트 잔고 인텐트 binance 낙하 버그 수정 (`fallbackIntent.ts`)
- 업비트 잔고 응답 한국어 포맷 (`formatBalanceText`)
- Yahoo Finance 프록시 User-Agent 추가
- 홈 KPI 총 자산 Gate.io → Upbit KRW 교체 (`Home.tsx`)
- 텔레그램↔웹 동기화 복구 (서버 재시작)
- 커밋: `80c3798` `ea7ce5a` `edfa8ff` `7cb5922`

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
| Codex | 없음 | 없음 |

## 2026-05-02 3계층 구조 문서 반영 종료 (Codex)

- 오늘 완료
  - `docs/ARCHITECTURE.md`, `README.md`, `AGENTS.md`, `CLAUDE.md`에 `3계층 구조` 반영
  - `Command Channel` / `Knowledge Core` / `Execution Modules`를 공통 중심축으로 고정
- 운영 기준
  - 모든 업무는 `AI 채팅`에서 시작
  - `NotebookLM`, `Aston Wiki`, `Aston-Deals Folder`, `Google Drive`, `Google Sheets`를 지식 코어로 사용
  - `1·2계층`이 안정화되기 전에는 `3계층` 직원 구현을 우선하지 않음
- 다음 작업
  - `AI 채팅` 라우팅 점검: `server/intent/intentService.ts` 라우팅 매핑 정리, 화면 빠른 명령 5개 작동 검증

## 2026-05-02 AI 채팅 라우팅 점검 종료 (Codex)

- 오늘 완료
  - `docs/diagnostics/ai-chat-routing.md` 신규 작성
  - `웹 채팅`, `Telegram` webhook, `Home` 빠른 명령 5개의 실제 코드 경로 정리
  - `1계층 → 2계층`, `1계층 → 3계층` 연결 현황과 누락 지점 기록
- 핵심 진단
  - `Home` 빠른 명령 5개는 클릭 즉시 실행이 아니라 `/chat` 입력창 prefill만 수행
  - `Telegram`은 `handleWorkspaceCommand()` 우회 경로와 `routeIntentMessage()`를 함께 사용
  - `NotebookLM`, `Monitoring`, `Google Sheets` 읽기 경로는 AI 채팅 자연어 라우팅에 직접 연결되지 않음
- 다음 작업
  - 진단서 `8절`·`10절`을 기준으로 우선 보완 작업 선정

## 2026-05-02 작업 종료 인수인계 (Codex)

- 오늘 완료
  - `docs/ARCHITECTURE.md` 신규 작성
  - `TODO.md`, `CHANGELOG.md`, `HANDOFF.md` 문서 작업 이력 반영
- 문서 기준
  - 실제 코드 기준으로 프론트 라우트, `appRouter`, LLM, Google Workspace, DB, Chat Sync, Agent/Deal 모듈 구조 정리
  - 요청서와 실제 구현 불일치 항목 명시: App 라우트 수, `appRouter` 범위, `RiskGuard` 위치, `data/*.json` 수
  - Mermaid 다이어그램 5개 포함
- 다음 작업 후보
  - `README.md` 재정비

## 2026-05-02 README 작업 종료 인수인계 (Codex)

- 오늘 완료
  - `README.md`를 `Aston Workstation` 기준 진입 문서로 재작성
  - `TODO.md`, `CHANGELOG.md`, `HANDOFF.md`에 README 작업과 다음 후보 반영
- 문서 기준
  - 상세 구조 설명은 `docs/ARCHITECTURE.md` 링크로 위임
  - 실행 방법, 필수 환경 변수, 주요 명령어, 프로젝트 구조, 제약을 1분 읽기 분량으로 압축
- 다음 작업
  - `docs/employees/pf-analyst.md` 작성

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

### 다음 메인 작업: B-5 KakaoMcpAdapter

**OpenClaw로 카카오톡 메시지 자동 수집 → B-1 Knowledge Pipeline → Wiki**

- OpenClaw 연결 완료 (`available=true`)
- 설계 단계 진입 가능
- CURRENT_TASK.md 작성 후 시작

### 이전 메인 작업: NotebookLM 회수 (`/nb`) — 완료

회장님 30개+ NotebookLM 노트북에서 가치 있는 분석 결과를 Wiki로 끌어오는 경로.

**왜 이게 다음 우선순위인가**:
- 회장님이 NotebookLM에서 이미 시간 들여 분석 중 — 결과가 NotebookLM 안에만 갇혀 있음
- Wiki로 회수해야 AI 채팅이 활용 가능 (예: "한남644 PFV 후순위 리스크가 뭐였지?" → NotebookLM 분석 결과로 답변)
- 일회성 메모 저장(`/tg`)보다 회장님 시간 절약 폭이 훨씬 큼

**구현 방향** (Phase B-1 인프라 재사용):
- `NotebookLmAdapter` 추가 (`server/knowledge/adapters/notebooklm.ts`)
- 입력 형식: `/nb {project} {NotebookLM 답변 본문}` + 출처
- 저장: `projects/{project}/notebooklm/`
- 기존 Phase B-1의 cleaner / classifier / summarizer / tagger / router 재사용

**진입 전 회장님 결정 필요**:
- `notebooklm-mapping.yaml`에 30개+ 노트북 매핑 채우기 (회장님 직접)
- 또는 매핑 없이 자유 입력으로 시작할지

### 그 외 미해결

### 즉시 (P0)
5. **Yahoo Finance CORS 프록시** — `server/routers/proxy.ts` 생성, `/api/yahoo-proxy` 엔드포인트 추가
   - 수정 파일: `server/routers/proxy.ts`, `server/routers.ts`
6. **Upbit 잔고 Telegram 검증** — 텔레그램에서 "업비트 잔고" 메시지 전송 후 응답 확인
   - 코드 수정 없음, 운영 테스트만 필요

### 이번 주 (P1)
7. **Telegram 운영 검증** — webhook 상태 엔드포인트 + UI 뱃지
8. **대시보드 실시간 KPI** — mock 값 → 실제 서비스 카운트

### Intelligence System 다음 Phase
9. **Phase 1b** — `node-cron` + `server/intelligence/briefing.ts` (07:00 모닝 브리핑, 기존 Bot API 활용)

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

## 2026-05-02 Phase 6 딜 시트 조건부 서식 인수인계 (Codex)

- 완료 파일:
  - `server/_core/googleSheets.ts`
  - `server/deals/dealSheetSync.ts`
  - `server/deals/dealFileRouter.ts`
  - `server/deals/telegramDealFileHandler.ts`
  - `server/__tests__/googleSheets.test.ts`
  - `server/__tests__/dealSheetSync.test.ts`
  - `data/google-sheets.json`
- 실제 검증:
  - `npm run check` 통과
  - `npm run build` 통과
  - `npm test` 통과: 361 passed, 7 skipped, 2 todo
  - Google Sheets API로 조건부 서식 3개 + 헤더 서식 적용 확인
  - 시트 URL: https://docs.google.com/spreadsheets/d/1kX_l2bQw8II4LZCwdS9_QEQ9JQ4HfpXYGpDoIF9F8b0/edit
- 현재 진행 작업:
  - 없음
- 다음 Phase 후보:
  - 완료/거절 딜 아카이브 시트 분리
  - D-day 조건부 서식 색상 미세조정
  - 시트 역방향 동기화
## 2026-05-02 OpenClaw 실제 연동 활성화 인수인계 (Codex)

- 완료 파일:
  - `server/agents/openclawRuntime.ts`
  - `server/agents/openclawClient.ts`
  - `server/agents/openclawDiscovery.ts`
  - `server/agents/agentExecutor.ts`
  - `scripts/detect-openclaw.ts`
  - `server/__tests__/openclawClient.test.ts`
  - `server/__tests__/agentExecutor.test.ts`
- 실제 연결 상태:
  - Gateway URL: `http://127.0.0.1:8000`
  - Browser control: `http://127.0.0.1:8002`
  - MCP endpoint: `http://127.0.0.1:52108/mcp`
  - Aston health 기준 인증: Bearer token
  - `/api/agents/health` live 확인: `available=true`, `simulationMode=false`, `transport=gateway-rpc`
- `.env` 반영 완료:
  - `OPENCLAW_API_URL`
  - `OPENCLAW_API_KEY`
  - `OPENCLAW_REQUEST_TIMEOUT_MS=60000`
  - `AGENT_PERMISSION_LEVEL=2`
- smoke test 결과:
  - 실제 Gateway RPC 호출 수락 확인
  - `agent.wait`는 60초 내 `timeout`
  - 따라서 현재 Aston은 실연동 우선, timeout 시 시뮬레이션 fallback 유지
- 회장님 추가 작업:
  - 없음
- 다음 Phase 후보:
  - OpenClaw 응답 timeout 원인 확인
  - 텔레그램 실요청 1건으로 end-to-end 응답 재검증
  - Browser control/token 기반 NotebookLM 실작업 smoke


## 2026-05-02 OpenClaw 재탐지 + Gemini 재사용 보강 인수인계 (Codex)

### 완료 내용
- `scripts/detect-openclaw.ts`, `scripts/smoke-openclaw.ts` 추가/보강
- `server/agents/openclawRuntime.ts`, `openclawDiscovery.ts`, `openclawClient.ts` 보강
  - `.openclaw/openclaw.json`, `.openclaw/config.json` 존재 여부와 모델 힌트 기록
  - 수동 `OPENCLAW_API_URL` 인증 실패 시 자동 재탐지 재시도
  - Aston `GEMINI_API_KEY` 또는 `GOOGLE_API_KEY`를 OpenClaw HTTP payload에만 메모리 재사용
- `server/agents/agentHealth.ts`, `server/routers/agents.ts`, `server/intent/handlers/agents.ts`, `client/src/pages/AgentControl.tsx` 보강
  - `/api/agents/health`에 flattened 상태 필드 추가
  - 텔레그램 상태 문구와 `/agents` 상단 배지 반영
- `server/agents/agentTemplates.ts` 보강
  - `notebook-query` 템플릿에 NotebookLM URL, `dealStore.getDeal(dealName)`, 출처 기록, Aston Wiki 저장 지시 추가
- 테스트 보강
  - `detect-openclaw.test.ts`, `openclawClient.test.ts`, `openclawRuntime.test.ts`, `agentHealth.test.ts`, `agentTemplates.test.ts`

### 검증
- `npm run check` 통과
- `npm test` 통과: `365 passed, 7 skipped, 2 todo`
- `npm run build` 통과
- 모듈 경계 위반 0건 유지

### 실제 상태
- discovery 저장값
  - `detected=true`
  - `url=http://openclaw.local`
  - `modelHint=gpt-4`
  - 설정 파일: `C:\Users\user\.openclaw\openclaw.json` 존재, `config.json` 없음
- smoke 저장값
  - `available=false`
  - `status=skipped`
  - `errorReason=OpenClaw health 인증 확인 실패`
- Aston Gemini 키 상태
  - `.env`: `GEMINI_API_KEY=SET`
  - `.env`: `GOOGLE_API_KEY=MISSING`
  - 키 값은 코드/로그/JSON/UI/텔레그램에 출력하지 않음

### OpenClaw 운영 가이드
- OpenClaw 설정이 꼬이면 기존 `.openclaw` 폴더를 삭제하지 말고 반드시 이름 변경 백업 후 재생성
- 예시: `.openclaw` → `.openclaw_backup_YYYYMMDD`
- 재실행 후 Gemini 모델을 다시 등록
- Aston의 `GEMINI_API_KEY`와 동일한 키를 OpenClaw 설정에 사용할 수 있음
- 키와 토큰은 코드/로그/스크린샷/결과 파일에 노출하지 말 것

### 다음 액션
- `.env`의 `OPENCLAW_API_URL=http://openclaw.local`이 실제 유효 URL인지 확인
- 실제 OpenClaw gateway 또는 HTTP auth 방식 확인 후 `npx tsx scripts/smoke-openclaw.ts` 재실행
- 성공 시 `data/openclaw-smoke.json`의 1차/2차 preview 확인

## 2026-05-02 작업 종료 정리 (Codex)

- 오늘 완료
  - OpenClaw 재탐지 보강
  - Aston Gemini 키 재사용 경로 보강
  - `AgentControl.tsx` health 응답 옵셔널 체이닝 회귀 수정
- 미완 이슈
  - OpenClaw URL이 `openclaw.local`로 잘못 탐지됨
  - 실제 연결 URL은 `http://127.0.0.1:8000`
- 내일 작업
  - `.env`의 `OPENCLAW_API_URL`을 `http://127.0.0.1:8000`으로 수정
  - `npx tsx scripts/smoke-openclaw.ts` 재실행 후 실제 응답 확인



## 2026-05-03 작업일지 정리 (Codex)

- 오늘 정리
  - `CHANGELOG.md`, `TODO.md`, `HANDOFF.md` 상태값과 다음 작업을 2026-05-03 기준으로 갱신
  - 현재 진행 작업 표를 `없음`으로 정리
  - `Home` 빠른 명령 즉시 실행화 이후 우선순위를 `NotebookLM` / `Sheets` 자연어 라우팅 보완으로 고정
- 다음 작업
  - `NotebookLM` 자연어 라우팅 연결
  - `Sheets` 자연어 라우팅 연결
  - `오늘 일정 브리핑` 라우팅 수정

## 2026-05-06 AI 채팅 라우팅 5종 보완 완료 (Claude Code)

- 오늘 완료 (진단서 §6·§7·§8 누락 5종 한 번에 연결)
  1. `notebooklm_query` — `노트북 ...` / `노트북LM ...` / `NotebookLM ...` prefix → `queryNotebookLm()` 호출
  2. `google_read_sheet` — `시트 읽기/조회/보여줘`, `스프레드시트 ...`, `sheets read` → `SheetsConnector.readSheet()`
  3. `google_today_events` — `오늘 일정 브리핑`, `오늘 일정/스케줄/미팅` → KST 오늘 한정 `getEventsByDateRange()`
  4. `google_get_emails`(`newer_than:1d`) — `오늘 메일 요약`, `메일 요약` (기존 액션에 명시 규칙 추가)
  5. `chat_telegram_recent` — `Telegram 최근 메시지`, `텔레그램 최근` → `searchConversationMessages(source:telegram)`
  6. `monitoring_status` — `모니터링`, `시스템 상태`, `monitoring`, `system status` → `getApiUsageSnapshot` + uptime/메모리/세션
- 신규/수정 파일
  - 수정: `server/intent/types.ts`, `server/intent/fallbackIntent.ts`, `server/intent/handlers/intelligence.ts`, `server/intent/handlers/google.ts`, `server/intent/registry.ts`
  - 신규: `server/intent/handlers/chat.ts`
  - 테스트: `notebookLmRouting.test.ts`, `sheetsRouting.test.ts`, `todayEventsRouting.test.ts`, `fallbackIntentRules.test.ts`, `monitoringRouting.test.ts` (총 34 케이스)
- 검증
  - `npm run check` ✅ (모듈 경계 위반 0건)
  - `npm run build` ✅
  - `npm test` ✅ 403 passed (369 → +34), 7 skipped, 2 todo
- 우선순위 결정 근거
  - `오늘 일정 브리핑` > `오늘 일정` > `이번 주 일정` 순으로 매처 정렬
  - `시트 읽기`가 `시트 쓰기`보다 먼저 평가됨
  - `노트북`/`텔레그램 최근` prefix는 confidence 0.9~0.99로 일반 키워드 충돌 차단
- 운영 검증 잔여 (회장님 수동 QA)
  - 6개 명령을 텔레그램·웹 채팅에서 각 1회 전송
  - `WORKSPACE_SPREADSHEET_ID` / `NOTEBOOKLM_MCP_ENABLED` 미설정 환경 응답 확인
- 다음 후보
  - 진단서 §8 잔여: `한남 PF` 개별 딜 파싱, 웹 `intent.route` `data` 포맷 누락, 웹/Telegram 라우팅 경로 통합, `chatSyncRouter.getMessages` ownership check
