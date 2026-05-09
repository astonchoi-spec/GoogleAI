# Phase 4-A — 로컬 NotebookLM 회수 자료 → Web Chat RAG 주입

> 작성일: 2026-05-10 | 상태: 설계 승인 대기 → 구현 미착수
> 도구: Claude Code | 브랜치: codex-google-workspace-expansion

---

## 1. 배경

`docs/HANDOFF.md` "다음 단계 후보" 항목 중 가장 큰 가치 — `/notebook-lm` 페이지에 회수된 NotebookLM 분석 자료(`projects/{p}/notebooklm/*.md`)가 누적되고 있으나, 회장님 채팅에서 자동으로 인용되지 않음. 회장님이 직접 "노트북 한남동 사업성 요약" 식의 명시적 prefix 를 입력해야만 NotebookLM 검색 경로(`notebooklm_query`)가 작동함.

목표: chat 도메인 fallback 단계에서 회수 자료를 자동 검색·주입하여, 회장님이 별도 명령 없이 "한남 부동산 진행 상황 어때?" 같은 자연 질의만 해도 회수 자료가 컨텍스트로 참조되게 한다.

## 2. 결정된 전략 (회장님 직접 결정)

| 항목 | 결정 | 비고 |
|------|------|------|
| 검색 소스 | **로컬 `*.md` 직접 스캔** | Vertex AI Search 는 Phase 4-B 로 분리 (Phase 3-A/3-B 셋업 미완) |
| 적용 인터페이스 | **웹 채팅만** | 텔레그램은 검증 후 Phase 4-C 로 분리 |

## 3. 아키텍처

```
사용자 채팅 (web)
  → routers/llm.ts:chat
  → routeIntentMessage()                 ← 인텐트 매칭 (변경 없음)
  → handled=true 이면 즉시 반환            ← 변경 없음
  → handled=false 인 경우 (chat 도메인 fallback) ↓
  → ★ searchLocalNotes(query, k=3)       ← 신규 모듈 호출
  → systemPrompt 에 컨텍스트 단락 prepend  ← 신규
  → llmCaller.call(...)                   ← 변경 없음
  → 응답 텍스트 끝에 "📚 참고 자료" 절 부가  ← 신규
  → sources field 에 file path/제목 포함   ← 기존 GroundingSource 인터페이스 재사용
```

진입점은 `server/routers/llm.ts:208~250` 한 곳만 수정. 인텐트 매칭이 성공하면(`handled=true`) RAG 단계는 건너뛴다 — 기존 인텐트 라우팅과 100% 직교.

## 4. 신규 모듈 — `server/rag/localMdSearch.ts`

| 항목 | 결정 |
|------|------|
| 위치 | `server/rag/localMdSearch.ts` (~200줄 예상) |
| Public API | `searchLocalNotes(query: string, opts?: { k?: number, projects?: string[] }): Promise<NoteHit[]>` |
| `NoteHit` | `{ project: string, filePath: string, fileName: string, frontmatter: Record<string, unknown>, snippet: string, score: number }` |
| 검색 루트 | `${ASTON_WIKI_ROOT}/projects/*/notebooklm/*.md` (glob) — 28개 project 폴더 자동 |
| 토큰화 | 한국어 어절 split + 길이 ≥ 2 / 영어 길이 ≥ 3, 한·영·숫자 normalize, 불용어 제거 |
| 점수식 | (1) TF (본문 매칭 카운트) + (2) frontmatter `tags`/`categories` 일치 시 ×1.5 가중치 + (3) 제목/파일명 매칭 시 +5 보너스 |
| 결과 | top-K (기본 K=3), score 0 인 hit 제외, snippet 500자 (매칭어 주변 윈도) |
| 캐시 | in-memory 5분 TTL (파일 path → {hash, frontmatter, body} 캐시). 파일 mtime 변경 시 자동 무효화 |
| 빈 결과 | `[]` 반환. 호출 측이 RAG 없이 그대로 Gemini 호출. 에러 throw 금지 |
| 모듈 경계 | `server/rag/` 도메인. 외부 도메인 import 없음. `routers/` 만 import |

## 5. `routers/llm.ts` 수정 골자

```ts
// chat fallback 진입 직후 (history 가져오기 전)
const ragHits = await searchLocalNotes(input.message, { k: 3 }).catch((err) => {
  console.warn("[RAG] local search failed:", err);
  return [];
});

const ragContext = ragHits.length
  ? `\n\n참고할 회수 자료(${ragHits.length}건):\n${ragHits
      .map((h, i) => `[${i + 1}] ${h.project}/${h.fileName}\n${h.snippet}`)
      .join("\n\n")}\n\n위 자료를 우선 참고하되, 자료에 없는 사실을 만들어내지 마세요.`
  : "";

const systemPrompt = `${기존 프롬프트}${ragContext}`;
// llmCaller.call(...) 동일

// 응답 직후
return {
  response: response.content + (ragHits.length ? formatCitationFooter(ragHits) : ""),
  sources: ragHits.map((h) => ({
    title: `${h.project}/${h.fileName}`,
    uri: pathToFileURL(h.filePath).href,
  })),
  ...
};
```

`formatCitationFooter()` 출력 예:
```
📚 참고 자료
1. hannam-644/2026-05-08 사업성 분석.md
2. yeokbuk-pf/2026-05-05 PF 검토 메모.md
```

## 6. 테스트 (`server/__tests__/localMdSearch.test.ts`)

신규 8~10개 케이스:
- 정상: 임시 wiki root + 3개 .md → 키워드 검색 → 매칭/스코어링 검증
- frontmatter `tags` 일치 시 1.5× 가중치 적용 검증
- 제목 매칭 시 +5 보너스 검증
- 빈 root → `[]` 반환 (throw 금지)
- 캐시 히트 (두 번 호출 시 fs.readFile 1회만)
- top-K 컷오프
- mtime 변경 시 캐시 무효화

목표: 회귀 0건. 745 → 약 755 passed.

## 7. 자율 결정 (회장님 안 묻고 베스트 프랙티스 적용)

- K=3 (top 3 docs), snippet 500자, 캐시 TTL 5분
- 점수식 — TF + frontmatter 1.5× + 제목 +5
- 인용 절 포맷 — "📚 참고 자료" 한국어 헤더 + 번호 리스트
- `sources` URI 포맷 — `file://` 형태 (web UI는 이미 `GroundingSource` 칩 렌더링 코드 보유)
- 검색 루트 환경변수 — 기존 `ASTON_WIKI_ROOT` 재사용 (신규 env 없음)
- 모듈 경계 — `server/rag/` 도메인 (외부 import 없음, `routers/` 만 import)
- LLM 시스템 프롬프트에서 "자료에 없는 사실을 만들어내지 마세요" 명시 (할루시네이션 가드)

## 8. 비목표 (Phase 4-B 이후 분리)

- Vertex AI Search 호출 (Phase 3 9개 데이터스토어 셋업 완료 후 — 4-B)
- 텔레그램 적용 (`messageRouter.ts` — 4-C)
- chunk-level 검색 (현재는 file-level)
- 임베딩 기반 시맨틱 검색
- 다국어 토크나이저 (현재 한·영 휴리스틱)

## 9. 검증 기준

- [ ] `npm run check` ✅
- [ ] `npm run build` ✅
- [ ] `npm test` 745 → ~755 passed (회귀 0건)
- [ ] 라이브: 웹 채팅에서 "한남 PF 진행 상황" 입력 → 응답에 회수 자료 인용 + 📚 절 표시 확인 (회장님 직접 검증)
- [ ] 회수 자료가 없는 질의 → 기존 Gemini 일반 대화와 동일한 응답 (회귀 없음)

## 10. 후속 단계

- Phase 4-B: Vertex AI Search 통합 (Phase 3-A/3-B 완료 후)
- Phase 4-C: 텔레그램 적용 (`messageRouter.ts` 동일 패턴)
- Phase 4-D: chunk-level 검색 + 임베딩
