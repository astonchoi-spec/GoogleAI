import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDeal } from "../deals/dealStore.ts";
import { classifyAndSaveFile, shouldIgnoreFile } from "../deals/fileClassifier.ts";

let tmpDir: string;
let sourceDir: string;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `file-classifier-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  sourceDir = path.join(tmpDir, "source");
  await fs.mkdir(sourceDir, { recursive: true });
  process.env.DEALS_ROOT = path.join(tmpDir, "deals");
});

afterEach(async () => {
  delete process.env.DEALS_ROOT;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeSource(name: string, size = 1024 * 1024 + 1): Promise<string> {
  const filePath = path.join(sourceDir, name);
  await fs.writeFile(filePath, Buffer.alloc(size, 1));
  return filePath;
}

describe("fileClassifier", () => {
  it.each([
    ["kakao", "✅ 카톡 자료 자동 분류"],
    ["gmail", "✅ Gmail 자료 자동 분류"],
    ["download", "✅ 다운로드 자료 자동 분류"],
  ] as const)("formats %s source notification", async (source, expected) => {
    await createDeal("한남동644");
    const filePath = await writeSource("한남동644_계약서.pdf");
    const notifyText = vi.fn(async () => {});

    await classifyAndSaveFile({ source, filepath: filePath, originalName: path.basename(filePath), notifyText });

    expect(notifyText).toHaveBeenCalledWith(expect.stringContaining(expected));
  });

  it("combines source-specific ignore rules", () => {
    expect(shouldIgnoreFile("kakao", "KakaoTalk_20260101.mp4")).toBeTruthy();
    expect(shouldIgnoreFile("gmail", "제안서.pdf", { subject: "광고 할인 쿠폰" })).toBeTruthy();
    expect(shouldIgnoreFile("download", "Screenshot_1.png", { sizeBytes: 2_000_000 })).toBeTruthy();
  });

  it("uses Gmail subject metadata for exact matching", async () => {
    await createDeal("포항 해상케이블카");
    const filePath = await writeSource("사업계획서_제1권.pdf");
    const notifyText = vi.fn(async () => {});

    const result = await classifyAndSaveFile({
      source: "gmail",
      filepath: filePath,
      originalName: "사업계획서_제1권.pdf",
      metadata: { subject: "포항 해상케이블카 PF 자료" },
      notifyText,
    });

    expect(result.status).toBe("saved");
    if (result.status === "saved") expect(result.dealName).toBe("포항 해상케이블카");
  });

  it("creates pending classification when there is no exact match", async () => {
    await createDeal("용인신대지구");
    const filePath = await writeSource("사업계획서_제1권.pdf");
    const notifyPrompt = vi.fn(async () => {});

    const result = await classifyAndSaveFile({ source: "download", filepath: filePath, originalName: "사업계획서_제1권.pdf", notifyPrompt, ttlMs: 50 });

    expect(result.status).toBe("pending");
    expect(notifyPrompt).toHaveBeenCalledWith(expect.stringContaining("💾 다운로드 신규 파일"), expect.any(Object));
  });

  it("keeps source file while saving exact matches", async () => {
    await createDeal("용인신대지구");
    const filePath = await writeSource("용인신대지구_사업계획서.pdf");
    const result = await classifyAndSaveFile({ source: "download", filepath: filePath, originalName: "용인신대지구_사업계획서.pdf", notifyText: vi.fn(async () => {}) });

    expect(result.status).toBe("saved");
    await expect(fs.stat(filePath)).resolves.toBeTruthy();
  });
});
