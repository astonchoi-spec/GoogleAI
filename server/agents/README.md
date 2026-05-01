# server/agents

Aston Workstation의 Agent Control 모듈. OpenClaw 또는 향후 LLM 기반 분석 에이전트가 이 모듈을 통해 호출된다.

## 책임
- 작업 큐 관리 (인메모리, 최대 50개, 동시 1건)
- 템플릿 정의 및 시뮬레이션 결과 생성
- 결과를 `AGENT_WIKI_PATH`에 마크다운으로 저장
- 권한 단계(1=read, 2=실행, 3=자동) 검사

## 비책임
- OpenClaw HTTP 호출 (다음 Phase)
- 텔레그램 메시지 직접 발송 — `setAgentNotifier`로 외부 주입
- 인텐트 파싱 — `server/intent/handlers/agents.ts`에서 처리

## 데이터 경로
- 결과 저장: `AGENT_WIKI_PATH` (기본: `G:\Aston-Wiki\agents`)

## 환경 변수
- `OPENCLAW_API_URL` — 비어 있으면 시뮬레이션 모드
- `OPENCLAW_API_KEY`
- `AGENT_PERMISSION_LEVEL` — 1, 2, 3 (기본 1)
- `AGENT_WIKI_PATH`

## 의존성
- 표준 라이브러리(fs, path, crypto)만 사용
- 다른 도메인 모듈 직접 import 금지
