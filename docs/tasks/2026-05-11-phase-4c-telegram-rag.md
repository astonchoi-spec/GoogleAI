# CURRENT_TASK — Phase 4-C: 텔레그램 RAG 적용

> 작성: 2026-05-11 | 담당: Claude Code | 베이스: codex-google-workspace-expansion @ 34e6c85

## 목적
Phase 4-A(웹 채팅 로컬 RAG)와 동일한 검색·인용 절을 텔레그램에도 이식해, 회장님이 텔레그램에서 자연 질의를 던졌을 때 회수 자료(NotebookLM `*.md`)를 인용한 답을 받도록 한다.

## 범위
- `server/llm/telegramBot/messageRouter.ts` 만 수정 (단일 파일)
- 4-A 패턴 그대로:
  1. `routeIntentMessage` 결과의 `confidence < 0.7 + handled` 케이스는 LLM fallback 으로 다운그레이드
  2. LLM fallback(`replyWithLlm`) 내부에서 `searchLocalNotes(message, { k: 3 })` 호출
  3. 결과를 systemPrompt 에 `참고할 회수 자료(N건)` 블록으로 prepend
  4. 응답 본문 뒤에 `formatCitationFooter(hits)` append → 텔레그램으로 전송

## 비범위 (이번 작업 X)
- Vertex AI Search (Phase 4-B)
- chunk-level/embedding (Phase 4-D)
- `handleWorkspaceCommand` 경로 변경 (Telegram 전용 액션은 그대로)
- `data` payload 포맷 변경

## 완료 조건
- [ ] `server/llm/telegramBot/messageRouter.ts` 수정 (confidence 가드 + RAG 주입 + 인용 절)
- [ ] 약한 인텐트 매칭(<0.7) 다운그레이드 로직 동작
- [ ] `npm run check && npm run build` 통과
- [ ] `npm test` 회귀 0 (799+)
- [ ] CHANGELOG/TODO/HANDOFF 갱신
- [ ] 논리 단위 커밋 + push

## 자율 결정
- `INTENT_CONFIDENCE_THRESHOLD = 0.7` (4-A 동일)
- chat 도메인은 이미 LLM 으로 fallthrough — 그 경로에 RAG 삽입
- 회수 자료가 없으면(`hits=0`) systemPrompt 변경 없음 + 인용 절 없음 (4-A 동일)
- 인용 절은 텔레그램 1메시지 내 append (별도 메시지 분리 X)
