import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { extractAttachmentText } from "./attachmentExtract";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "attach-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("extractAttachmentText — guards", () => {
  it("미지원 확장자 거부", async () => {
    const filePath = path.join(tmpDir, "evil.exe");
    await fs.writeFile(filePath, "binary");
    const result = await extractAttachmentText(filePath);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/지원하지 않는 확장자/);
  });

  it("파일이 없으면 거부", async () => {
    const filePath = path.join(tmpDir, "missing.pdf");
    const result = await extractAttachmentText(filePath);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/파일을 찾을 수 없습니다/);
  });

  it("디렉토리는 거부 (확장자가 .pdf인 디렉토리)", async () => {
    const dirPath = path.join(tmpDir, "inner.pdf");
    await fs.mkdir(dirPath);
    const result = await extractAttachmentText(dirPath);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/파일이 아닙니다/);
  });

  it("50MB 초과 거부", async () => {
    const filePath = path.join(tmpDir, "huge.txt");
    const fh = await fs.open(filePath, "w");
    await fh.truncate(51 * 1024 * 1024);
    await fh.close();
    const result = await extractAttachmentText(filePath);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/50MB/);
  });
});
