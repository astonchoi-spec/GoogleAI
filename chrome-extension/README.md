# Aston NotebookLM Bridge — Chrome Extension

회장님 NotebookLM 노트를 1클릭으로 워크스테이션 Wiki에 자동 적재합니다.

## 동작 흐름

1. `notebooklm.google.com/notebook/*` 페이지 로드 시 우측 상단에 **[📥 Aston Wiki로 동기화]** 버튼 자동 주입
2. 회장님이 버튼 클릭 → 현재 화면 노트 본문 + 노트북 제목 + URL 스크래핑
3. `http://localhost:4000/api/rag/extension-ingest` POST 전송
4. 백엔드가 매핑 yaml 의 `notebook_url` 을 보고 project ID 자동 매칭 → `notebooklm-exports/{project}/*.md` 적재
5. SHA-256 해시로 중복 본문은 skip — 같은 노트 여러 번 클릭해도 도배 없음
6. 성공 시 버튼이 **[✅ 위키 적재 완료]** 로 3초간 변경

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
