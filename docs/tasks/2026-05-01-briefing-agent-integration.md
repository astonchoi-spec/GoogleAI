# 2026-05-01 모닝브리핑 에이전트 결과 통합

## 목표

매일 아침 모닝브리핑에 전일 실행된 에이전트 작업 결과 요약 섹션을 추가한다. OpenClaw 실제 결과와 시뮬레이션 결과를 동일 흐름으로 처리한다.

## 완료 범위

- `server/agents/agentQueue.ts`: `getTasksByDate(dateISO)` 추가. 완료/실패/취소 작업만 조회하고 진행 중 작업은 제외
- `server/agents/agentResultLoader.ts`: `AGENT_WIKI_PATH` 파일 스캔 fallback 추가
- `server/agents/agentBriefing.ts`: 메모리 큐와 wiki fallback 결과 병합, 완료/실패 섹션 데이터 생성
- `server/_core/briefingSources.ts`: `getAgentResultsSection()` 공개 export
- `server/intelligence/briefing.ts`: 딜 섹션 다음, Risk Guard 앞에 에이전트 섹션 삽입

## 출력 예시

```text
## 🤖 어제 에이전트 작업 (1건)
• 🧪 PF 종합 분석 — 한남동644
  IRR(추정): 14.1% 평당 매입단가: 4,800만원 리스크: 3건
  🔗 G:\Aston-Wiki\agents\2026-04-30-pf-comprehensive-abc12.md
```

## 자율 결정

- 완료 결과는 최대 5건 표시, 초과분은 `외 N건`으로 축약
- 시뮬레이션 결과는 `🧪` 아이콘을 우선 사용
- 취소 작업은 브리핑에서 제외
- 실패 작업은 같은 에이전트 섹션 하단에 `⚠️ 실패 N건`으로 짧게 표시

## 검증

- `npm run check` ✅ (모듈 경계 위반 0건)
- `npm run build` ✅
- `npm test` ✅ (340 passed, 7 skipped, 2 todo)
- 신규/보강 테스트 10개 이상

## 다음 후보

- MTProto 텔레그램 수집기
- PF Google Sheets 동기화
- 주간/월간 에이전트 누적 보고
