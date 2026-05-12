# 2026-05-01 Review Mode Transition

## 목적

Telegram 승인 모드와 Upbit 실주문 코드는 보존하되, 기본 운영 상태를 검토 모드로 전환한다. AI는 매수/매도 추천이나 자동 주문 실행 대신 시장 데이터 기반 의사결정 보조 리포트를 제공한다.

## 범위

- `ENABLE_REAL_ORDERS=false` 기본값 추가
- 실주문 실행기에서 환경변수 기반 주문 차단
- 검토 명령 및 자연어 질문 라우팅 추가
- 멀티 타임프레임 리포트 추가
- 기존 `매수 시뮬` / `매도 시뮬` 명령을 검토 모드 리포트로 재정의
- Telegram 승인 버튼 클릭 시 검토 모드에서는 실주문 차단

## 자율 결정

- 신규 인텐트명은 `trading_review_report`로 정의했다.
- 단위 없는 큰 숫자는 KRW로 가정하고 입력 해석 안내를 붙인다.
- `숫자+배`는 금액보다 우선해 레버리지로 파싱한다.
- 펀딩비는 Binance funding history의 최신값, 최근 4회 평균, 최근 24회 평균으로 표시한다.
- 김프 24h 변화는 Upbit 24h 변화율과 Binance 24h 변화율 차이로 근사한다.
- 종합 판정은 체크리스트 경고 개수 기반으로 `양호` / `주의` / `비추천`을 산출한다.

## 검증

- `npm run check` 통과
- `npm run build` 통과
- `npm test` 통과: 189 passed, 7 skipped, 2 todo

## 변경 파일

- `server/trading/reviewReport.ts`
- `server/trading/orderExecutor.ts`
- `server/intent/handlers/approval.ts`
- `server/intent/handlers/trading.ts`
- `server/intent/fallbackIntent.ts`
- `server/intent/types.ts`
- `server/__tests__/reviewReport.test.ts`
- `server/__tests__/orderExecutor.test.ts`
- `.env.example`
- `README.md`
- `TODO.md`
- `CHANGELOG.md`
- `HANDOFF.md`

## 수동 검증 명령

- `검토 BTC`
- `롱 검토 BTC 15배`
- `숏 검토 ETH 5배`
- `매수 시뮬 BTC 5만원`
- `매수 적합?`
- 기존 승인 버튼 클릭 시 `🔒 검토 모드: 실주문 비활성화 상태입니다.` 응답 확인
