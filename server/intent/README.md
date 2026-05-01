# Intent 모듈

Telegram/Web 메시지를 도메인 액션으로 분류하고 호출하는 라우팅 전용 모듈이다.

## 책임

- 사용자 메시지를 `IntentAction`으로 분류한다.
- 도메인별 handler registry를 통해 필요한 도메인 모듈을 호출한다.
- Telegram/Web 응답을 한국어 텍스트 중심으로 정규화한다.

## 비책임

- 도메인 비즈니스 로직을 직접 구현하지 않는다.
- 데이터 저장소를 직접 소유하지 않는다.
- 도메인 모듈 간 데이터 공유를 중개하지 않는다.

## 데이터 경로

| 환경 변수 | 용도 |
|---|---|
| 없음 | 자체 저장소 없음 |

## 외부 API 의존성

- 직접 외부 API 호출은 최소화한다.
- 필요한 외부 연동은 각 도메인 모듈을 호출한다.

## 텔레그램 명령 목록

- 모든 Telegram 명령의 1차 라우팅 지점이다.
- 실제 명령 목록은 각 도메인 README에 기록한다.

## 다른 모듈과의 관계

- `server/intent/`는 도메인 모듈을 import할 수 있다.
- 도메인 모듈은 `server/intent/`를 import하지 않는다.
- 공유 타입/유틸은 필요 시 `server/_core/`로 이동한다.

## 주요 파일 목록과 라인 수

| 파일 | 라인 수 | 설명 |
|---|---:|---|
| `fallbackIntent.ts` | 442 | 키워드 기반 분류 |
| `intentService.ts` | 205 | 공개 라우팅 API |
| `registry.ts` | 19 | handler registry |
| `types.ts` | 154 | Intent 타입과 헬퍼 |
| `wiki.ts` | 160 | Wiki 인텐트 파서/실행기 |
| `handlers/approval.ts` | 360 | 거래 승인/검토 핸들러 |
| `handlers/deals.ts` | 9 | Deals 핸들러 |
| `handlers/finance.ts` | 18 | Finance 핸들러 |
| `handlers/google.ts` | 186 | Google 핸들러 |
| `handlers/intelligence.ts` | 18 | Intelligence 핸들러 |
| `handlers/kakaoCallback.ts` | 102 | 카톡 파일 인라인 분류 callback 처리 |
| `handlers/realestate.ts` | 161 | Realestate 핸들러 |
| `handlers/trading.ts` | 299 | Trading 핸들러 |
| `handlers/wiki.ts` | 14 | Wiki 핸들러 |

## 신규 기능 판단 기록

- 새 사용자 명령은 먼저 기존 도메인 handler에 추가할 수 있는지 판단한다.
- 신규 도메인이 필요하면 README와 경계 규칙을 함께 추가한다.
