# ASTON WORKSTATION — 작업 목록
last_updated: 2026-04-27 (귀가 세션)
branch: codex-google-workspace-expansion

---

## 현재 상태 요약

| 태스크 | 상태 | 커밋 |
|---|---|---|
| 1-C TradingView 웹훅 서버 | ✅ 완료 | 82cea91 |
| 1-D 자동 매매일지 Google Sheets | ✅ 완료 | 7f0b7d2 |
| 테스트 수정 9개 | ✅ 완료 | 3da3f79 |
| **2-A 기술적 분석 엔진** (RSI/MACD/Bollinger/EMA/ATR) | ✅ 완료 | 8e026d7 |
| **2-B 대시보드 라이브 데이터** (Home KPI tRPC 연결) | ✅ 완료 | 0a1ee9a |
| allowExecute true 설정 | ✅ 완료 | c1311de |
| **2-C 선물 리스크 계산기** | 🎯 다음 작업 | — |

---

## 다음 작업 — 2-C 선물 리스크 계산기

- [ ] `server/trading/riskCalculator.ts` 구현 (또는 기존 파일 보강)
  - 청산가 (liquidation price)
  - 손절가 / 목표가 (stop / target)
  - 1R / 2R / 3R 포지션 크기 계산
  - AI 梨꾪똿 연동용 입력 스키마 정의
- [ ] `server/routers/trading.ts`에 `riskCalc` 프로시저 추가
- [ ] `server/intent/intentService.ts` 인텐트 액션 등록
- [ ] UI: TradingPage 내 리스크 계산기 탭/패널
- [ ] 테스트 추가 (`server/__tests__/riskCalculator.test.ts`)

---

## 회사컴 Codex 작업 중 (미커밋 — 건드리지 말 것)

> 회사컴에서 Codex가 아직 커밋하지 않은 파일들이 있음.
> 집에서는 해당 파일 수정 금지. 다음 회사 출근 후 Codex 결과 확인 후 통합.

- `package.json`
- `client/` 일부
- `server/finance/`
- `server/realestate/*`

---

## P0 안정화 (언제든 먼저 처리 가능)

- [ ] Google Workspace 프로덕션 준비
  - Sheets API / Drive API 활성화 확인
  - Google OAuth 재연결 후 스코프 갱신
- [ ] 채팅 E2E QA (단일 전송 중복 방지, 대화 삭제/편집/검색)
- [ ] Gemini 그라운딩 출처 UI (소스 칩)

---

## 완료된 전체 목록 (참고)

- [x] Phase 1 UI 구조 (0~6)
- [x] Phase 1.5 UI 보강 (6-1, 6-2)
- [x] Gate.io ccxt 커넥터 (7)
- [x] Kiwoom REST 커넥터 (7-1)
- [x] Kiwoom WebSocket 실시간 피드 (7-2)
- [x] TradingView 웹훅 수신기 (7-3 / 1-C)
- [x] Upbit WebSocket 김치프리미엄 (8)
- [x] 매매일지 자동화 Gate + Kiwoom (10)
- [x] 매매일지 수동 / CSV 백엔드 (10-1 / 1-D)
- [x] 기술적 분석 엔진 RSI/MACD/Bollinger/EMA/ATR (2-A)
- [x] 홈 대시보드 KPI 라이브 데이터 연결 (2-B)
- [x] Phase 3 tRPC 라우터 등록 / AI 인텐트 라우터 / UI-백엔드 연결 (17~19)
