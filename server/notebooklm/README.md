# server/notebooklm

NotebookLM 노트북 매핑 조회 모듈.

## 책임
- `index/notebooklm-mapping.yaml` 읽기 + 파싱 + 캐싱
- `/nb`, `/nb list`, `/nb show {id}`, `/nb search {keyword}` 명령 처리
- Wiki 경로(`projects/{project}/notebooklm/`) 계산 반환

## 비책임
- NotebookLM 내부 크롤링·API 호출 — 수동 매핑만 관리
- 파일 시스템 쓰기 — 조회 전용

## 데이터 경로
- 운영: `$ASTON_WIKI_ROOT/index/notebooklm-mapping.yaml`
- 폴백: `<repo>/index/notebooklm-mapping.yaml`

## 명령
| 명령 | 설명 |
|------|------|
| `/nb` | 도움말 + 카테고리별 통계 |
| `/nb list` | 전체 노트북 목록 |
| `/nb list 부동산` | 카테고리 필터 (부동산/학습/리서치/시스템/개인 등) |
| `/nb show {project}` | project ID 또는 이름으로 상세 (Wiki 경로 포함) |
| `/nb search {keyword}` | 이름·태그 검색 |

## 환경 변수
- `ASTON_WIKI_ROOT` — Wiki G드라이브 루트 경로

## 의존성
- `server/_core/` — 없음 (파일 시스템 직접 접근)
- 타 도메인 모듈 import 없음
