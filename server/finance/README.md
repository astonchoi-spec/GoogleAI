# Finance 모듈

DART 공시와 금융 데이터 조회를 담당하는 독립 모듈이다.

## 책임

- DART API 공시 검색, 최근 공시 조회, 공시 포맷팅을 처리한다.
- 금융 데이터 조회 결과를 인텐트/브리핑에서 사용할 수 있는 형태로 제공한다.

## 비책임

- 브리핑 조합은 `server/intelligence/` 책임이다.
- 매매 리스크와 기술적 분석은 `server/trading/` 책임이다.
- Telegram 명령 라우팅은 `server/intent/` 책임이다.

## 데이터 경로

| 환경 변수 | 용도 |
|---|---|
| `DART_API_KEY` | DART Open API 인증키 |

## 외부 API 의존성

- DART Open API
- HTTP 호출은 모듈 내부에서 독립적으로 처리한다.

## 텔레그램 명령 목록

- `공시 <회사명>`
- `DART <회사명>`

## 다른 모듈과의 관계

- 다른 도메인 모듈 직접 import 금지.
- `server/intent/`에서 이 모듈을 호출한다.
- 브리핑 공유가 필요하면 `server/_core/briefingSources.ts` 같은 공통 소스를 통해 연결한다.

## 주요 파일 목록과 라인 수

| 파일 | 라인 수 | 설명 |
|---|---:|---|
| `dartAPI.ts` | 265 | DART 공시 API |

## 신규 기능 판단 기록

- DART/금융 데이터 조회는 이 모듈에 추가한다.
- 투자 판단, 주문, 거래 기록은 Trading 모듈에 둔다.
