# _core 모듈

도메인 공통 인프라, 공통 타입, 서버 부팅, tRPC, Redis, LLM Adapter를 담는 공유 코어 모듈이다.

## 책임

- Express/tRPC 서버 부팅과 공통 미들웨어를 관리한다.
- Redis, LLM Adapter, 공통 환경 변수, 알림, OAuth, storage proxy를 제공한다.
- 여러 도메인이 함께 써야 하는 타입/유틸/소스 어댑터를 둔다.

## 비책임

- 특정 도메인 비즈니스 로직을 새로 구현하지 않는다.
- 도메인 간 직접 결합을 우회하기 위한 임시 import 허브로 사용하지 않는다.
- Telegram 명령 라우팅은 `server/intent/` 책임이다.

## 데이터 경로

| 환경 변수 | 용도 |
|---|---|
| `REDIS_URL` | Redis 연결 |
| `GEMINI_API_KEY` | LLM Adapter |
| 서버/OAuth 관련 환경 변수 | 부팅, 인증, 공통 인프라 |

## 외부 API 의존성

- Redis
- Gemini/OpenAI 등 LLM Provider
- Express/tRPC
- 공통 브리핑 소스에서 사용하는 public API

## 텔레그램 명령 목록

- 직접 Telegram 명령을 소유하지 않는다.

## 다른 모듈과의 관계

- 모든 도메인 모듈이 `_core`를 import할 수 있다.
- `_core`에 공통 타입/유틸을 둘 때는 둘 이상의 모듈이 실제로 공유하는 경우로 제한한다.
- 도메인 로직이 커지면 `_core`가 아니라 해당 도메인 모듈로 이동한다.

## 주요 파일 목록과 라인 수

| 파일 | 라인 수 | 설명 |
|---|---:|---|
| `apiUsage.ts` | 169 | API 사용량 추적 |
| `briefingSources.ts` | 371 | 브리핑 공통 데이터 소스 |
| `context.ts` | 28 | tRPC context |
| `cookies.ts` | 50 | 쿠키 옵션 |
| `dataApi.ts` | 64 | 공통 데이터 API |
| `deployment.ts` | 98 | 배포 가드 |
| `encryption.ts` | 88 | 암복호화 |
| `env.ts` | 7 | 환경 변수 헬퍼 |
| `imageGeneration.ts` | 92 | 이미지 생성 저장 |
| `index.ts` | 113 | 서버 진입점 |
| `intentRouter.ts` | 702 | 기존 통합 intent router |
| `llm.ts` | 19 | LLM caller bridge |
| `llmAdapter.ts` | 248 | LLM Adapter |
| `map.ts` | 319 | 지도 유틸 |
| `notification.ts` | 114 | 공통 알림 |
| `oauth.ts` | 42 | OAuth route |
| `redis.ts` | 193 | Redis 싱글턴 |
| `sdk.ts` | 117 | 인증 SDK |
| `storageProxy.ts` | 48 | storage proxy |
| `systemRouter.ts` | 26 | system tRPC router |
| `trpc.ts` | 91 | tRPC core |
| `vite.ts` | 76 | Vite dev server |
| `voiceTranscription.ts` | 284 | 음성 전사 |
| `types/cookie.d.ts` | 6 | cookie 타입 보강 |
| `types/manusTypes.ts` | 69 | Manus 타입 |

## 신규 기능 판단 기록

- 둘 이상의 도메인이 공유하는 순수 타입/유틸/인프라만 `_core`에 둔다.
- 특정 도메인 책임이 명확하면 해당 도메인 README에 기록하고 그 모듈에 구현한다.
