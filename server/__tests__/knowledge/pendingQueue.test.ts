import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as queueModule from "../../knowledge/storage/pendingQueue.ts";
import type { TaggedDocument, RoutingDecision } from "../../knowledge/types.ts";

function makeDoc(): TaggedDocument {
  return {
    source_type: "telegram",
    source_ref: "tg:1:1",
    raw_text: "test",
    received_at: "2026-05-07T00:00:00+09:00",
    cleaned_text: "test",
    category: "other",
    suggested_projects: [],
    classification_confidence: 0,
    title: "test",
    summary: "test",
    key_points: [],
    action_item_candidates: [],
    tags: [],
    people: [],
    companies: [],
    importance: "normal",
    permanent_knowledge: false,
    privacy_level: "private",
    step_failures: [],
    quality: "complete",
  };
}

function makeRoute(): RoutingDecision {
  return { target_folder: "/tmp/inbox/telegram", routing_reason: "inbox_fallback" };
}

describe("pendingQueue", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pending-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("새 항목 enqueue", async () => {
    const filePath = await queueModule.enqueuePending(makeDoc(), makeRoute(), new Error("disk full"));
    expect(filePath).toContain("wiki-pending");
    const items = await queueModule.listPending();
    expect(items).toHaveLength(1);
    expect(items[0].source_ref).toBe("tg:1:1");
    expect(items[0].attempts).toBe(1);
    expect(items[0].last_error).toBe("disk full");
  });

  it("같은 source_ref 재실패 시 attempts 증가", async () => {
    await queueModule.enqueuePending(makeDoc(), makeRoute(), new Error("err1"));
    await queueModule.enqueuePending(makeDoc(), makeRoute(), new Error("err2"));
    const items = await queueModule.listPending();
    expect(items).toHaveLength(1);
    expect(items[0].attempts).toBe(2);
    expect(items[0].last_error).toBe("err2");
    expect(items[0].first_failed_at).toBeTruthy();
  });

  it("removePending — 큐에서 제거", async () => {
    await queueModule.enqueuePending(makeDoc(), makeRoute(), new Error("e"));
    expect((await queueModule.listPending()).length).toBe(1);
    const removed = await queueModule.removePending("tg:1:1");
    expect(removed).toBe(true);
    expect((await queueModule.listPending()).length).toBe(0);
  });

  it("listPending — 큐 비어있으면 빈 배열", async () => {
    expect(await queueModule.listPending()).toEqual([]);
  });
});
