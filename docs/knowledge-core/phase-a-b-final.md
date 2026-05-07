# Knowledge Core — Phase A·B-0 최종 확정
> 작성: 2026-05-07 | 상태: **확정** | 대체 대상: phase-a-b-design.md
> 코드 작성 금지. 본 문서는 구조·운영 흐름 합의서다.

---

## 0. 목적과 범위

이 문서는 다음을 확정한다.
- Aston-Wiki / NotebookLM / Aston Workstation의 역할 분담
- Google Drive 기반 Aston-Wiki 폴더 구조
- NotebookLM 노트북 ↔ Wiki 프로젝트 매핑 규칙
- NotebookLM 결과 회수 방식
- 입력원 우선순위와 공통 파이프라인 지향
- 자동화 실험 경로 도입 조건 (안정성 체크리스트)

**확정하지 않는 것**:
- frontmatter vs JSON sidecar (보류)
- 자체 RAG / 벡터DB / 임베딩 (Phase C 이후)
- NotebookLM 자동화 구현 (실험 경로로만 분리)
- 코드 (이번 단계 전부 보류)

---

## 1. Knowledge Core 최종 방향 — 3축 구조

| 축 | 정체성 | 책임 |
|----|--------|------|
| **Google Drive / Aston-Wiki** | 장기기억 본진 / 원본 자료 창고 | 모든 입력의 종착지. 모든 도구의 기준 데이터 |
| **NotebookLM** | 프로젝트별 깊은 분석실 | PDF·계약서·보고서·리서치·유튜브·웹자료 깊은 분석. 본진이 아니다. 장기 저장소도 아니다 |
| **Aston Workstation** | Wiki를 읽는 작업 환경 | 검색·모닝브리핑·회고·AI 채팅 컨텍스트의 표시·실행 계층. 자체 영구 저장소를 중심에 두지 않는다 |

### Aston-Wiki에 저장되는 것
- 원본 자료
- 텔레그램 메모
- 회의록
- 카톡 수동 업로드
- Gmail 요약
- 음성 STT 기록
- **NotebookLM 분석 결과 회수본**
- 프로젝트별 판단
- 후속 액션
- 정기 브리핑
- 회고
- 최종 보고서

### NotebookLM 운영 원칙
NotebookLM에서 나온 가치 있는 결과는 **반드시 Aston-Wiki로 회수**한다. NotebookLM 안에만 남은 분석 결과는 "아직 회수되지 않은 지식"으로 본다.

---

## 2. 절대 원칙 (3개)

1. **본진 보호**
   - NotebookLM을 본진으로 삼지 않는다.
   - Wiki만으로 NotebookLM을 대체하려 하지 않는다.
   - 자동화가 깨져도 `/nb` 붙여넣기 수동 경로로 시스템 전체가 계속 작동해야 한다.

2. **검색·합성 야망 보류**
   - 자체 RAG, 벡터DB, 임베딩 검색은 Phase C 이후에 검토한다.
   - 지금은 Wiki I/O, 저장 구조, 입력 파이프라인, NotebookLM 결과 회수에 집중한다.

3. **단일 진입점**
   - 모든 업무는 AI 채팅(1계층)에서 시작한다.
   - 1계층은 Wiki를 기본 컨텍스트로 사용하고, 필요 시 NotebookLM 결과를 참조한다.

---

## 3. Google Drive 기반 Aston-Wiki 폴더 구조

```
Google Drive/
└── Aston-Wiki/
    ├── projects/
    │   └── {project}/
    │       ├── sources/        # NotebookLM 투입 원본 자료 (PDF, DOCX, XLSX, HWP 변환본 등)
    │       ├── notebooklm/     # NotebookLM 분석 결과 회수본
    │       ├── notes/          # 회장님 메모, Telegram, 카톡 수동, 회의 메모
    │       └── outputs/        # 최종 보고서·제안서·제출 문서
    ├── inbox/
    │   ├── telegram/
    │   ├── notebooklm/
    │   ├── meeting/
    │   ├── voice/
    │   ├── gmail/
    │   └── kakao_manual/
    ├── daily/                  # 모닝 브리핑 아카이브
    ├── weekly/                 # 주간 회고 아카이브
    └── index/                  # 매핑·manifest·인덱스 메타 영역
```

### 폴더 역할 상세

- **`projects/{project}/sources/`**
  - NotebookLM에 투입할 원본 자료 보관
  - PDF, DOCX, XLSX, HWP 변환본, 회의자료, 계약서, 사업수지표, 웹 리서치, 유튜브 요약 원문 등 프로젝트 관련 원천 자료

- **`projects/{project}/notebooklm/`**
  - NotebookLM 분석 결과 회수본
  - Q&A 결과, 리스크 분석, 회의 준비 요약, 보고서 초안, 마인드맵 요약, 오디오 브리핑 요약, 핵심 판단

- **`projects/{project}/notes/`**
  - 회장님 메모, Telegram 메모, 카톡 수동 업로드, 회의 메모

- **`projects/{project}/outputs/`**
  - 최종 보고서, 제안서, 회의자료, 브리핑, 제출용 문서

- **`inbox/`**
  - 입력 어댑터가 1차로 떨어뜨리는 미분류 영역
  - 분류·태깅·요약 파이프라인 통과 후 `projects/{project}/` 하위 적절한 폴더로 이동
  - 프로젝트 매칭이 실패한 항목은 inbox에 남긴다 → 주간 회고 시점에 수동 분류 또는 폐기

- **`index/`**
  - 검색·매핑·manifest·인덱스 메타 영역
  - 지금은 폴더 자리만 확보 (notebooklm-mapping.yaml은 본 단계에서 스켈레톤 작성)

---

## 4. NotebookLM 노트북 ↔ Wiki 프로젝트 매핑 규칙

회장님은 이미 NotebookLM에 30개 이상의 프로젝트성 노트북을 운영 중이며, 단순 임시 자료가 아니라 **고급 지식 자산**으로 본다.

### 기본 원칙
- **1 NotebookLM 노트북 = 1 Wiki 프로젝트 폴더**
- 단, 하나의 프로젝트에 여러 NotebookLM 노트북이 생길 수 있으므로 확장 가능하게 설계

### 폴더명 규칙
- **영문 케밥 케이스**로 통일
- 한글 표시명은 frontmatter 또는 mapping yaml의 `display_name`에 보존
- 이유: CLI 안정성 / Git·자동화 안정성 / 인코딩 이슈 최소화 / Windows·WSL·Drive 동기화 충돌 감소

### 매핑 예시

| NotebookLM 노트북 | Wiki 프로젝트 폴더 |
|-------------------|---------------------|
| 한남동644 시그니처 공동주택 개발사업 | `projects/hannam-644/` |
| 한남644PFV | `projects/hannam-644-pfv/` 또는 `projects/hannam-644/` 하위 그룹 |
| 역북동 PF | `projects/yeokbuk-pf/` |
| Aston-Quant-Guard | `projects/system-aston-quant-guard/` |
| 트레이딩뷰 봇 및 퀀트 전략 자동화 | `projects/system-trading-automation/` |
| 기흥구 중동 1042-7 토지매각계획 | `projects/jungdong-1042-7/` |
| NotebookLM 활용법 | `projects/learning-notebooklm/` |

### 매핑 파일

`Aston-Wiki/index/notebooklm-mapping.yaml`

본 단계에서 스켈레톤만 만든다. 실제 30개 이상 노트북 매핑값은 회장님이 직접 채운다.

---

## 5. NotebookLM 결과 회수 방식 — 3개 경로

### V1 기본 경로 (안정·필수, 절대 보존)

가장 중요. 자동화가 전부 깨져도 작동해야 하는 **최후 보루**.

```
NotebookLM에서 회장님이 직접 질문
  → 가치 있는 답변 발생
  → /nb 명령어 또는 Workstation Paste Box로 본문 입력
  → 공통 파이프라인 실행
      → 정제 → 태깅 → 요약 → 액션아이템 추출
  → projects/{project}/notebooklm/ 저장
```

#### `/nb` 입력 예시

```
/nb hannam-644

NotebookLM 질문:
이 PFV 구조에서 후순위 투자자 리스크 3가지는?

답변:
[NotebookLM 답변 본문 붙여넣기]

출처:
한남644PFV 사업계획서.pdf, p.42-58
```

저장 경로 예: `projects/hannam-644/notebooklm/2026-05-07-pfv-junior-risk.md`

**이 경로는 반드시 유지**한다.

### V1 실험 경로 (자동화 시도)

`reallygood83/notebooklm-llm-wiki-flow`를 **설계 패턴 참고용**으로 사용한다. 코드 그대로 가져오지 않는다.

#### 참고할 패턴
- staged writes (부분 쓰기 시 Wiki 오염 방지)
- manifest.json (회수 이력 추적)
- deterministic index rebuild (인덱스 재생성 결정성)
- fake-client integration test (실제 NotebookLM 없이도 테스트)
- Jinja2 template rendering (저장 포맷 일관성)
- typed flow phases (단계 명시)
- Claude Code slash command (회장님 단일 진입점)
- NotebookLM 결과를 Wiki knowledge layer로 회수하는 철학

#### Aston Workstation 재설계 흐름

```
Claude Code 또는 Workstation
  → /aston-nb 또는 /note-wiki
  → Aston NotebookLM Flow CLI
  → NotebookLM 질의 또는 결과 회수
  → Aston-Wiki/projects/{project}/notebooklm/ 저장
  → index/manifest.json 업데이트
```

**이 경로는 실험 경로다. V1 기본 경로 위에 올리지 않는다.**

### Enterprise 경로 (보류)

- NotebookLM Enterprise API는 실재함 (Google Cloud / IAM / Enterprise / Preview 성격)
- V1 핵심 경로로 두지 않는다
- Phase C 또는 Phase D 이후, 회장님 시스템이 Cloud/Enterprise 기반으로 확장될 때 재평가

---

## 6. 자동화 실험 경로 안정성 체크리스트 (7 게이트)

NotebookLM 자동화 실험 경로를 도입하려면 **반드시 아래 7개 게이트를 모두 통과**해야 한다.

| # | 게이트 | 통과 기준 |
|---|--------|-----------|
| 1 | **수동 경로와 출력 호환성** | 자동·수동 결과물이 동일 스키마, 동일 폴더 규칙으로 저장 |
| 2 | **폴백 가능성** | 자동화 사망 시 5분 안에 `/nb` 수동 경로로 전환 가능 |
| 3 | **차단 회피 의존성 제한** | Playwright·비공식 API·내부 RPC가 차단되어도 V1 기본 경로 무영향 |
| 4 | **인증·세션 관리** | Google 계정 세션 만료 시 알림 + 재로그인 절차 명확 |
| 5 | **멱등성** | 같은 NotebookLM 답변을 두 번 회수해도 Wiki에 중복 파일 X (해시 기반 검사 고려) |
| 6 | **manifest 무결성** | 자동화 중간 실패 시 부분 쓰기로 Wiki 오염 X (staged writes 적용) |
| 7 | **로컬 실행 가능성** | Workstation에서 인터넷 없이도 이미 회수된 결과물 검색·열람 가능 |

**7개 중 하나라도 통과 못 하면 자동화는 V1 기본 경로 위에 올리지 않는다.**

비공식 API·내부 RPC·Playwright 기반 자동화는 **실험 경로로만** 둔다. 시스템의 핵심은 항상 Aston-Wiki 저장 구조다.

---

## 7. 입력원 우선순위 (확정)

| 순위 | 입력원 | 방식 | 비고 |
|------|--------|------|------|
| 1 | Telegram 메모 → Aston-Wiki | 완전 자동 | API가 가장 깔끔. **공통 파이프라인의 레퍼런스 구현** |
| 2 | NotebookLM 결과 회수 → Aston-Wiki | 기본 `/nb` 반자동 | 자동화는 실험 경로. 30개+ 노트북 운영 중이라 2순위 격상 |
| 3 | 회의록 수동 업로드 → Aston-Wiki | 수동 | 양식만 표준화 |
| 4 | 본인 음성 STT → Aston-Wiki | 반자동 | 텔레그램 음성 메시지 활용 가능 |
| 5 | Gmail 요약 → Aston-Wiki | 자동 폴링 | 비실시간 |
| 6 | 카톡 수동 업로드 → Aston-Wiki | 수동 | 텍스트 복사 붙여넣기. 중요 대화만 |
| 7 | 카톡 OpenClaw / PlayMCP 자동 | 가능 시 실험 경로 | 차단 위험 인지 |

**카톡 캡처 OCR은 설계 범위에서 영구 제외.**

### Telegram = 공통 파이프라인의 레퍼런스 구현

Telegram 어댑터는 단순 봇으로 만들지 않는다. 공통 파이프라인의 **레퍼런스**다.

```
입력
  → 원문 저장
  → 정제
  → 분류
  → 요약
  → 태깅
  → Wiki 저장
  → 검색 / 브리핑 / 회고 / AI 채팅 컨텍스트 활용
```

후속 어댑터(음성·Gmail·카톡·NotebookLM)는 이 공통 골격에 붙는 **adapter**로 설계한다.

---

## 8. notebooklm-llm-wiki-flow 참고 분석 (요약)

`reallygood83/notebooklm-llm-wiki-flow`는 MCP가 핵심이 아니라 다음 구조에 가깝다.

```
Claude Code slash command
  → Python CLI
  → notebooklm-py / Playwright 기반 NotebookLM 자동화
  → 결과 회수
  → LLM Wiki / Obsidian / qmd 저장
```

### 우리가 가져갈 것: 코드 X, **설계 패턴 O**

| 패턴 | 우리 시스템 적용 |
|------|------------------|
| Slash command 진입점 | `/nb`, `/aston-nb` |
| typed flow phases | 입력→정제→분류→요약→태깅→저장 단계화 |
| manifest.json | `Aston-Wiki/index/manifest.json` (자동화 이력) |
| staged writes | 부분 쓰기 시 임시 파일 → 검증 후 commit |
| fake-client integration test | NotebookLM 없이도 파이프라인 테스트 가능 |
| Jinja2 template | Markdown 저장 포맷 일관성 |
| 저장 단위 = .md | Aston-Wiki도 동일 (frontmatter는 추후 결정) |

코드 자체를 import 하지 않는다. **철학과 패턴**만 가져온다.

---

## 9. 다음 결정 질문 (Q1, Q2)

문서 작성 후 Claude Code는 자체 의견을 제시하되, 최종 결정은 회장님 답변을 기다린다.

### Q1. 프로젝트 폴더 명명 방식

**제안안**: 폴더명은 영문 케밥 케이스, 한글명은 `display_name`으로 보존
```
projects/hannam-644/
display_name: 한남동644 시그니처 공동주택
```

#### Claude Code 의견: **강한 찬성**

이유:
1. **Windows·Drive·WSL·Git 4축 모두 안전**한 유일한 명명 방식 — 한글 폴더명은 매번 인코딩 충돌(오늘만 해도 vite가 `D:/%EA%B5%AC%EA%B8%80%EC%97%B0%EB%8F%99AI`로 URL 인코딩)
2. **CLI 자동화 안정성** — bash·PowerShell·Node·Python 모두 영문 경로에서 escape 이슈 없음
3. **3년 후 협업·이관 시 비용 0** — 다른 사람·시스템이 인계받을 때 한글 폴더명 깨짐 위험 없음
4. **`display_name`으로 한글 손실 0** — 회장님 텔레그램·UI 표시는 한글 그대로

대안(반대 입장 검증): "한글 폴더명을 직접 쓰자"는 옵션은 검토했으나, 인코딩 사고 가능성·자동화 fragility를 감수할 가치가 없음. **제안 그대로 채택 권장**.

### Q2. inbox → projects 분류 방식

**세 옵션**:
- (a) 파이프라인이 LLM 기반 자동 분류 → confidence 낮으면 inbox 잔류
- (b) 모든 항목 inbox 잔류 → 일·주 단위 수동 분류
- (c) 입력 시점에 명령어로 명시 → 미명시는 inbox 잔류

**제안안**: (c) 방식 중심
```
/tg #hannam-644 메모내용
/nb yeokbuk-pf NotebookLM 답변
/meeting osb-pf 미팅내용
```
미명시 항목은 inbox에 남기고, 주간 회고 시 일괄 분류. 자동 분류는 Phase C 의미 검색 도입 이후로 보류.

#### Claude Code 의견: **찬성** (단, 한 가지 보완 제안)

이유:
1. **회장님이 입력 시점에 가장 풍부한 컨텍스트 보유** — 메모 보내는 순간 어느 프로젝트인지 가장 잘 안다
2. **자동 분류 오탐의 비용이 큼** — 잘못 분류된 항목은 검색에서 못 찾는다. inbox 잔류는 단순히 처리 지연일 뿐, 데이터 손실 없음
3. **/nb 자체가 이미 명시 명령** — 일관성 있음
4. **점진 진화 가능** — Phase C에서 자동 분류 옵션이 생기면 (a)+(c) 하이브리드로 자연스럽게 전환

#### 보완 제안 (선택, 회장님 결정)

미명시 항목 처리에서 **약한 키워드 힌트**만 추가:
- `#hannam`, `한남`, `한남동644` 같은 **명백한 키워드**가 본문에 있으면 inbox 안에서 `inbox/_suggested/hannam-644/`처럼 **제안 폴더**에만 분류 (실제 projects/로 이동은 하지 않음)
- 회장님이 주간 회고 시 "제안 OK"만 누르면 일괄 이동
- 자동 분류 흉내가 아니라 **수동 분류 보조**로만 작동

이 보완은 선택입니다. 단순함 우선이면 제안안(c) 그대로 채택해도 충분합니다.

---

## 10. 향후 단계

이 문서가 확정되면 다음 순서로 진행:

| 단계 | 내용 | 코드 작성? |
|------|------|------------|
| **Phase B-0 마무리** | Q1·Q2 확정 + 정제·분류·요약·태깅 모듈 인터페이스 정의 | X (인터페이스만) |
| **Phase B-1** | 텔레그램 어댑터를 공통 파이프라인 위에 구현 (Phase 1c와 통합·재구성) | O |
| **Phase B-2** | 음성 어댑터 (STT 선택지 결정 필요) | O |
| **Phase B-3+** | Gmail / 카톡 수동 / 회의록 / NotebookLM 회수 어댑터 순차 추가 | O |
| **Phase C** | 의미 검색·임베딩·자체 RAG 검토 | O |

---

## 부록 A — 본 문서가 확정한 것 / 보류한 것

### 확정 ✅
- Knowledge Core 3축 구조 (Wiki / NotebookLM / Workstation)
- Wiki 절대 본진 / NotebookLM 외부 분석실 / 회수 의무
- Google Drive 폴더 구조 (projects, inbox, daily, weekly, index)
- 영문 케밥 폴더명 + display_name 한글 보존 (Q1 강 찬성)
- NotebookLM 결과 회수 3경로 (V1 기본 / V1 실험 / Enterprise 보류)
- 자동화 실험 경로 7 게이트
- 입력원 7개 우선순위 + 카톡 OCR 영구 제외
- Telegram = 공통 파이프라인 레퍼런스

### 보류 ⏸
- frontmatter vs JSON sidecar (저장 포맷 디테일)
- 자체 RAG / 벡터DB / 임베딩 (Phase C 이후)
- NotebookLM 자동화 구현 (실험 경로로 분리 보관)
- 코드 작성 일체

### 다음 결정 대기 ❓
- ~~Q1: 폴더 명명 방식 채택 여부~~ → **확정 (2026-05-07)**: 영문 케밥 케이스 + `display_name` 한글 보존 채택
- ~~Q2: inbox 분류 방식 (c) 채택 + 보완 제안 수용 여부~~ → **확정 (2026-05-07)**: (c) 명령어 명시 + 보완 제안 (`inbox/_suggested/{project}/` 약한 키워드 힌트) 모두 채택

### Phase B-0 마무리 진행
Q1·Q2 확정으로 Phase B-0 인터페이스 설계 단계로 진입.
산출물: [`phase-b0-interfaces.md`](./phase-b0-interfaces.md)
