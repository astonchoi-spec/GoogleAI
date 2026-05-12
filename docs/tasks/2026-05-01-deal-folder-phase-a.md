# Deal Folder Phase A - 텔레그램 파일 기반 딜 자료 자동 정리

## 상태
완료: 2026-05-01

## 구현 범위
- `server/deals/` 신규 모듈 추가
  - 타입 정의, 폴더/메타 저장소, 명령 파서, 텔레그램 파일 저장 핸들러
- 텔레그램 document/photo 첨부 + `딜 저장` 캡션 처리 연결
- `딜 추가`, `딜 목록`, `딜 상세`, `딜 노트북`, `딜 상태` 인텐트 처리
- `.env.example`에 `DEALS_ROOT` 추가
- 저장소/파서 테스트 38개 추가

## 자율 결정
- 기본 딜 상태는 `reviewing`으로 설정
- 파일명 충돌 suffix는 `-2`, `-3` 형식 사용
- 부분 매칭은 공백 제거 substring + 문자 포함 보조 매칭 사용
- `_deal.json`에는 최근 파일 이력 20개만 유지
- 파일 카운트는 조회/저장 시 실제 카테고리 폴더를 다시 세어 갱신
- 텔레그램 파일 다운로드는 Telegraf `getFileLink()` + Node 내장 `fetch` 사용

## 검증
- `npm run check` 통과
- `npm run build` 통과
- `npm test` 통과: 227 passed, 7 skipped, 2 todo
- 딜 단위 테스트: 38 passed

## 수동 검증 명령
1. `딜 추가 한남동644`
2. `딜 목록`
3. `딜 한남동644`
4. PDF 첨부 + 캡션 `딜 저장 한남동644 계약서`
5. `딜 노트북 한남동644 https://notebooklm.google.com/notebook/xxx`
6. `딜 한남동644`
7. PDF 첨부 + 캡션 `딜 저장 한남644 계약서`
8. Google Drive에서 `G:\내 드라이브\Aston-Deals\한남동644\01_계약서\` 파일 확인
