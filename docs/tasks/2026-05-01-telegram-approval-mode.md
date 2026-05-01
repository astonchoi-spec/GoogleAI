# Telegram 승인 모드 — 매매 신호 1탭 승인 자동 체결

- 일자: 2026-05-01
- 작업자: Claude Code
- 브랜치: codex-google-workspace-expansion

## 목표
신호 감지 → 텔레그램 인라인 키보드 알림 → 회장님 1탭 승인 → Upbit 자동 매매

## 신규 파일

| 파일 | 줄 수 | 역할 |
|------|------|------|
| `server/trading/approvalQueue.ts` | 159 | 승인 대기 큐 (in-memory Map + TTL) |
| `server/trading/orderExecutor.ts` | 225 | Upbit JWT 서명 REST 직접 호출 (시장가 매수/매도/조회) |
| `server/intent/handlers/approval.ts` | 346 | 신호 발송 핸들러 + Telegram callback_query 처리 |
| `server/__tests__/approvalQueue.test.ts` | 141 | 큐 단위 테스트 (12 케이스) |
| `server/__tests__/orderExecutor.test.ts` | 154 | Upbit 모킹 테스트 (11 케이스) |

## 수정 파일

- `server/intent/types.ts` — IntentAction 에 `trading_buy_signal`, `trading_sell_signal`, `trading_approval_list` 추가
- `server/intent/fallbackIntent.ts` (484줄) — "매수 시뮬"/"매도 시뮬"/"승인 큐" 매처 추가
- `server/intent/registry.ts` — approvalHandlers 등록
- `server/llm/telegram-bot.ts` (546→568줄) — `setupApprovalCallbacks()` 추가, `bot.action(/^(approve|reject|detail):(.+)$/)` 등록
- `.env.example` — `MAX_ORDER_KRW`, `MAX_DAILY_AUTO_TRADES`, `APPROVAL_TIMEOUT_MS` 추가

## 자율 결정 내역

| 항목 | 결정 | 근거 |
|------|------|------|
| 승인 타임아웃 | **5분** (env 오버라이드 가능) | 회장 짧은 회의 견딤 + 오래된 신호로 잘못 체결 방지 절충점 |
| 타임아웃 시 동작 | **자동 거부** (`expired` 상태로 전이) | 안전 우선. 재알림은 노이즈만 증가 |
| 동시 승인 처리 | **자유 ID 기반 lookup** (FIFO 강제 X) | 동시 다건 시나리오 드물고, FIFO 강제는 인라인 키보드 UX 와 충돌 |
| 주문 실패 재시도 | **없음** (실패 즉시 보고) | 실패 원인이 잔고 부족·최소 금액 미달 등이면 재시도 무용 |
| callback_data 포맷 | `approve:<uuid>` / `reject:<uuid>` / `detail:<uuid>` | 직관적이고 charset 64자 제한 만족 |
| Risk Guard 통합 위치 | **승인 직후 + 한도 검사 직후**, 주문 직전 | 승인 후 시간 경과 동안 상태 변화 가능성 대응 |
| 주문 수량 계산 | **고정 KRW (env)**, 자본 비율 X | 단순·예측 가능성. 기본 50,000원 (한도 500,000원) |
| 시장가 vs 지정가 | **시장가만** 1차 지원 | 신호 즉시성 우선. 지정가는 추후 확장 |
| 위키 자동 저장 | **체결 후 `#trading` 카테고리 저장** | 거래 일지 자동화. 실패해도 체결은 유지 |
| Upbit JWT 서명 | **Node 내장 crypto HMAC HS256** (jose 미사용) | 의존성 최소화, 동기 처리, 코드 30줄 |
| ccxt vs 직접 fetch | **직접 fetch** | CLAUDE.md §7 룰 준수, ccxt 미설치 환경에서도 동작 |

## 보안 제약 구현

- ✅ 승인 버튼 클릭자가 `OWNER_TELEGRAM_CHAT_ID` 일치 검증 — 불일치 시 "권한이 없습니다" 알림 후 무시
- ✅ Upbit API 키는 `process.env.UPBIT_API_KEY/UPBIT_SECRET` 에서만 로드 — 코드/로그 노출 없음
- ✅ 주문 실행 직전 Risk Guard 재검사 (수동 잠금/일일 손실/연속 손실)
- ✅ 단일 주문 최대 50만원 (env `MAX_ORDER_KRW`, default 500_000) — 신호 등록 시 + 승인 시 이중 검사
- ✅ 일일 자동 매매 한도 5건 (env `MAX_DAILY_AUTO_TRADES`, default 5) — KST 자정 기준 카운트
- ✅ pending 이 아닌 요청 재처리 차단 ("이미 …상태입니다")

## 검증

- `npm run check` ✅
- `npm run build` ✅
- `npm test` ✅ — **183 passed**, 7 skipped, 2 todo (이전 160 → +23 신규)
  - approvalQueue 12 케이스 (enqueue/setStatus/expireOld/countExecutedToday/list)
  - orderExecutor 11 케이스 (매수/매도/조회/네트워크오류/한국어에러매핑)
- 라인 수: 모든 신규 파일 500줄 이하 (최대 approval.ts 346줄)

## 수동 검증 명령

텔레그램에서:

```
매수 시뮬 BTC 5만원      # 50,000원 매수 신호 → 인라인 키보드 발송
매수 시뮬                  # 기본 BTC 50,000원
매도 시뮬 BTC 0.001       # 0.001 BTC 매도 신호
승인 큐                    # 대기/완료 항목 조회
```

플로우:
1. 위 명령 입력 → "📡 매수 신호 발송…" 회신 + 별도 메시지로 인라인 키보드 (✅ 승인 / ❌ 거부 / 📊 상세) 도착
2. ✅ 탭 → Risk Guard 재검사 → Upbit 시장가 주문 → 결과 메시지로 편집 ("✅ 매수 체결 완료 / 평균가 / 체결량 / 주문 ID")
3. 위키에 `#trading` 태그로 자동 기록

⚠️ **실제 주문 검증은 회장님이 별도 소액 테스트** — 코드는 실제 Upbit API 를 호출함. 모킹 모드 없음.

## 잔여 이슈 / 후속 과제

- `server/llm/telegram-bot.ts` 가 568줄로 500줄 룰 위반 (이전부터 위반 상태, 본 작업으로 +22줄). P1 분리 대상으로 TODO 등록.
- 지정가 주문 미지원 — 추후 신호에 `price` 필드 추가 시 `placeLimitOrder()` 신규 구현 필요.
- 자동 신호 트리거 — 현재는 "매수 시뮬" 수동 명령만 받음. 추후 preCheckEngine + cron 으로 자동 신호 발송 연결.
