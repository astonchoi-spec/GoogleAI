# server/rag — Aston 통합 지식 RAG 모듈

## 책임

Aston Workstation의 **통합 지식 RAG**를 담당한다. 두 트랙을 병행 운영:

- **Track A — 외부 NotebookLM 카탈로그·회수 매핑**
  - 회장님이 `notebooklm.google.com`에서 운영하는 28개 노트북 메타데이터 보관
  - 회수된 분석 결과는 기존 `server/notebooklm/` + `server/knowledge/` 파이프라인으로 처리
- **Track B — 내부 GCP Discovery Engine 기반 자체 RAG (Phase 2 이후)**
  - GCP 서비스 계정 + Discovery Engine API로 자체 데이터 스토어 9개 운영
  - 문서 업로드·인덱싱·쿼리 자동화

## 비책임

- 외부 NotebookLM API 호출 (공개 API 없음 — 코드 자체에서 다루지 않음)
- 회수된 마크다운 본문의 채팅 컨텍스트 주입 (Phase 4에서 `server/intent/handlers/chat.ts` 측에서 본 모듈 호출)
- 회수 자료의 Wiki 색인 (이미 `projects/{p}/`에 저장되면 자동)

## 데이터 경로

- 매핑: `data/rag-mapping.yaml` (28개 노트북 + Track B 데이터 스토어 매핑)
- 회수 자료: `projects/{project}/notebooklm/*.md` (Track A) 또는 `projects/{project}/rag/*.md` (Track B)

## 환경 변수 (Phase 2 이후 활성)

```
VERTEX_SEARCH_PROJECT_ID=<GCP project ID>
VERTEX_SEARCH_LOCATION=global
VERTEX_SEARCH_SERVICE_ACCOUNT_JSON=<서비스 계정 키 JSON 경로>
DRIVE_WATCHER_FOLDER_ID=<Track A 회수용 Drive 폴더 ID>
```

## 명령

본 모듈은 tRPC를 통해 노출:

- `rag.listMappings()` — 28개 노트북 + 데이터 스토어 그룹 정보 (Phase 1)
- `rag.queryDataStore(...)` — Discovery Engine 쿼리 (Phase 2)
- `rag.importDocument(...)` — 문서 업로드 + 인덱싱 (Phase 2)
- `rag.statusByProject(...)` — 프로젝트별 회수 자료 + 인덱싱 상태 (Phase 3)

## 의존성

- 없음 (다른 도메인 모듈 import 0). 미래에 `intent/handlers/chat.ts`가 `rag.queryDataStore`를 호출하는 단방향 의존만 허용.

## 구현 단계

| Phase | 범위 | 상태 |
|-------|------|------|
| 1 | yaml 매핑 + 카탈로그 페이지 | ✅ 완료 (2026-05-09) |
| 2 | Discovery Engine 클라이언트 + 인증 | ⬜ |
| 3 | 저장 파이프라인 + frontmatter 표준화 | ⬜ |
| 4 | 채팅 RAG 컨텍스트 주입 | ⬜ |

## 모듈 경계

- `server/rag/`는 다른 도메인 모듈을 import하지 않는다
- `scripts/check-module-boundaries.ts` 의 DOMAIN_MODULES 에 등록됨
