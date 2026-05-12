# 2026-05-02 OpenClaw 재탐지 + Aston Gemini API 재사용

## 범위
- OpenClaw 재탐지와 설정 파일 스캔 보강
- Aston `GEMINI_API_KEY` 재사용 경로 보강
- OpenClaw smoke 결과 저장
- Agent Health / Telegram / `/agents` 상태 표시 보강
- NotebookLM `notebook-query` 템플릿 지시 보강

## 구현 요약
- `scripts/detect-openclaw.ts`
  - discovery JSON에 `candidates`, `configFiles`, `modelHint` 저장
- `scripts/smoke-openclaw.ts`
  - `1+1은?`, `한남동 부동산 시세를 한 줄로 요약해줘` smoke 실행
  - 결과를 `data/openclaw-smoke.json`에 저장
- `server/agents/openclawRuntime.ts`
  - `.openclaw/openclaw.json`, `.openclaw/config.json` 존재 여부 기록
  - `GEMINI_API_KEY` 우선, `GOOGLE_API_KEY` fallback 확인
- `server/agents/openclawClient.ts`
  - stale `OPENCLAW_API_URL` 실패 시 자동 재탐지 재시도
  - OpenClaw HTTP 호출 payload에만 `providerApiKey`로 Aston Gemini 키 메모리 전달
  - 로그/JSON/UI/텔레그램에 키 값 저장 금지
- `server/agents/agentHealth.ts`
  - `/api/agents/health`용 flattened 상태 스냅샷 생성
- `server/intent/handlers/agents.ts`, `server/routers/agents.ts`, `client/src/pages/AgentControl.tsx`
  - OpenClaw 상태, Gemini 상태, 권한 단계, smoke 상태 노출
- `server/agents/agentTemplates.ts`
  - `notebook-query`에 NotebookLM URL, `dealStore.getDeal(dealName)`, `notebookUrl` 미연결 안내, 출처 기록, Aston Wiki 저장 지시 추가

## 자율 결정 메모
- OpenClaw 모델 키 전달은 새 설정 체계를 만들지 않고 Aston의 기존 `GEMINI_API_KEY`를 HTTP payload의 `providerApiKey`로만 메모리 재사용하도록 결정
- stale 수동 URL이 자동 탐지를 막지 않도록, `OPENCLAW_AUTO_DETECT`가 켜져 있으면 인증 실패 후 재탐지를 다시 시도하도록 결정
- 설정 파일 점검은 보안상 “존재 여부 + 모델 힌트”만 기록하고 토큰 문자열은 어디에도 저장하지 않도록 결정

## 실제 결과
- discovery
  - `detected=true`
  - `url=http://openclaw.local`
  - `modelHint=gpt-4`
  - `C:\Users\user\.openclaw\openclaw.json` 존재
- smoke
  - `available=false`
  - `status=skipped`
  - `errorReason=OpenClaw health 인증 확인 실패`

## 검증
- `npm run check`
- `npm test` → `365 passed, 7 skipped, 2 todo`
- `npm run build`

## 후속 과제
- `OPENCLAW_API_URL=http://openclaw.local` 실제 유효성 확인
- OpenClaw gateway/HTTP 인증 방식 재확인
- 실제 연결 성공 후 smoke 재실행
