import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentQueue } from "../agents/agentQueue.ts";
import type { AgentTask } from "../agents/agentTypes.ts";

function instantRunner(): (task: AgentTask, signal: AbortSignal) => Promise<{ markdown: string; wikiPath: string | null }> {
  return async (task) => ({ markdown: `# ${task.templateLabel}\n${task.target}`, wikiPath: null });
}

function delayedRunner(ms: number) {
  return (task: AgentTask, signal: AbortSignal) =>
    new Promise<{ markdown: string; wikiPath: string | null }>((resolve, reject) => {
      const timer = setTimeout(() => resolve({ markdown: "ok", wikiPath: null }), ms);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      });
    });
}

const ORIG_LEVEL = process.env.AGENT_PERMISSION_LEVEL;
const ORIG_APPROVAL_TIMEOUT = process.env.AGENT_APPROVAL_TIMEOUT_MIN;

beforeEach(() => {
  process.env.AGENT_PERMISSION_LEVEL = "3";
});

afterEach(() => {
  if (ORIG_LEVEL === undefined) delete process.env.AGENT_PERMISSION_LEVEL;
  else process.env.AGENT_PERMISSION_LEVEL = ORIG_LEVEL;
  if (ORIG_APPROVAL_TIMEOUT === undefined) delete process.env.AGENT_APPROVAL_TIMEOUT_MIN;
  else process.env.AGENT_APPROVAL_TIMEOUT_MIN = ORIG_APPROVAL_TIMEOUT;
});

describe("AgentQueue", () => {
  it("enqueues a task and runs it to completion", async () => {
    const queue = new AgentQueue({ runner: instantRunner() });
    const task = queue.enqueue({ templateId: "pf-comprehensive", target: "한남동644" });
    expect(task.status).toBe("pending");
    await queue.waitForIdle();
    const fetched = queue.get(task.id);
    expect(fetched?.status).toBe("completed");
    expect(fetched?.resultPreview).toContain("PF 종합");
  });

  it("rejects unknown templates", () => {
    const queue = new AgentQueue({ runner: instantRunner() });
    expect(() => queue.enqueue({ templateId: "no-such", target: "X" })).toThrow();
  });

  it("rejects empty target", () => {
    const queue = new AgentQueue({ runner: instantRunner() });
    expect(() => queue.enqueue({ templateId: "pf-comprehensive", target: "  " })).toThrow();
  });

  it("enforces max task limit", () => {
    const queue = new AgentQueue({ runner: delayedRunner(50), maxTasks: 3 });
    queue.enqueue({ templateId: "pf-comprehensive", target: "A" });
    queue.enqueue({ templateId: "pf-comprehensive", target: "B" });
    queue.enqueue({ templateId: "pf-comprehensive", target: "C" });
    expect(() => queue.enqueue({ templateId: "pf-comprehensive", target: "D" })).toThrow(/가득/);
  });

  it("cancels a pending task", async () => {
    const queue = new AgentQueue({ runner: delayedRunner(200) });
    queue.enqueue({ templateId: "pf-comprehensive", target: "A" });
    const second = queue.enqueue({ templateId: "pf-comprehensive", target: "B" });
    const cancelled = queue.cancel(second.id);
    expect(cancelled?.status).toBe("cancelled");
    await queue.waitForIdle();
  });

  it("times out a long-running task", async () => {
    const queue = new AgentQueue({ runner: delayedRunner(2000), taskTimeoutMs: 80 });
    const task = queue.enqueue({ templateId: "pf-comprehensive", target: "slow" });
    await queue.waitForIdle();
    const final = queue.get(task.id);
    expect(["failed", "cancelled"]).toContain(final?.status);
  });

  it("runs tasks sequentially (concurrency 1)", async () => {
    let active = 0;
    let maxObserved = 0;
    const tracker = (_task: AgentTask, _signal: AbortSignal) =>
      new Promise<{ markdown: string; wikiPath: string | null }>((resolve) => {
        active += 1;
        maxObserved = Math.max(maxObserved, active);
        setTimeout(() => {
          active -= 1;
          resolve({ markdown: "ok", wikiPath: null });
        }, 30);
      });
    const queue = new AgentQueue({ runner: tracker });
    for (let i = 0; i < 4; i += 1) queue.enqueue({ templateId: "pf-comprehensive", target: `t${i}` });
    await queue.waitForIdle();
    expect(maxObserved).toBe(1);
  });

  it("returns final tasks by KST date only", async () => {
    const queue = new AgentQueue({ runner: instantRunner() });
    const first = queue.enqueue({ templateId: "pf-comprehensive", target: "A" });
    queue.enqueue({ templateId: "pf-comprehensive", target: "B" });
    await queue.waitForIdle();
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const tasks = queue.getTasksByDate(today);

    expect(tasks.map((task) => task.id)).toContain(first.id);
    expect(tasks.every((task) => task.status === "completed")).toBe(true);
  });

  it("keeps level 2 tasks awaiting approval until approved", async () => {
    process.env.AGENT_PERMISSION_LEVEL = "2";
    const queue = new AgentQueue({ runner: instantRunner() });
    const task = queue.enqueue({ templateId: "pf-comprehensive", target: "A" });
    expect(task.status).toBe("awaiting_approval");
    expect(queue.get(task.id)?.status).toBe("awaiting_approval");
    queue.approve(task.id);
    await queue.waitForIdle();
    expect(queue.get(task.id)?.status).toBe("completed");
  });

  it("rejects level 2 tasks on owner rejection", () => {
    process.env.AGENT_PERMISSION_LEVEL = "2";
    const queue = new AgentQueue({ runner: instantRunner() });
    const task = queue.enqueue({ templateId: "pf-comprehensive", target: "A" });
    const rejected = queue.reject(task.id);
    expect(rejected?.status).toBe("rejected");
  });

  it("auto rejects approval requests after timeout", async () => {
    process.env.AGENT_PERMISSION_LEVEL = "2";
    process.env.AGENT_APPROVAL_TIMEOUT_MIN = "0.001";
    const queue = new AgentQueue({ runner: instantRunner() });
    const task = queue.enqueue({ templateId: "pf-comprehensive", target: "A" });
    await new Promise((resolve) => setTimeout(resolve, 90));
    expect(queue.get(task.id)?.status).toBe("rejected");
  });
});
