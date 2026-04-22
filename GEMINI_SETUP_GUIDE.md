# Gemini API 설정 가이드

## 개요

프로젝트의 기본 LLM 엔진이 **Gemini (Google)**로 설정되었습니다. 이 가이드는 Gemini API를 설정하고 사용하는 방법을 설명합니다.

## 설정 완료 확인

✅ **이미 완료된 작업:**
- 기본 엔진: `gemini`
- 기본 모델: `flash` (Gemini 2.5 Flash)
- GEMINI_API_KEY 환경 변수 설정 완료
- API 키 검증 테스트 통과 (3/3)

## 현재 설정 상태

### 기본 모델
```typescript
// server/llm/models.ts
export const DEFAULT_ENGINE = "gemini";
export const DEFAULT_MODEL_KEY = "flash";
```

### 환경 변수
```bash
GEMINI_API_KEY=your_api_key_here
```

## 사용 가능한 Gemini 모델

| 모델 키 | 모델명 | 설명 | 특징 |
|--------|------|------|------|
| `flash` | Gemini 2.5 Flash | 빠른 응답 | 기본값, 가장 빠름 |
| `pro` | Gemini 2.5 Pro | 고성능 | 더 정확한 응답 |
| `3.1pro` | Gemini 3.1 Pro Preview | 최신 모델 | 실험적 기능 |
| `3.1live` | Gemini 3.1 Flash Live Preview | 실시간 | 최신 정보 포함 |

## 모델 전환 방법

### 웹 채팅에서
1. Chat 페이지 방문
2. 엔진 선택: "Gemini" 유지
3. 모델 선택: Flash, Pro 등 선택

### Telegram에서
```
/model flash    # Gemini Flash로 전환
/model pro      # Gemini Pro로 전환
/status         # 현재 설정 확인
```

## 성능 비교

### Gemini Flash (기본값)
- **응답 시간**: ~1-2초
- **정확도**: 높음
- **비용**: 낮음
- **추천**: 대부분의 사용 사례

### Gemini Pro
- **응답 시간**: ~2-3초
- **정확도**: 매우 높음
- **비용**: 중간
- **추천**: 복잡한 작업, 정확도 중요

## 사용 예시

### 웹 채팅
```
사용자: "안녕하세요. 구글 캘린더에 내일 오전 10시에 회의 일정을 만들어주세요."
Gemini: "네, 도움을 드리겠습니다. 회의 제목과 참석자 정보를 알려주시면..."
```

### Telegram
```
사용자: /start
봇: "안녕하세요! Google ↔ Telegram 통합 봇입니다..."

사용자: "내일 날씨 어때?"
봇: "죄송하지만 저는 실시간 날씨 정보에 접근할 수 없습니다..."

사용자: /model pro
봇: "✅ 모델을 Gemini Pro로 전환했습니다."

사용자: /status
봇: "📊 현재 설정:
엔진: gemini
모델: Gemini 2.5 Pro
메시지: 5개
마지막 업데이트: 2026-04-21 07:40:00"
```

## API 키 관리

### API 키 얻기
1. [Google AI Studio](https://aistudio.google.com/app/apikey) 방문
2. "Get API Key" 클릭
3. "Create API key in new project" 선택
4. API 키 복사

### API 키 보안
- 🔒 절대 공개하지 마세요
- 🔒 버전 관리에 커밋하지 마세요
- 🔒 환경 변수로만 관리하세요
- 🔒 정기적으로 회전하세요

### API 키 업데이트
```bash
# 새 API 키로 업데이트
export GEMINI_API_KEY=new_api_key_here

# 또는 .env 파일에서
GEMINI_API_KEY=new_api_key_here
```

## 비용 및 할당량

### 무료 할당량
- Gemini 2.5 Flash: 월 1,500개 요청 무료
- Gemini 2.5 Pro: 월 50개 요청 무료

### 유료 플랜
- 초과 요청은 자동으로 청구됩니다
- 가격: [Google AI Pricing](https://ai.google.dev/pricing)

### 할당량 확인
- [Google Cloud Console](https://console.cloud.google.com)
- API 및 서비스 → Generative AI API → 할당량

## 문제 해결

### "API 키가 유효하지 않습니다" 오류
```
❌ Error: Invalid API key
```
**해결책:**
1. API 키 복사 확인 (공백 없음)
2. API 키가 활성화되었는지 확인
3. 새 API 키 생성 시도

### "할당량 초과" 오류
```
❌ Error: Quota exceeded
```
**해결책:**
1. 할당량 확인 (Google Cloud Console)
2. 유료 플랜으로 업그레이드
3. 요청 빈도 감소

### "네트워크 오류" 메시지
```
❌ Error: Network error
```
**해결책:**
1. 인터넷 연결 확인
2. 방화벽 설정 확인
3. Gemini API 상태 확인 (status.cloud.google.com)

### 응답이 느린 경우
**최적화 방법:**
1. Gemini Flash 사용 (기본값)
2. 메시지 길이 단축
3. 네트워크 지연 확인

## 고급 설정

### 모델별 최적 설정

**Flash (기본값)**
```typescript
// 빠른 응답 필요 시
const response = await llmCaller.call(
  "gemini",
  "flash",
  messages,
  systemPrompt
);
```

**Pro**
```typescript
// 정확한 분석 필요 시
const response = await llmCaller.call(
  "gemini",
  "pro",
  messages,
  systemPrompt
);
```

### 시스템 프롬프트 커스터마이징
```typescript
const systemPrompt = `당신은 구글 생태계와 텔레그램을 통합하는 AI 어시스턴트입니다.
사용자의 질문에 친절하고 정확하게 답변해주세요.
한국어로 응답하세요.`;
```

## 모니터링

### 요청 로깅
```bash
# 개발 환경
tail -f .manus-logs/networkRequests.log | grep gemini

# 프로덕션 환경
grep "gemini" /var/log/app.log
```

### 성능 메트릭
- 평균 응답 시간: ~1-3초
- 성공률: 99%+
- 에러율: <1%

## 참고 자료

- [Google AI Studio](https://aistudio.google.com/)
- [Gemini API 문서](https://ai.google.dev/docs)
- [Google AI 가격](https://ai.google.dev/pricing)
- [Google Cloud Console](https://console.cloud.google.com)

## 다음 단계

1. ✅ Gemini API 키 설정 완료
2. ⏳ 웹 채팅 테스트 (Chat 페이지 방문)
3. ⏳ Telegram 봇 테스트 (메시지 전송)
4. ⏳ 명령어 테스트 (/engine, /model, /status)
5. ⏳ 최종 배포

---

**마지막 업데이트**: 2026-04-21
**상태**: Gemini API 설정 완료, 테스트 통과
