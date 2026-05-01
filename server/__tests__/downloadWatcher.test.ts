import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDeal } from "../deals/dealStore.ts";
import { handleDownloadedFile } from "../deals/downloadWatcher.ts";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `download-watcher-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmpDir, { recursive: true });
  process.env.DEALS_ROOT = path.join(tmpDir, "deals");
});

afterEach(async () => {
  delete process.env.DEALS_ROOT;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function write(name: string, size: number): Promise<string> {
  const filePath = path.join(tmpDir, name);
  await fs.writeFile(filePath, Buffer.alloc(size, 1));
  return filePath;
}

describe("downloadWatcher", () => {
  it("ignores temporary download files", async () => {
    const result = await handleDownloadedFile(await write("자료.crdownload", 2_000_000)) as any;
    expect(result.status).toBe("ignored");
  });

  it("ignores standalone images", async () => {
    const result = await handleDownloadedFile(await write("image_1.png", 2_000_000)) as any;
    expect(result.status).toBe("ignored");
  });

  it("ignores files smaller than 1MB", async () => {
    const result = await handleDownloadedFile(await write("작은자료.pdf", 1000)) as any;
    expect(result.status).toBe("ignored");
    expect(result.reason).toBe("small-file");
  });

  it("classifies normal PDF downloads", async () => {
    await createDeal("한남동644");
    const result = await handleDownloadedFile(await write("한남동644_계약서.pdf", 2_000_000)) as any;
    expect(result.status).toBe("saved");
    expect(result.dealName).toBe("한남동644");
  });
});
