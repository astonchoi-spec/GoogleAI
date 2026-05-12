import { describeLevel, getPermissionLevel } from "./permissionGate.ts";
import { getOpenClawClient, type OpenClawStatus } from "./openclawClient.ts";
import { listAgentTasks } from "./index.ts";
import { loadOpenClawSmoke } from "./openclawSmoke.ts";

export type AgentHealthSnapshot = {
  openclaw: OpenClawStatus;
  openclawDetected: boolean;
  openclawUrl: string | null;
  simulationMode: boolean;
  modelHint: string | null;
  lastSmokeAt: string | null;
  lastSmokeStatus: "passed" | "failed" | "skipped" | "never";
  permissionLevel: number;
  permissionLabel: string;
  queueStatus: {
    total: number;
    active: number;
    completed: number;
    failed: number;
  };
};

export async function getAgentHealthSnapshot(): Promise<AgentHealthSnapshot> {
  const openclaw = getOpenClawClient().getStatus();
  const tasks = listAgentTasks();
  const smoke = await loadOpenClawSmoke();
  const active = tasks.filter((task) => task.status === "awaiting_approval" || task.status === "pending" || task.status === "running");
  return {
    openclaw,
    openclawDetected: openclaw.available,
    openclawUrl: openclaw.url,
    simulationMode: openclaw.simulationMode,
    modelHint: openclaw.modelHint ?? openclaw.model ?? null,
    lastSmokeAt: smoke?.checkedAt ?? null,
    lastSmokeStatus: smoke?.status ?? "never",
    permissionLevel: getPermissionLevel(),
    permissionLabel: describeLevel(),
    queueStatus: {
      total: tasks.length,
      active: active.length,
      completed: tasks.filter((task) => task.status === "completed").length,
      failed: tasks.filter((task) => task.status === "failed").length,
    },
  };
}
