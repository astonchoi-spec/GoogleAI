import type { AgentTemplate } from "./agentTypes.ts";

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "pf-comprehensive",
    label: "PF 종합 분석",
    description: "딜의 사업성, 시장, 법무, 자금 구조를 종합 평가합니다.",
    category: "pf",
    inputs: [
      { key: "target", label: "딜명 또는 주소", required: true, placeholder: "예: 한남동644" },
      { key: "scope", label: "추가 분석 항목", required: false, placeholder: "비교 대상, 주안점 등" },
    ],
  },
  {
    id: "pf-version-compare",
    label: "PF 버전 비교",
    description: "같은 딜의 두 버전(예: 초기/수정안) 사업성 변동을 정리합니다.",
    category: "pf",
    inputs: [
      { key: "target", label: "딜명", required: true, placeholder: "예: 용인신대지구" },
      { key: "versionA", label: "버전 A", required: true, placeholder: "예: 2026-04 초안" },
      { key: "versionB", label: "버전 B", required: true, placeholder: "예: 2026-05 수정" },
    ],
  },
  {
    id: "pf-legal-risk",
    label: "PF 법무 리스크 점검",
    description: "계약서/법률 검토 자료에서 핵심 리스크 항목을 추출합니다.",
    category: "pf",
    inputs: [
      { key: "target", label: "딜명", required: true, placeholder: "예: 행당동 역세권" },
    ],
  },
  {
    id: "trading-decision",
    label: "트레이딩 의사결정",
    description: "현재 시세·지표·리스크 가드 상태를 종합한 진입/청산 검토 리포트.",
    category: "trading",
    inputs: [
      { key: "target", label: "심볼", required: true, placeholder: "예: BTC, ETH" },
      { key: "side", label: "방향", required: false, placeholder: "long/short" },
    ],
  },
  {
    id: "notebook-query",
    label: "NotebookLM 질의",
    description: "지정 NotebookLM 노트북에 자연어 질문을 던지고 답을 수집합니다.",
    category: "research",
    inputs: [
      { key: "target", label: "노트북 키워드", required: true, placeholder: "예: 한남동644" },
      { key: "question", label: "질문", required: true, placeholder: "예: 토지 매입 일정은?" },
    ],
  },
];

export function getTemplate(id: string): AgentTemplate | null {
  return AGENT_TEMPLATES.find((template) => template.id === id) ?? null;
}

export function listTemplates(): AgentTemplate[] {
  return AGENT_TEMPLATES;
}
