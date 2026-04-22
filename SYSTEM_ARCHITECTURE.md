# 시스템 아키텍처 문서

## 전체 시스템 개요

구글 생태계 + 텔레그램 양방향 통합 플랫폼은 다음과 같은 컴포넌트로 구성됩니다:

```
┌─────────────────────────────────────────────────────────────────┐
│                     사용자 인터페이스                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐          ┌──────────────────────┐     │
│  │   웹 프론트엔드       │          │   Telegram Bot       │     │
│  │  (React + Tailwind)  │          │  (Telegraf)          │     │
│  └──────────────────────┘          └──────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
           │                                    │
           │ tRPC                               │ Webhook
           ↓                                    ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Express 백엔드 서버                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  tRPC 라우터                                              │   │
│  │  ├─ llm.chat (채팅)                                      │   │
│  │  ├─ llm.switchEngine (엔진 전환)                         │   │
│  │  ├─ llm.switchModel (모델 전환)                          │   │
│  │  ├─ llm.getStatus (상태 조회)                            │   │
│  │  ├─ google.gmail (Gmail 작업)                            │   │
│  │  ├─ google.calendar (Calendar 작업)                      │   │
│  │  ├─ google.drive (Drive 작업)                            │   │
│  │  └─ google.sheets (Sheets 작업)                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Webhook 핸들러                                           │   │
│  │  ├─ /api/webhooks/telegram (Telegram)                    │   │
│  │  └─ /api/webhooks/google/callback (Google OAuth)         │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
           │                    │                    │
           ↓                    ↓                    ↓
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   LLM Caller     │  │  Session Manager │  │  Google Auth     │
│                  │  │  (Redis)         │  │  Manager         │
│ ├─ Gemma4        │  │                  │  │                  │
│ │ (Ollama)       │  │ ├─ User Sessions │  │ ├─ OAuth2Client  │
│ ├─ Gemini        │  │ ├─ Conversation  │  │ ├─ Token Storage │
│ │ (Google API)   │  │ │   History      │  │ └─ Scopes        │
│ ├─ Codex         │  │ └─ Google Tokens │  │                  │
│ │ (OpenAI API)   │  │                  │  │                  │
│ └─ Claude        │  │                  │  │                  │
│   (Anthropic)    │  │                  │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
           │                    │                    │
           ↓                    ↓                    ↓
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  LLM 서버        │  │  Redis Server    │  │  Google APIs     │
│                  │  │                  │  │                  │
│ ├─ Ollama        │  │ ├─ Session 저장  │  │ ├─ Gmail API     │
│ ├─ Gemini API    │  │ ├─ 대화 기록     │  │ ├─ Calendar API  │
│ ├─ OpenAI API    │  │ └─ 토큰 저장     │  │ ├─ Drive API     │
│ └─ Anthropic API │  │                  │  │ └─ Sheets API    │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

## 주요 컴포넌트 상세

### 1. 프론트엔드 (React + TypeScript)

**위치**: `/client/src`

**주요 페이지**:
- `Home.tsx` - 랜딩 페이지 (프로젝트 설명)
- `Chat.tsx` - AI 채팅 인터페이스

**주요 컴포넌트**:
- `ChatInterface.tsx` - 채팅 UI (메시지 입력, 엔진/모델 선택)
- `Sidebar.tsx` - 네비게이션 사이드바
- `HeroSection.tsx` - Hero 섹션
- `ArchitectureSection.tsx` - 아키텍처 설명
- 기타 섹션 컴포넌트들

**스타일링**: Tailwind CSS 4 + shadcn/ui

### 2. 백엔드 (Express + tRPC)

**위치**: `/server`

**주요 구조**:
```
server/
├─ _core/
│  ├─ index.ts (메인 서버 진입점)
│  ├─ trpc.ts (tRPC 설정)
│  ├─ context.ts (tRPC 컨텍스트)
│  ├─ oauth.ts (OAuth 라우트)
│  └─ storageProxy.ts (S3 프록시)
├─ routers/
│  ├─ routers.ts (메인 라우터)
│  ├─ llm.ts (LLM 라우터)
│  └─ google-workspace.ts (Google API 라우터)
├─ webhooks/
│  ├─ telegram.ts (Telegram Webhook)
│  └─ google-callback.ts (Google OAuth Callback)
├─ llm/
│  ├─ models.ts (모델 레지스트리)
│  ├─ caller.ts (LLM 호출 인터페이스)
│  ├─ session.ts (Redis 세션 관리)
│  └─ telegram-bot.ts (Telegram Bot)
└─ google/
   ├─ auth.ts (Google OAuth 관리)
   ├─ gmail.ts (Gmail 커넥터)
   ├─ calendar.ts (Calendar 커넥터)
   ├─ drive.ts (Drive 커넥터)
   └─ sheets.ts (Sheets 커넥터)
```

### 3. LLM 엔진 (멀티 모델 지원)

**Gemma4 (로컬)**
- 엔진: Ollama
- 모델: gemma4:e2b, gemma4:e4b, gemma4:26b, gemma4:31b
- 특징: 로컬 실행, 개인정보 보호, 빠른 응답

**Gemini (Google)**
- API: Google Generative AI SDK
- 모델: gemini-2.5-flash, gemini-2.5-pro, gemini-3.1-pro-preview, gemini-3.1-flash-live-preview
- 특징: 최신 모델, 멀티모달 지원

**Codex (OpenAI)**
- API: OpenAI Chat Completions
- 모델: gpt-5.4, gpt-5.4-mini, gpt-5.3-codex, gpt-5.3-codex-spark
- 특징: 코드 생성 능력, 고성능

**Claude (Anthropic)**
- API: Anthropic Messages API
- 모델: claude-sonnet-4, claude-opus-4-5, claude-opus-4-6
- 특징: 긴 컨텍스트, 정확한 분석

### 4. 데이터 저장소

**Redis (세션 및 대화 기록)**
- 사용자별 세션 저장
- 대화 기록 (최대 50개 메시지)
- Google OAuth 토큰 저장
- TTL: 24시간

**MySQL/TiDB (사용자 데이터)**
- 사용자 계정 정보
- 사용자 역할 (admin/user)
- 로그인 기록

### 5. Google Workspace 통합

**Gmail API**
- 이메일 송수신
- 이메일 검색
- 이메일 삭제
- 라벨 관리

**Calendar API**
- 일정 조회
- 일정 생성/수정/삭제
- 참석자 관리

**Drive API**
- 파일 검색
- 파일 업로드/다운로드
- 폴더 생성
- 파일 공유

**Sheets API**
- 스프레드시트 읽기/쓰기
- 데이터 추가
- 스프레드시트 생성

## 데이터 흐름

### 웹 채팅 흐름

```
1. 사용자가 웹에서 메시지 입력
   ↓
2. ChatInterface에서 trpc.llm.chat 호출
   ↓
3. 백엔드 llm.chat 뮤테이션 실행
   ├─ 사용자 메시지를 Redis에 저장
   ├─ 최근 10개 메시지 조회
   ├─ 선택된 LLM 엔진으로 호출
   └─ 응답을 Redis에 저장
   ↓
4. 응답을 프론트엔드로 반환
   ↓
5. ChatInterface에서 응답 표시
```

### Telegram 메시지 흐름

```
1. 사용자가 Telegram에서 메시지 전송
   ↓
2. Telegram Bot API → Webhook (POST /api/webhooks/telegram)
   ↓
3. Telegram Bot Handler 실행
   ├─ 명령어 확인 (/engine, /model, /use, /status, /clear)
   ├─ 명령어면 해당 처리
   └─ 일반 메시지면 LLM 호출
   ↓
4. LLM 호출 (명령어가 아닌 경우)
   ├─ 사용자 메시지를 Redis에 저장
   ├─ 최근 10개 메시지 조회
   ├─ 선택된 LLM 엔진으로 호출
   └─ 응답을 Redis에 저장
   ↓
5. Telegram Bot API를 통해 응답 전송
   ↓
6. 사용자가 Telegram에서 응답 수신
```

### Google Workspace 작업 흐름

```
1. 사용자가 웹에서 Google 작업 요청
   ↓
2. trpc.google.* 호출
   ↓
3. Google Auth Manager에서 사용자 토큰 조회
   ├─ 토큰 유효성 확인
   └─ 필요시 토큰 갱신
   ↓
4. 해당 Google API 커넥터 실행
   ├─ Gmail: 이메일 송수신
   ├─ Calendar: 일정 관리
   ├─ Drive: 파일 관리
   └─ Sheets: 스프레드시트 관리
   ↓
5. 결과를 프론트엔드로 반환
```

## 인증 및 보안

### Manus OAuth
- 사용자 로그인/로그아웃
- 세션 쿠키 관리
- 역할 기반 접근 제어 (RBAC)

### Google OAuth 2.0
- 사용자 동의 기반 인증
- 토큰 저장 (Redis)
- 토큰 자동 갱신
- 스코프 관리

### API 보안
- tRPC 타입 안전성
- 입력 검증 (Zod)
- 에러 핸들링
- 레이트 리미팅 (선택사항)

## 성능 최적화

### 캐싱
- Redis 세션 캐싱 (24시간 TTL)
- 대화 기록 캐싱 (메모리)

### 비동기 처리
- 모든 I/O 작업 비동기화
- 병렬 처리 (Promise.all)

### 데이터베이스
- 연결 풀링
- 쿼리 최적화
- 인덱싱

## 배포 구조

### 개발 환경
```
localhost:3000
├─ 프론트엔드 (Vite HMR)
├─ 백엔드 (Express)
├─ Redis (localhost:6379)
└─ Ollama (localhost:11434)
```

### 프로덕션 환경
```
your-domain.com
├─ 프론트엔드 (정적 파일)
├─ 백엔드 (Express)
├─ Redis (클라우드)
├─ 데이터베이스 (MySQL/TiDB)
└─ LLM 서버 (클라우드)
```

## 모니터링 및 로깅

### 로그 위치
- 개발: 콘솔 출력
- 프로덕션: `.manus-logs/` 디렉토리

### 주요 로그 파일
- `devserver.log` - 서버 시작 및 에러
- `browserConsole.log` - 클라이언트 콘솔
- `networkRequests.log` - HTTP 요청
- `sessionReplay.log` - 사용자 상호작용

## 확장성

### 새로운 LLM 엔진 추가
1. `server/llm/models.ts`에 모델 정의
2. `server/llm/caller.ts`에 호출 메서드 추가
3. 환경 변수 설정

### 새로운 Google API 추가
1. `server/google/` 디렉토리에 커넥터 생성
2. `server/routers/google-workspace.ts`에 라우터 추가
3. 필요한 OAuth 스코프 추가

### 새로운 Telegram 명령어 추가
1. `server/llm/telegram-bot.ts`의 `setupCommands()` 메서드에 추가
2. 명령어 로직 구현
3. 도움말 업데이트

## 참고 자료

- [Express 문서](https://expressjs.com/)
- [tRPC 문서](https://trpc.io/)
- [Telegraf 문서](https://telegraf.dev/)
- [Google APIs 문서](https://developers.google.com/apis)
- [Redis 문서](https://redis.io/)
- [Tailwind CSS 문서](https://tailwindcss.com/)
