import { AgentQueue } from "./agentQueue.ts";
import { makeSimulationRunner, isSimulationMode, getAgentWikiRoot } from "./agentExecutor.ts";
import type { AgentNotifier, AgentTask, CreateAgentTaskInput } from "./agentTypes.ts";

export * from "./agentTypes.ts";
export * from "./agentTemplates.ts";
export * from "./permissionGate.ts";
export { AgentQueue } from "./agentQueue.ts";
export { isSimulationMode, getAgentWikiRoot, makeSimulationRunner } from "./agentExecutor.ts";

let singleton: AgentQueue | null = null;
let registeredNotifier: AgentNotifier | undefined;

export function setAgentNotifier(notifier: AgentNotifier): void {
  registeredNotifier = notifier;
  singleton = null;
}

export function getAgentQueue(): AgentQueue {
  if (singleton) return singleton;
  const runner = makeSimulationRunner();
  singleton = new AgentQueue({ runner, notifier: registeredNotifier });
  return singleton;
}

export function resetAgentQueueForTesting(): void {
  singleton = null;
}

export function enqueueAgentTask(input: CreateAgentTaskInput): AgentTask {
  return getAgentQueue().enqueue(input);
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
