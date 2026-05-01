# Trading 모듈

매매 판단, 리스크, 승인 큐, 기술적 분석, 거래 기록을 담당하는 독립 모듈이다.

## 책임

- 진입 전 점검, 검토 리포트, 기술적 분석, 리스크 가드, 승인 큐를 제공한다.
- 인증 주문 실행은 Upbit REST/JWT 경로로 제한하고, 공개 시장 데이터는 직접 fetch한다.
- 거래 일지와 리스크 상태를 관리한다.

## 비책임

- Telegram 문장 라우팅은 `server/intent/` 책임이다.
- 부동산 PF, Wiki, Deals 자료 처리는 각 도메인 모듈 책임이다.
- Google Workspace 일반 명령은 `server/google/` 책임이다.

## 데이터 경로

| 환경 변수 | 용도 |
|---|---|
| `ENABLE_REAL_ORDERS` | 실주문 활성화 여부. 기본값 false |
| `UPBIT_ACCESS_KEY` / `UPBIT_SECRET_KEY` | Upbit 인증 주문 |
| `MAX_ORDER_KRW` | 1회 주문 한도 |
| `MAX_DAILY_AUTO_TRADES` | 일일 자동 거래 한도 |
| `APPROVAL_TIMEOUT_MS` | 승인 큐 TTL |
| `data/risk-state.json` | Risk Guard 상태 파일 |

## 외부 API 의존성

- Binance public REST API
- Upbit public REST API 및 인증 REST API
- Google Sheets API는 거래 일지 일부에서 사용한다.

## 텔레그램 명령 목록

- `검토 BTC`, `롱 검토 BTC 15배`, `숏 검토 ETH 5배`
- `BTC 숏 77000 손절 78500 목표 74000`
- `매수 시뮬 BTC 5만원`, `매도 시뮬 BTC 0.01개`
- `승인 큐`, `리스크 상태`, `오늘 거래 중지`, `거래 재개`
- `잔고 조회`, `업비트 잔고`, `포지션`

## 다른 모듈과의 관계

- 다른 도메인 모듈 직접 import 금지.
- 공통 Redis/LLM/라우터 타입은 `server/_core/`를 통해서만 공유한다.
- `server/intent/`에서 이 모듈을 호출한다.
- `server/exchanges/`는 인증 거래소 커넥터 영역이며, 공개 시장 데이터 조회에는 사용하지 않는다.

## 주요 파일 목록과 라인 수

| 파일 | 라인 수 | 설명 |
|---|---:|---|
| `approvalQueue.ts` | 159 | 승인 대기 큐 |
| `orderExecutor.ts` | 242 | Upbit 주문 실행 및 검토 모드 차단 |
| `preCheckEngine.ts` | 521 | 진입 전 점검 |
| `reviewReport.ts` | 425 | 검토 리포트 |
| `riskCalculator.ts` | 223 | 선물 리스크 계산 |
| `riskGuard.ts` | 263 | 리스크 가드 |
| `riskStore.ts` | 269 | 리스크 상태 저장 |
| `technicalAnalysis.ts` | 418 | 기술적 분석 |
| `tradeJournal.ts` | 787 | 거래 일지 |

## 신규 기능 판단 기록

- 매매 판단/리스크/주문/기술 지표는 이 모듈에 추가한다.
- 자료 보관, 판단 기록, 부동산 PF 로직은 직접 import 없이 각 모듈의 파일 경로 또는 intent 라우팅으로 연결한다.
