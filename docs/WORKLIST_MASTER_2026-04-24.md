# Aston Workstation Master Worklist

- last_updated: `2026-04-24`
- current_focus: `Phase 2 realtime prep`
- progress: `11/27 completed`

## Real Trading Environment

| market | broker_or_exchange | api | note |
|---|---|---|---|
| KR stocks | Kiwoom | yes | Kiwoom REST |
| KR futures | Kiwoom | yes | KOSPI200 futures |
| US futures | Kiwoom | yes | CME E-mini, NASDAQ futures |
| Crypto spot | Gate.io | yes | ccxt gate |
| Crypto futures | Gate.io | yes | ccxt gate |
| KR stocks (secondary) | Toss | no | manual / csv fallback |
| Chart | TradingView | yes | widget + webhook |

## Market Source Mapping

| market | price | realtime | order | chart | journal |
|---|---|---|---|---|---|
| Crypto spot | ccxt gate | Gate WS | ccxt gate | TV widget | auto api |
| Crypto futures | ccxt gate | Gate WS | ccxt gate | TV widget | auto api |
| KR stocks | Kiwoom REST | Kiwoom WS | Kiwoom REST | TV widget | auto api |
| KR futures | Kiwoom REST | Kiwoom WS | Kiwoom REST | TV widget | auto api |
| US futures | Kiwoom REST | Kiwoom WS | Kiwoom REST | TV widget | auto api |
| Toss stocks | none | none | manual only | TV view only | manual or csv |

## Phase 1 - UI Structure (Completed)

- [x] `0` AGENTS context
- [x] `1` UI structure analysis
- [x] `2` Navigation extension (trading / real-estate-pf)
- [x] `3` Trading page skeleton
- [x] `4` Real estate PF page skeleton
- [x] `5` AI chat UI extension (mic + tts + quick actions)
- [x] `6` Home dashboard widgets

## Phase 1.5 - UI Reinforcement (Completed)

- [x] `6-1` Trading page market tabs + TradingView advanced chart widget
- [x] `6-2` Journal manual form + csv import UI (Toss fallback)

## Phase 2 - Backend Modules

### Exchange Integration

- [x] `7` Gate.io connector (ccxt spot + futures)
- [x] `7-1` Kiwoom REST connector (KR stocks + KR futures + US futures)
- [ ] `7-2` Kiwoom websocket realtime feed
- [ ] `7-3` TradingView webhook receiver (alert to telegram / auto-order)
- [ ] `8` Upbit websocket (kimchi premium monitor)

### Analysis Engine

- [ ] `9` Technical indicators (RSI/MACD/Bollinger/SMA/EMA/ATR)
- [ ] `12` Futures risk calculator (liquidation/stop/target)

### Record and Management

- [ ] `10` Journal automation (Gate + Kiwoom fills to Sheets)
- [ ] `10-1` Journal manual and csv backend (Toss)
- [ ] `11` Alert engine (BullMQ: price/rsi/kimchi/funding/tv webhook -> Telegram)

### Real Estate PF

- [ ] `13` Feasibility engine (PF IRR/DSCR/profitability)
- [ ] `14` Public data api integration
- [ ] `15` PF deal pipeline (Sheets + Calendar milestone)
- [ ] `16` DART disclosure and financial statements api

## Phase 3 - Integration

- [ ] `17` tRPC router registration
- [ ] `18` AI intent parsing router
- [ ] `19` UI to backend full connection

## Recommended Execution Order

1. Phase 2 foundation: `7`, `7-1` (completed)
2. Phase 2 realtime: `7-2`, `7-3`, `8`
3. Phase 2 parallel: `9`, `12`, `10-1`, `13`, `14`, `15`, `16`
4. Phase 2 dependent final: `10`, `11`
5. Phase 3: `17` -> `18` -> `19`

## Package and Env Summary

- package: `ccxt`, `technicalindicators`, `bullmq`, `lightweight-charts`, `axios`, `ws`, `googleapis`, `zod`
- env:
  - `GATE_API_KEY`, `GATE_SECRET`
  - `KIWOOM_APP_KEY`, `KIWOOM_APP_SECRET`, `KIWOOM_ACCOUNT_NO`, `KIWOOM_HTS_ID`
  - `TV_WEBHOOK_SECRET`
  - `DATA_GO_KR_API_KEY`
  - `DART_API_KEY`
  - `UPBIT_API_KEY`, `UPBIT_SECRET`

## Task Count

- phase1: `7` completed
- phase1_5: `2` completed
- phase2: `2` completed, `13` pending
- phase3: `3` pending
- total: `27` tasks, `11` completed
