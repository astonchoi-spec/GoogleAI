import { randomBytes } from "node:crypto";
import type { AgentNotifier, AgentStatus, AgentTask, CreateAgentTaskInput } from "./agentTypes.ts";
import { getTemplate } from "./agentTemplates.ts";

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

  enqueue(input: CreateAgentTaskInput): AgentTask {
    if (this.tasks.size >= this.maxTasks) {
      throw new Error(`작업 큐가 가득 찼습니다. (최대 ${this.maxTasks}개)`);
    }
    const template = getTemplate(input.templateId);
    if (!template) throw new Error(`알 수 없는 템플릿: ${input.templateId}`);
    const target = input.target.trim();
    if (!target) throw new Error("대상이 비어 있습니다.");
    const id = randomBytes(5).toString("base64url");
    const task: AgentTask = {
      id,
      templateId: template.id,
      templateLabel: template.label,
      target,
      inputs: input.inputs ?? {},
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    this.tasks.set(id, task);
    this.order.unshift(id);
    this.waiting.push(id);
    void this.tick();
    return task;
  }

  cancel(id: string): AgentTask | null {
    const task = this.tasks.get(id);
    if (!task) return null;
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
