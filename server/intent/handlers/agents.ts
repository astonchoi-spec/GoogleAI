import {
  cancelAgentTask,
  enqueueAgentTask,
  getAgentTask,
  listAgentTasks,
  listTemplates,
  type AgentStatus,
  type AgentTask,
} from "../../agents/index.ts";
import { getAgentHealthSnapshot } from "../../agents/agentHealth.ts";
import type { HandlerMap, IntentHandler } from "../types.ts";

const STATUS_LABEL: Record<AgentStatus, string> = {
  awaiting_approval: "🛡 승인 대기",
  pending: "🕒 대기",
  running: "🏃 진행 중",
  completed: "✅ 완료",
  failed: "⚠️ 실패",
  cancelled: "🛑 취소",
  rejected: "🚫 거절",
};

async function header(): Promise<string> {
  const health = await getAgentHealthSnapshot();
  const openClawLabel = health.openclawDetected
    ? "🟢 OpenClaw: 실제 연동"
    : health.openclawUrl
      ? "🟡 OpenClaw: 탐지됨 / 시뮬레이션 fallback"
      : "🟡 OpenClaw: 미탐지 / 시뮬레이션 모드";
  const geminiLabel = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim()
    ? "🧠 Gemini API: Aston 앱에 설정됨"
    : "🧠 Gemini API: 미설정";
  return [
    "🤖 에이전트 상태",
    openClawLabel,
    geminiLabel,
    `🛡 권한: ${health.permissionLabel}`,
    health.openclawUrl ? `🔗 URL: ${health.openclawUrl}` : null,
    health.modelHint ? `🧩 모델 힌트: ${health.modelHint}` : null,
    "",
    "OpenClaw를 실행하면 자동 재탐지됩니다.",
  ].filter(Boolean).join("\n");
}

function formatTemplateList(prefix: string): string {
  const lines = [prefix, "", "📚 에이전트 템플릿"];
  for (const template of listTemplates()) {
    lines.push(`- ${template.id}: ${template.label}`);
    lines.push(`  ${template.description}`);
  }
  lines.push("", "사용법: 에이전트 실행 <templateId> <대상>");
  return lines.join("\n");
}

function formatTaskRow(task: AgentTask): string {
  return `- ${STATUS_LABEL[task.status]} [${task.id}] ${task.templateLabel} · ${task.target}`;
}

async function formatTaskStatus(): Promise<string> {
  const prefix = await header();
  const tasks = listAgentTasks();
  if (tasks.length === 0) return `${prefix}\n\n📭 등록된 작업이 없습니다.`;
  const active = tasks.filter((task) => task.status === "running" || task.status === "pending" || task.status === "awaiting_approval");
  const recent = tasks.filter((task) => !active.includes(task)).slice(0, 5);
  const lines = [prefix, ""];
  lines.push(active.length > 0 ? "## 진행 중" : "## 진행 중 없음");
  if (active.length > 0) lines.push(...active.map(formatTaskRow));
  if (recent.length > 0) {
    lines.push("", "## 최근 결과");
    lines.push(...recent.map(formatTaskRow));
  }
  return lines.join("\n");
}

function formatTaskResult(task: AgentTask): string {
  const lines = [`🤖 ${task.templateLabel}`, `🆔 ${task.id}`, `상태: ${STATUS_LABEL[task.status]}`];
  if (task.target) lines.push(`🎯 ${task.target}`);
  if (task.durationMs) lines.push(`⏱ ${(task.durationMs / 1000).toFixed(1)}초`);
  if (task.result?.wikiPath) lines.push(`🗂 ${task.result.wikiPath}`);
  if (task.error) lines.push(`⚠️ ${task.error}`);
  if (task.resultPreview) lines.push("", "미리보기", task.resultPreview);
  return lines.join("\n");
}

function parseExecuteArgs(rest: string): { templateId: string; target: string; inputs: Record<string, string> } | null {
  const tokens = rest.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const [templateId, ...restTokens] = tokens;
  // notebook-query 는 target + question 두 입력 필요.
  // 형식: 에이전트 실행 notebook-query <target(단일 토큰)> <question...>
  if (templateId === "notebook-query" && restTokens.length >= 2) {
    const [target, ...questionTokens] = restTokens;
    return { templateId, target, inputs: { question: questionTokens.join(" ") } };
  }
  return { templateId, target: restTokens.join(" "), inputs: {} };
}

const handleAgentCommand: IntentHandler = async (intent, options) => {
  const message = options.message.trim();
  const rest = message.replace(/^에이전트\s*/, "").trim();

  if (!rest || /^목록$/.test(rest)) {
    // Phase 6-D-6 — 템플릿 목록 분기. 의미적 list. response 통합형 + text="".
    return {
      intent, handled: true, requiresConfirmation: false,
      response: formatTemplateList(await header()),
      handlerResponse: {
        kind: "list",
        text: "",
        meta: { action: "agent_command", subCommand: "list" },
      },
    };
  }
  if (/^상태$/.test(rest)) {
    // Phase 6-D-6 — 작업 상태 분기. 진행 중 + 최근 결과 list 의미. response 통합.
    return {
      intent, handled: true, requiresConfirmation: false,
      response: await formatTaskStatus(),
      handlerResponse: {
        kind: "list",
        text: "",
        meta: { action: "agent_command", subCommand: "status" },
      },
    };
  }

  const resultMatch = rest.match(/^결과\s+(\S+)$/);
  if (resultMatch) {
    const task = getAgentTask(resultMatch[1]);
    // Phase 6-D-6 — 단일 작업 결과 또는 not_found 안내.
    // Phase 7-A — found 는 kind="text", not_found 는 kind="error" 로 분리.
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: task ? formatTaskResult(task) : `🚫 작업을 찾지 못했습니다: ${resultMatch[1]}`,
      handlerResponse: {
        kind: task ? "text" : "error",
        text: "",
        meta: {
          action: "agent_command",
          subCommand: "result",
          taskId: resultMatch[1],
          status: task ? "found" : "not_found",
        },
      },
    };
  }

  const cancelMatch = rest.match(/^취소\s+(\S+)$/);
  if (cancelMatch) {
    const task = cancelAgentTask(cancelMatch[1]);
    // Phase 6-D-6 — 작업 취소 또는 not_found.
    // Phase 7-A — cancelled 는 kind="text", not_found 는 kind="error" 로 분리.
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: task ? `🛑 취소 요청\n🤖 ${task.templateLabel}\n🆔 ${task.id}\n상태: ${STATUS_LABEL[task.status]}` : `🚫 작업을 찾지 못했습니다: ${cancelMatch[1]}`,
      handlerResponse: {
        kind: task ? "text" : "error",
        text: "",
        meta: {
          action: "agent_command",
          subCommand: "cancel",
          taskId: cancelMatch[1],
          status: task ? "cancelled" : "not_found",
        },
      },
    };
  }

  const executeMatch = rest.match(/^실행\s+(.+)$/);
  if (executeMatch) {
    const parsed = parseExecuteArgs(executeMatch[1]);
    if (!parsed) {
      // Phase 6-D-6 — 인자 부족. 짧은 사용법 안내.
      // Phase 7-A — invalid_args 는 kind="error" 로 재분류.
      return {
        intent, handled: true, requiresConfirmation: false,
        response: "⚠️ 사용법: 에이전트 실행 <templateId> <대상>",
        handlerResponse: {
          kind: "error",
          text: "",
          meta: { action: "agent_command", subCommand: "execute", status: "invalid_args" },
        },
      };
    }
    try {
      const task = enqueueAgentTask({ templateId: parsed.templateId, target: parsed.target, inputs: parsed.inputs });
      // Phase 6-D-6 — 작업 등록 성공. text 분기. taskId / templateId 디버그 메타.
      return {
        intent,
        handled: true,
        requiresConfirmation: false,
        response: [`🤖 에이전트 작업 등록`, `📋 ${task.templateLabel}`, `🆔 ${task.id}`, `🎯 ${task.target}`, "", await header(), "", `결과 확인: 에이전트 결과 ${task.id}`].join("\n"),
        handlerResponse: {
          kind: "text",
          text: "",
          meta: {
            action: "agent_command",
            subCommand: "execute",
            taskId: task.id,
            templateId: parsed.templateId,
            status: "queued",
          },
        },
      };
    } catch (err) {
      // Phase 7-A — 작업 등록 실패를 kind="error" 로 정식 재분류. byte-for-byte 동일.
      return {
        intent,
        handled: true,
        requiresConfirmation: false,
        response: `🚫 작업 등록 실패: ${err instanceof Error ? err.message : String(err)}`,
        handlerResponse: {
          kind: "error",
          text: "",
          meta: {
            action: "agent_command",
            subCommand: "execute",
            status: "error",
            errorType: err instanceof Error ? err.name : "unknown",
          },
        },
      };
    }
  }

  // Phase 6-D-6 — fallthrough. 사용법 안내. text 분기.
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: "⚠️ 사용법\n- 에이전트 목록\n- 에이전트 실행 <templateId> <대상>\n- 에이전트 실행 notebook-query <프로젝트> <질문>\n- 에이전트 상태\n- 에이전트 결과 <task_id>\n- 에이전트 취소 <task_id>",
    handlerResponse: {
      kind: "text",
      text: "",
      meta: { action: "agent_command", subCommand: "help" },
    },
  };
};

export const agentHandlers: HandlerMap = {
  agent_command: handleAgentCommand,
};
