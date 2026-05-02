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
    label: "NotebookLM 질의",
    description: "지정 NotebookLM 노트북에 자연어 질문을 던지고 답을 수집합니다.",
    category: "research",
    instructions: [
      "NotebookLM 웹사이트(https://notebooklm.google.com)를 연다.",
      "작업 입력 파라미터로 dealName이 전달되면 dealStore.getDeal(dealName)을 호출하여 _deal.json의 notebookUrl 필드를 읽는다.",
      "notebookUrl이 있으면 해당 URL로 이동하고, 없으면 텔레그램에 \"⚠️ <딜명> NotebookLM 미연결, '딜 노트북 <딜명> <URL>' 명령으로 등록 필요\"를 안내한 뒤 작업을 종료한다.",
      "질문을 입력한다.",
      "답변을 기다린다.",
      "답변 요약을 한국어 마크다운으로 정리한다.",
      "출처가 보이면 함께 기록한다.",
      "결과를 Aston Wiki agents 폴더에 저장한다.",
      "이번 Phase에서는 실제 조작 실패 시 시뮬레이션 fallback을 유지한다.",
    ].join("\n"),
    inputs: [
      { key: "target", label: "딜명", required: true, placeholder: "예: 한남동44" },
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
