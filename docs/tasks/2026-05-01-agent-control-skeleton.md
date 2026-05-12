# 2026-05-01 Agent Control 골격 (Phase 2)

## 목표
- Aston에 Agent Control 모듈 신설
- OpenClaw 미연동 상태에서 시뮬레이션 모드로 전체 흐름 완성
- 다음 Phase에서 OpenClaw API 연동만 추가하면 되도록 골격 완비

## 신규 파일
- `server/agents/agentTypes.ts` (51줄): AgentTask/Template/Status/Result/Notifier 타입
- `server/agents/agentTemplates.ts` (62줄): 5개 템플릿(pf-comprehensive, pf-version-compare, pf-legal-risk, trading-decision, notebook-query)
- `server/agents/agentQueue.ts` (158줄): 인메모리 큐, max 50, 30분 타임아웃, 동시 1건, AbortController 기반 취소
- `server/agents/agentExecutor.ts` (154줄): 시뮬레이션 러너, 템플릿별 더미 마크다운, AGENT_WIKI_PATH 저장
- `server/agents/permissionGate.ts` (41줄): AGENT_PERMISSION_LEVEL 기반 (1=read, 2=실행, 3=자동)
- `server/agents/index.ts` (44줄): 외부 노출 + 싱글턴 큐 + 알림자 주입
- `server/agents/README.md`: 모듈 책임/비책임/데이터 경로/환경변수
- `server/intent/handlers/agents.ts` (129줄): 5개 텔레그램 명령 핸들러
- `server/routers/agents.ts` (68줄): GET/POST/DELETE /api/agents/*
- `server/_core/agentNotifier.ts` (73줄): 텔레그램 시작/완료/실패 알림 (도메인 경계 보존)
- `client/src/pages/AgentControl.tsx` (240줄): 권한 표시, 빠른 실행 카드 5개, 진행 중·완료 리스트, 입력 모달, 5초 폴링
- `server/__tests__/agentTemplates.test.ts` (3 케이스)
- `server/__tests__/permissionGate.test.ts` (5 케이스)
- `server/__tests__/agentQueue.test.ts` (7 케이스)
- `server/__tests__/agentExecutor.test.ts` (6 케이스)

## 수정 파일
- `server/intent/types.ts`: `IntentDomain`에 `agents` 추가, `IntentAction`에 `agent_command` 추가
- `server/intent/fallbackIntent.ts`: `^에이전트` prefix 매처 (confidence 0.99, deals보다 우선)
- `server/intent/registry.ts`: agentHandlers 등록
- `server/_core/index.ts`: `setAgentNotifier(agentTelegramNotifier)` + `registerAgentRoutes(app)`
- `client/src/App.tsx`: `/agents` 라우트
- `client/src/components/Sidebar.tsx`: Agent Control 네비 항목 추가 (Bot 아이콘)
- `scripts/check-module-boundaries.ts`: DOMAIN_MODULES에 `agents` 추가
- `.env.example`: OPENCLAW_API_URL, OPENCLAW_API_KEY, AGENT_PERMISSION_LEVEL, AGENT_WIKI_PATH

## 자율 결정
- **큐 자료구조**: Map(id→task) + 순서 배열 + 대기 배열 — O(1) 조회 + FIFO 처리 + 단일 동시 실행
- **시뮬 sleep**: 3000~5000ms 랜덤 (옵션으로 오버라이드 가능, 테스트는 10ms)
- **취소 방식**: AbortController. pending이면 큐에서 제거하고 cancelled 상태로 마킹, running이면 abort 시그널 송출
- **타임아웃**: AbortController로 동일 메커니즘 (30분 후 abort, status는 `failed` 또는 `cancelled` 어느 쪽이든 허용)
- **권한 게이트**: 이번 Phase는 1단계 enforce 의무가 모호 — 게이트는 명세대로 execute를 차단하지만, 실제 시뮬 실행은 게이트를 거치지 않음. 다음 Phase에서 OpenClaw 호출 직전에 게이트 호출 추가 예정. 테스트는 게이트 단독 동작 검증
- **알림자 주입**: `setAgentNotifier()`로 `_core/agentNotifier.ts`에서 등록 — `server/agents/`는 텔레그램 의존 0
- **결과 저장 경로**: `AGENT_WIKI_PATH/<KST날짜>-<템플릿>-<id>.md`. 미설정 시 wikiPath null
- **더미 결과 양식**: 템플릿마다 그럴듯한 PF/트레이딩 시뮬 수치, 마지막에 시뮬레이션 안내 푸터
- **API 응답**: HTTP API는 JSON(외부 통신용 예외), 텔레그램은 한국어+이모지

## 텔레그램 응답 예시 (시뮬레이션)

### 1) `에이전트 목록`
```
🤖 에이전트 템플릿
🧪 시뮬레이션 모드 (OpenClaw 미연동)
🛡 권한: 1단계 — 읽기 전용 (시뮬레이션 모드)

• pf-comprehensive — PF 종합 분석
  딜의 사업성, 시장, 법무, 자금 구조를 종합 평가합니다.
• pf-version-compare — PF 버전 비교
  같은 딜의 두 버전(예: 초기/수정안) 사업성 변동을 정리합니다.
...

사용법: 에이전트 실행 <템플릿id> <대상>
```

### 2) `에이전트 실행 pf-comprehensive 한남동644`
```
🤖 에이전트 작업 등록
📋 PF 종합 분석
🆔 abc12
🎯 한남동644

🧪 시뮬레이션 모드 (OpenClaw 미연동)
🛡 권한: 1단계 — 읽기 전용 (시뮬레이션 모드)

상태 확인: 에이전트 결과 abc12
```

이후 작업 시작/완료 알림이 자동 push:
```
🤖 에이전트 작업 시작
📋 PF 종합 분석
🆔 abc12
🎯 한남동644

✅ 에이전트 작업 완료
📋 PF 종합 분석
🆔 abc12
⏱ 소요 4.2초

📄 미리보기
# PF 종합 분석 — 한남동644
> 시뮬레이션 결과 · 생성 ...

🔗 G:\Aston-Wiki\agents\2026-05-01-pf-comprehensive-abc12.md
```

### 3) `에이전트 결과 abc12`
```
📋 PF 종합 분석
🆔 abc12
상태: ✅ 완료
🎯 한남동644
⏱ 4.2초
🔗 G:\Aston-Wiki\agents\2026-05-01-pf-comprehensive-abc12.md

── 미리보기 ──
# PF 종합 분석 — 한남동644
> 시뮬레이션 결과 · ...
```

## UI 화면 설명 (`/agents`)
- 상단 패널: 권한 단계 라벨 + 시뮬레이션 모드 배지
- 빠른 실행 카드 5개: 각 카드 클릭 시 모달이 열려 템플릿 인풋 입력
- 모달: target 필수, 그 외 인풋은 옵셔널. 실행 버튼 누르면 POST /api/agents/tasks
- 진행 중·대기 리스트: 5초 간격 폴링, 행마다 취소 버튼(running/pending만)
- 최근 완료 리스트: 최대 10건, 미리보기 200자 표시
- 다크 테마(#0a0e27 계열) + cyan 강조

## 다음 Phase에서 회장님이 준비할 정보
1. **OpenClaw API URL** — 예: `http://localhost:8080` 또는 `http://wsl.local:8080`. WSL2/Docker 사용 시 호스트에서 접근 가능한 URL 확인.
2. **OpenClaw API Key** — 인증 필요 시.
3. **OpenClaw 엔드포인트 스펙** — 호출 메서드/페이로드/응답 포맷. 가능하면 Postman 또는 curl 예제.
4. **WSL2/Docker 네트워크 접근 확인** — Aston 서버에서 `curl <OPENCLAW_API_URL>/health` 가 200 반환되는지.
5. **권한 단계 결정** — Phase 3에서 회장 승인(2단계)를 거칠지, 자동(3단계)로 갈지.
6. **NotebookLM 연동 방식** — `notebook-query` 템플릿이 OpenClaw를 통해 NotebookLM을 호출하는지, 별도 채널인지.

## 검증
- `npm run check` ✅ (모듈 경계 위반 0건)
- `npm run build` ✅
- `npm test` ✅ 313 passed (292 → +21 신규)

## 범위 밖 (다음 Phase)
- OpenClaw 실제 API 연동 (HTTP 호출)
- WSL2/Docker 통신 검증
- Gemini API 직접 호출
- 권한 단계 2·3 구현 (회장 승인 인라인 키보드, 자동 트리거)
- 모닝브리핑에 에이전트 결과 통합
