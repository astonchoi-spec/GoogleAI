# Aston Workstation

한국어 우선 Executive Command Center입니다. 웹 대시보드와 Telegram Bot을 하나의 Node.js 서버에서 운영합니다.

## Trading Review Mode

Telegram 매매 명령은 기본적으로 검토 모드로 동작합니다. `ENABLE_REAL_ORDERS=false`가 기본값이며, 이 상태에서는 Upbit 실주문이 실행되지 않습니다.

실주문을 활성화하려면 `.env`에 `ENABLE_REAL_ORDERS=true`를 명시해야 합니다. 활성화 시 `server/trading/orderExecutor.ts`가 경고 로그를 출력하고, 기존 승인 버튼 플로우가 실제 Upbit 주문을 호출합니다.

검토 모드 수동 확인 명령:

- `검토 BTC`
- `롱 검토 BTC 15배`
- `숏 검토 ETH 5배`
- `매수 시뮬 BTC 5만원`
- `매수 적합?`

