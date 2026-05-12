# 2026-05-02 OpenClaw 실제 연동 활성화

## 목표
- OpenClaw를 `http://127.0.0.1:8000` 기준으로 Aston에 실제 연결
- 토큰 자동 탐색과 `.env` 반영
- `/api/agents/health`에서 시뮬레이션이 아닌 실연동 상태 노출
- 실제 호출 실패 시에도 기존 작업은 시뮬레이션 fallback으로 성공 처리

## 구현
- `server/agents/openclawRuntime.ts`
  - `~/.openclaw/openclaw.json`에서 gateway token/model 자동 탐색
  - `.env`에 `OPENCLAW_API_URL`, `OPENCLAW_API_KEY`, `OPENCLAW_REQUEST_TIMEOUT_MS`, `AGENT_PERMISSION_LEVEL` 동기화
- `server/agents/openclawClient.ts`
  - HTTP 추정 endpoint 우선 방식에서 `gateway-rpc` 우선 방식으로 전환
  - 실제 호출 패턴: `sessions.create -> sessions.send -> agent.wait -> chat.history`
  - 실연동 실패 시 기존 HTTP fallback, 최종 실패 시 시뮬레이션 fallback 유지
- `scripts/detect-openclaw.ts`
  - 탐지 성공 시 `.env` 자동 반영
- `server/agents/openclawDiscovery.ts`
  - 후보 포트 `8002`, `52108` 추가

## 확인 결과
- 탐지 성공:
  - `http://localhost:8000`
  - Aston 런타임 기준 실사용 URL: `http://127.0.0.1:8000`
- 토큰 자동 발견:
  - `~/.openclaw/openclaw.json`
- 인증 방식:
  - Bearer token
- 엔드포인트 패턴:
  - `gateway-rpc`
- 앱 live health:
  - `available=true`
  - `simulationMode=false`
  - `taskEndpoint=gateway:sessions.send`

## smoke test
- 실제 Gateway RPC 작업 수락 확인
- 모델: `github-copilot/gpt-4.1`
- 결과:
  - `agent.wait` 60초 timeout
  - 응답 본문 확보 실패
- 처리:
  - Aston은 실연동 우선
  - timeout 시 시뮬레이션 fallback 유지

## 검증
- `npm run check` 통과
- `npm run build` 통과
- `npm test` 통과: `359 passed, 7 skipped, 2 todo`

## 다음 Phase 후보
- OpenClaw 응답 timeout 원인 분석
- 텔레그램 실요청 1건 end-to-end 재검증
- Browser control 기반 NotebookLM 실작업 smoke

