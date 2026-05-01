# Deals 모듈

Aston-Deals 자료 창고를 파일 시스템 기반 딜 폴더와 메타데이터로 관리하는 독립 모듈이다.

## 책임

- `DEALS_ROOT` 하위 딜 폴더 생성, 목록, 상세, 상태, 힌트, 파일 저장을 처리한다.
- Telegram document/photo 첨부를 딜 폴더 파일로 저장한다.
- `_deal.json` 메타데이터와 충돌 없는 파일명을 관리한다.

## 비책임

- Gmail 자동 분류와 다운로드 폴더 감시는 아직 이 모듈 밖 후속 작업이다.
- Wiki 판단 기록 저장은 `server/wiki/` 책임이다.
- Telegram 라우팅과 텍스트 인텐트 판단은 `server/intent/` 책임이다.

## 데이터 경로

| 환경 변수 | 용도 |
|---|---|
| `DEALS_ROOT` | 딜 폴더 저장 루트 |

## 외부 API 의존성

- Telegram 파일 다운로드 URL을 통해 첨부 파일을 가져온다.
- 직접 Google API 호출 없음.

## 텔레그램 명령 목록

- `딜 추가 <이름>`
- `딜 목록`
- `딜 <이름>`
- `딜 힌트 <이름> <내용>`
- `딜 상태 <이름> <상태>`
- `딜 저장 <이름>` 캡션이 붙은 document/photo 첨부

## 다른 모듈과의 관계

- 다른 도메인 모듈 직접 import 금지.
- `server/intent/`와 `server/llm/telegram-bot.ts`가 이 모듈을 호출한다.
- Wiki/Intelligence와의 공유는 `DEALS_ROOT` 파일 시스템 경로를 통해서만 한다.

## 주요 파일 목록과 라인 수

| 파일 | 라인 수 | 설명 |
|---|---:|---|
| `dealFileRouter.ts` | 108 | 딜 명령 파싱, 이름 정규화 |
| `dealStore.ts` | 259 | 폴더, 메타, 파일 저장소 |
| `dealTypes.ts` | 76 | 딜 타입 정의 |
| `index.ts` | 4 | 모듈 export |
| `telegramDealFileHandler.ts` | 199 | Telegram 파일 첨부 처리 |

## 신규 기능 판단 기록

- 딜 폴더/메타/첨부 저장 기능은 이 모듈에 추가한다.
- Gmail, Downloads 감시, Wiki 판단 연계는 직접 import가 아니라 파일 경로 기반 연계로 설계한다.
