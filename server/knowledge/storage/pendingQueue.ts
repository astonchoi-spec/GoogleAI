// I/O 실패 시 PipelineInput을 보존하는 pending 큐.
// data/wiki-pending/{hash}.json 형태로 저장.
// 데이터 유실 방지가 최우선. 재시도는 별도 도구.

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { PendingItem, RoutingDecision, TaggedDocument } from "../types.ts";

export function getPendingDir(): string {
  return path.resolve(process.cwd(), "data", "wiki-pending");
}

function pendingKey(sourceRef: string): string {
  return crypto.createHash("sha256").update(sourceRef).digest("hex").slice(0, 16);
}

export async function enqueuePending(
  doc: TaggedDocument,
  route: RoutingDecision,
  error: Error,
): Promise<string> {
  await fs.mkdir(getPendingDir(), { recursive: true });
  const key = pendingKey(doc.source_ref);
  const filePath = path.join(getPendingDir(), `${key}.json`);

  let existing: PendingItem | null = null;
  try {
    existing = JSON.parse(await fs.readFile(filePath, "utf8")) as PendingItem;
  } catch {
    /* not exist */
  }

  const now = new Date().toISOString();
  const item: PendingItem = {
    source_ref: doc.source_ref,
    doc,
    route,
    attempts: (existing?.attempts ?? 0) + 1,
    last_error: error.message,
    first_failed_at: existing?.first_failed_at ?? now,
    last_attempt_at: now,
  };

  await fs.writeFile(filePath, JSON.stringify(item, null, 2), "utf8");
  return filePath;
}

export async function listPending(): Promise<PendingItem[]> {
  try {
    const entries = await fs.readdir(getPendingDir());
    const items: PendingItem[] = [];
    for (const name of entries) {
      if (!name.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(getPendingDir(), name), "utf8");
        items.push(JSON.parse(raw) as PendingItem);
      } catch (e) {
        console.error("[pendingQueue] read failed:", name, e);
      }
    }
    return items;
  } catch {
    return [];
  }
}

export async function removePending(sourceRef: string): Promise<boolean> {
  const filePath = path.join(getPendingDir(), `${pendingKey(sourceRef)}.json`);
  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}
