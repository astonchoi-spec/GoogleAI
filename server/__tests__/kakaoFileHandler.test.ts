import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDeal } from "../deals/dealStore.ts";
import {
  getPendingKakaoFile,
  handleNewFile,
  isIgnoredKakaoFile,
} from "../deals/kakaoFileHandler.ts";

let tmpDir: string;
let sourceDir: string;

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `kakao-handler-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  sourceDir = path.join(tmpDir, "kakao");
  await fs.mkdir(sourceDir, { recursive: true });
  process.env.DEALS_ROOT = path.join(tmpDir, "deals");
});

afterEach(async () => {
  delete process.env.DEALS_ROOT;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeSource(fileName: string, content = "pdf"): Promise<string> {
  const filePath = path.join(sourceDir, fileName);
  await fs.writeFile(filePath, content);
  return filePath;
}

describe("kakaoFileHandler", () => {
  it.each(["KakaoTalk_20260101_test.mp4", "서울제일내과의원_검진.pdf", "download.tmp"])("ignores %s", (fileName) => {
    expect(isIgnoredKakaoFile(fileName)).toBe(true);
  });

  it("auto-saves exact deal matches without deleting the source file", async () => {
    await createDeal("용인신대지구");
    const filePath = await writeSource("용인신대지구_사업계획서.pdf");
    const notifyText = vi.fn(async () => {});

    const result = await handleNewFile(filePath, { notifyText });

    expect(result.status).toBe("saved");
    if (result.status === "saved") {
      expect(result.category).toBe("feasibility");
      await expect(fs.stat(result.filePath)).resolves.toBeTruthy();
    }
    await expect(fs.stat(filePath)).resolves.toBeTruthy();
    expect(notifyText).toHaveBeenCalledWith(expect.stringContaining("✅ 카톡 자료 자동 분류"));
  });

  it("creates pending classification buttons for ambiguous files", async () => {
    await createDeal("용인신대지구");
    await createDeal("포항 해상케이블카");
    const filePath = await writeSource("사업계획서_제1권.pdf");
    const notifyPrompt = vi.fn(async () => {});

    const result = await handleNewFile(filePath, { notifyPrompt });

    expect(result.status).toBe("pending");
    if (result.status === "pending") {
      expect(result.candidates.map((deal) => deal.name)).toEqual(expect.arrayContaining(["용인신대지구", "포항 해상케이블카"]));
      expect(getPendingKakaoFile(result.tempId)?.fileName).toBe("사업계획서_제1권.pdf");
    }
    expect(notifyPrompt).toHaveBeenCalledWith(
      expect.stringContaining("📥 카톡 신규 파일"),
      expect.objectContaining({ inline_keyboard: expect.any(Array) }),
    );
  });

  it("expires temporary classification records", async () => {
    await createDeal("용인신대지구");
    const filePath = await writeSource("미분류_자료.pdf");
    const result = await handleNewFile(filePath, {
      notifyPrompt: vi.fn(async () => {}),
      ttlMs: 5,
    });

    expect(result.status).toBe("pending");
    if (result.status === "pending") {
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(getPendingKakaoFile(result.tempId)).toBeNull();
    }
  });
});
