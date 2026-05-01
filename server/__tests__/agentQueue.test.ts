import { describe, expect, it } from "vitest";
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
});
