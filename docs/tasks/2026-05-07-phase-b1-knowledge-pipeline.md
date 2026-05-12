# CURRENT_TASK.md — Phase B-1: TelegramAdapter + 공통 파이프라인 (drafted)
> 작성: 2026-05-07 | 상태: **Draft (구현 시작 전)**
> 전제: phase-a-b-final.md / phase-b0-interfaces.md 합의 완료
> ⚠️ **본 문서는 회장님 승인 전까지 구현 시작 금지.** Phase B-1 readiness 자체 평가(`docs/knowledge-core/phase-b1-readiness-eval.md`) 검토 후 합의.

---

## 1. 목적

Phase B-0에서 정의한 **공통 입력 파이프라인 8단계**를 TelegramAdapter를 첫 어댑터로 **레퍼런스 구현**한다. 후속 어댑터(음성·Gmail·카톡·NotebookLM)가 동일 골격에 붙을 수 있도록 한다.

---

## 2. 범위 (Scope)

### 포함
- `TelegramAdapter` 신규 (`server/knowledge/adapters/telegram.ts`)
- 단계 1~7 모듈 신규 구현:
  - 어댑터 (단계 1)
  - Cleaner (단계 2)
  - Classifier (단계 3, Gemini)
  - Summarizer (단계 4, Gemini)
  - Tagger (단계 5, Gemini)
  - Router (단계 6, 규칙 기반)
  - WikiWriter (단계 7, 신규 frontmatter 스키마)
- 단계 8 (이벤트 발행)은 **인터페이스만 노출, 구현은 stub** (no-op)
- 명령 파서: `/tg #project` 1종만 (token dispatcher 구조로 확장성 확보)
- 기존 `wiki_auto_classify` 핸들러는 **건드리지 않음** (병행 운영)
- 신규 인텐트 `tg_pipeline_capture`: `/tg`로 시작하는 메시지 전용
- 테스트: fake LLM client + fake telegram event end-to-end

### 제외
- 다른 어댑터 (음성·Gmail·카톡·NotebookLM·회의록)
- 자동 promotion (LLM 분류 → projects 자동 이동) — 절대 구현 X
- 임베딩·의미 검색
- 기존 wikiStore.ts의 마이그레이션 (Phase B-1 종료 후 별도 작업)
- frontmatter vs JSON sidecar 결정 — frontmatter only로 진행 (확장 결정 보류)
- inbox/_suggested 키워드 힌트 자동 생성 — 본 단계는 inbox/{source_type}/만 사용 (B-1 후속)

---

## 3. 신규 모듈 위치

```
server/knowledge/                         ← 신규 디렉토리
  ├── README.md                            모듈 책임·비책임·데이터 경로
  ├── types.ts                             PipelineInput, CleanedDocument, ... 공통 타입
  ├── adapters/
  │   └── telegram.ts                      TelegramAdapter
  ├── pipeline/
  │   ├── cleaner.ts                       단계 2
  │   ├── classifier.ts                    단계 3 (Gemini)
  │   ├── summarizer.ts                    단계 4 (Gemini)
  │   ├── tagger.ts                        단계 5 (Gemini)
  │   ├── router.ts                        단계 6
  │   └── runner.ts                        파이프라인 오케스트레이션
  ├── storage/
  │   └── wikiWriter.ts                    단계 7 (신규 스키마)
  ├── parser/
  │   ├── tokenDispatcher.ts               확장 가능한 명령 토큰 파서
  │   └── handlers/
  │       └── projectToken.ts              # 프리픽스
  └── events/
      └── pipelineEvents.ts                단계 8 stub (no-op 발행기)
```

기존 `server/wiki/wikiStore.ts`, `server/intelligence/`는 **건드리지 않는다**. 모듈 경계 검사(`scripts/check-module-boundaries.ts`)에 `knowledge` 도메인 추가.

---

## 4. 기존 코드와의 관계

| 기존 | 신규와의 관계 |
|------|---------------|
| `server/wiki/wikiStore.ts` | 보존. 기존 `wiki_save` / `wiki_search` / `wiki_auto_classify`는 그대로 동작. |
| `server/intent/handlers/wiki.ts::wikiAutoClassify` | 건드리지 않음. `저장해`, `자동저장` 키워드는 계속 기존 경로. |
| `server/intelligence/collector.ts` (Phase 1d MTProto) | 건드리지 않음. 신규 파이프라인과 병행. |
| `server/llm/telegramBot/messageRouter.ts` | 한 줄 추가 — `/tg`로 시작하면 신규 인텐트로 라우팅. 기존 흐름 무손상. |
| `server/intent/fallbackIntent.ts` | `tg_pipeline_capture` 신규 매처 추가 (최우선 — `/tg` prefix 정확 매칭). |
| `server/intent/types.ts`, `registry.ts` | `tg_pipeline_capture` 액션 등록. |
| `server/intent/handlers/` 신규 `knowledgePipeline.ts` | `tg_pipeline_capture` → `pipelineRunner.run()` 호출. |

**중요**: 기존 `wiki_auto_classify`와 `tg_pipeline_capture`가 동일 메시지에 매치되지 않도록 `/tg` 프리픽스로 명확 분리.

---

## 5. WIKI_ROOT 경로 정책

기존: `WIKI_ROOT=D:\구글연동AI\data\wiki`(또는 `G:\내 드라이브\Aston-Wiki`).

**Phase B-1 처리 방식**:
- 신규 파이프라인은 `WIKI_ROOT` 그대로 사용
- 기존 layout (`WIKI_ROOT/YYYY-MM-DD/HH-MM-SS-slug.md`)와 병행하되, **신규 파일은 `WIKI_ROOT/inbox/telegram/`에만 저장**
- `projects/{project}/` 폴더는 명시 명령(`/tg #project`)일 때만 생성·사용
- 기존 데이터 마이그레이션은 Phase B-1에 포함하지 않음

---

## 6. 테스트 전략

`server/__tests__/knowledge/`:

- `pipelineRunner.test.ts`: 파이프라인 8단계 end-to-end (fake LLM, fake fs)
- `tokenDispatcher.test.ts`: `/tg`, `/tg #project`, 미명시, 잘못된 prefix
- `wikiWriter.test.ts`: 멱등성 (동일 source_ref + raw_text → skip), 충돌 처리
- `router.test.ts`: explicit_command vs inbox_fallback
- `cleaner.test.ts`: 정규화 규칙
- `telegramAdapter.test.ts`: 가짜 텔레그램 이벤트 → PipelineInput

회귀 검증:
- 기존 423 tests + 본 작업 신규 ~30 tests = 약 453 + 통과
- 기존 `wiki_auto_classify`, `wiki_save`, `wiki_search` 회귀 테스트 그대로 통과

---

## 7. Exit Criteria (Phase B-1 완료 조건)

다음을 **모두** 만족해야 완료:

- [ ] `npm run check` 통과 (모듈 경계 + tsc)
- [ ] `npm run build` 통과
- [ ] 신규 테스트 ~30건 통과, 기존 회귀 0건
- [ ] 텔레그램에서 `/tg 메모내용` 입력 → `WIKI_ROOT/inbox/telegram/` 하위에 신규 스키마 .md 파일 생성 확인
- [ ] 텔레그램에서 `/tg #hannam-644 메모내용` → `WIKI_ROOT/projects/hannam-644/notes/`에 저장 확인
- [ ] 텔레그램에서 기존 `저장해 ...` → 기존 wikiStore 경로(`WIKI_ROOT/YYYY-MM-DD/`)에 저장 (회귀 없음)
- [ ] 동일 메시지 두 번 보내도 `inbox/telegram/` 안에 파일 1개만 존재 (멱등성)
- [ ] LLM 일부 단계 실패 simulation 시 `status: "partial"` 표시되고 저장 진행 (LLM 폴백)
- [ ] I/O 실패 simulation 시 `data/wiki-pending/`에 PipelineInput 보존 (I/O 폴백)
- [ ] CHANGELOG.md / TODO.md / HANDOFF.md 갱신
- [ ] 본 CURRENT_TASK.md를 `docs/tasks/2026-XX-XX-phase-b1-telegram-pipeline.md`로 아카이브 후 빈 템플릿 복원

---

## 8. 회장님 확정 합의사항 (2026-05-07)

자체 평가 보고서(`docs/knowledge-core/phase-b1-readiness-eval.md`) 기반으로 다음 12개 항목 확정. **본 합의는 구현 중 자유롭게 변경 금지** — 변경 시 회장님 재합의 필요.

### 1. 기존 Wiki layout 불일치
- 기존 `WIKI_ROOT/YYYY-MM-DD/...` layout 그대로 보존
- 신규 Knowledge Pipeline은 `projects/`, `inbox/` 구조 사용
- 기존 데이터 마이그레이션 X
- 두 layout 당분간 섞어 사용

### 2. WIKI_ROOT 기준
- 운영 Wiki root: `G:\내 드라이브\Aston-Wiki`
- 개발/테스트 기본값: **절대 G 드라이브 아님**. `data/test-wiki/` 또는 `tmp/aston-wiki-test/`
- 실제 G 드라이브 쓰기는 **`ASTON_WIKI_ROOT` 환경변수 명시 시에만** 허용
- 환경변수 결정 우선순위: `ASTON_WIKI_ROOT` > `WIKI_ROOT` > 테스트 기본값

### 3. Phase 1d MTProto Collector
- B-1에서 통합하지 않음
- MTProto는 별도 트랙 유지
- B-1은 **Telegram Bot `/tg` + 공통 Pipeline에만 집중**

### 4. SQLite db-chat ↔ Wiki 이중 저장
- 둘 다 저장
- SQLite = 대화 로그 / 이벤트 / 상태 추적
- Wiki = 장기기억 / 검색 / 브리핑 / AI 컨텍스트
- B-1에서 SQLite 구조 대규모 변경 X

### 5. LLM 호출 구조
- 분류·요약·태깅 **분리 유지**
- 비용보다 **디버깅·테스트·실패 격리** 우선
- `explicit_project` 있으면 classifier LLM 호출 **생략**
- 테스트는 fake LLM만 사용

### 6. 사용자 응답 (2단계)
- 1차: `📝 Wiki 저장 처리중...`
- 2차: `✅ 저장 완료: {saved_path}` 또는 `⚠️ 저장 실패, pending queue에 보관됨`
- 응답 지연으로 사용자가 멈춘 것으로 느끼지 않게

### 7. 멱등성 및 재처리
- 기본 멱등성: `source_ref + sha256(raw_text)`
- B-1에서는 **Track A만**: `reprocess_requested: true` frontmatter 메타 또는 내부 옵션
- Track B (`scripts/reprocess.ts`) 일괄 재처리 CLI는 B-1 범위 **제외**
- raw_text는 **어떤 경우에도 보존**

### 8. 명령어 파서
- 정규식 한 줄 고정 파서 **금지**
- token dispatcher 구조
- B-1에서는 `#project` 토큰만 구현
- 향후 `+person`, `@company`, `!urgent`, `due:`, `tag:`, `perm:` 확장 가능 인터페이스
- 알 수 없는 토큰은 `unknown_tokens`에 보존, 본문으로 흘려보냄

### 9. 실패 처리
- LLM 실패와 I/O 실패 **반드시 분리**
- LLM 실패: 중단 X, `quality: "partial"`, `step_failures`에 단계 기록, 가능한 정보로 저장 진행
- I/O 실패: `data/wiki-pending/`에 PipelineInput 원본 보존, 데이터 유실 방지 우선, 텔레그램에 pending 보관 알림
- 같은 try-catch로 뭉개기 **금지**

### 10. Phase 1c 통합 방식
- rewrite **금지**, wrap 우선
- `messageRouter.ts`는 가능하면 건드리지 않음
- 기존 `wiki_auto_classify` 그대로 둠
- `/tg` prefix만 신규 인텐트 `tg_pipeline_capture`로 분리
- 기존 Telegram 기능 회귀 절대 금지

### 11. 구현 범위 (확정)

**구현**:
- TelegramAdapter 최소 구현
- `/tg #project` 명령 처리
- PipelineInput 변환
- token dispatcher 기본 구조
- cleaner / classifier / summarizer / tagger / router
- WikiWriter
- 멱등성 체크
- LLM 실패 partial 저장
- I/O 실패 pending 보관
- fake LLM 테스트
- fake Telegram 테스트
- temp Wiki root 저장 테스트
- 2단계 Telegram 응답

**구현 X**:
- NotebookLM 자동화
- Gmail
- 음성 STT
- 카톡 연동
- MTProto 통합
- 자체 RAG / 벡터DB
- 기존 Wiki 마이그레이션
- 일괄 재처리 CLI

### 12. 진행 절차
1. 본 §8 갱신 (완료 시점에 본 항목 ✅ 표시)
2. Phase B-1 구현
3. 구현 후 테스트 결과·변경 파일 목록 보고

---

리스크 상세는 평가 보고서 §5 참조.

---

## 9. 자율 결정 항목 (회장님 시간 절약)

다음은 Claude Code가 자율 판단:
- frontmatter 필드 직렬화 형식 (YAML 기본, 배열 표현 등)
- LLM 프롬프트 상세 문구 (한국어, JSON 출력 강제)
- LLM 토큰 한도, 타임아웃 (Gemini 2.5 Flash 기본, 30초 timeout)
- 멱등성 해시 알고리즘 (SHA-256 of cleaned_text + source_ref)
- 파일명 slug 규칙 (영문·숫자·하이픈, 한글은 `note-{shortid}`)
- 에러 메시지 한국어 문구
- pending 큐 파일 포맷 (JSON)

전략 방향(저장 위치, 인터페이스, 작업 범위, 우선순위)은 본 문서에 모두 명시 — 작업 중 디테일 수정만 자율.

---

## 10. 구현 순서 (구현 시작 후 권장)

1. `types.ts` + 모듈 경계 등록
2. `tokenDispatcher.ts` + handlers (가장 단순, 의존성 없음)
3. `cleaner.ts` (LLM 미사용)
4. `wikiWriter.ts` + 멱등성 + pending 큐
5. `classifier.ts` / `summarizer.ts` / `tagger.ts` (Gemini 호출, fake client 우선 테스트)
6. `router.ts`
7. `pipelineRunner.ts` (오케스트레이션)
8. `telegramAdapter.ts`
9. 인텐트 등록 + messageRouter.ts 한 줄 추가
10. end-to-end 테스트
11. 운영 검증 (텔레그램 실 메시지 1회)

---

## 11. 참고 문서

- 설계 합의: `docs/knowledge-core/phase-a-b-final.md`
- 인터페이스 명세: `docs/knowledge-core/phase-b0-interfaces.md`
- 자체 평가: `docs/knowledge-core/phase-b1-readiness-eval.md` ⚠️ **구현 전 필독**
