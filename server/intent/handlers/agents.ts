import {
  cancelAgentTask,
  describeLevel,
  enqueueAgentTask,
  getAgentTask,
  getPermissionLevel,
  isSimulationMode,
  listAgentTasks,
  listTemplates,
  type AgentStatus,
  type AgentTask,
} from "../../agents/index.ts";
import type { HandlerMap, IntentHandler } from "../types.ts";

const STATUS_LABEL: Record<AgentStatus, string> = {
  pending: "⏳ 대기",
  running: "🚀 진행 중",
  completed: "✅ 완료",
  failed: "❌ 실패",
  cancelled: "⛔ 취소",
};

function header(): string {
  const mode = isSimulationMode() ? "🧪 시뮬레이션 모드 (OpenClaw 미연동)" : "🛰 OpenClaw 연동 모드";
  return `${mode}\n🛡 권한: ${describeLevel(getPermissionLevel())}`;
}

function formatTemplateList(): string {
  const lines = ["🤖 에이전트 템플릿", header(), ""];
  for (const template of listTemplates()) {
    lines.push(`• ${template.id} — ${template.label}`);
    lines.push(`  ${template.description}`);
  }
  lines.push("", "사용법: 에이전트 실행 <템플릿id> <대상>");
  return lines.join("\n");
}

function formatTaskRow(task: AgentTask): string {
  const targetText = task.target ? ` · ${task.target}` : "";
  return `• ${STATUS_LABEL[task.status]} [${task.id}] ${task.templateLabel}${targetText}`;
}

function formatTaskStatus(): string {
  const tasks = listAgentTasks();
  if (tasks.length === 0) return `${header()}\n\n📭 등록된 작업이 없습니다.`;
  const active = tasks.filter((task) => task.status === "running" || task.status === "pending");
  const recent = tasks.filter((task) => !active.includes(task)).slice(0, 5);
  const lines = [header(), ""];
  if (active.length > 0) {
    lines.push("## 진행 중·대기");
    lines.push(...active.map(formatTaskRow));
  } else {
    lines.push("## 진행 중·대기 없음");
  }
  if (recent.length > 0) {
    lines.push("", "## 최근 완료");
    lines.push(...recent.map(formatTaskRow));
  }
  return lines.join("\n");
}

function formatTaskResult(task: AgentTask): string {
  const lines = [`📋 ${task.templateLabel}`, `🆔 ${task.id}`, `상태: ${STATUS_LABEL[task.status]}`];
  if (task.target) lines.push(`🎯 ${task.target}`);
  if (task.durationMs) lines.push(`⏱ ${(task.durationMs / 1000).toFixed(1)}초`);
  if (task.result?.wikiPath) lines.push(`🔗 ${task.result.wikiPath}`);
  if (task.error) lines.push(`❌ ${task.error}`);
  if (task.resultPreview) {
    lines.push("", "── 미리보기 ──", task.resultPreview);
  }
  return lines.join("\n");
}

function parseExecuteArgs(rest: string): { templateId: string; target: string; inputs: Record<string, string> } | null {
  const tokens = rest.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const [templateId, ...rest2] = tokens;
  const target = rest2.join(" ");
  return { templateId, target, inputs: {} };
}

const handleAgentCommand: IntentHandler = async (intent, options) => {
  const message = options.message.trim();
  const rest = message.replace(/^에이전트\s*/, "").trim();

  if (!rest || /^목록$/.test(rest)) {
    return { intent, handled: true, requiresConfirmation: false, response: formatTemplateList() };
  }
  if (/^상태$/.test(rest)) {
    return { intent, handled: true, requiresConfirmation: false, response: formatTaskStatus() };
  }
  const resultMatch = rest.match(/^결과\s+(\S+)$/);
  if (resultMatch) {
    const task = getAgentTask(resultMatch[1]);
    if (!task) {
      return { intent, handled: true, requiresConfirmation: false, response: `🚫 작업을 찾지 못했습니다: ${resultMatch[1]}` };
    }
    return { intent, handled: true, requiresConfirmation: false, response: formatTaskResult(task) };
  }
  const cancelMatch = rest.match(/^취소\s+(\S+)$/);
  if (cancelMatch) {
    const task = cancelAgentTask(cancelMatch[1]);
    if (!task) {
      return { intent, handled: true, requiresConfirmation: false, response: `🚫 작업을 찾지 못했습니다: ${cancelMatch[1]}` };
    }
    return { intent, handled: true, requiresConfirmation: false, response: `⛔ 취소 요청\n📋 ${task.templateLabel}\n🆔 ${task.id}\n상태: ${STATUS_LABEL[task.status]}` };
  }
  const executeMatch = rest.match(/^실행\s+(.+)$/);
  if (executeMatch) {
    const parsed = parseExecuteArgs(executeMatch[1]);
    if (!parsed) {
      return { intent, handled: true, requiresConfirmation: false, response: "⚠️ 사용법: 에이전트 실행 <템플릿id> <대상>" };
    }
    try {
      const task = enqueueAgentTask({ templateId: parsed.templateId, target: parsed.target, inputs: parsed.inputs });
      const lines = ["🤖 에이전트 작업 등록", `📋 ${task.templateLabel}`, `🆔 ${task.id}`, `🎯 ${task.target}`, "", header(), "", `상태 확인: 에이전트 결과 ${task.id}`];
      return { intent, handled: true, requiresConfirmation: false, response: lines.join("\n") };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { intent, handled: true, requiresConfirmation: false, response: `🚫 작업 등록 실패: ${msg}` };
    }
  }

  return { intent, handled: true, requiresConfirmation: false, response: "⚠️ 사용법:\n- 에이전트 목록\n- 에이전트 실행 <템플릿id> <대상>\n- 에이전트 상태\n- 에이전트 결과 <task_id>\n- 에이전트 취소 <task_id>" };
};

export const agentHandlers: HandlerMap = {
  agent_command: handleAgentCommand,
};
