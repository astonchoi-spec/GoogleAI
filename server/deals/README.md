# Deals 모듈

Aston-Deals 자료 창고를 파일 시스템 기반 딜 폴더와 메타데이터로 관리하는 독립 모듈이다.

## 책임

- `DEALS_ROOT` 하위 딜 폴더 생성, 목록, 상세, 상태, 힌트, 파일 저장을 처리한다.
- Telegram document/photo 첨부를 딜 폴더 파일로 저장한다.
- 카카오톡 받은 파일 폴더의 신규 파일을 감시하고 딜명/카테고리 기준으로 복사 분류한다.
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

## 외부 API 의존성

- Telegram 파일 다운로드 URL을 통해 첨부 파일을 가져온다.
- chokidar로 로컬 파일 시스템 변경을 감시한다.
- 직접 Google API 호출 없음.

## 텔레그램 명령 목록

- `딜 추가 <이름>`
- `딜 목록`
- `딜 <이름>`
- `딜 힌트 <이름> <내용>`
- `딜 상태 <이름> <상태>`
- `딜 저장 <이름>` 캡션이 붙은 document/photo 첨부
- 카톡 파일 수동 분류용 인라인 버튼 callback: `kakao:<tempId>:...`

## 다른 모듈과의 관계

- 다른 도메인 모듈 직접 import 금지.
- `server/intent/`와 `server/llm/telegram-bot.ts`가 이 모듈을 호출한다.
- Wiki/Intelligence와의 공유는 `DEALS_ROOT` 파일 시스템 경로를 통해서만 한다.

## 주요 파일 목록과 라인 수

| 파일 | 라인 수 | 설명 |
|---|---:|---|
| `dealFileRouter.ts` | 92 | 딜 명령 파싱, 이름 정규화 |
| `dealMatcher.ts` | 77 | 카톡 파일명 딜 매칭, 카테고리 추정 |
| `dealStore.ts` | 239 | 폴더, 메타, 파일 저장소 |
| `dealTypes.ts` | 64 | 딜 타입 정의 |
| `folderWatcher.ts` | 78 | 카톡 다운로드 폴더 감시 |
| `index.ts` | 7 | 모듈 export |
| `kakaoFileHandler.ts` | 187 | 카톡 신규 파일 자동/수동 분류 |
| `telegramDealFileHandler.ts` | 178 | Telegram 파일 첨부 처리 |

## 신규 기능 판단 기록

- 딜 폴더/메타/첨부 저장 기능은 이 모듈에 추가한다.
- 카톡 다운로드 폴더 감시는 딜 자료 유입 경로이므로 이 모듈에 포함한다.
- Gmail/네이버메일 감시, Wiki 판단 연계는 직접 import가 아니라 파일 경로 기반 연계로 설계한다.
