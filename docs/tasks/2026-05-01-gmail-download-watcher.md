# Gmail 자동 분류 + 다운로드 폴더 감시 통합

> 날짜: 2026-05-01  
> 도구: Codex  
> 상태: 완료

## 목표

- Gmail `Aston-Deals` 라벨 첨부파일을 5분마다 폴링해 딜 폴더로 분류한다.
- 브라우저 다운로드 폴더 신규 파일도 같은 방식으로 분류한다.
- 카톡/Gmail/다운로드 3채널이 공통 분류 엔진과 동일한 Telegram 인라인 버튼 UX를 사용한다.

## 구현

- `server/deals/fileClassifier.ts`
  - `classifyAndSaveFile({ source, filepath, originalName, metadata })`
  - source별 무시 패턴
  - 딜명 exact 매칭 시 자동 저장
  - partial/none은 Telegram 인라인 버튼 분류 대기
  - callback prefix: `kakao:`, `gmail:`, `dl:`
- `server/deals/dealMatcher.ts`
  - `findMatchingDeal()`에 `extraText` 지원
  - Gmail 제목/발신자/첨부파일명을 함께 매칭
- `server/deals/gmailWatcher.ts`
  - `label:Aston-Deals is:unread has:attachment` 쿼리
  - 첨부파일 OS temp 저장 후 공통 분류 엔진 호출
  - 처리 후 UNREAD 제거 및 `Aston-Deals/Processed` 라벨 추가 시도
- `server/deals/downloadWatcher.ts`
  - `DOWNLOAD_WATCH_PATH` 감시
  - `awaitWriteFinish` 2000ms
  - `.crdownload`, 이미지, 설치파일, 1MB 미만 파일 무시
- `server/intent/handlers/fileCallback.ts`
  - 파일 분류 callback 통합
  - 기존 `kakaoCallback.ts`는 wrapper로 유지
- `server/_core/googleOAuth.ts`
  - Google OAuth 토큰 접근을 `_core`로 이동해 도메인 경계 유지
- `server/_core/index.ts`
  - 카톡/Gmail/다운로드 watcher 시작 및 종료 cleanup 연결

## 자율 결정

- Gmail processed 라벨은 `Aston-Deals/Processed`로 생성/사용한다.
- Gmail 라벨이 없거나 생성이 실패해도 분류 자체는 중단하지 않고 경고 로그만 남긴다.
- 다운로드 폴더는 `DEALS_ROOT`와 겹치면 비활성화해 무한 루프를 방지한다.
- Gmail OAuth 미연결/만료는 Telegram으로 1회만 알리고 반복 알림은 막는다.
- `telegram-bot.ts`는 라우팅 regex만 `^(kakao|gmail|dl):`로 바꿔 499줄을 유지했다.

## 검증

- `npm run check` 통과
- `npm run build` 통과
- `npm test` 통과: 269 passed, 7 skipped, 2 todo
- 신규 테스트 16개:
  - `fileClassifier.test.ts` 7개
  - `gmailWatcher.test.ts` 5개
  - `downloadWatcher.test.ts` 4개

## 수동 스모크 결과

- 카톡 watcher 로그 확인: `[kakao-watcher] watching: C:\Users\user\Documents\카카오톡 받은 파일`
- Gmail watcher 로그 확인: `[gmail-watcher] polling every 5min, label: Aston-Deals`
- 다운로드 watcher 로그 확인: `[download-watcher] watching: C:\Users\user\Downloads`
- Gmail metadata 분류: 제목 `용인신대지구 PF 자료` + 파일명 `사업계획서_제1권.pdf` → saved
- 다운로드 PDF: `용인신대지구_plan.pdf` → saved, deal=`용인신대지구`
- 다운로드 임시파일: `test.crdownload` → ignored
- 스크린샷: `Screenshot_1.png` → ignored
- 기존 카톡 회귀 테스트: 18개 통과

## Gmail OAuth 상태

- `data/google-tokens.json` 존재
- userId=1 access token 있음
- userId=1 refresh token 있음
- userId=1 access token 만료 전: 2026-05-01 19:59:19 KST

## 후속 작업

- 실제 Gmail inbox에서 `Aston-Deals` 라벨 메일 1건으로 운영 QA.
- Telegram 실제 화면에서 Gmail/다운로드 인라인 버튼 분류 최종 확인.
- 딜 후보 8개 초과 시 검색/페이지네이션 UX 개선.
