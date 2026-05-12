# NotebookLM 저작물 회수 익스텐션 재설계 (Approach A)

> 작성일: 2026-05-09 | 브랜치: codex-google-workspace-expansion
> 선행 spec: `2026-04-30-aston-wiki-phase1a-design.md` (Aston Wiki 인프라)

---

## 배경

현재 `chrome-extension/` (v0.1.2) 익스텐션은 NotebookLM 페이지 전체 DOM에서 가장 긴 텍스트 블록을 추출해 마크다운으로 저장한다. 실제 운영에서:

- 페이지의 숨겨진 emoji-picker UI 텍스트("이모티콘을 찾을 수 없음", "로드 중" 등)가 추출되어 **본문이 쓰레기로 저장**됨 (2026-05-09 14:29 첫 실험에서 확인)
- NotebookLM의 진짜 가치인 **회장님이 만든 저작물**(보고서·로드맵·시장분석 등 9개+)을 가져오는 기능이 전혀 없음
- 회장님 피드백: "노트북엘엠은 생성된 저작물과 소스를 통한 대화창에서 작업을 계속하는 것이 강점인데 하나도 구현 안 되네"

브레인스토밍 결과 **회장님 1순위 가치 = 직접 만든 저작물**, **활용 = Aston Wiki에서 직접 열어 읽고 편집**으로 좁혀졌다.

---

## 목표

NotebookLM에서 회장님이 펼친 저작물(보고서·로드맵·시장분석·제안서)을 **1클릭으로** 마크다운으로 변환해 `projects/{project}/notebooklm/` 에 영구 보존하고, Aston Wiki에서 직접 열어 편집·재가공할 수 있게 한다.

NotebookLM이 사라져도 Aston Wiki에 회장님 저작물이 남아있어야 한다.

---

## 범위

**In Phase 1 (본 spec)**
- NotebookLM 스튜디오 패널의 저작물(보고서·로드맵·시장분석·제안서)을 펼친 화면에서 [📥 가져오기] 1클릭 회수
- 가시성 + 노이즈 필터 강화로 본문 추출 신뢰성 확보
- 저작물 종류 자동 추론 (제목 prefix 기반)
- 마크다운 + frontmatter 저장 (저작물 종류, 출처, 캡처 시각 등)
- 같은 저작물 재캡처 시 **버전 누적** (회장님 편집본 보호)
- 회수 결과 토스트 (성공/스킵/실패) UI

**Out (Phase 2 이후)**
- 채팅 Q&A 회수 (별도 버튼)
- 일괄 회수 (노트북 진입 시 모든 저작물 자동 fetch)
- 마인드맵·플래시카드·인포그래픽 같은 비텍스트 저작물 (이미지·구조 보존 필요)
- AI 오디오 오버뷰(.wav) 다운로드
- NotebookLM ↔ Aston Wiki 양방향 동기화 (NotebookLM 공식 API 부재)

---

## 신규/수정 파일

| 파일 | 종류 | 예상 줄수 |
|------|------|-----------|
| `chrome-extension/content.js` | 수정 (대폭) | 기존 ~210 → ~280 |
| `chrome-extension/manifest.json` | 수정 (version bump) | — |
| `chrome-extension/background.js` | 수정 (artifact_kind forward) | +5 |
| `server/knowledge/extensionIngest.ts` | 수정 (frontmatter 확장 + 버전 누적) | +60 |
| `server/__tests__/knowledge/extensionIngest.test.ts` | 신규 | ~150 |
| `chrome-extension/README.md` | 수정 | +30 |

패키지 설치 없음.

---

## UX 흐름

```
[회장님 NotebookLM 노트북 진입]
         ↓
[스튜디오 패널의 저작물 클릭 — 풀화면 펼침]
         ↓
[우상단 📥 Aston Wiki로 가져오기 버튼 가시화]
         ↓ 클릭
[본문 추출 → 마크다운 변환 → POST /api/rag/extension-ingest]
         ↓
[버튼 상태 변경: ✅ 적재 완료 (mongolia-whitelier) | ⏸ 동일 본문 skip | ⚠️ 신규 버전(v3) 저장]
         ↓ 3초 후 idle
[회장님 다음 저작물 클릭 → 반복]
```

**버튼 상태 사전**

| 상태 | 색 | 라벨 |
|------|---|------|
| idle | 파랑 | 📥 Aston Wiki로 가져오기 |
| sending | 진파랑 | ⏳ 전송 중… |
| ok-new | 초록 | ✅ 적재 완료 ({project}) |
| ok-skipped | 회색 | ⏸ 이미 동일 본문 |
| ok-versioned | 호박색 | 📚 신규 버전 저장 (v{n}) |
| ok-unmapped | 노랑 | ⚠️ \_unmapped — 매핑 필요 |
| err-empty | 빨강 | ❌ 본문 미감지 — 드래그 후 재시도 |
| err-network | 빨강 | ❌ 백엔드 연결 실패 |

---

## 추출 로직 (content.js)

**우선순위**

1. **사용자 selection** — `window.getSelection()` 30자 이상 + 노이즈 필터 통과 시 채택. **가장 신뢰 가능, 회장님이 의도적으로 드래그한 영역**.
2. **저작물 패널 selector** — NotebookLM이 저작물 펼침 시 사용하는 컨테이너 우선:
   - `[role="dialog"][aria-modal="true"]` — 모달 형태 저작물
   - `[data-test-id*="artifact"]`, `[data-test-id*="studio-output"]`
   - `[role="article"]`
   - `chat-message`, `[role="log"]` (채팅 응답 형태 저작물)
3. **가시성 필터** (이미 v0.1.2에 적용 — 유지):
   - `aria-hidden="true"` 제외
   - `offsetParent === null` 제외
   - `display:none` / `visibility:hidden` / `opacity:0` 제외
4. **노이즈 토큰 블랙리스트** (이미 v0.1.2에 적용 — 유지·확장):
   - "이모티콘을 찾을 수 없음", "최근에 사용함", "로드 중", "검색 결과", "노트북 만들기", "Search emojis", "Loading"
   - 의미 있는 문자 비율 30% 미만 시 제외
5. **fallback** — main 영역의 가장 긴 의미 있는 단락(`p`, `div`, `li` 중 50자+ 노이즈 통과)

**저작물 종류 추론** (제목 prefix 기반)

| 제목 패턴 | artifact_kind |
|----------|---------------|
| `[시장 분석 가이드]`, `시장 분석`, `시장 트렌드` | `market-analysis` |
| `[투자 분석 보고서]`, `투자 분석` | `investment-report` |
| `로드맵`, `Roadmap`, `Blueprint` | `roadmap` |
| `제안서`, `Proposal` | `proposal` |
| `요약`, `Summary` | `summary` |
| 그 외 | `report` (기본값) |

매칭은 대소문자 무시, 한글·영문 둘 다 허용. 명확하지 않으면 `report`로 폴백.

---

## 저장 스키마 (extensionIngest.ts)

**파일 경로**

```
{ASTON_WIKI_ROOT}/projects/{project}/notebooklm/{YYYY-MM-DD}-{slug}.md
```

`{slug}` 규칙:
- 제목에서 한글 제거하고 영문·숫자만 케밥
- 영문 3자 미만이면 → `artifact-{artifact_kind}-{hash8}` 폴백 (예: `artifact-market-analysis-2d4217a8`)
- 한글 제목 보존은 frontmatter `title` 필드에서

**frontmatter**

```yaml
---
type: notebooklm-artifact
artifact_kind: market-analysis
title: "[시장 분석 가이드] '몽탄 신도시' 몽골 외식 시장의 기회와 K-프랜차이즈"
project: mongolia-whitelier
notebook_title: "화이트리어 역삼·몽골 공동창업 및 총판 확장 전략"
source_url: https://notebooklm.google.com/notebook/9a7481fc-45a9-4db6-981b-3c6d99d4f11c
captured_at: 2026-05-09T14:29:10.698Z
raw_text_hash: 61396407c28892f26f90d6c52689ea54edc167c8d09f968b91d9052da3a8e3b1
version: 1
---
```

`version` 필드는 같은 `(source_url, artifact_kind, title)` 조합 재캡처 시 증가.

---

## 중복 처리 (변경 사항)

**현재 (v0.1.x)**: 같은 본문 hash면 무조건 skip → 회장님이 NotebookLM에서 저작물 수정 후 재캡처해도 새 hash → 별도 파일 저장 (관리 어려움)

**신규**:
1. 같은 `(source_url, artifact_kind, title)` 조합 + **본문 hash 동일** → skip ("이미 동일 본문" 응답)
2. 같은 `(source_url, artifact_kind, title)` 조합 + **본문 hash 다름** → **신규 버전 저장**:
   - 기존 파일은 그대로 유지 (회장님 편집본 보호)
   - 신규 파일명: `{YYYY-MM-DD}-{slug}-v{N}.md` (`N`은 기존 버전 수 + 1)
   - frontmatter `version: N` 갱신
3. 매칭되는 기존 파일 없음 → 신규 적재 (`version: 1`)

**버전 결정 알고리즘**:
- `projects/{project}/notebooklm/` 디렉토리에서 frontmatter `source_url`이 같은 파일들 enumerate → max version 찾기 → +1

---

## API 응답 (background → content)

```typescript
{
  ok: true,
  status: "created" | "skipped" | "versioned",
  project: "mongolia-whitelier",
  artifactKind: "market-analysis",
  version: 3,
  savedPath: "projects/mongolia-whitelier/notebooklm/2026-05-09-...md",
  isUnmapped: false,
  mappingHint: undefined,
}
```

또는 실패 시:

```typescript
{
  ok: false,
  error: "본문 너무 짧음 (최소 20자)" | "프로젝트 폴더 생성 실패: …" | …,
}
```

---

## 테스트

`server/__tests__/knowledge/extensionIngest.test.ts` 신규:

- artifact_kind 추론 (제목 prefix 6종 + fallback)
- frontmatter 직렬화 (필수 필드 누락 없음)
- 버전 결정: 신규 / skip / v2 / v3 시나리오
- slug 폴백 (한글 100% 제목)
- \_unmapped 폴백 (매핑 yaml에 없는 URL)
- 본문 너무 짧음 / sourceUrl 누락 거부

content.js 측 추출 로직은 단위 테스트 어려움 (DOM 의존) → 회장님 수동 검증 (Phase 1 완료 시 회수 테스트 5개 노트북에서 직접 확인)

---

## 단계적 확장 (Phase 2 이후 — 본 spec 범위 밖)

| Phase | 범위 | 트리거 조건 |
|-------|------|-------------|
| Phase 2 | 채팅 Q&A 회수 (질문 + AI 답 + 인용 source 메타데이터) | Phase 1 운영 안정 확인 후 |
| Phase 3 | 노트북 진입 시 일괄 회수 (저작물 9개 자동 enumerate) | 단일 회수 추출 정확도 90%+ 검증 후 |
| Phase 4 | 비텍스트 저작물 (마인드맵 SVG·인포그래픽 PNG·플래시카드 JSON) | 회장님이 비텍스트 저작물 활용 의향 확인 후 |
| Phase 5 | AI 오디오 오버뷰 다운로드 | 회장님이 오디오 활용 패턴 확인 후 |

---

## 위험 / 열린 질문

1. **NotebookLM UI 변경**: Google이 selector를 자주 바꿈. content.js의 selector 다중 fallback + 노이즈 필터 + selection 우선 정책으로 완화하지만, 6개월 내 한 번은 selector 갱신 필요할 수 있음. → 운영 시 selector 매칭 실패 시 콘솔 경고 + 회장님 selection fallback 안내.

2. **저작물 종류 추론 정확도**: 제목 prefix가 변형(예: 회장님이 직접 제목 수정)되면 `report`로 폴백. 정확도 100% 보장 안 됨. → 추론 결과를 frontmatter에 남겨 사후 보정 가능.

3. **버전 누적 정책**: 회장님이 NotebookLM에서 사소한 오타만 수정해도 새 버전 저장 → 파일 누적. 향후 버전 정리(consolidate) 도구 필요할 수 있음. Phase 1 운영 1개월 후 결정.

4. **\_unmapped 폴더**: 매핑 yaml에 없는 노트북 URL은 `_unmapped/`로 들어감. 회장님이 yaml 매핑 보강해야 정상 project로 이동. → mappingHint 응답 + Wiki 인덱스 페이지에 \_unmapped 알림 추가는 Phase 1.5에서 검토.

5. **NotebookLM 인증/세션**: 익스텐션은 회장님 브라우저 세션에서 실행되므로 NotebookLM 로그인 그대로 사용. 다만 `notebooklm.google.com/notebook/...` 외의 URL(예: 단축 URL, drive 미러)에서는 매칭 실패. → 정규화 함수 `normalizeNotebookUrl`이 origin+pathname만 비교하므로 query string 차이는 무시.

---

## 참고

- 현재 익스텐션 코드: `chrome-extension/{manifest.json, content.js, background.js, options.html, options.js, README.md}`
- 백엔드 진입점: `server/knowledge/extensionIngest.ts` (`POST /api/rag/extension-ingest`)
- 매핑 yaml: `index/notebooklm-mapping.yaml` (28개 노트북 등록됨)
- 저장 위치 결정: `server/knowledge/storage/wikiWriter.ts` `resolveWikiRoot()` — `ASTON_WIKI_ROOT > WIKI_ROOT > data/test-wiki`
