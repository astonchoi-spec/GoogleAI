# Phase B-0 — 공통 입력 파이프라인 모듈 인터페이스
> 작성: 2026-05-07 | 상태: 설계 (코드 작성 X)
> 전제: phase-a-b-final.md Q1·Q2 확정 반영

---

## 0. 본 문서의 목적과 한계

### 목적
Phase B-1(Telegram 어댑터 구현) 진입 전, **모든 입력 어댑터·정제·분류·요약·태깅·저장 모듈의 인터페이스만** 확정한다.
- 데이터가 어떻게 흘러가는지 (입출력 타입)
- 모듈 간 책임 경계
- 에러·fallback 정책
- frontmatter 최소 필드 (저장 포맷 디테일은 여전히 보류)

### 한계
- **코드 X**. 본 문서 안의 `interface` 표기는 TypeScript 문법을 빌린 **명세 표기**이며, 실제 `.ts` 파일을 만들지 않는다.
- frontmatter vs JSON sidecar 결정 보류 — 지금은 "필드 목록"까지만 정의
- 실제 LLM 호출 모델·토큰 한도·프롬프트 문구는 Phase B-1 구현 시 결정

---

## 1. 파이프라인 단계 8개 (재확인)

```
[입력 소스]
   │
   ▼  (1) 어댑터 — 소스별 표준화
   ▼
[원문 저장]
   │
   ▼  (2) 정제 (cleaning) — 공통
   ▼
[정제된 텍스트]
   │
   ▼  (3) 분류 (classification) — Gemini
   ▼
[분류 결과]
   │
   ▼  (4) 요약 (summary) — Gemini
   ▼
[요약 + 핵심 포인트]
   │
   ▼  (5) 태깅·엔티티 (tagging) — Gemini
   ▼
[메타데이터 풍부화 완료]
   │
   ▼  (6) 라우팅 — projects/{project}/ vs inbox/ vs inbox/_suggested/{project}/ 결정
   ▼
[목적지 폴더 결정]
   │
   ▼  (7) Wiki 저장 — Markdown + frontmatter
   ▼
[Wiki 저장 완료]
   │
   ▼  (8) 후속 트리거 — 검색 인덱스 갱신, 활동 피드 알림 등 (선택)
```

각 단계는 **독립 모듈**이며, 다음 단계로 명시적 데이터 객체를 전달한다.

---

## 2. 공통 데이터 타입

```typescript
// 어댑터가 출력하는 표준 입력 객체
interface PipelineInput {
  source_type: SourceType;
  source_ref: string;             // 어댑터별 고유 식별자
  raw_text: string;               // 정제 전 원본
  attachments?: Attachment[];     // 첨부 파일 (Drive 경로 또는 로컬 경로)
  hints?: SourceHints;            // 어댑터가 알 수 있는 메타 (chat 이름, 발신자 등)
  command_hints?: CommandHints;   // /tg #hannam-644 같은 명시 명령에서 파싱된 정보
  received_at: string;            // ISO 8601 (KST)
}

type SourceType =
  | "telegram"
  | "voice"
  | "gmail"
  | "kakao_manual"
  | "kakao_mcp"
  | "meeting"
  | "manual"
  | "notebooklm";

interface Attachment {
  kind: "image" | "audio" | "pdf" | "doc" | "spreadsheet" | "other";
  source_path: string;            // 원본 위치
  size_bytes?: number;
  mime?: string;
}

interface SourceHints {
  // 어댑터별 자유 형식. 예: telegram의 chat_title, gmail의 sender, voice의 duration_sec
  [key: string]: string | number | boolean | undefined;
}

interface CommandHints {
  explicit_project?: string;      // /tg #hannam-644 → "hannam-644"
  explicit_command?: string;      // "/tg" | "/nb" | "/meeting" | ...
  permanent_knowledge?: boolean;  // 명령에 강제 플래그 있을 때
  importance?: "low" | "normal" | "high";
}
```

---

## 3. 어댑터 인터페이스 (단계 1)

모든 어댑터는 동일한 출력 계약을 따른다. 어댑터의 책임은 **소스 → PipelineInput 변환만**.

```typescript
interface InputAdapter {
  readonly source_type: SourceType;

  // 소스별 트리거에서 호출됨. 트리거가 여러 개면 각각 별도 어댑터.
  // 실패 시 throw — 파이프라인이 catch하여 dead-letter 처리.
  toPipelineInput(rawSourceEvent: unknown): Promise<PipelineInput>;
}
```

### 어댑터별 매핑 (재확인)

| 어댑터 | source_ref 형식 | 트리거 |
|--------|------------------|--------|
| `TelegramAdapter` | `tg:{chat_id}:{message_id}` | 봇 메시지 수신 |
| `VoiceAdapter` | `voice:{filehash}` | 음성 파일 업로드 / 텔레그램 음성 |
| `GmailAdapter` | `gmail:{message_id}` | 라벨 폴링 |
| `KakaoManualAdapter` | `kakao_manual:{filehash}` | 사용자 export 업로드 |
| `KakaoMcpAdapter` | `kakao_mcp:{room_id}:{ts}` | OpenClaw / PlayMCP webhook |
| `MeetingAdapter` | `meeting:{filehash}` | 회의록 업로드 |
| `ManualAdapter` | `manual:{uuid}` | AI 채팅 직접 호출 |
| `NotebookLmAdapter` | `nb:{notebook_id}:{section}` | `/nb` 명령 또는 자동 회수 |

### `/tg` `/nb` `/meeting` 명령 규약

회장님이 입력 시점에 명시:
```
/tg #hannam-644 메모내용
/nb yeokbuk-pf NotebookLM 답변
/meeting osb-pf 미팅내용
```

각 어댑터는 본문 첫 토큰을 검사해 명시 명령이면 `command_hints.explicit_project`를 채운다. 없으면 비워둔다 (라우팅 단계에서 처리).

---

## 4. 정제 (Cleaning) 인터페이스 (단계 2)

소스 무관 공통 모듈. **본문은 보존**하면서 노이즈만 제거한다.

```typescript
interface Cleaner {
  clean(input: PipelineInput): Promise<CleanedDocument>;
}

interface CleanedDocument extends PipelineInput {
  cleaned_text: string;           // 정제 결과
  cleaning_notes?: string[];      // 어떤 정제를 했는지 (감사용)
}
```

### 정제 규칙
- HTML/마크다운 noise 정규화 (텔레그램 forward 메시지의 zero-width space 등)
- 연속 공백·줄바꿈 단일화
- 문장부호 정규화 (스마트 쿼트 → 일반 쿼트)
- URL은 유지 (제거 X)
- **원본은 손상시키지 않는다** — `raw_text`는 그대로 유지, `cleaned_text`만 새로

---

## 5. 분류 (Classification) 인터페이스 (단계 3)

Gemini 호출. category·related_projects 추정.

```typescript
interface Classifier {
  classify(doc: CleanedDocument): Promise<ClassifiedDocument>;
}

interface ClassifiedDocument extends CleanedDocument {
  category: Category;             // 큰 분류
  suggested_projects: string[];   // 영문 케밥. 신뢰도 순. 비어있을 수 있음.
  classification_confidence: number; // 0~1
}

type Category =
  | "real-estate"   // 부동산 PF
  | "trading"       // 트레이딩
  | "system"        // 시스템·자동화
  | "legal"         // 법무·계약
  | "finance"       // 금융·공시
  | "personal"      // 개인 일정·가족
  | "research"      // 리서치·학습
  | "meeting"       // 회의·자문
  | "other";
```

### 호출 정책
- LLM 실패 시 → `category: "other"`, `suggested_projects: []`로 폴백 (파이프라인 진행 막지 않음)
- `command_hints.explicit_project`이 있으면 LLM 호출 **건너뛰기** 가능 (비용 절감)

---

## 6. 요약 (Summary) 인터페이스 (단계 4)

Gemini 호출. 요약 + 핵심 포인트 + 액션 아이템 후보 추출.

```typescript
interface Summarizer {
  summarize(doc: ClassifiedDocument): Promise<SummarizedDocument>;
}

interface SummarizedDocument extends ClassifiedDocument {
  title: string;                  // 한 줄 요지 (자동 생성)
  summary: string;                // 1~3 문단
  key_points: string[];           // 불릿 3~7개
  action_item_candidates: ActionItemDraft[];  // LLM이 본문에서 발견한 액션 후보
}

interface ActionItemDraft {
  text: string;
  due_date?: string;              // ISO 8601 if extractable
  assignee?: string;              // "본인" 또는 사람 이름
}
```

### 호출 정책
- 입력 짧으면 (예: <100자) summary == cleaned_text, key_points는 비움
- LLM 실패 시 → title은 cleaned_text 첫 50자, summary는 cleaned_text 그대로

---

## 7. 태깅·엔티티 추출 인터페이스 (단계 5)

Gemini 호출. 태그·인물·기관·중요도 등 메타 풍부화.

```typescript
interface Tagger {
  tag(doc: SummarizedDocument): Promise<TaggedDocument>;
}

interface TaggedDocument extends SummarizedDocument {
  tags: string[];                 // 자유 태그 (한글 가능)
  people: string[];               // 언급된 인물
  companies: string[];            // 언급된 회사·기관
  importance: "low" | "normal" | "high";
  permanent_knowledge: boolean;   // 영구 지식 후보 여부 (LLM 추정 + command_hints 우선)
  privacy_level: "public" | "private" | "sensitive";
}
```

### 호출 정책
- `command_hints.permanent_knowledge`가 명시되면 LLM 추정값 무시 (회장님 의도 우선)
- `command_hints.importance`도 동일

---

## 8. 라우팅 인터페이스 (단계 6)

저장 목적지(폴더) 결정. 별도 LLM 호출 없음 — 규칙 기반.

```typescript
interface Router {
  route(doc: TaggedDocument): RoutingDecision;
}

interface RoutingDecision {
  target_folder: string;          // Wiki 내 절대 경로 (Drive 기준)
  routing_reason: RoutingReason;
  suggested_alternative?: string; // _suggested 폴더 경로 (있을 때)
}

type RoutingReason =
  | "explicit_command"            // command_hints.explicit_project 사용
  | "single_high_confidence"      // suggested_projects[0] confidence ≥ 0.85
  | "keyword_hint_suggested"      // 키워드 힌트 → inbox/_suggested/{project}/
  | "inbox_fallback";             // 미명시 + 키워드 힌트 없음 → inbox/{source_type}/
```

### 라우팅 규칙 (우선순위 순)

1. **`command_hints.explicit_project` 있음**
   → `projects/{project}/notes/` 또는 `notebooklm/`(NotebookLM 어댑터일 때) 또는 `outputs/`(명령에 따라)

2. **`command_hints.explicit_project` 없지만 LLM `suggested_projects[0]` 있고 `classification_confidence ≥ 0.85`**
   → 자동 promotion **하지 않는다**. `inbox/_suggested/{project}/`로만 보낸다 (Q2 보완 제안 채택)

3. **그 외** → `inbox/{source_type}/`

이렇게 하면 **자동 분류 오탐의 비용 = 0** (실제 projects/는 회장님 손으로만 진입).

### 키워드 힌트 (보조)
본문 또는 hints에 명백한 키워드(`#hannam`, `한남`, `한남동644` 등)가 있으면 `suggested_projects` 상위에 후보로 추가. mapping yaml에서 `display_name`·노트북명을 키워드로 자동 추출 가능.

---

## 9. 저장 인터페이스 (단계 7)

`TaggedDocument` + `RoutingDecision`을 받아 Wiki 파일 작성.

```typescript
interface WikiWriter {
  save(doc: TaggedDocument, route: RoutingDecision): Promise<WikiEntry>;
}

interface WikiEntry {
  id: string;                     // 파일경로에서 파생 또는 UUID
  saved_path: string;             // 절대 경로
  url?: string;                   // Drive 웹 URL (Drive API 사용 시)
}
```

### 저장 규칙
- 파일명 규약: `YYYY-MM-DD-{source_type}-{slug}.md`
  - slug는 title을 영문·숫자·하이픈으로 안전화 (한글은 풀어쓰기 또는 `note-{shortid}`)
- frontmatter 최소 필드 (확정):
  ```
  id, created_at, source_type, source_ref, title, summary, tags,
  related_projects, importance, permanent_knowledge, privacy_level,
  status, action_items, people, companies, linked_files,
  notebooklm_ref, saved_path
  ```
- 본문 구조 (현재 권장):
  ```markdown
  ## 원문
  (raw_text)

  ## 정제본
  (cleaned_text — 원문과 의미 차이 없으면 생략 가능)

  ## 요약
  (summary)

  ## 핵심 포인트
  (key_points)

  ## 액션 아이템
  (action_items)
  ```
- 충돌 처리: 같은 `source_ref` 재유입 시 (멱등성)
  - 해시 기반 중복 검사
  - 기존 파일이 있고 raw_text가 동일하면 **skip**
  - 다르면 새 파일에 `-v2` suffix (재버전화) — 자동화 게이트 5번(멱등성)과 직결

### 파일 포맷 결정 보류
frontmatter only / JSON sidecar / 병행 — 본 단계에서 **결정하지 않음**. 추후 회수 데이터가 쌓이면 의사결정.
지금은 frontmatter에 위 필드를 모두 포함하는 것으로 진행.

---

## 10. 후속 트리거 (단계 8, 선택)

저장 완료 이벤트 발행. 구독자가 자유롭게 처리:
- 검색 인덱스 갱신 (Phase C에서 의미 검색 도입 시)
- 활동 피드 알림
- 모닝 브리핑 데이터 캐시 갱신
- AI 채팅 컨텍스트 캐시 무효화

```typescript
interface PipelineEvent {
  event_type: "wiki_entry_saved";
  entry: WikiEntry;
  metadata: {
    source_type: SourceType;
    routing_reason: RoutingReason;
    is_permanent_knowledge: boolean;
  };
  timestamp: string;
}
```

이번 Phase B-0에서는 **이벤트 발행 인터페이스만 정의**. 실제 구독자는 Phase B-2 이후.

---

## 11. 에러·Fallback 정책 (전체)

각 단계 실패 시 행동:

| 단계 | 실패 시 |
|------|---------|
| 어댑터 | dead-letter 큐에 raw event 저장 + 회장님 알림 (Telegram). 파이프라인 중단. |
| 정제 | LLM 미사용 모듈이라 실패할 일 없음. 예외 발생 시 throw → 어댑터와 동일 처리. |
| 분류 | `category: "other"`, `suggested_projects: []`로 폴백. 진행. |
| 요약 | title=첫 50자, summary=cleaned_text 그대로. 진행. |
| 태깅 | tags=[], importance="normal", permanent=false 폴백. 진행. |
| 라우팅 | 항상 `inbox/{source_type}/` 보장 (라우팅 자체는 실패 안 함) |
| 저장 | Drive API 실패 → 로컬 임시 위치(`data/wiki-pending/`)에 저장 + 재시도 큐. 회장님 알림. |

**원칙**: LLM 단계의 실패는 진행을 막지 않는다 (회복 가능 메타 폴백). I/O 단계의 실패는 데이터 손실 방지를 우선한다 (재시도 + 알림).

---

## 12. 본 단계에서 인터페이스로만 정의하고 보류한 것

- **임베딩·의미 검색**: Phase C 이후
- **사용자 정의 정제 규칙 플러그인**: 정제는 모놀리식으로 시작
- **다국어 분류 규칙**: 한국어 우선, 영어 본문은 정제 후 같이 처리 (별도 분기 X)
- **이미지 OCR**: 카톡 OCR 영구 제외와 일관 — 이미지 첨부는 attachments에 경로만 보존
- **음성 길이 제한**: VoiceAdapter 구현 시 결정
- **dead-letter UI**: Phase B-3 이후

---

## 13. Phase B-1 진입 조건 (체크리스트)

Phase B-0가 끝났다고 판단하기 전 확인:

- [x] Q1 폴더 명명 확정 (영문 케밥 + display_name)
- [x] Q2 inbox 분류 방식 확정 ((c) 명시 + _suggested 보완)
- [x] 어댑터 인터페이스 정의 (단계 1)
- [x] 정제·분류·요약·태깅 인터페이스 정의 (단계 2~5)
- [x] 라우팅 규칙 정의 (단계 6)
- [x] 저장 인터페이스 + frontmatter 필드 목록 정의 (단계 7)
- [x] 후속 이벤트 인터페이스 정의 (단계 8)
- [x] 에러·Fallback 정책 정의
- [ ] **Phase B-1 작업 지시서(`CURRENT_TASK.md`) 작성** ← 다음 단계
- [ ] notebooklm-mapping.yaml에 회장님이 실제 노트북 30개+ 매핑 (코드와 병행 가능)

---

## 14. Phase B-1 진입 시 작성할 CURRENT_TASK.md 항목 (예고)

Claude Code가 Phase B-1에 들어가기 위해 **CURRENT_TASK.md에 명시되어야 할 것**:

- 범위: TelegramAdapter + 공통 파이프라인 단계 1~7 구현 (단계 8은 stub)
- 기존 Phase 1c (Gemini 자동 분류 저장) 코드와의 통합·재구성 방식 (rewrite vs wrap)
- 신규 모듈 위치 (`server/knowledge/` 또는 기존 `server/wiki/` 확장)
- 테스트 전략 (fake LLM client, 가짜 Telegram 메시지로 end-to-end)
- 기존 wikiStore.ts와 신규 WikiWriter의 관계 (병행 vs 단계적 교체)
- npm run check / build / test 통과 조건
- 회귀 위험: 기존 Aston Wiki Phase 1a~1d 사용자 데이터(이미 G:\Aston-Wiki에 저장된 .md 파일들)에 대한 호환성 보장

이 결정들은 **CURRENT_TASK.md를 회장님이 작성·확인**한 시점에 합의한다. Claude Code가 자율로 시작하지 않는다.

---

## 부록 A — 본 문서 확정 / 보류 / 다음

### 확정 ✅
- 파이프라인 8단계 구조
- 모든 모듈의 입출력 인터페이스 (TypeScript 명세 표기)
- 어댑터 8종의 source_ref 규약
- `/tg`, `/nb`, `/meeting` 명령 규약
- 분류 카테고리 9종
- 라우팅 규칙 (Q2 보완안 반영 — `inbox/_suggested/{project}/`)
- frontmatter 최소 필드 목록
- 에러·Fallback 정책

### 보류 ⏸ (의도적)
- frontmatter vs JSON sidecar (실제 회수 데이터 쌓인 후 결정)
- 임베딩·벡터 검색 (Phase C)
- 자동 promotion (LLM 분류 → projects 직접 이동) — 영구 보류 가능성 큼
- 음성 STT 엔진·길이 제한 (VoiceAdapter 구현 시)
- dead-letter UI

### 다음 ➡
1. **CURRENT_TASK.md 작성**: Phase B-1 (TelegramAdapter + 공통 파이프라인) 작업 지시서
2. notebooklm-mapping.yaml 회장님이 실제 노트북 매핑 채우기 (병행)
3. 코드 작성 시작 (CURRENT_TASK.md 합의 후)
