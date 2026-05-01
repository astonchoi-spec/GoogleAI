# 2026-05-01 OpenClaw 자동 탐지 및 연동

## 상태
- 완료
- 탐지 결과: 미탐지
- 운영 모드: 시뮬레이션 폴백 유지

## 구현
- `scripts/detect-openclaw.ts`
  - localhost, 127.0.0.1, host.docker.internal 대상 포트 후보 스캔
  - `/health`, `/api/health`, `/v1/health`, `/` 확인
  - Docker `openclaw` 컨테이너 포트 파싱 지원
  - 결과를 `data/openclaw-discovery.json`에 저장
- `server/agents/openclawDiscovery.ts`
  - 자동 탐지 공통 로직
  - Docker 미설치/미실행은 실패가 아니라 미탐지로 처리
- `server/agents/openclawClient.ts`
  - 탐지 결과 또는 환경변수 fallback 로드
  - 인증 방식 자동 감지: none -> bearer -> x-api-key
  - 실행 엔드포인트 추론: `/api/tasks`, `/v1/run`, `/execute`
  - 표준 `{ prompt, model, tools }` payload 후 OpenAI-compatible payload fallback
  - 응답 키 `result`, `output`, `content`, `text`, `choices[].message.content` 파싱
  - 실패 시 시뮬레이션 결과로 fallback
- Agent Queue
  - `awaiting_approval`, `rejected` 상태 추가
  - 권한 2단계에서 실행 전 텔레그램 승인 요청
  - 5분 미응답 시 자동 거부
  - 콜백: `agent_approve:<task_id>`, `agent_reject:<task_id>`
- NotebookLM
  - `notebook-query` 템플릿은 `_deal.json`의 `notebookUrl`을 파일 시스템 경로로 직접 조회
  - OpenClaw 지시에 NotebookLM 접속, 노트북 이동, 질문 입력, 응답 추출 절차 포함
- API/UI
  - `GET /api/agents/health` 추가
  - `/agents` 상단에 OpenClaw 상태, 큐 상태, 인증 방식 표시

## 탐지 결과
- `npx tsx scripts/detect-openclaw.ts`
- 결과: OpenClaw 미탐지
- 사유: 후보 포트와 Docker 컨테이너에서 OpenClaw 식별 응답 없음
- Docker: `docker` CLI 미탐지 (`spawn docker ENOENT`)
- 저장: `data/openclaw-discovery.json`

## 검증
- `npm run check` 통과
- `npm run build` 통과
- `npm test` 통과: 330 passed, 7 skipped, 2 todo
- 신규/보강 테스트:
  - `detect-openclaw.test.ts` 4개
  - `openclawClient.test.ts` 6개
  - `permissionGate.test.ts` 보강 3개
  - `agentQueue.test.ts` 보강 3개
  - `agentExecutor.test.ts` 보강 1개
- 모듈 경계 위반: 0건
- 신규/수정 핵심 파일은 500줄 이하

## 자율 결정
- Health 응답은 `openclaw` 문자열 또는 health endpoint의 일반적인 OK JSON을 허용했다.
- 실제 실행 실패는 작업 실패가 아니라 `⚠️` 표시가 붙은 시뮬레이션 결과로 성공 처리한다.
- 권한 기본값은 2단계로 변경했다. UI 실행도 텔레그램 승인이 있어야 실제 큐 실행으로 넘어간다.
- Docker CLI 부재는 오류가 아니라 미탐지 근거로 기록한다.

## 다음 단계
- OpenClaw가 실제로 실행 중인 상태에서 서버 재시작 또는 탐지 스크립트 재실행
- 모닝브리핑에 전일 에이전트 결과 통합
- Phase 1c MTProto 수집기
- PF Google Sheets 동기화
