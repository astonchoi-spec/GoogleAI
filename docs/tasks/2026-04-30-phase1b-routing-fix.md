# Phase 1b 버그 수정 - 브리핑 인텐트 라우팅 충돌

상태: 완료
완료일: 2026-04-30

## 문제
- `브리핑 테스트` 입력 시 Google Assistant 인텐트로 잘못 라우팅됨
- `브리핑` 입력 시 캘린더 조회만 실행되고 4개 섹션 브리핑 미작동
- 기대: 시장/DART/위키/RiskGuard 4개 섹션이 텔레그램으로 발송

## 수정 범위
1. `server/intent/intentService.ts`에서 브리핑 인텐트 우선순위 조정
2. `[intent] matched: <intent_name> for input: <message>` 라우팅 로그 추가
3. `server/__tests__/briefing.test.ts`에 브리핑 라우팅 회귀 테스트 추가

## 결과
- `브리핑 테스트` -> `intelligence_morning_briefing`
- `브리핑` -> `intelligence_morning_briefing`
- Google Calendar 인텐트보다 브리핑 키워드가 우선됨

## 검증
- `npm run check`
- `npm run build`
- `npm test`
