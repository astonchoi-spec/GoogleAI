import type { AgentTemplate } from "./agentTypes.ts";

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "pf-comprehensive",
    label: "PF 종합 분석",
    description: "사업지의 시장, 법무, 자금 구조를 종합 평가합니다.",
    category: "pf",
    inputs: [
      { key: "target", label: "딜명 또는 주소", required: true, placeholder: "예: 한남동 44" },
      { key: "scope", label: "추가 분석 항목", required: false, placeholder: "예: 비교 사업지, 자금 조달안" },
    ],
  },
  {
    id: "pf-version-compare",
    label: "PF 버전 비교",
    description: "같은 사업지의 버전 간 변경점을 정리합니다.",
    category: "pf",
    inputs: [
      { key: "target", label: "딜명", required: true, placeholder: "예: 용인 신대지구" },
      { key: "versionA", label: "버전 A", required: true, placeholder: "예: 2026-04 초안" },
      { key: "versionB", label: "버전 B", required: true, placeholder: "예: 2026-05 수정안" },
    ],
  },
  {
    id: "pf-legal-risk",
    label: "PF 법무 리스크 점검",
    description: "계약과 법무 검토 자료에서 주요 리스크를 추출합니다.",
    category: "pf",
    inputs: [{ key: "target", label: "딜명", required: true, placeholder: "예: 반포 재건축" }],
  },
  {
    id: "trading-decision",
    label: "트레이딩 의사결정",
    description: "현재 시세와 리스크 가드 상태를 종합해 진입/청산 검토 리포트를 작성합니다.",
    category: "trading",
    inputs: [
      { key: "target", label: "종목", required: true, placeholder: "예: BTC, ETH" },
      { key: "side", label: "방향", required: false, placeholder: "long / short" },
    ],
  },
  {
    id: "notebook-query",
    label: "NotebookLM 회수 자료 검색",
    description:
      "로컬에 회수된 NotebookLM 답변 자료에서 질문 관련 발췌를 찾습니다 (Phase 4-A 로컬 RAG).",
    category: "research",
    instructions: [
      "외부 NotebookLM 자동화는 사용하지 않는다(2026-05-11 결정).",
      "server/rag/localMdSearch.ts 를 _core/ragProxy 경유로 호출해 projects/*/notebooklm/*.md 를 검색한다.",
      "질문 키워드로 상위 5건의 발췌(snippet)를 마크다운으로 정리한다.",
      "회수 자료가 없으면 Chrome Extension 또는 Drive Watcher 사용법을 안내한다.",
      "결과를 AGENT_WIKI_PATH 마크다운으로 저장한다.",
    ].join("\n"),
    inputs: [
      { key: "target", label: "딜명/프로젝트", required: true, placeholder: "예: 한남동644" },
      { key: "question", label: "질문", required: true, placeholder: "예: 주요 매입 일정은?" },
    ],
  },
];

export function getTemplate(id: string): AgentTemplate | null {
  return AGENT_TEMPLATES.find((template) => template.id === id) ?? null;
}

export function listTemplates(): AgentTemplate[] {
  return AGENT_TEMPLATES;
}
