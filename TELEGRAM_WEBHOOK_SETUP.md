# Telegram 봇 Webhook 설정 가이드

## 현재 상태
- ✅ Telegram 봇 토큰 설정됨
- ✅ LLM 엔진 (Gemini) 설정됨
- ✅ axios timeout 30초 설정됨
- ✅ Gemma4 실패 시 Gemini 자동 폴백 설정됨
- ⏳ Webhook 설정 필요

## Webhook 설정 방법

### 1. 웹훅 정보 확인
```bash
curl https://3000-iv3dfus69o6p86md7zo4e-2135bb3d.sg1.manus.computer/api/webhooks/telegram/webhook-info
```

응답 예시:
```json
{
  "url": "",
  "has_custom_certificate": false,
  "pending_update_count": 0,
  "ip_address": "...",
  "last_error_date": 0,
  "last_error_message": "",
  "last_synchronization_error_date": 0,
  "max_connections": 40,
  "allowed_updates": []
}
```

### 2. Webhook 설정
```bash
curl -X POST https://3000-iv3dfus69o6p86md7zo4e-2135bb3d.sg1.manus.computer/api/webhooks/telegram/set-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "webhookUrl": "https://3000-iv3dfus69o6p86md7zo4e-2135bb3d.sg1.manus.computer/api/webhooks/telegram"
  }'
```

응답:
```json
{
  "ok": true,
  "message": "Webhook set to https://3000-iv3dfus69o6p86md7zo4e-2135bb3d.sg1.manus.computer/api/webhooks/telegram"
}
```

### 3. 다시 확인
```bash
curl https://3000-iv3dfus69o6p86md7zo4e-2135bb3d.sg1.manus.computer/api/webhooks/telegram/webhook-info
```

`"url"` 필드가 설정된 URL로 표시되면 성공입니다.

## 테스트

### 1. 웹 채팅 테스트
- Chat 페이지에서 메시지 입력
- Gemini 응답 확인

### 2. Telegram 봇 테스트
- Telegram에서 봇에 메시지 전송
- `/status` 명령어로 현재 설정 확인
- `/model pro` 명령어로 모델 전환 테스트

## 문제 해결

### 메시지가 여전히 안 가는 경우

1. **Webhook 상태 확인**
```bash
curl https://3000-iv3dfus69o6p86md7zo4e-2135bb3d.sg1.manus.computer/api/webhooks/telegram/webhook-info
```

2. **서버 로그 확인**
- 개발 서버 로그에서 "Telegram bot starting" 메시지 확인
- 메시지 수신 시 로그 확인

3. **LLM 응답 확인**
- 웹 채팅에서 먼저 테스트
- 웹 채팅이 작동하면 Telegram도 작동해야 함

### Timeout 에러
- 30초 이상 걸리는 요청은 timeout됨
- 네트워크 상태 확인
- API 키 설정 확인

## 아키텍처

```
Telegram 사용자
    ↓
Telegram Bot API
    ↓
Webhook: /api/webhooks/telegram
    ↓
TelegramBot 클래스
    ↓
LLMCaller (Gemini)
    ↓
응답 → Telegram 사용자
```

## 환경 변수

- `TELEGRAM_BOT_TOKEN`: Telegram Bot 토큰 (필수)
- `GEMINI_API_KEY`: Google Gemini API 키 (필수)
- `OLLAMA_HOST`: Ollama 서버 주소 (선택, 기본: http://localhost:11434)

## 주요 기능

### 명령어
- `/start` - 환영 메시지
- `/status` - 현재 설정 확인
- `/engine <엔진>` - 엔진 전환 (gemini, codex, claude)
- `/model <모델키>` - 모델 전환
- `/use <엔진> <모델키>` - 한번에 전환
- `/clear` - 대화 기록 초기화

### 자동 기능
- 메시지 자동 응답 (선택된 LLM 사용)
- 대화 기록 자동 저장
- Gemma4 실패 시 Gemini로 자동 폴백
- 30초 타임아웃 자동 처리
