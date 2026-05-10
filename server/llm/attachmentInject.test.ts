import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { injectAttachments } from "./attachmentInject";

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "inject-test-"));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("injectAttachments", () => {
  it("패턴 없으면 systemPrompt 그대로", async () => {
    const result = await injectAttachments("BASE", "안녕");
    expect(result.systemPrompt).toBe("BASE");
    expect(result.attachments).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("정상 첨부 1건 — systemPrompt에 [첨부 문서] 섹션 prepend", async () => {
    const filePath = path.join(tmpDir, "memo.md");
    await fs.writeFile(filePath, "# 제목\n본문", "utf8");
    const msg = `요약해줘 [첨부: ${filePath}]`;
    const result = await injectAttachments("BASE", msg);
    expect(result.systemPrompt).toContain("BASE");
    expect(result.systemPrompt).toContain("[첨부 문서]");
    expect(result.systemPrompt).toContain("[첨부 — memo.md]");
    expect(result.systemPrompt).toContain("# 제목");
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("다중 첨부 — \\n\\n---\\n 구분자", async () => {
    const f1 = path.join(tmpDir, "a.txt");
    const f2 = path.join(tmpDir, "b.txt");
    await fs.writeFile(f1, "AAA", "utf8");
    await fs.writeFile(f2, "BBB", "utf8");
    const msg = `[첨부: ${f1}] 그리고 [Attached: ${f2}]`;
    const result = await injectAttachments("BASE", msg);
    expect(result.attachments).toHaveLength(2);
    expect(result.systemPrompt).toContain("AAA");
    expect(result.systemPrompt).toContain("BBB");
    expect(result.systemPrompt).toContain("\n\n---\n");
  });

  it("실패 첨부는 (추출 실패: ...)로 노출, warnings에 사유", async () => {
    const missing = path.join(tmpDir, "ghost.pdf");
    const msg = `[첨부: ${missing}]`;
    const result = await injectAttachments("BASE", msg);
    expect(result.attachments[0].ok).toBe(false);
    expect(result.systemPrompt).toContain("추출 실패");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("한국어 콜론(：)도 매치", async () => {
    const filePath = path.join(tmpDir, "k.md");
    await fs.writeFile(filePath, "한글 본문", "utf8");
    const msg = `[첨부：${filePath}]`;
    const result = await injectAttachments("BASE", msg);
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].ok).toBe(true);
  });
});
