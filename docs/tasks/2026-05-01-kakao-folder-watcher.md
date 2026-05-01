# 카카오톡 받은 파일 폴더 자동 감시 및 딜 분류

> 날짜: 2026-05-01  
> 도구: Codex  
> 상태: 완료

## 목표

- 카카오톡 PC 다운로드 폴더를 감시한다.
- 신규 파일을 무시/자동 분류/수동 분류 3단계로 처리한다.
- 딜 폴더에는 복사 저장하고, 카톡 원본은 유지한다.

## 구현

- `server/deals/folderWatcher.ts`
  - `KAKAO_DOWNLOAD_PATH` 감시
  - `awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 }`
  - 폴더 미존재 또는 빈 환경 변수면 경고 후 비활성화
- `server/deals/dealMatcher.ts`
  - 딜명 exact/partial/none 매칭
  - 띄어쓰기 변형 매칭
  - 계약/사업수지/법률/시장/공시/기타 카테고리 추정
- `server/deals/kakaoFileHandler.ts`
  - KakaoTalk 자동 미디어, 의료 자료, 임시 다운로드 파일 무시
  - exact 매칭은 `saveFile()`로 복사 저장 후 Telegram 알림
  - partial/none은 임시 Map에 10분 보관 후 인라인 버튼 분류
- `server/intent/handlers/kakaoCallback.ts`
  - `kakao:` callback 처리
  - OWNER_TELEGRAM_CHAT_ID 권한 검증
  - 딜 선택 후 카테고리 선택 2단계 저장
- `server/_core/index.ts`
  - Telegram bot 초기화 후 watcher 시작
  - SIGINT/SIGTERM에서 watcher close
- `server/llm/telegram-bot.ts`
  - `kakao:` callback 라우팅 추가

## 자율 결정

- callback_data는 Telegram 길이 제한을 피하기 위해 `kakao:<tempId>:d:<index>`, `kakao:<tempId>:c:<index>:<category>` 형식 사용.
- 모호 파일은 등록 딜 후보가 없으면 최근 딜 최대 8개를 버튼으로 제공.
- `기타` 버튼은 임시 보류로 처리하고 저장은 하지 않음. 딜 없는 파일을 임의 딜로 만들지 않기 위함.
- watcher는 Telegram bot 등록 뒤 시작해 자동 분류 알림 누락 가능성을 줄임.

## 검증

- `npm run check` 통과
- `npm run build` 통과
- `npm test` 통과: 253 passed, 7 skipped, 2 todo
- 신규 테스트 18개:
  - `dealMatcher.test.ts` 10개
  - `kakaoFileHandler.test.ts` 6개
  - `folderWatcher.test.ts` 2개

## 수동 스모크 결과

- `C:\Users\user\Documents\카카오톡 받은 파일` 폴더 생성 확인
- watcher 로그 확인: `[kakao-watcher] watching: C:\Users\user\Documents\카카오톡 받은 파일`
- `용인신대지구_사업계획서.pdf` → `feasibility` 자동 저장, 원본 유지
- `포항 해상케이블카_시장조사.pdf` → `market` 자동 저장, 원본 유지
- `사업계획서_제1권.pdf` → 인라인 버튼 분류 대기 생성
- `KakaoTalk_20260101_test.mp4` → 무시, 알림 없음

## 후속 작업

- Telegram 실제 화면에서 인라인 버튼 2단계 분류 최종 QA.
- 딜 목록 8개 초과 시 검색/페이지네이션 UX 개선.
- 네이버메일/Gmail 첨부 자동 분류는 별도 작업으로 분리.
