# Deals 모듈

Aston-Deals 자료 창고를 파일 시스템 기반 딜 폴더와 메타데이터로 관리하는 독립 모듈이다.

## 책임

- `DEALS_ROOT` 하위 딜 폴더 생성, 목록, 상세, 상태, 힌트, 파일 저장을 처리한다.
- Telegram document/photo 첨부를 딜 폴더 파일로 저장한다.
- 카카오톡 받은 파일 폴더의 신규 파일을 감시하고 딜명/카테고리 기준으로 복사 분류한다.
- Gmail 라벨 메일 첨부와 브라우저 다운로드 폴더 파일을 같은 분류 엔진으로 처리한다.
- 딜명이 모호한 카톡 파일은 Telegram 인라인 버튼 분류 대기 상태로 관리한다.
- `_deal.json` 메타데이터와 충돌 없는 파일명을 관리한다.

## 비책임

- Gmail/네이버메일 자동 분류는 이 모듈의 책임이 아니다.
- Wiki 판단 기록 저장은 `server/wiki/` 책임이다.
- Telegram 라우팅과 텍스트 인텐트 판단은 `server/intent/` 책임이다.

## 데이터 경로

| 환경 변수 | 용도 |
|---|---|
| `DEALS_ROOT` | 딜 폴더 저장 루트 |
| `KAKAO_DOWNLOAD_PATH` | 카카오톡 받은 파일 감시 경로. 빈 값이면 비활성화 |
| `GMAIL_ENABLED` | `true`일 때 Gmail 라벨 폴링 활성화 |
| `GMAIL_AUTO_LABEL` | 자동 분류 대상 Gmail 라벨. 기본 `Aston-Deals` |
| `GMAIL_POLL_INTERVAL_MIN` | Gmail 폴링 주기. 기본 5분 |
| `DOWNLOAD_WATCH_PATH` | 브라우저 다운로드 폴더 감시 경로. 빈 값이면 비활성화 |

## 외부 API 의존성

- Telegram 파일 다운로드 URL을 통해 첨부 파일을 가져온다.
- chokidar로 로컬 파일 시스템 변경을 감시한다.
- Gmail API는 `_core/googleOAuth.ts`에서 받은 OAuth 클라이언트로 호출한다.

## 텔레그램 명령 목록

- `딜 추가 <이름>`
- `딜 목록`
- `딜 <이름>`
- `딜 힌트 <이름> <내용>`
- `딜 상태 <이름> <상태>`
- `딜 저장 <이름>` 캡션이 붙은 document/photo 첨부
- 파일 수동 분류용 인라인 버튼 callback: `kakao:<tempId>:...`, `gmail:<tempId>:...`, `dl:<tempId>:...`

## 다른 모듈과의 관계

- 다른 도메인 모듈 직접 import 금지.
- `server/intent/`와 `server/llm/telegram-bot.ts`가 이 모듈을 호출한다.
- Wiki/Intelligence와의 공유는 `DEALS_ROOT` 파일 시스템 경로를 통해서만 한다.

## 주요 파일 목록과 라인 수

| 파일 | 라인 수 | 설명 |
|---|---:|---|
| `dealFileRouter.ts` | 92 | 딜 명령 파싱, 이름 정규화 |
| `dealMatcher.ts` | 92 | 파일명/제목/발신자 딜 매칭, 카테고리 추정 |
| `dealStore.ts` | 239 | 폴더, 메타, 파일 저장소 |
| `dealTypes.ts` | 64 | 딜 타입 정의 |
| `downloadWatcher.ts` | 84 | 브라우저 다운로드 폴더 감시 |
| `fileClassifier.ts` | 197 | 카톡/Gmail/다운로드 공통 분류 엔진 |
| `folderWatcher.ts` | 78 | 카톡 다운로드 폴더 감시 |
| `gmailWatcher.ts` | 149 | Gmail 라벨 폴링과 첨부 다운로드 |
| `index.ts` | 9 | 모듈 export |
| `kakaoFileHandler.ts` | 50 | 카톡 분류 wrapper |
| `telegramDealFileHandler.ts` | 178 | Telegram 파일 첨부 처리 |

## 신규 기능 판단 기록

- 딜 폴더/메타/첨부 저장 기능은 이 모듈에 추가한다.
- 카톡 다운로드 폴더 감시는 딜 자료 유입 경로이므로 이 모듈에 포함한다.
- Gmail 라벨 첨부와 브라우저 다운로드 감시는 동일한 딜 자료 유입 경로이므로 이 모듈에 포함한다.
- 네이버메일은 Gmail 자동전달을 전제로 Gmail 감시 경로를 재사용한다.
- Wiki 판단 연계는 직접 import가 아니라 파일 경로 기반 연계로 설계한다.
