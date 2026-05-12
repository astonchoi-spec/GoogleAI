# CURRENT_TASK — Agent↔RAG 합성: notebook-query 템플릿 재라우팅

> 작성: 2026-05-11 | 담당: Claude Code | 베이스: codex-google-workspace-expansion @ c016525

## 목적
`server/agents/agentTemplates.ts`의 `notebook-query` 템플릿이 현재 OpenClaw 자동화 또는 가짜 시뮬레이션 데이터를 반환한다. NotebookLM 외부 자동화 도입을 보류하기로 결정(2026-05-11)했으므로, 이 템플릿을 **Phase 4-A 로컬 RAG(`searchLocalNotes`)** 로 재라우팅해 회수 자료에서 즉시 답을 찾도록 한다.

## 범위
- `server/agents/agentExecutor.ts` — `runAgent`/`runSimulation`에서 `templateId === "notebook-query"` 분기를 추가해 `searchLocalNotes(question)` 호출 → markdown 변환 → persistResult
- `server/agents/agentTemplates.ts` — notebook-query 템플릿 description/instructions를 로컬 RAG 검색으로 업데이트
- 모듈 경계: `agents/`가 `rag/`를 import — 현재 `_core/`만 공유하는 원칙과 충돌하므로 **`_core/`에 thin proxy 추가**하거나 직접 import 허용 여부 결정 필요

## 자율 결정
- `rag/` 는 도메인 모듈. `agents/` 가 직접 import 하면 모듈 경계 위반. → **`_core/ragProxy.ts`** 신규 추가하여 `_core` 경유 (Modular Monolith 원칙 준수, `_core`는 도메인 간 공유 인프라)
- query는 `task.inputs.question` 만 사용 (target은 hits의 project 필드와 자연 매칭)
- 검색 K=5 (agent 결과는 더 풍부하게)
- hits=0 이면 markdown에 "회수 자료 없음" 안내 + Chrome Extension/Drive Watcher 사용법 안내
- 결과 markdown 포맷:
  ```
  # NotebookLM 질의 결과
  > 질문: {question}
  > 검색 시각: KST timestamp · task {task.id}

  ## 회수 자료 N건 발췌
  ### [1] {project}/{fileName} (score {score})
  {snippet}
  ...
  ```
- OpenClaw 호출은 PF/Trading 템플릿용으로 유지 (notebook-query만 우회)

## 비범위 (이번 작업 X)
- `server/integrations/notebookLmMcp.ts` 데드코드 정리 (4곳 사용처 — 별도 작업)
- 다른 agent 템플릿(PF/Trading) 변경
- `/nb ask` 신규 인텐트 추가
- LLM 호출 추가 (RAG 검색 결과만 반환 — agent는 비동기 큐라 별도 LLM 추론 필요 시 후속 작업)

## 완료 조건
- [ ] `_core/ragProxy.ts` 추가 (`searchLocalNotes` re-export)
- [ ] `agentExecutor.ts` notebook-query 분기 추가
- [ ] `agentTemplates.ts` 템플릿 설명 업데이트
- [ ] 신규 테스트 (notebook-query 분기 hits / no-hits)
- [ ] `npm run check && npm run build` 통과
- [ ] `npm test` 회귀 0 (818+)
- [ ] 모듈 경계 검사 통과
- [ ] CHANGELOG / TODO / HANDOFF 갱신
- [ ] 논리 단위 커밋 + push
