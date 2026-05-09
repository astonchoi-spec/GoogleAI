# Aston NotebookLM Bridge — Chrome Extension

회장님 NotebookLM 노트를 1클릭으로 워크스테이션 Wiki에 자동 적재합니다.

## 동작 흐름

1. `notebooklm.google.com/notebook/*` 페이지 로드 시 우상단 **[📥 Aston Wiki로 가져오기]** 버튼 자동 주입
2. 회장님이 NotebookLM **스튜디오 저작물(보고서·로드맵·시장분석·제안서)을 클릭해 펼친 상태**에서 버튼 클릭
3. 우선순위로 본문 추출:
   - (1) 화면에서 드래그 선택한 텍스트 (가장 신뢰 가능)
   - (2) 저작물 모달 / 챗 응답 selector
   - (3) main 영역 fallback (가시성 + 노이즈 필터 적용)
4. `http://localhost:4000/api/rag/extension-ingest` POST
5. 백엔드가 매핑 yaml 의 `notebook_url` 로 project 자동 매칭
6. 제목 prefix 기반 **artifact_kind 자동 추론** (6종):
   - `market-analysis` (시장 분석 가이드·시장 트렌드)
   - `investment-report` (투자 분석 보고서·투자 분석)
   - `roadmap` (로드맵·Roadmap·Blueprint)
   - `proposal` (제안서·Proposal)
   - `summary` (요약·Summary)
   - `report` (그 외 — 폴백)
7. 저장 위치: `{ASTON_WIKI_ROOT}/projects/{project}/notebooklm/{YYYY-MM-DD}-{slug}-v{N}.md`
8. **버전 누적 정책**:
   - 같은 source_url + 동일 본문 hash → **skip** (`⏸ 동일 본문 skip`)
   - 같은 source_url + 다른 본문 hash → **신규 버전 저장** v{N+1} (`📚 신규 버전 저장 (v3)`)
   - 회장님이 NotebookLM에서 저작물 수정 후 재캡처해도 **기존 파일 보존**
9. 성공 시 버튼 상태:
   - `✅ 적재 완료 (mongolia-whitelier market-analysis v1)` — 신규
   - `📚 신규 버전 저장 (v3)` — 회장님 수정 후 재캡처
   - `⏸ 동일 본문 skip` — 같은 본문 재클릭
   - `⚠️ _unmapped … — yaml 매핑 필요` — 매핑 yaml에 notebook_url 누락

## 설치 방법 (회장님 PC, 1회)

1. Chrome 주소창에 `chrome://extensions` 입력
2. 우상단 **개발자 모드** 토글 ON
3. **압축해제된 확장 프로그램 로드** 클릭
4. 본 폴더 (`{repo}/chrome-extension/`) 선택
5. 확장 프로그램 목록에 "Aston NotebookLM Bridge" 활성화 확인

## 옵션 설정 (선택)

확장 프로그램 아이콘 우클릭 → **옵션** → 백엔드 엔드포인트 URL 변경 가능.
기본값 `http://localhost:4000/api/rag/extension-ingest`.

## 파일 구성

| 파일 | 역할 |
|------|------|
| `manifest.json` | Manifest V3, host_permissions 으로 localhost:4000 + notebooklm.google.com 허용 |
| `content.js` | NotebookLM 페이지에 버튼 주입, MutationObserver 로 SPA 라우팅 대응, 본문 스크래핑 |
| `background.js` | content.js 메시지 받아 백엔드 POST (CORS 우회 via host_permissions) |
| `options.html/js` | 백엔드 URL 변경 UI |

## 백엔드 측 매칭 규칙

- 매핑 yaml(`data/rag-mapping.yaml`) 의 `notebook_url` 필드와 정확히 일치하는 노트북 URL → 해당 `project` 사용
- 일치하지 않는 URL → `inbox/notebooklm-extension/` 로 fallback (운영자가 추후 yaml 보강 권장)

## 보안

- Extension 은 **회장님 클릭이 있을 때만** 데이터를 전송 (자동 백그라운드 전송 X)
- 백엔드는 매핑 yaml 의 project 화이트리스트만 허용
- `chrome.storage.local` 사용, 외부 동기화 X
