import fs from "node:fs/promises";
import path from "node:path";
import type { AgentTask } from "./agentTypes.ts";
import { getOpenClawClient } from "./openclawClient.ts";

export type ExecutorOutput = { markdown: string; wikiPath: string | null };

export type ExecutorOptions = {
  now?: () => Date;
  sleepMs?: number;
  fs?: { writeFile: typeof fs.writeFile; mkdir: typeof fs.mkdir };
  rootOverride?: string;
};

export function isSimulationMode(): boolean {
  const envUrl = process.env.OPENCLAW_API_URL?.trim();
  return !envUrl && !getOpenClawClient().getStatus().available;
}

export function getAgentWikiRoot(override?: string): string | null {
  const root = override ?? process.env.AGENT_WIKI_PATH?.trim();
  return root ? root : null;
}

function kstDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function buildSimulationMarkdown(task: AgentTask, now: Date): string {
  const header = [
    `# ${task.templateLabel} — ${task.target}`,
    `> 시뮬레이션 결과 · 생성 ${now.toISOString()} · task ${task.id}`,
    "",
  ];
  const body = renderTemplateBody(task);
  return [...header, ...body, "", "---", "_본 결과는 OpenClaw 미연동 상태의 시뮬레이션입니다._"].join("\n");
}

function renderTemplateBody(task: AgentTask): string[] {
  const target = task.target;
  switch (task.templateId) {
    case "pf-comprehensive":
      return [
        "## 핵심 지표",
        `- IRR(추정): 14.1%`,
        `- 평당 매입단가: 4,800만원`,
        `- 분양가 가정: 6,200만원/평`,
        `- 자기자본 회수기간: 2.4년`,
        "",
        "## 리스크 (3건)",
        `1. ${target} 인근 분양가 상한제 적용 가능성`,
        `2. PF 대출금리 상승 시 IRR -1.8%p 민감`,
        `3. 인허가 지연 30일 → 사업비 +1.2%`,
        "",
        "## 권고",
        `- 토지 잔금 2주 안 진행, 시공사 2곳 견적 비교 필요`,
      ];
    case "pf-version-compare":
      return [
        "## 버전 변동",
        `- ${task.inputs?.versionA ?? "버전 A"} → ${task.inputs?.versionB ?? "버전 B"}`,
        "- 분양가 +3% / 공사비 +5% / IRR -0.7%p",
        "",
        "## 주요 변경",
        "- 용적률 240% → 250% (+10%p)",
        "- 분양 시점 6개월 지연",
        "",
        "## 의견",
        "공사비 상승분이 분양가 인상으로 흡수됨. IRR은 여전히 14% 위.",
      ];
    case "pf-legal-risk":
      return [
        "## 핵심 리스크 항목",
        `1. ${target} 매도자 권리 제한 — 신탁 해지 조건 확인 필요`,
        "2. 위약금 조항: 잔금 지연 시 일 0.05% (과중)",
        "3. 인허가 미완 시 매수자 해제권 미명시",
        "",
        "## 우선 협상 포인트",
        "- 위약금율 0.03%로 인하",
        "- 인허가 미완 시 자동 연장 30일 명시",
      ];
    case "trading-decision":
      return [
        "## 시장 스냅샷",
        `- 심볼: ${target}`,
        `- RSI(1h/4h): 55 / 61`,
        "- 펀딩비: +0.012%",
        "- 김프: +2.3%",
        "",
        "## 판정",
        `${task.inputs?.side === "short" ? "🔴 단기 숏 검토" : "🟢 단기 롱 진입 검토"} — 손절 -1.5%, 목표 +3.2%`,
      ];
    case "notebook-query":
      return [
        `## 질문`,
        `> ${task.inputs?.question ?? "(질문 없음)"}`,
        "",
        "## NotebookLM 응답 (시뮬레이션)",
        "OpenClaw 연동 후 사용 가능합니다.",
        `${target} 노트북에서 발췌한 핵심 답변 3건:`,
        "1. 토지 매입은 2026-06 잔금 예정",
        "2. 인허가는 5월 말 사전 협의 진행 중",
        "3. 시공사 후보 2곳 (대형 1, 중견 1)",
      ];
    default:
      return [`### ${target}`, "(템플릿이 정의되지 않음)"];
  }
}

function withFallbackWarning(reason: string | undefined, markdown: string): string {
  return [`⚠️ OpenClaw 호출 실패로 시뮬레이션 결과를 반환합니다.`, `사유: ${reason ?? "알 수 없음"}`, "", markdown].join("\n");
}

export function makeSimulationRunner(options: ExecutorOptions = {}) {
  const now = options.now ?? (() => new Date());
  const sleepMs = options.sleepMs ?? 3000 + Math.floor(Math.random() * 2000);
  const fileApi = options.fs ?? fs;

  return async function runSimulation(task: AgentTask, signal: AbortSignal): Promise<ExecutorOutput> {
    if (signal.aborted) throw new Error("작업이 시작 전에 취소되었습니다.");
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, sleepMs);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error("작업이 취소되었습니다."));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
    const stamp = now();
    const markdown = buildSimulationMarkdown(task, stamp);
    const wikiPath = await persistResult(task, markdown, stamp, fileApi, options.rootOverride);
    return { markdown, wikiPath };
  };
}

export function makeAgentRunner(options: ExecutorOptions = {}) {
  const simulationRunner = makeSimulationRunner(options);
  return async function runAgent(task: AgentTask, signal: AbortSignal): Promise<ExecutorOutput> {
    const client = getOpenClawClient();
    const status = client.getStatus();
    if (!status.available) {
      await client.probe();
    }
    const probed = client.getStatus();
    if (!probed.available) {
      return simulationRunner(task, signal);
    }
    const result = await client.runTask(task);
    if (result.ok) {
      const stamp = options.now?.() ?? new Date();
      const wikiPath = await persistResult(task, result.markdown, stamp, options.fs ?? fs, options.rootOverride);
      return { markdown: result.markdown, wikiPath };
    }
    const fallback = await simulationRunner(task, signal);
    return { markdown: withFallbackWarning(result.reason, fallback.markdown), wikiPath: fallback.wikiPath };
  };
}

async function persistResult(
  task: AgentTask,
  markdown: string,
  now: Date,
  fileApi: { writeFile: typeof fs.writeFile; mkdir: typeof fs.mkdir },
  rootOverride: string | undefined
): Promise<string | null> {
  const root = getAgentWikiRoot(rootOverride);
  if (!root) return null;
  try {
    await fileApi.mkdir(root, { recursive: true });
    const filename = `${kstDateKey(now)}-${task.templateId}-${task.id}.md`;
    const target = path.join(root, filename);
    await fileApi.writeFile(target, markdown, "utf-8");
    return target;
  } catch (err) {
    console.error("[agentExecutor] persistResult:", err);
    return null;
  }
}
