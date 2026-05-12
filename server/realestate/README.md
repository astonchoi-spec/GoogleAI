# Realestate 모듈

부동산 PF 타당성, 토지 규제, 딜 파이프라인을 담당하는 독립 모듈이다.

## 책임

- PF feasibility 계산과 보고서 포맷을 제공한다.
- 토지 규제/공공 데이터 조회를 처리한다.
- PF 딜 파이프라인 상태와 Google Sheets/Calendar 연동 기반 기록을 관리한다.

## 비책임

- Aston-Deals 파일 창고는 `server/deals/` 책임이다.
- Wiki 판단 기록 저장은 `server/wiki/` 책임이다.
- Telegram 라우팅은 `server/intent/` 책임이다.

## 데이터 경로

| 환경 변수 | 용도 |
|---|---|
| Google OAuth 환경 변수 | Sheets/Calendar 연동 인증 |
| 공공 데이터 API 키 | 토지 규제/공공 데이터 조회 |

## 외부 API 의존성

- Google Sheets API
- Google Calendar API
- 공공 데이터 API

## 텔레그램 명령 목록

- `PF 타당성 ...`
- `토지 규제 <주소>`
- `딜 목록`
- `딜 단계 변경 ...`

## 다른 모듈과의 관계

- 다른 도메인 모듈 직접 import 금지.
- `server/intent/`에서 이 모듈을 호출한다.
- Deals/Wiki와의 공유는 직접 import가 아니라 파일 경로 또는 명시된 저장소를 통해 처리한다.

## 주요 파일 목록과 라인 수

| 파일 | 라인 수 | 설명 |
|---|---:|---|
| `dealPipeline.ts` | 465 | PF 딜 파이프라인 |
| `feasibilityEngine.ts` | 335 | PF 타당성 계산 |
| `publicDataAPI.ts` | 371 | 공공 데이터 조회 |

## 신규 기능 판단 기록

- PF 계산, 토지 규제, 딜 단계 관리는 이 모듈에 추가한다.
- 딜 원본 파일 저장은 Deals 모듈, 판단 로그는 Wiki 모듈로 유지한다.
