import { randomBytes } from "node:crypto";
import type { AgentNotifier, AgentStatus, AgentTask, CreateAgentTaskInput } from "./agentTypes.ts";
import { getTemplate } from "./agentTemplates.ts";
import { checkAgentAction, getAgentApprovalTimeoutMs } from "./permissionGate.ts";

const MAX_TASKS = 50;
const TASK_TIMEOUT_MS = 30 * 60 * 1000;

export type AgentRunner = (task: AgentTask, signal: AbortSignal) => Promise<{ markdown: string; wikiPath: string | null }>;

export type AgentQueueOptions = {
  runner: AgentRunner;
  notifier?: AgentNotifier;
  maxTasks?: number;
  taskTimeoutMs?: number;
};

export class AgentQueue {
  private tasks = new Map<string, AgentTask>();
  private order: string[] = [];
  private waiting: string[] = [];
  private approvalTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private active: { id: string; controller: AbortController; timer: ReturnType<typeof setTimeout> } | null = null;
  private readonly runner: AgentRunner;
  private readonly notifier?: AgentNotifier;
  private readonly maxTasks: number;
  private readonly taskTimeoutMs: number;

  constructor(options: AgentQueueOptions) {
    this.runner = options.runner;
    this.notifier = options.notifier;
    this.maxTasks = options.maxTasks ?? MAX_TASKS;
    this.taskTimeoutMs = options.taskTimeoutMs ?? TASK_TIMEOUT_MS;
  }

  list(): AgentTask[] {
    return this.order.map((id) => this.tasks.get(id)!).filter(Boolean);
  }

  get(id: string): AgentTask | null {
    return this.tasks.get(id) ?? null;
  }

  getTasksByDate(dateISO: string): AgentTask[] {
    const finalStatuses = new Set<AgentStatus>(["completed", "failed", "cancelled"]);
    return this.list().filter((task) => {
      if (!finalStatuses.has(task.status)) return false;
      const stamp = task.finishedAt ?? task.createdAt;
      return toKstDateKey(new Date(stamp)) === dateISO;
    });
  }

  enqueue(input: CreateAgentTaskInput): AgentTask {
    if (this.tasks.size >= this.maxTasks) {
      throw new Error(`작업 큐가 가득 찼습니다. (최대 ${this.maxTasks}개)`);
    }
    const template = getTemplate(input.templateId);
    if (!template) throw new Error(`알 수 없는 템플릿: ${input.templateId}`);
    const target = input.target.trim();
    if (!target) throw new Error("대상이 비어 있습니다.");
    const permission = checkAgentAction("execute");
    if (!permission.allowed) {
      throw new Error(permission.reason ?? "에이전트 실행 권한이 없습니다.");
    }
    const id = randomBytes(5).toString("base64url");
    const task: AgentTask = {
      id,
      templateId: template.id,
      templateLabel: template.label,
      target,
      inputs: input.inputs ?? {},
      status: permission.requiresApproval ? "awaiting_approval" : "pending",
      createdAt: new Date().toISOString(),
    };
    this.tasks.set(id, task);
    this.order.unshift(id);
    if (permission.requiresApproval) {
      this.scheduleApprovalTimeout(id);
      void this.notifyApprovalRequired(task);
    } else {
      this.waiting.push(id);
      void this.tick();
    }
    return task;
  }

  approve(id: string): AgentTask | null {
    const task = this.tasks.get(id);
    if (!task) return null;
    if (task.status !== "awaiting_approval") return task;
    this.clearApprovalTimer(id);
    this.update(id, { status: "pending" });
    this.waiting.push(id);
    void this.tick();
    return this.tasks.get(id) ?? null;
  }

  reject(id: string, reason = "회장 승인 거부"): AgentTask | null {
    const task = this.tasks.get(id);
    if (!task) return null;
    if (task.status !== "awaiting_approval") return task;
    this.clearApprovalTimer(id);
    this.update(id, { status: "rejected", error: reason, finishedAt: new Date().toISOString() });
    return this.tasks.get(id) ?? null;
  }

  cancel(id: string): AgentTask | null {
    const task = this.tasks.get(id);
    if (!task) return null;
    if (task.status === "awaiting_approval") {
      this.clearApprovalTimer(id);
      this.update(id, { status: "cancelled", finishedAt: new Date().toISOString() });
      return this.tasks.get(id) ?? null;
    }
    if (task.status === "pending") {
      this.waiting = this.waiting.filter((wid) => wid !== id);
      this.update(id, { status: "cancelled", finishedAt: new Date().toISOString() });
      return this.tasks.get(id) ?? null;
    }
    if (task.status === "running" && this.active?.id === id) {
      this.active.controller.abort();
      return this.tasks.get(id) ?? null;
    }
    return task;
  }

  private update(id: string, patch: Partial<AgentTask>): void {
    const current = this.tasks.get(id);
    if (!current) return;
    this.tasks.set(id, { ...current, ...patch });
  }

  private scheduleApprovalTimeout(id: string): void {
    const timer = setTimeout(() => {
      const task = this.tasks.get(id);
      if (task?.status === "awaiting_approval") {
        this.update(id, { status: "rejected", error: "5분 내 승인 응답이 없어 자동 거부되었습니다.", finishedAt: new Date().toISOString() });
      }
      this.approvalTimers.delete(id);
    }, getAgentApprovalTimeoutMs());
    this.approvalTimers.set(id, timer);
  }

  private clearApprovalTimer(id: string): void {
    const timer = this.approvalTimers.get(id);
    if (timer) clearTimeout(timer);
    this.approvalTimers.delete(id);
  }

  private async notifyApprovalRequired(task: AgentTask): Promise<void> {
    try {
      await this.notifier?.onApprovalRequired?.(task);
    } catch (err) {
      console.error("[agentQueue] onApprovalRequired notifier:", err);
    }
  }

  private async tick(): Promise<void> {
    if (this.active) return;
    const nextId = this.waiting.shift();
    if (!nextId) return;
    const task = this.tasks.get(nextId);
    if (!task || task.status !== "pending") {
      void this.tick();
      return;
    }
    const controller = new AbortController();
    const startedAt = new Date().toISOString();
    this.update(nextId, { status: "running", startedAt });
    const timer = setTimeout(() => {
      controller.abort();
    }, this.taskTimeoutMs);
    this.active = { id: nextId, controller, timer };
    const startTask = this.tasks.get(nextId)!;
    try {
      await this.notifier?.onStart?.(startTask);
    } catch (err) {
      console.error("[agentQueue] onStart notifier:", err);
    }
    try {
      const output = await this.runner(startTask, controller.signal);
      const finishedAt = new Date().toISOString();
      const durationMs = Date.parse(finishedAt) - Date.parse(startedAt);
      const preview = output.markdown.slice(0, 200);
      const finalStatus: AgentStatus = controller.signal.aborted ? "cancelled" : "completed";
      this.update(nextId, {
        status: finalStatus,
        finishedAt,
        durationMs,
        result: { markdown: output.markdown, wikiPath: output.wikiPath },
        resultPreview: preview,
      });
      const finalTask = this.tasks.get(nextId)!;
      try {
        if (finalStatus === "completed") await this.notifier?.onComplete?.(finalTask);
      } catch (err) {
        console.error("[agentQueue] onComplete notifier:", err);
      }
    } catch (err) {
      const finishedAt = new Date().toISOString();
      const durationMs = Date.parse(finishedAt) - Date.parse(startedAt);
      const aborted = controller.signal.aborted;
      const message = err instanceof Error ? err.message : String(err);
      this.update(nextId, {
        status: aborted ? (this.tasks.get(nextId)?.status === "cancelled" ? "cancelled" : "failed") : "failed",
        finishedAt,
        durationMs,
        error: aborted ? "타임아웃 또는 취소되었습니다." : message,
      });
      const failedTask = this.tasks.get(nextId)!;
      try {
        if (failedTask.status === "failed") await this.notifier?.onFail?.(failedTask);
      } catch (notifierErr) {
        console.error("[agentQueue] onFail notifier:", notifierErr);
      }
    } finally {
      clearTimeout(timer);
      this.active = null;
      void this.tick();
    }
  }

  async waitForIdle(): Promise<void> {
    while (this.active || this.waiting.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

function toKstDateKey(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
