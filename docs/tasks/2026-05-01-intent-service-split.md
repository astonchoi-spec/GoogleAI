# intentService.ts 분할 리팩토링

- 일자: 2026-05-01
- 작업자: Claude Code
- 브랜치: codex-google-workspace-expansion

## 배경
- `server/intent/intentService.ts` 가 1511줄로, AGENTS.md/CLAUDE.md §9 "단일 파일 500줄 이하" 룰 위반
- 인텐트 추가 시(위키, 브리핑) 한 파일에 누적되어 유지보수 부담

## 목표 / 결과

| 항목 | 전 | 후 |
|------|----|----|
| `intentService.ts` 라인 수 | 1511 | 192 |
| 핸들러 분리 도메인 수 | 0 (단일 파일) | 6 (trading/realestate/finance/google/intelligence/wiki) |
| 단일 파일 500줄 위반 | 1건 | 0건 |
| 테스트 결과 | 160 passed | 160 passed (회귀 없음) |

## 새 파일 구조

```
server/intent/
├── intentService.ts        (192줄) — classifyIntent / routeIntentMessage 디스패처 / formatIntentRouteMessage / normalizeIntent
├── types.ts                (171줄) — IntentDomain·Action·Result·RouteResponse·HandlerMap, asString/asNumber/yyyymmdd 등 헬퍼, getGoogleAuth, GOOGLE_REAUTH_MSG
├── fallbackIntent.ts       (452줄) — 키워드 기반 1차 분류 (우선순위 보존)
├── registry.ts             (16줄)  — 도메인별 핸들러 맵 병합
├── wiki.ts                 (기존)  — wiki_save/search 매처 + executeWikiSave/Search
└── handlers/
    ├── trading.ts          (274줄) — balance/positions/TA/risk_*/pre_check/add_alert/analysis_*
    ├── realestate.ts       (201줄) — portfolio/feasibility/land_*/deals_*
    ├── google.ts           (197줄) — calendar/sheet/drive/gmail
    ├── finance.ts          (20줄)  — DART
    ├── intelligence.ts     (20줄)  — morning_briefing
    └── wiki.ts             (17줄)  — wiki.ts executor 래핑
```

## 자율 결정 사항

1. **registry 패턴 도입** — `Partial<Record<IntentAction, IntentHandler>>` 기반. 각 도메인 핸들러 모듈이 `HandlerMap` 객체를 export, `registry.ts`에서 병합. `routeIntentMessage`는 `handlerRegistry[intent.action]` 조회.
2. **fallbackIntent는 분리하되 단일 함수 유지** — 키워드 매칭 우선순위가 도메인 사이에 미묘하게 얽혀 있어(예: trading_pre_check가 trading_risk_calculate보다 먼저, 풍부한 google 매처가 약한 fallback보다 먼저) 도메인별 분리 대신 한 파일에 보존. 452줄로 룰 만족.
3. **types.ts에 helpers 통합** — asString/asNumber/yyyymmdd 등 모든 도메인이 쓰는 유틸을 분산하지 않고 한 파일에 모음. getGoogleAuth, GOOGLE_REAUTH_MSG, isGoogleAuthError 도 동일.
4. **intentService.ts 공개 API 보존** — `classifyIntent`, `routeIntentMessage`, `formatIntentRouteMessage`, `normalizeIntent`, `IntentResult` 타입을 동일 경로로 export. `wiki.ts`/`telegram-bot.ts`/`routers/intent.ts`/`routers/llm.ts`/`chat-dedup.test.ts`/`briefing.test.ts` import 변경 없음.
5. **wiki.ts 위치 유지** — 이미 분리된 파일이므로 handlers/wiki.ts에서 thin wrapper로 호출만 함. 기존 export(matchWikiSave, matchWikiSearch, executeWikiSave, executeWikiSearch) 보존.

## 검증

- `npm run check` ✅
- `npm run build` ✅
- `npm test` ✅ (160 passed, 7 skipped, 2 todo — 기존과 동일)
- 모든 신규 파일 500줄 이하 (최대 trading.ts 274줄)
- intentService import 경로 변경 없음 (외부 API 보존)

## 텔레그램 수동 회귀 체크리스트 (운영 검증)

- [ ] "위키 저장 테스트 #테스트"
- [ ] "위키 검색 테스트"
- [ ] "브리핑 테스트"
- [ ] "브리핑"
- [ ] "잔고 조회" / "업비트 잔고"
- [ ] "오늘 일정"
- [ ] "최근 메일"
- [ ] "BTC 숏 77000 손절 78500 목표 74000" (pre_check)
- [ ] "리스크 상태"
