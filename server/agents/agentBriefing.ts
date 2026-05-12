import { getAgentTasksByDate, type AgentTask } from "./index.ts";
import { getAgentResultsDateKey, loadAgentResultsForDate, type LoadedAgentResult } from "./agentResultLoader.ts";

export type AgentResultsBriefingItem = {
  id: string;
  templateId: string;
  templateLabel: string;
  icon: string;
  target: string;
  preview: string;
  wikiPath: string | null;
  simulation: boolean;
  status: "completed" | "failed";
};

export type AgentResultsBriefingSection = {
  date: string;
  items: AgentResultsBriefingItem[];
  failedItems: AgentResultsBriefingItem[];
  extraCount: number;
};

export async function getAgentResultsSection(now: Date = new Date()): Promise<AgentResultsBriefingSection | null> {
  const date = getAgentResultsDateKey(now);
  try {
    const loaded = await loadAgentResultsForDate(date);
    const tasks = getAgentTasksByDate(date).filter((task) => task.status !== "cancelled");
    const byId = new Map<string, AgentResultsBriefingItem>();

    for (const result of loaded) byId.set(result.taskId, fromLoadedResult(result));
    for (const task of tasks) byId.set(task.id, fromAgentTask(task, byId.get(task.id)));

    const allItems = Array.from(byId.values());
    const failedItems = allItems.filter((item) => item.status === "failed");
    const completed = allItems.filter((item) => item.status === "completed");
    if (completed.length === 0 && failedItems.length === 0) return null;

    const visible = completed.slice(0, 5);
    return { date, items: visible, failedItems, extraCount: Math.max(0, completed.length - visible.length) };
  } catch (error) {
    console.error("[agentBriefing] agent results section error:", error);
    return null;
  }
}

function fromLoadedResult(result: LoadedAgentResult): AgentResultsBriefingItem {
  return {
    id: result.taskId,
    templateId: result.templateId,
    templateLabel: result.templateLabel,
    icon: agentTemplateIcon(result.templateId, result.simulation),
    target: result.target,
    preview: shorten(result.metrics || result.preview, 200),
    wikiPath: result.wikiPath,
    simulation: result.simulation,
    status: "completed",
  };
}

function fromAgentTask(task: AgentTask, existing?: AgentResultsBriefingItem): AgentResultsBriefingItem {
  const simulation = existing?.simulation ?? /시뮬레이션|OpenClaw 호출 실패/.test(task.result?.markdown ?? task.resultPreview ?? "");
  return {
    id: task.id,
    templateId: task.templateId,
    templateLabel: task.templateLabel,
    icon: agentTemplateIcon(task.templateId, simulation),
    target: task.target,
    preview: shorten(task.error ?? task.resultPreview ?? existing?.preview ?? "", 200),
    wikiPath: task.result?.wikiPath ?? existing?.wikiPath ?? null,
    simulation,
    status: task.status === "failed" ? "failed" : "completed",
  };
}

function agentTemplateIcon(templateId: string, simulation: boolean): string {
  if (simulation) return "🧪";
  if (templateId.startsWith("pf-")) return "📊";
  if (templateId.startsWith("trading-")) return "📈";
  if (templateId === "notebook-query") return "📚";
  return "🤖";
}

function shorten(text: string, limit: number): string {
  const compacted = text.replace(/\s+/g, " ").trim();
  return compacted.length > limit ? `${compacted.slice(0, limit - 3)}...` : compacted;
}
