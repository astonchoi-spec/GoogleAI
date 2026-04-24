# AGENTS.md

## 프로젝트 개요
에스턴 워크스테이션 (GoogleTG) — Google Workspace + Telegram + AI 통합 앱
사용자가 AI 채팅으로 Gmail, Calendar, Drive, Sheets를 자연어로 제어하고,
Telegram과 양방향 메시징을 하는 앱이다.

## 기술 스택
- 프론트엔드: React + TypeScript + Vite
- 백엔드: Node.js + tRPC
- 상태관리: Redis (FSM 기반 세션 관리)
- AI: Gemini API
- 인증: Google OAuth 2.0
- 메시징: Telegram Bot API (Webhook + Pub/Sub)
- DB 대용: Google Sheets API

## 핵심 파일 구조
- server/_core/ → Redis 인스턴스, voiceTranscription 등 코어 유틸
- server/trpc/ → tRPC 라우터 (appRouter에서 통합)
- client/components/UnifiedChatInterface.tsx → 메인 AI 채팅 UI
- .env → 환경변수 (GOOGLE_CLIENT_ID, TELEGRAM_BOT_TOKEN, GEMINI_API_KEY 등)

## 반드시 지켜야 할 규칙

### 코드 수정 원칙
- 기존 파일을 삭제하거나 기능을 제거하지 않는다
- 기존 컴포넌트를 수정할 때는 최소한의 변경만 한다
- 기존 코드를 수정한 줄에는 // MODIFIED: 이유 주석을 단다
- 새 기능은 반드시 새 파일/컴포넌트로 추가한다

### 백엔드 규칙
- tRPC 라우터는 server/trpc/routers/에 파일별 분리 후 appRouter에 등록
- Redis 인스턴스는 server/_core/redis.ts에서 import (새로 만들지 않는다)
- Google API 인증은 기존 OAuth 플로우를 재사용 (새 인증 로직 만들지 않는다)
- 새 환경변수 추가 시 .env.example에도 반드시 추가
- 모든 tRPC 프로시저 input은 zod로 검증

### 프론트엔드 규칙
- 기존 앱의 다크테마 색상을 따른다 (배경: #0a0e27 계열)
- 기존 컴포넌트가 사용하는 스타일링 방식(Tailwind/CSS Module 등)을 확인하고 동일하게 사용
- 기존 아이콘 라이브러리를 확인하고 동일한 것을 사용
- 새 페이지/컴포넌트 추가 시 기존 라우팅 패턴을 따른다

### 빌드 & 테스트
- 파일 수정 후 TypeScript 빌드 에러가 없는지 확인
- npm run build 또는 해당 빌드 명령이 통과하는지 확인
- strict mode TypeScript

### Git 운영 규칙
- 중요한 작업을 시작하기 전에는 현재 변경분을 먼저 커밋해 작업 복구 지점을 만든다
- 큰 작업은 단계별로 쪼개서 커밋하고, 검증 결과를 커밋 메시지 또는 작업 보고에 남긴다
- 커밋 전에는 git status로 포함 파일을 확인하고, 사용자 변경분을 임의로 되돌리지 않는다

## 현재 네비게이션 구조
상단 탭: 홈 / AI 채팅 / Google Workspace
(추가 예정: 트레이딩 / 부동산PF)
