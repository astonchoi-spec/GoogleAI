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

## 환경 변수

```
# Phase 2 활성 (Discovery Engine 통신)
VERTEX_SEARCH_PROJECT_ID=<GCP project ID>            # 예: aston-work-station
VERTEX_SEARCH_LOCATION=global                         # 또는 us / eu / asia-northeast3

# Phase 3 활성 (Track A Drive Watcher)
DRIVE_WATCHER_FOLDER_ID=<Drive 폴더 ID>
```

## 인증

**ADC (Application Default Credentials) 사용. JSON 키 파일 미사용.**

운영자는 1회 `gcloud auth application-default login` 으로 인증을 끝낸다.
이후 `new DataStoreServiceClient()` 등 SDK 클라이언트가 자동으로 ADC 토큰을 사용한다.

## 명령

본 모듈은 tRPC를 통해 노출:

- `rag.listMappings()` — 28개 노트북 + 데이터 스토어 그룹 정보 (Phase 1)
- `rag.listDataStores()` — 9개 데이터 스토어 + 매핑 프로젝트 목록 (Phase 1)
- `rag.trackBStatus()` — GCP 환경·인증 상태 (Phase 2)
- `rag.queryDataStore({ dataStoreId, query, filter? })` — Discovery Engine 검색 + 요약 (Phase 2)
- 내부 함수 (tRPC 미노출) — `createDataStore` / `importDocument` / `query` (Phase 2)
- `rag.statusByProject(...)` — 프로젝트별 회수 자료 + 인덱싱 상태 (Phase 3)

## 의존성

- 없음 (다른 도메인 모듈 import 0). 미래에 `intent/handlers/chat.ts`가 `rag.queryDataStore`를 호출하는 단방향 의존만 허용.

## 구현 단계

| Phase | 범위 | 상태 |
|-------|------|------|
| 1 | yaml 매핑 + 카탈로그 페이지 | ✅ 완료 (2026-05-09) |
| 2 | Discovery Engine 클라이언트 + ADC 인증 + tRPC 노출 | ✅ 완료 (2026-05-09) |
| 3 | 저장 파이프라인 + frontmatter 표준화 + Drive Watcher | ⬜ |
| 4 | 채팅 RAG 컨텍스트 주입 | ⬜ |

## 모듈 경계

- `server/rag/`는 다른 도메인 모듈을 import하지 않는다
- `scripts/check-module-boundaries.ts` 의 DOMAIN_MODULES 에 등록됨
