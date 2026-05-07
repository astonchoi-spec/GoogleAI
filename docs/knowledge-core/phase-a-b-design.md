# Knowledge Core 설계 — Phase A 확정 + Phase B-0 초안
> 작성: 2026-05-07 | 대상: Aston Wiki + NotebookLM 통합 설계
> 상태: Phase A 확정 / Phase B-0 (공통 파이프라인 + 저장 스키마) 설계 중

> ⚠️ **본 문서는 [phase-a-b-final.md](./phase-a-b-final.md)로 대체되었습니다.**
> Knowledge Core 최종 방향(3축 구조: Aston-Wiki / NotebookLM / Workstation),
> Google Drive 폴더 구조, NotebookLM 회수 방식 등 모든 결정은 final 문서를 기준으로 합니다.
> 본 문서는 설계 이력 추적용으로 보존됩니다.

---

## 1. Phase A 확정 요약 — Wiki와 NotebookLM의 분업

### 결정
**시나리오 3 — 분업** 으로 확정.

| 구성 | 역할 | 책임 |
|------|------|------|
| **Aston Wiki** | 장기기억 / 운영 본진 | 모든 정보의 최종 저장소. 검색·회상·브리핑·AI 채팅 컨텍스트의 기준 데이터 |
| **NotebookLM** | 외부 분석실 | 장문 PDF, 보고서, 책, 논문, 계약서, 프로젝트 자료 묶음의 깊은 분석 |
| **AI 채팅** | 단일 진입점 | 기본 컨텍스트는 Wiki. 필요 시 NotebookLM 결과 참조 |

### 핵심 원칙
- NotebookLM에서 산출된 요약·인사이트·결론은 **반드시 Wiki로 회수**한다. NotebookLM 안에만 두지 않는다.
- 자체 RAG 풀스택은 지금 만들지 않는다.
- NotebookLM에 전부 의존하지 않는다.
- **Wiki 중심 + NotebookLM 보조** 구조.

---

## 2. Phase B 입력원 우선순위 (확정)

| 순서 | 입력원 | 비고 |
|------|--------|------|
| 1 | 텔레그램 메모 → Wiki | **레퍼런스 구현** (공통 파이프라인 검증용) |
| 2 | 본인 음성 → STT → Wiki | |
| 3 | Gmail 요약 → Wiki | |
| 4 | 카톡 수동 업로드 → Wiki | 회장님이 export/복사/붙여넣기 |
| 5 | 카톡 OpenClaw / PlayMCP 자동 수집 → Wiki | 안정화 후 |
| 별도 트랙 | 회의록 수동 업로드 → Wiki | 1~5와 병렬 진행 가능 |

**제외**: 카톡 캡처 OCR — 난이도 대비 효율 낮고 유지보수 가치 없음.

---

## 3. 공통 입력 파이프라인 구조

텔레그램·음성·Gmail·카톡·회의록 등 모든 입력원은 **하나의 공통 파이프라인**에 어댑터로 붙는다. 텔레그램 전용 구조로 만들지 않는다.

```
[입력 소스]               (텔레그램 메시지, 음성 파일, Gmail, 카톡 export, 회의록…)
     │
     ▼
[입력 어댑터]              ← source-specific. 원문 + source_type + source_ref 추출
     │
     ▼
[원문 저장 (raw)]          ← 정제 전 원본을 그대로 보존 (감사·재처리용)
     │
     ▼
[정제 (cleaning)]          ← 공통 모듈. HTML strip, 공백 정규화, 중복 제거
     │
     ▼
[분류 (Gemini)]            ← category, related_projects 추정
     │
     ▼
[요약 (Gemini)]            ← summary 1~3문단 + key points
     │
     ▼
[태깅 + 엔티티 추출]        ← tags, people, companies, action_items, due_date
     │
     ▼
[Wiki 저장]                ← Markdown + frontmatter (공통 스키마)
     │
     ▼
[활용 레이어]              ← 검색 / 브리핑 / 회고 / AI 채팅 컨텍스트
```

각 단계는 **독립 모듈**로, 어댑터 교체나 중간 단계 추가가 코드 수정 최소화로 가능해야 한다.

---

## 4. 입력 어댑터 목록과 역할

각 어댑터의 책임은 **"소스 → 표준화된 입력 객체"** 변환만 한다. 정제·분류·요약·저장은 공통 파이프라인이 담당.

| 어댑터 | 트리거 | source_type | source_ref 형식 | 비고 |
|--------|--------|-------------|------------------|------|
| `TelegramAdapter` | 봇 메시지 수신 (polling/webhook) | `telegram` | `tg:{chat_id}:{message_id}` | 1단계 |
| `VoiceAdapter` | 음성 파일 업로드 / 텔레그램 음성 메시지 | `voice` | `voice:{filehash}` | 2단계, STT 결과를 raw_text에 |
| `GmailAdapter` | 라벨 폴링 (`Aston-Wiki` 등) | `gmail` | `gmail:{message_id}` | 3단계 |
| `KakaoManualAdapter` | 사용자 export 업로드 (텔레그램·웹 채팅) | `kakao_manual` | `kakao_manual:{filehash}` | 4단계 |
| `KakaoMcpAdapter` | OpenClaw / PlayMCP webhook | `kakao_mcp` | `kakao_mcp:{room_id}:{ts}` | 5단계, 안정화 후 |
| `MeetingAdapter` | 회의록 업로드 (음성 STT or 직접 텍스트) | `meeting` | `meeting:{filehash}` | 별도 트랙 |
| `ManualAdapter` | AI 채팅에서 직접 "위키 저장" 호출 | `manual` | `manual:{uuid}` | 기존 인텐트 유지 |
| `NotebookLmAdapter` | NotebookLM 분석 결과 회수 | `notebooklm` | `nb:{notebook_id}:{section}` | 인사이트 회수 전용 |

**공통 어댑터 인터페이스(개념)**:
- 입력: 소스별 원본
- 출력: `{ source_type, source_ref, raw_text, attachments?, hints? }`
- `hints`는 어댑터가 알 수 있는 메타 (예: 텔레그램 chat 이름, Gmail 발신자) — 공통 파이프라인이 활용

---

## 5. Wiki 저장 공통 스키마 초안

### 핵심 원칙
- **원문(raw_text)과 요약(summary)을 분리** 저장 — 재요약·재분류 가능하도록
- **일회성 메모 vs 영구 지식 구분** — `permanent_knowledge` 플래그
- **action item은 별도 추출** — frontmatter 배열로
- NotebookLM 결과물도 동일 스키마로 저장 (`source_type: notebooklm`)
- frontmatter 필드는 **시간이 지나도 의미가 변하지 않는** 것만 포함. 휘발성 상태(예: "오늘 본 메모")는 포함 X

### 필드 정의

```
id                   ← 고유 ID. 파일 경로 또는 UUID
created_at           ← ISO 8601 (KST), 입력 발생 시각
source_type          ← telegram | voice | gmail | kakao_manual |
                       kakao_mcp | meeting | manual | notebooklm
source_ref           ← 원본 식별자 (어댑터별 형식)
title                ← 한 줄 요지 (자동 생성 또는 수동)
raw_text             ← 정제된 원문
summary              ← 1~3문단 요약 (Gemini 생성)
tags                 ← ["부동산PF", "한남644", ...]
related_projects     ← 관련 프로젝트 키 (정규화된 키)
importance           ← low | normal | high (기본 normal)
action_items         ← [ { text, due_date?, assignee? }, ... ]
due_date             ← 노트 자체의 마감일 (있을 경우)
people               ← 언급된 인물 목록
companies            ← 언급된 회사·기관 목록
permanent_knowledge  ← true(영구 지식) | false(일회성 메모) — 검색 가중치 차등
privacy_level        ← public | private | sensitive
status               ← draft | active | archived | done
linked_files         ← 관련 첨부 파일 경로 (Drive·로컬)
notebooklm_ref       ← 연관된 NotebookLM 노트북 ID (있을 경우)
saved_path           ← 본 Wiki 파일의 절대 경로 (자기 참조)
```

### 분류 카테고리(연도 폴더 + 카테고리 폴더 병행 제안)

```
G:\Aston-Wiki\
├── 2026\
│   ├── 05\
│   │   ├── 2026-05-07-telegram-한남644-주간진행.md
│   │   └── 2026-05-07-meeting-osb-자문회의.md
├── projects\
│   ├── 한남644\
│   ├── osb\
├── daily\          ← 모닝 브리핑 아카이브
└── permanent\      ← permanent_knowledge=true 항목 심볼릭 링크 또는 색인
```

(폴더 구조는 다음 결정 단계에서 합의)

---

## 6. Markdown 저장 예시

### 예 1 — 텔레그램 메모 (일회성)

```markdown
---
id: 2026-05-07-telegram-한남644-주간진행
created_at: 2026-05-07T14:32:11+09:00
source_type: telegram
source_ref: tg:1234567:9876
title: 한남644 주간 진행 — 인허가 5/15 신청
summary: |
  한남644 PF 건. 인허가 5월 15일 신청 예정. 자문 김변호사 컨펌 받음.
  자금 컨소시엄 1차 미팅 5월 20일.
tags: [부동산PF, 한남644, 인허가, 일정]
related_projects: [한남644]
importance: high
action_items:
  - text: 인허가 신청서 5/13까지 변호사 검토 완료
    due_date: 2026-05-13
    assignee: 본인
  - text: 컨소시엄 미팅 자료 5/19까지 준비
    due_date: 2026-05-19
    assignee: 본인
due_date: 2026-05-15
people: [김변호사]
companies: []
permanent_knowledge: false
privacy_level: private
status: active
linked_files: []
notebooklm_ref: null
saved_path: G:\Aston-Wiki\2026\05\2026-05-07-telegram-한남644-주간진행.md
---

## 원문
> 한남644 인허가 5/15 신청. 김변호사 컨펌. 컨소시엄 1차 5/20.

## 요약
한남644 PF 건. 인허가 5월 15일 신청 예정...

## 액션 아이템
- [ ] 5/13까지 변호사 검토 완료
- [ ] 5/19까지 컨소시엄 자료 준비
```

### 예 2 — NotebookLM 결과 회수 (영구 지식)

```markdown
---
id: 2026-05-07-notebooklm-한남644-사업성요약
created_at: 2026-05-07T16:00:00+09:00
source_type: notebooklm
source_ref: nb:abc123:summary
title: 한남644 사업성 분석 — NotebookLM 핵심 요약
summary: |
  IRR 12.4% 추정. 주요 리스크 3가지: 인허가 지연, 자금 조달 시기, 분양가 변동.
  민감도 분석 결과 첨부 시트 참조.
tags: [부동산PF, 한남644, NotebookLM, 사업성]
related_projects: [한남644]
importance: high
action_items: []
people: []
companies: []
permanent_knowledge: true
privacy_level: private
status: active
linked_files:
  - G:\Aston-Deals\한남644\사업수지\민감도분석.xlsx
notebooklm_ref: notebook-abc123
saved_path: G:\Aston-Wiki\projects\한남644\2026-05-07-notebooklm-사업성요약.md
---

## 요약
IRR 12.4% 추정...

## 핵심 인사이트
1. ...
2. ...

## NotebookLM 원본 출처
- 노트북: notebook-abc123
- 분석 대상 문서: 사업수지.xlsx, 인허가검토서.pdf
```

---

## 7. 다음 결정 질문 (1개, 회장님 확정 필요)

### Q. 메타데이터 저장 방식 — 어느 방식으로?

| 옵션 | 구조 | 장점 | 단점 |
|------|------|------|------|
| **A. Markdown frontmatter only** | `.md` 파일 하나에 YAML frontmatter + 본문 | 사람이 읽기 좋음. 단일 파일. 현재 Phase 1a 방식과 동일. | 메타 필드가 늘면 frontmatter 비대. 메타만 변경해도 본문 파일 전체 rewrite. |
| **B. JSON sidecar only** | `.md` (본문) + `.json` (메타) 두 파일 페어 | 메타 변경 시 본문 무손상. 프로그램 조회 빠름. | 파일 2배. 사람이 메타 보려면 json 별도 열기. |
| **C. 병행 (frontmatter essential + JSON sidecar 확장)** | frontmatter에 핵심 필드(id, created_at, source_type, title, tags), 확장 필드(action_items 상세, embedding, 분석 결과)는 JSON sidecar | 사람용/프로그램용 분리. 검색·임베딩 등 미래 확장에 유리. | 가장 복잡. 두 위치를 동기화해야 함. |

**권장 의견**: 지금 시점에서는 **A (frontmatter only)** 가 가장 합리적입니다.
- 이유 1: 현재 Phase 1a 코드와 호환 (마이그레이션 비용 0)
- 이유 2: 회장님이 직접 메모를 열어 읽고 수정할 수 있음 (장기기억의 본진이라는 정의에 부합)
- 이유 3: 추후 임베딩이 필요해지면 그때 별도 vector index 또는 sidecar로 확장 가능
- B/C는 자체 RAG 풀스택으로 갈 때 의미가 있는데, Phase A에서 그건 보류로 결정함

**확정해 주실 것**: A / B / C 중 어느 방식?

---

## 다음 단계 (Phase B-0 이후)

이 결정이 끝나면 다음 순서로 진행:
1. **Phase B-0 마무리** — 정제·분류·요약·태깅 모듈의 인터페이스 정의 (코드 X, 인터페이스만)
2. **Phase B-1** — 텔레그램 어댑터를 공통 파이프라인 위에 구현 (Phase 1c와 통합·재구성)
3. **Phase B-2** — 음성 어댑터 (STT 선택지 결정 필요)
4. 이후 Gmail / 카톡 / 회의록 / NotebookLM 회수 어댑터 순차 추가
