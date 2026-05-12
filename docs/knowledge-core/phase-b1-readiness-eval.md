# Phase B-1 Readiness — Claude Code 자체 평가 보고서
> 작성: 2026-05-07 | 작성자: Claude Code (Sonnet 4.6)
> 목적: 회장님 지시 4개 항목 + 추가 리스크에 대한 솔직한 평가

---

## 0. 결론 요약

**Phase B-1 진입 가능. 단, 6개 리스크에 대한 회장님 합의 필요.**

가장 심각한 것은 **리스크 R1 — 기존 Wiki 저장 레이아웃과 신규 설계의 불일치**. 코드 통합은 어렵지 않으나, 데이터 레이아웃이 다르다는 것이 가장 큰 함정.

---

## 1. 기존 Phase 1c Telegram 코드의 wrap 가능성

### 진입점 식별

**유일한 텔레그램 텍스트 진입점**: `server/llm/telegramBot/messageRouter.ts:16` `bot.on("message", ...)` 한 곳.

흐름 요약:
```
bot.on("message")
  → isDealFileMessage?              (딜 파일 첨부 우회 처리)
  → routeIntentMessage()            (인텐트 분류 + 핸들러 dispatch)
       ├─ 매치되면 응답
       └─ wiki_auto_classify가 잡히면 → server/intent/handlers/wiki.ts → writeWiki()
  → handleWorkspaceCommand()        (Google 도메인 fallback)
  → replyWithLlm()                  (자유 채팅 fallback)
```

**Phase 1c (`wiki_auto_classify`) 진입 트리거**: `fallbackIntent.ts`에서 `저장해`, `자동저장`, `분류저장` 키워드 매처. 매처 통과 시 `writeWiki(title, body, categories, source)` 호출. 단순 함수 호출이라 wrap이 매우 쉽다.

### 평가: ✅ wrap 가능 (난이도 낮음)

**가장 안전한 방식 — 병행 운영**:
- `/tg` 프리픽스 = 신규 파이프라인 (`tg_pipeline_capture` 인텐트)
- `저장해`, `자동저장`, `분류저장` 키워드 = 기존 `wiki_auto_classify` (그대로 유지)
- 두 매처가 동일 메시지에 매치되지 않도록 `/tg` 매처를 **최우선** + 정확 prefix 매칭으로 분리
- messageRouter.ts는 **건드리지 않는다**. 신규 인텐트 등록만으로 작동.

**façade 우회는 불필요**. 인텐트 라우팅이 이미 명령 파서 역할을 하므로 façade 한 겹 더 두는 건 과한 추상화.

**유일한 주의점**: `routeIntentMessage`가 `/tg` 메시지를 신규 인텐트로 매칭하는지 확인이 필요. fallbackIntent.ts에 `tg_pipeline_capture` 매처를 **`google_ensure_schema`보다 위**(우선순위)에 둬야 안전. confidence 0.99로 고정 추천.

### 회장님 합의 필요?
없음. 코드 패턴 결정. 자율 진행 가능.

---

## 2. 멱등성 규칙의 재처리 우회 경로

### 기본 멱등성
`source_ref + sha256(raw_text)` 검사. 동일 키 존재 시 skip. (Phase B-0 §9 명시)

### 재처리가 필요한 시나리오
| 시나리오 | 빈도 | 대응 |
|----------|------|------|
| LLM 모델 업그레이드 | 분기 1회 | **일괄 재처리** |
| 분류 결과 잘못된 1건 | 주 수회 | **단일 항목 재처리** |
| 폴더 구조 변경 (마이그레이션) | 연 1~2회 | **일괄 재처리** + 경로 재계산 |
| 카테고리 매핑 보강 | 월 1회 | **일괄 재처리** (분류·태깅만) |
| 잘못된 명령 입력 (오타) | 주 수회 | **삭제 후 재입력** (재처리 X) |

### 평가: ⚠️ 단순 플래그로 부족. **2-track 구조 권장**

#### Track A — 단일 항목 재처리 (frontmatter 메타)
- 회장님이 잘못 분류된 .md 파일을 직접 열어 frontmatter에 `reprocess_requested: true` 추가
- 파일 watcher 또는 다음 파이프라인 실행 시 픽업 → 재분류·재요약·재태깅
- 재처리 후 `reprocess_requested` 제거, `last_reprocessed_at` 추가
- **장점**: 회장님이 직접 컨트롤. UI 없이 텍스트 편집만으로 재처리.

#### Track B — 일괄 재처리 (CLI 도구)
- `scripts/reprocess.ts --since=2026-05-01 --steps=classify,tag --dry-run`
- 옵션: `--source=telegram`, `--project=hannam-644`, `--steps=summarize`
- `--dry-run` 기본 — 미리보기 → 회장님 확인 → `--apply`
- **장점**: 모델 업그레이드 등 대규모 변경 시 명확한 감사 로그.

#### 멱등성과 양립 방법
멱등성 검사를 다음과 같이 분기:
```
if (existing && existing.raw_text_hash === current_hash) {
  if (!existing.reprocess_requested && !cli_force_reprocess) {
    skip;
  }
  // 재처리 요청 있으면 통과 — 단, raw_text는 그대로 두고 요약·분류·태깅만 재실행
}
```

### 회장님 합의 필요?
**예 (소규모)**: Phase B-1에 Track A만 포함하고 Track B는 후속 작업으로 분리할지, 둘 다 포함할지 판단.

**Claude Code 권장**: Phase B-1은 **Track A만**. 이유:
- 일괄 재처리는 데이터가 어느 정도 쌓인 후에야 의미 있음
- Track B는 별도 작업 (`scripts/reprocess.ts`)이라 본 작업 범위 비대화 위험
- Track A의 `reprocess_requested` 메타 필드만 인식하도록 wikiWriter에 1줄 추가

---

## 3. LLM 실패와 I/O 실패 처리 경로 분리

### 두 실패의 본질적 차이

| | LLM 실패 | I/O 실패 |
|---|---|---|
| 빈도 | 잦음 (rate limit, timeout) | 드물지만 치명 |
| 회복 | 폴백값으로 진행 가능 | 재시도 또는 보존 필수 |
| 데이터 손실 위험 | **없음** (raw_text는 보존) | **있음** (저장 자체 실패) |
| 즉시 진행 가능? | Yes | No |

### 평가: ⚠️ **반드시 분리해야 함**. 같은 `try-catch`에 묶으면 안 됨.

#### 권장 설계

**LLM 실패 — inline 폴백 + 메타 마킹**
```
try {
  doc = await classifier.classify(doc);
} catch (e) {
  doc.category = "other";
  doc.suggested_projects = [];
  doc.classification_confidence = 0;
  doc.step_failures = [...(doc.step_failures ?? []), "classify"];
  // 진행 — 절대 중단하지 않음
}
```

저장 시 `quality` 필드:
- `step_failures`가 비어 있으면 `quality: "complete"`
- 1~2개면 `quality: "partial"`
- 3+개면 `quality: "minimal"` (raw_text만 신뢰 가능)

회장님은 검색·브리핑 시 `quality: "minimal"` 항목을 별도 표시할 수 있음.

**I/O 실패 — 외부 큐 + 재시도 + 알림**
```
try {
  await wikiWriter.save(doc, route);
} catch (e) {
  // 데이터 손실 방지 우선
  await fs.writeFile(
    `data/wiki-pending/${source_ref_hash}.json`,
    JSON.stringify({ doc, route, attempts: 1, last_error: e.message }),
  );
  await notifyChairman(`📥 Wiki 저장 실패. pending에 보관됨: ${source_ref_hash}`);
  throw e; // 파이프라인은 실패로 종료, 다음 메시지에 영향 없음
}
```

`scripts/retry-pending.ts` (별도 명령으로 5분마다 또는 수동) — pending 큐 처리.

**둘이 동시에 일어나면?**
LLM이 partial로 떨어지고 그 partial을 저장하려다 I/O가 실패한 경우 → pending 큐에는 partial 결과 그대로 보존 → 재시도 시 LLM도 같이 재시도할지 옵션 (`reprocess_requested: true` 플래그가 자연스럽게 연동).

### 회장님 합의 필요?
**없음** (자율 진행). 단, pending 큐 알림이 텔레그램으로 가는 것을 회장님이 원하시는지 확인하면 좋음. 권장: yes (실패 인지 즉시).

---

## 4. 명령어 파서 확장성

### 현재 요구
Phase B-1: `/tg #project 메모내용`만 지원.

### 향후 확장 가능 토큰
| 토큰 | 의미 | 예시 |
|------|------|------|
| `#project` | 프로젝트 매핑 | `#hannam-644` |
| `+person` | 인물 태그 | `+홍길동` |
| `@company` | 회사·기관 | `@삼성` |
| `!urgent` / `!high` / `!low` | importance | `!urgent` |
| `due:날짜` | due_date | `due:2026-05-15` |
| `tag:키워드` | 수동 태그 | `tag:사업성검토` |
| `perm` | permanent_knowledge | `perm` 단독 |
| `private` / `public` / `sensitive` | privacy_level | `sensitive` |

### 평가: ⚠️ **정규식 한 줄 절대 금지**. token dispatcher 필수.

#### 정규식 한 줄로 가면 발생할 일
- 토큰 추가마다 정규식 수정 → 회귀 위험 누적
- 토큰 순서 의존성 (`/tg #x +y`만 되고 `/tg +y #x`는 안 됨)
- 본문에 `#` 들어가면 오인식 (예: 메모 본문 "C# 학습 중")
- 테스트 작성 비용 폭증

#### 권장 구조 — Token Dispatcher

```typescript
// server/knowledge/parser/tokenDispatcher.ts (인터페이스만)
interface TokenHandler {
  prefix: string;                    // '#', '+', '@', '!', 'due:', 'tag:', 'perm', 'private', ...
  matches(token: string): boolean;
  apply(token: string, hints: CommandHints): void;
}

interface ParsedCommand {
  command: string;                   // 'tg', 'nb', 'meeting', ...
  hints: CommandHints;
  body: string;                      // 토큰 제거 후 남은 본문
  unknown_tokens: string[];          // 매처 없는 토큰 (본문으로 흘림)
}

function parseCommand(rawText: string, handlers: TokenHandler[]): ParsedCommand;
```

핸들러는 prefix별로 등록:
```typescript
// server/knowledge/parser/handlers/projectToken.ts
export const projectTokenHandler: TokenHandler = {
  prefix: '#',
  matches: (t) => /^#[\w-]+$/.test(t),
  apply: (t, hints) => { hints.explicit_project = t.slice(1); },
};
```

#### 본 단계 구현 범위
- `tokenDispatcher.ts` 인터페이스 + 구현
- `projectToken.ts` 한 종만 등록
- 다른 핸들러는 **인터페이스만 잡고 구현 X**
- 알 수 없는 토큰은 `unknown_tokens`에 보관 → 본문 머리에 다시 붙여 raw_text 손실 방지

#### 본문 보호 규칙
- 첫 토큰이 `/tg` 등 명령 prefix가 **아니면** dispatcher 호출 자체 X (전체 메시지가 본문)
- 첫 토큰이 명령 prefix면 두 번째 토큰부터 dispatcher 처리
- "C# 학습 중" 같은 본문이 명령 없이 들어오면 dispatcher 무관

### 회장님 합의 필요?
**없음** (코드 패턴 결정).

---

## 5. 추가 리스크 (Claude Code 발견)

### R1 ⚠️ **(가장 심각)** 기존 Wiki 레이아웃 vs 신규 설계 불일치

**현재 상태**:
- `WIKI_ROOT/YYYY-MM-DD/HH-MM-SS-ms-slug.md`
- frontmatter 필드: `id, date, title, categories, source` (5개)

**Phase A·B-0 설계**:
- `Aston-Wiki/projects/{project}/notes/...` 또는 `Aston-Wiki/inbox/{source_type}/...`
- frontmatter 필드: 18개 (source_type, source_ref, summary, action_items, ...)

**충돌 지점**:
- `searchWiki()`가 기존 layout 가정으로 재귀 탐색 — 신규 layout도 같이 인덱싱됨 (다행, 검색 자체는 호환)
- 모닝 브리핑 (`server/intelligence/briefing.ts`)이 `WIKI_ROOT/daily/`에서 brief를 읽음 — 신규 `Aston-Wiki/daily/`와 경로 다를 수 있음
- 카테고리 매처가 `categories` 필드에서 작동. 신규 frontmatter는 `tags` + `related_projects` 분리 — 검색 호환성?

**권장 처리**:
- **Phase B-1에는 마이그레이션 포함하지 않는다**. 기존 `WIKI_ROOT` 그대로, 신규 파일만 새 layout으로 추가.
- 신규 파일 frontmatter에 `categories` 필드도 보존 (구버전 검색 호환). `tags` + `categories` 둘 다 채움.
- 기존 데이터 마이그레이션은 Phase B-2 또는 별도 작업.

**회장님 합의 필요**: 신규 데이터를 기존 `WIKI_ROOT` 안에 섞을지, 아니면 `WIKI_ROOT/v2/` 같은 별도 영역을 둘지.

---

### R2 `WIKI_ROOT` 위치 혼란

`.env` 현재 `WIKI_ROOT=D:\구글연동AI\data\wiki` (오늘 본 값). 설계는 `G:\내 드라이브\Aston-Wiki` 가정.

**둘 다 작동은 하지만**, Phase A에서 "Google Drive 기반"이라고 명시. Phase B-1 시작 전 `.env`의 `WIKI_ROOT`를 어디로 정할지 확정 필요.

**권장**: `WIKI_ROOT=G:\내 드라이브\Aston-Wiki` 로 변경. 회장님 직접 변경.

---

### R3 Phase 1d MTProto Collector와 신규 파이프라인의 관계

`server/intelligence/collector.ts`는 12개 채널 메시지를 자동 수집해 `writeWiki()`로 직접 저장. 즉, **이미 자동 분류 파이프라인이 별도 존재**.

신규 파이프라인이 Telegram 채널 메시지도 흡수해야 하는가?

**Claude Code 의견**:
- 본 단계는 **봇 DM(privatemessage)만** 대상. 채널 수집은 `collector.ts`로 유지.
- 향후 Phase B-2에서 collector도 신규 파이프라인 위로 통합 검토.
- Phase B-1에서는 **건드리지 않는다**.

**회장님 합의**: 위 분리에 동의하시는지.

---

### R4 SQLite db-chat과 Wiki 이중 저장

`messageRouter.ts`는 모든 메시지를 SQLite (`saveMessage`)에 저장. 신규 파이프라인이 추가로 Wiki에도 저장하면 동일 메시지가 두 곳.

**문제 가능성**:
- 검색 시 SQLite vs Wiki 둘 중 어디?
- 회장님이 `/tg` 입력하면 SQLite 채팅 로그 + Wiki 저장 = 둘 다 기록되는 게 의도? (예: 자유 채팅은 SQLite만, `/tg`는 Wiki만?)

**Claude Code 권장**:
- SQLite는 **대화 컨텍스트 / UI 동기화** 전용. 영구 지식 X.
- Wiki는 **장기기억 / 검색·회상 대상**. 영구 지식 O.
- `/tg` 메시지는 **두 곳 다 저장**. 한 쪽이 누락되면 곤란하므로.
- AI 채팅 컨텍스트 구성은 SQLite 직전 N개 + Wiki 검색 결과 추후 통합 (Phase C).

**회장님 합의**: 두 곳 다 저장에 동의하시는지.

---

### R5 LLM 호출 비용 증가

기존 `wiki_auto_classify`는 Gemini 호출 1회 (분류·요약·태그를 한 번에). 신규 설계는 분류·요약·태깅 **3회 호출**로 분리.

- 1메시지당 비용 = 약 3배 (LLM 호출 회수 기준)
- 텔레그램 메시지 일 100개 가정 시 일 300 회 → 월 9000 회 → Gemini 2.5 Flash 기준 비용 미미 (월 $1 미만 예상)
- 단, 토큰 수가 큰 회의록·NotebookLM 결과면 비용 누적 가능

**Claude Code 권장**:
- Phase B-1은 분리 호출 유지 (각 단계 명확화)
- 비용·응답시간 데이터 쌓이면 Phase B-2에서 단일 호출 통합 검토 (분류+요약+태그를 한 프롬프트로)
- `command_hints.explicit_project`이 있으면 분류 LLM 호출 **건너뛰기** (Phase B-0 §5 명시)

**회장님 합의**: 비용 추정에 동의하시는지, 또는 단일 호출 통합을 처음부터 원하시는지.

---

### R6 응답 시간 (사용자 체감)

신규 파이프라인은 LLM 3회 호출 + Drive 저장. 텔레그램 응답까지 **5~15초** 소요 가능.

기존 `wiki_auto_classify`는 LLM 1회 + 로컬 fs 저장으로 **2~5초**.

**문제**: 회장님이 메모 보내고 즉시 응답 못 받으면 "씹혔나?" 싶을 수 있음.

**권장 UX**:
- `/tg` 입력 즉시 `📝 처리 중...` 응답 (typing indicator + 짧은 reply)
- 파이프라인 완료 시 본 응답 추가: `✅ Wiki 저장 완료 | 📂 #hannam-644 | 💬 요약 한 줄`
- 사용자가 "보냈다"는 인지를 즉시 받음

**회장님 합의**: 위 2단계 응답 패턴 채택.

---

## 6. 합의 필요 항목 정리 (회장님 확인)

| # | 항목 | Claude Code 권장 | 합의 필요? |
|---|------|-------------------|-------------|
| 1 | 멱등성 재처리 — Track A(메타플래그)만 vs A+B 둘 다 | A만 (Phase B-1) | 예 |
| 2 | I/O 실패 시 텔레그램 알림 | yes | 예 |
| R1 | 기존 `WIKI_ROOT` 안에 섞기 vs `v2/` 분리 | 안에 섞기 (frontmatter로 구분) | 예 |
| R2 | `WIKI_ROOT` 경로 (Drive로 이전 여부) | `G:\내 드라이브\Aston-Wiki` | 예 |
| R3 | MTProto collector는 별도 유지 | 별도 유지 (Phase B-1 미통합) | 예 |
| R4 | SQLite + Wiki 이중 저장 | yes | 예 |
| R5 | LLM 분리 호출 vs 단일 호출 | 분리 (Phase B-1) | 가벼움 |
| R6 | 2단계 응답 패턴 | 채택 | 가벼움 |

### Claude Code 자율 결정 (합의 불필요)
- 명령 파서 = token dispatcher 구조
- LLM 실패 = inline 폴백 + step_failures 메타
- I/O 실패 = pending 큐 + 재시도
- frontmatter 필드 직렬화 (YAML)
- Gemini 모델 / timeout / 프롬프트 문구

---

## 7. Phase B-1 진입 순서

1. 본 평가 보고서 회장님 검토
2. §6 합의 필요 항목 6건 결정
3. CURRENT_TASK.md §8 회귀 위험 섹션에 결정 사항 반영
4. 코드 구현 시작 (CURRENT_TASK.md §10 순서 따름)

**§6 결정이 끝나기 전 코드 시작 금지.**
