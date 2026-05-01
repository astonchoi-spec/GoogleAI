import { AgentQueue } from "./agentQueue.ts";
import { makeAgentRunner, makeSimulationRunner, isSimulationMode, getAgentWikiRoot } from "./agentExecutor.ts";
import { getOpenClawClient } from "./openclawClient.ts";
import type { AgentNotifier, AgentTask, CreateAgentTaskInput } from "./agentTypes.ts";

export * from "./agentTypes.ts";
export * from "./agentTemplates.ts";
export * from "./permissionGate.ts";
export { AgentQueue } from "./agentQueue.ts";
export { isSimulationMode, getAgentWikiRoot, makeSimulationRunner, makeAgentRunner } from "./agentExecutor.ts";
export { getOpenClawClient, OpenClawClient } from "./openclawClient.ts";
export type { OpenClawStatus } from "./openclawClient.ts";

let singleton: AgentQueue | null = null;
let registeredNotifier: AgentNotifier | undefined;

export function setAgentNotifier(notifier: AgentNotifier): void {
  registeredNotifier = notifier;
  singleton = null;
}

export function getAgentQueue(): AgentQueue {
  if (singleton) return singleton;
  const runner = makeAgentRunner();
  singleton = new AgentQueue({ runner, notifier: registeredNotifier });
  return singleton;
}

export function resetAgentQueueForTesting(): void {
  singleton = null;
}

export function enqueueAgentTask(input: CreateAgentTaskInput): AgentTask {
  return getAgentQueue().enqueue(input);
}

export function approveAgentTask(id: string): AgentTask | null {
  return getAgentQueue().approve(id);
}

export function rejectAgentTask(id: string, reason?: string): AgentTask | null {
  return getAgentQueue().reject(id, reason);
}

export function listAgentTasks(): AgentTask[] {
  return getAgentQueue().list();
}

export function getAgentTask(id: string): AgentTask | null {
  return getAgentQueue().get(id);
}

export function cancelAgentTask(id: string): AgentTask | null {
  return getAgentQueue().cancel(id);
}

export async function probeOpenClaw(): Promise<void> {
  const status = await getOpenClawClient().probe();
  if (status.available) {
    console.log(`[agent] OpenClaw 연동 성공 - URL: ${status.url}, 인증: ${status.authType}`);
    await registeredNotifier?.onComplete?.({
      id: "openclaw-probe",
      templateId: "openclaw-probe",
      templateLabel: "OpenClaw 연동 점검",
      target: status.url ?? "",
      inputs: {},
      status: "completed",
      createdAt: new Date().toISOString(),
      resultPreview: `OpenClaw 연동 성공\nURL: ${status.url}\n인증: ${status.authType}`,
    });
  } else {
    console.log("[agent] OpenClaw 미탐지 - 시뮬레이션 모드 유지");
    await registeredNotifier?.onFail?.({
      id: "openclaw-probe",
      templateId: "openclaw-probe",
      templateLabel: "OpenClaw 연동 점검",
      target: "자동 탐지",
      inputs: {},
      status: "failed",
      createdAt: new Date().toISOString(),
      error: "OpenClaw 미탐지 - 시뮬레이션 모드 유지",
    });
  }
}
