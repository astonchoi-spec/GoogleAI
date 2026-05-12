# server/knowledge — Knowledge Pipeline (Phase B-1)

> Phase A·B-0 합의 기반의 공통 입력 파이프라인.
> 텔레그램 메모를 첫 어댑터 레퍼런스 구현으로 한다.

## 책임
- 다양한 입력원(텔레그램·음성·Gmail·카톡·회의록·NotebookLM)을 표준화된 `PipelineInput`으로 변환
- 정제 → 분류 → 요약 → 태깅 → 라우팅 → Wiki 저장의 8단계 파이프라인 실행
- 멱등성 보장 (`source_ref + raw_text_hash`)
- LLM 실패는 inline 폴백, I/O 실패는 pending 큐로 분리

## 비책임
- 검색·임베딩 (Phase C)
- 자동 promotion (`inbox` → `projects` 자동 이동, **영구 X**)
- 기존 Wiki 데이터 마이그레이션
- 일괄 재처리 CLI (`Track B`, B-1 제외)
- NotebookLM/카톡/Gmail 어댑터 (B-1 제외)
- MTProto Collector 통합 (B-1 제외)

## 데이터 경로
- 신규 Wiki 저장: `${ASTON_WIKI_ROOT ?? WIKI_ROOT ?? data/test-wiki}/inbox/{source_type}/` 또는 `${ROOT}/projects/{project}/notes/`
- I/O 실패 pending: `data/wiki-pending/{source_ref_hash}.json`
- 운영 권장 환경변수: `ASTON_WIKI_ROOT=G:\내 드라이브\Aston-Wiki`

## 의존성
- LLM: `server/_core/llmAdapter.ts` 경유 (Gemini)
- 모듈 경계: `server/knowledge/`는 다른 도메인 모듈을 직접 import하지 않음. 공유는 `server/_core/`로만.

## 환경변수
- `ASTON_WIKI_ROOT` (선택, 운영용. 미설정 시 fallback)
- `WIKI_ROOT` (기존 Phase 1a 호환)
- `ASTON_PIPELINE_LOG_LEVEL` (선택, 향후)

## 명령
- 텔레그램에서 `/tg 메모내용` → `inbox/telegram/`
- 텔레그램에서 `/tg #project 메모내용` → `projects/{project}/notes/`
- 미명시 token은 `unknown_tokens`에 보존, 본문으로 흘려보냄

## 모듈 구조
```
types.ts                        공통 타입
adapters/telegram.ts            TelegramAdapter
parser/tokenDispatcher.ts       명령 토큰 파서
parser/handlers/projectToken.ts #project 핸들러
pipeline/cleaner.ts             단계 2
pipeline/classifier.ts          단계 3
pipeline/summarizer.ts          단계 4
pipeline/tagger.ts              단계 5
pipeline/router.ts              단계 6
pipeline/runner.ts              오케스트레이션
storage/wikiWriter.ts           단계 7 (멱등성·frontmatter)
storage/pendingQueue.ts         I/O 실패 보관
events/pipelineEvents.ts        단계 8 stub (no-op)
```
