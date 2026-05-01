# Google 모듈

Google OAuth와 Gmail, Calendar, Drive, Sheets 연동을 담당하는 독립 모듈이다.

## 책임

- Google OAuth 토큰을 관리하고 Workspace API 클라이언트를 제공한다.
- Gmail 조회, Calendar 일정, Drive 파일, Sheets 읽기/쓰기 기능을 제공한다.
- Workspace Sheet 설정 파일을 관리한다.

## 비책임

- Telegram 명령 라우팅은 `server/intent/` 책임이다.
- Deals/Wiki 파일 저장 정책은 각 모듈 책임이다.
- 매매 판단과 브리핑 조합은 각각 `server/trading/`, `server/intelligence/` 책임이다.

## 데이터 경로

| 환경 변수 | 용도 |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth 인증 |
| `GOOGLE_REDIRECT_URI` | OAuth callback |
| `data/google-tokens.json` | 로컬 토큰 저장 파일 |
| Workspace Sheet 설정 파일 | `workspace-sheet-config.ts`에서 관리 |

## 외부 API 의존성

- Google OAuth 2.0
- Gmail API
- Calendar API
- Drive API
- Sheets API

## 텔레그램 명령 목록

- `최근 메일`
- `오늘 일정`
- `일정 추가 ...`
- `드라이브 검색 ...`
- `시트 ...`

## 다른 모듈과의 관계

- 다른 도메인 모듈 직접 import 금지.
- `server/intent/`에서 이 모듈을 호출한다.
- 파일 기반 모듈과의 공유는 Google Drive 동기화 경로나 Sheets 문서를 통해 처리한다.

## 주요 파일 목록과 라인 수

| 파일 | 라인 수 | 설명 |
|---|---:|---|
| `auth.ts` | 262 | OAuth 토큰 관리 |
| `calendar.ts` | 247 | Calendar 연동 |
| `drive.ts` | 243 | Drive 연동 |
| `gmail.ts` | 174 | Gmail 연동 |
| `sheets.ts` | 282 | Sheets 연동 |
| `workspace-sheet-config.ts` | 59 | Workspace Sheet 설정 |

## 신규 기능 판단 기록

- Google API 단위 기능은 이 모듈에 추가한다.
- 도메인 판단 로직은 Google 모듈에 넣지 않고 해당 도메인 모듈 또는 intent 레이어에서 연결한다.
