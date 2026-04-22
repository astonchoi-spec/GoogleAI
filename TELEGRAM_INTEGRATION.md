# Telegram Bot 통합 가이드

## 개요

이 프로젝트는 Telegram Bot을 통해 멀티 모델 LLM 엔진(Gemma4, Gemini, Codex, Claude)과 Google Workspace API를 통합합니다. 사용자가 Telegram에서 메시지를 보내면 선택된 LLM이 응답합니다.

## 아키텍처

```
Telegram User
    ↓ (메시지 전송)
Telegram Bot API
    ↓ (Webhook)
Express Server (/api/webhooks/telegram)
    ↓
Telegram Bot Handler
    ↓
Session Manager (Redis)
    ↓
LLM Caller (Gemma4/Gemini/Codex/Claude)
    ↓
LLM Response
    ↓
Telegram User (응답 표시)
```

## 설정

### 1. Telegram Bot 토큰 획득

1. Telegram에서 [@BotFather](https://t.me/botfather)와 대화
2. `/newbot` 명령어 실행
3. 봇 이름과 사용자명 입력
4. 받은 토큰을 복사

### 2. 환경 변수 설정

`.env` 파일에 다음을 추가:

```bash
TELEGRAM_BOT_TOKEN=your_bot_token_here
WEBHOOK_BASE_URL=https://your-domain.com
REDIS_URL=redis://localhost:6379
OLLAMA_HOST=http://localhost:11434
```

### 3. Webhook 설정

서버가 시작되면 자동으로 Telegram Bot이 초기화됩니다. Webhook을 수동으로 설정하려면:

```bash
curl -X POST http://localhost:3000/api/webhooks/telegram/set-webhook \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl":"https://your-domain.com/api/webhooks/telegram"}'
```

## 사용 가능한 명령어

### /start
봇 소개 및 사용 가능한 명령어 표시

### /engine <엔진이름>
LLM 엔진 전환
- `gemma4` - Gemma4 (로컬, 기본값)
- `gemini` - Google Gemini
- `codex` - OpenAI GPT (Codex)
- `claude` - Anthropic Claude

예: `/engine gemini`

### /model <모델키>
현재 엔진 내에서 모델 전환

**Gemma4 모델:**
- `e2b` - Gemma 2B
- `e4b` - Gemma 4B (기본값)
- `26b` - Gemma 26B
- `31b` - Gemma 31B

**Gemini 모델:**
- `flash` - Gemini 2.5 Flash
- `pro` - Gemini 2.5 Pro
- `3.1pro` - Gemini 3.1 Pro Preview
- `3.1live` - Gemini 3.1 Flash Live Preview

**Codex 모델:**
- `5.4` - GPT 5.4
- `mini` - GPT 5.4 Mini
- `codex` - GPT 5.3 Codex
- `spark` - GPT 5.3 Codex Spark

**Claude 모델:**
- `sonnet` - Claude Sonnet 4
- `opus45` - Claude Opus 4.5
- `opus` - Claude Opus 4.6

예: `/model flash`

### /use <엔진> <모델키>
엔진과 모델을 동시에 전환

예: `/use gemini flash`

### /status
현재 설정 확인
- 현재 엔진
- 현재 모델
- 대화 기록 메시지 수
- 마지막 업데이트 시간

### /clear
대화 기록 초기화

## 메시지 처리 흐름

### 1. 메시지 수신
사용자가 Telegram에서 메시지 전송 → Webhook으로 서버 수신

### 2. 세션 조회
Redis에서 사용자의 세션 정보 조회 (엔진, 모델, 대화 기록)

### 3. 메시지 저장
사용자 메시지를 Redis의 대화 기록에 추가

### 4. LLM 호출
선택된 엔진과 모델로 LLM 호출
- 최근 10개 메시지 히스토리 포함
- 시스템 프롬프트: "당신은 구글 생태계와 텔레그램을 통합하는 AI 어시스턴트입니다..."

### 5. 응답 저장
LLM 응답을 Redis의 대화 기록에 추가

### 6. 응답 전송
Telegram을 통해 사용자에게 응답 전송

## API 엔드포인트

### POST /api/webhooks/telegram
Telegram Webhook 엔드포인트

### GET /api/webhooks/telegram/health
봇 상태 확인
```json
{
  "status": "ok",
  "botRunning": true,
  "timestamp": "2026-04-21T07:00:00.000Z"
}
```

### POST /api/webhooks/telegram/set-webhook
Webhook URL 설정
```json
{
  "webhookUrl": "https://your-domain.com/api/webhooks/telegram"
}
```

### GET /api/webhooks/telegram/webhook-info
Webhook 정보 조회

## 세션 관리

사용자별 세션은 Redis에 저장됩니다:

```typescript
interface UserSession {
  userId: string;
  engine: LLMEngine;
  modelKey: string;
  conversationHistory: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: number;
  }>;
  lastUpdated: number;
}
```

- **TTL**: 24시간
- **최대 메시지**: 50개 (초과 시 오래된 메시지 삭제)
- **자동 정리**: 24시간 후 자동 삭제

## 에러 처리

### Redis 연결 실패
```
❌ 세션 오류
```
Redis 서버 확인 필요

### LLM 호출 실패
```
❌ 오류가 발생했습니다: [에러 메시지]
```
- LLM 서버 상태 확인
- API 키 확인
- 네트워크 연결 확인

### 알 수 없는 엔진/모델
```
❌ 알 수 없는 엔진: xxx
❌ 모델을 찾을 수 없습니다: xxx
```
`/status` 명령어로 사용 가능한 엔진/모델 확인

## 로컬 테스트

### 1. Redis 시작
```bash
redis-server
```

### 2. Ollama 시작 (Gemma4 사용 시)
```bash
ollama serve
ollama pull gemma4:e4b
```

### 3. 서버 시작
```bash
cd /home/ubuntu/google-tg-app-design
pnpm dev
```

### 4. Telegram 봇 테스트
1. Telegram에서 봇 검색
2. `/start` 명령어 실행
3. 메시지 전송하여 응답 확인

## 프로덕션 배포

### 1. 환경 변수 설정
```bash
export TELEGRAM_BOT_TOKEN=your_token
export WEBHOOK_BASE_URL=https://your-domain.com
export REDIS_URL=redis://redis-host:6379
export OLLAMA_HOST=http://ollama-host:11434
```

### 2. Webhook URL 설정
```bash
curl -X POST https://your-domain.com/api/webhooks/telegram/set-webhook \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl":"https://your-domain.com/api/webhooks/telegram"}'
```

### 3. 모니터링
```bash
curl https://your-domain.com/api/webhooks/telegram/health
```

## 문제 해결

### 봇이 응답하지 않음
1. `/api/webhooks/telegram/health` 확인
2. Redis 연결 확인
3. LLM 서버 상태 확인
4. 서버 로그 확인

### 메시지 처리 지연
- LLM 응답 시간 확인
- 네트워크 지연 확인
- LLM 서버 부하 확인

### 메모리 누수
- Redis TTL 설정 확인 (24시간)
- 대화 기록 최대 50개 유지 확인
- 서버 메모리 모니터링

## 참고

- [Telegraf 문서](https://telegraf.dev/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Redis 문서](https://redis.io/documentation)
