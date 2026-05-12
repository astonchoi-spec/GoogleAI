import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  DEAL_CATEGORY_DIRS,
  addMilestone,
  clearDealDeadline,
  completeMilestone,
  createDeal,
  ensureDealFolder,
  findDealByPartialName,
  getDeal,
  listDeals,
  removeMilestone,
  saveFile,
  setDealDeadline,
  updateDealMeta,
} from "../deals/index.ts";
import { parseDealDate } from "../deals/dateParser.ts";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `deals-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmpDir, { recursive: true });
  process.env.DEALS_ROOT = tmpDir;
});

afterEach(async () => {
  delete process.env.DEALS_ROOT;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("dealStore", () => {
  it("creates deal folder with six category folders", async () => {
    const folder = await ensureDealFolder("한남동644");
    const entries = await fs.readdir(folder);
    expect(entries).toEqual(expect.arrayContaining(Object.values(DEAL_CATEGORY_DIRS)));
  });

  it("creates and reads _deal.json", async () => {
    const created = await createDeal("한남동644");
    const metaFile = path.join(created.drivePath, "_deal.json");
    await expect(fs.stat(metaFile)).resolves.toBeTruthy();
    const read = await getDeal("한남동644");
    expect(read.name).toBe("한남동644");
    expect(read.status).toBe("reviewing");
  });

  it("updates _deal.json metadata", async () => {
    await createDeal("한남동644");
    const updated = await updateDealMeta("한남동644", { status: "completed", notebookUrl: "https://notebooklm.google.com/notebook/xxx" });
    expect(updated.status).toBe("completed");
    expect(updated.notebookUrl).toContain("notebooklm.google.com");
  });

  it("saves file and refreshes category count", async () => {
    await createDeal("한남동644");
    const result = await saveFile("한남동644", "contract", "한남동644 변경계약서.pdf", Buffer.from("pdf"));
    expect(result.savedName).toMatch(/한남동644 변경계약서\.pdf$/);
    await expect(fs.stat(result.filePath)).resolves.toBeTruthy();
    const meta = await getDeal("한남동644");
    expect(meta.fileCount.contract).toBe(1);
  });

  it("matches partial typo-like deal name", async () => {
    await createDeal("한남동644");
    const match = await findDealByPartialName("한남644");
    expect(match.type).toBe("single");
    if (match.type === "single") expect(match.deal.name).toBe("한남동644");
  });

  it("returns ambiguous partial matches", async () => {
    await createDeal("한남동644");
    await createDeal("한남동777");
    const match = await findDealByPartialName("한남");
    expect(match.type).toBe("ambiguous");
    if (match.type === "ambiguous") expect(match.candidates).toHaveLength(2);
  });

  it("sanitizes Windows forbidden characters in deal folder names", async () => {
    const meta = await createDeal('한남/동:644*?"<>|');
    expect(meta.name).toBe("한남동644");
    expect(path.basename(meta.drivePath)).toBe("한남동644");
  });

  it("adds -2 suffix on filename collision", async () => {
    await createDeal("한남동644");
    const fixedDate = new Date("2026-05-01T05:32:10.000Z");
    const first = await saveFile("한남동644", "contract", "변경계약서.pdf", Buffer.from("one"), fixedDate);
    const second = await saveFile("한남동644", "contract", "변경계약서.pdf", Buffer.from("two"), fixedDate);
    expect(first.savedName).toBe("2026-05-01-14-32-10-변경계약서.pdf");
    expect(second.savedName).toBe("2026-05-01-14-32-10-변경계약서-2.pdf");
  });

  it("lists deals grouped by status", async () => {
    await createDeal("한남동644");
    await createDeal("행당동 역세권");
    await updateDealMeta("행당동 역세권", { status: "active" });
    const result = await listDeals();
    expect(result.all).toHaveLength(2);
    expect(result.grouped.reviewing).toHaveLength(1);
    expect(result.grouped.active).toHaveLength(1);
  });

  it("sets and clears deal deadline", async () => {
    await createDeal("한남동644");
    const iso = parseDealDate("2026-06-30")!;
    const updated = await setDealDeadline("한남동644", iso, "사업협약 체결");
    expect(updated.deadline).toBe(iso);
    expect(updated.deadlineLabel).toBe("사업협약 체결");

    const cleared = await clearDealDeadline("한남동644");
    expect(cleared.deadline).toBeUndefined();
    expect(cleared.deadlineLabel).toBeUndefined();
  });

  it("adds milestones sorted by date and persists across reads", async () => {
    await createDeal("한남동644");
    const a = parseDealDate("2026-06-30")!;
    const b = parseDealDate("2026-05-15")!;
    await addMilestone("한남동644", "사업협약", a);
    await addMilestone("한남동644", "인허가신청", b);
    const meta = await getDeal("한남동644");
    expect(meta.milestones).toHaveLength(2);
    expect(meta.milestones![0].label).toBe("인허가신청");
    expect(meta.milestones![1].label).toBe("사업협약");
  });

  it("completes a milestone by partial label match", async () => {
    await createDeal("한남동644");
    const iso = parseDealDate("2026-05-15")!;
    await addMilestone("한남동644", "인허가 신청", iso);
    const { milestone } = await completeMilestone("한남동644", "인허가");
    expect(milestone.done).toBe(true);
    expect(milestone.completedAt).toBeTruthy();
    const meta = await getDeal("한남동644");
    expect(meta.milestones![0].done).toBe(true);
  });

  it("removes a milestone", async () => {
    await createDeal("한남동644");
    await addMilestone("한남동644", "심의 의결", parseDealDate("2026-06-01")!);
    await removeMilestone("한남동644", "심의");
    const meta = await getDeal("한남동644");
    expect(meta.milestones).toHaveLength(0);
  });

  it("rejects milestone operations on missing labels", async () => {
    await createDeal("한남동644");
    await addMilestone("한남동644", "인허가", parseDealDate("2026-05-15")!);
    await expect(completeMilestone("한남동644", "존재안함")).rejects.toThrow();
  });
});
