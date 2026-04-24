# CLAUDE.md

## 프로젝트: 에스턴 워크스테이션 (GoogleTG)
Google Workspace(Gmail, Calendar, Drive, Sheets) + Telegram + AI 통합 앱

## 기술 스택
- 프론트: React + TypeScript + Vite
- 백엔드: Node.js + tRPC
- 상태관리: Redis (FSM 기반 세션)
- AI: Gemini API
- 인증: Google OAuth 2.0
- 메시징: Telegram Bot Webhook + Google Pub/Sub
- DB 대용: Google Sheets API

## 핵심 파일 구조
- server/_core/ : Redis 인스턴스, voiceTranscription 등 코어 유틸
- server/trpc/ : tRPC 라우터 (appRouter, llm.chat 등)
- client/components/UnifiedChatInterface.tsx : 메인 AI 채팅 UI
- .env : 환경변수

## 코딩 규칙
- 기존 UI/라우터를 절대 삭제하지 않는다
- 새 기능은 새 파일/컴포넌트로 추가한다
- 기존 컴포넌트 수정 시 최소한으로, 주석으로 변경 이유 표시
- tRPC 라우터는 server/trpc/routers/에 파일별 분리
- TypeScript strict mode

## Git 운영 규칙
- 중요한 작업을 시작하기 전에는 현재 변경분을 먼저 커밋해 작업 복구 지점을 만든다
- 큰 작업은 단계별로 쪼개서 커밋하고, 검증 결과를 커밋 메시지 또는 작업 보고에 남긴다
- 커밋 전에는 git status로 포함 파일을 확인하고, 사용자 변경분을 임의로 되돌리지 않는다
