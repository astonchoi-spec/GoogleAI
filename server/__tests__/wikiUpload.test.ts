// Step 1.5 (2026-05-12) — Wiki 페이지 업로드 백엔드 핸들러 단위 테스트.
// 통합(express + multipart) 대신 saveUploadedFile() 의 검증 로직과 디스크 기록을 직접 호출한다.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  saveUploadedFile,
  setUploadAllowedProjects,
  getUploadAllowedProjects,
} from "../knowledge/wikiUpload.ts";

const TMP_PREFIX = path.join(os.tmpdir(), "wiki-upload-test-");

function makePdfBase64(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64");
}

describe("wikiUpload — 화이트리스트", () => {
  it("research-inbox 와 _unmapped 는 항상 허용된다", () => {
    setUploadAllowedProjects(["hannam-644", "yeokbuk-pf"]);
    const allowed = getUploadAllowedProjects();
    expect(allowed).toContain("research-inbox");
    expect(allowed).toContain("_unmapped");
    expect(allowed).toContain("hannam-644");
  });
});

describe("wikiUpload — saveUploadedFile", () => {
  let tmpRoot: string;
  let prevEnv: string | undefined;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(TMP_PREFIX);
    prevEnv = process.env.ASTON_WIKI_ROOT;
    process.env.ASTON_WIKI_ROOT = tmpRoot;
    setUploadAllowedProjects(["hannam-644"]);
  });

  afterEach(async () => {
    if (prevEnv === undefined) delete process.env.ASTON_WIKI_ROOT;
    else process.env.ASTON_WIKI_ROOT = prevEnv;
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("허용 project 에 PDF 를 저장한다", async () => {
    const result = await saveUploadedFile({
      project: "hannam-644",
      filename: "test-report.pdf",
      base64: makePdfBase64("dummy pdf body"),
    });
    expect(result.status).toBe("created");
    expect(result.project).toBe("hannam-644");
    expect(result.willAutoIngest).toBe(true);
    expect(result.filename).toBe("test-report.pdf");
    const saved = await fs.readFile(result.savedPath, "utf-8");
    expect(saved).toBe("dummy pdf body");
  });

  it("이미지 파일은 willAutoIngest=false 로 저장된다", async () => {
    // 1x1 투명 PNG signature.
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]).toString("base64");
    const result = await saveUploadedFile({
      project: "hannam-644",
      filename: "screenshot.png",
      base64: png,
    });
    expect(result.willAutoIngest).toBe(false);
    expect(result.status).toBe("created");
  });

  it("저장 경로는 ${ASTON_WIKI_ROOT}/notebooklm-exports/{project}/{filename}", async () => {
    const result = await saveUploadedFile({
      project: "hannam-644",
      filename: "a.md",
      base64: Buffer.from("# header", "utf-8").toString("base64"),
    });
    const expected = path.join(tmpRoot, "notebooklm-exports", "hannam-644", "a.md");
    expect(result.savedPath).toBe(expected);
  });

  it("동일 파일명 재업로드 시 ` (2).pdf` 식으로 rename 된다", async () => {
    const b64 = makePdfBase64("first");
    const r1 = await saveUploadedFile({
      project: "hannam-644",
      filename: "report.pdf",
      base64: b64,
    });
    const r2 = await saveUploadedFile({
      project: "hannam-644",
      filename: "report.pdf",
      base64: makePdfBase64("second"),
    });
    expect(r1.status).toBe("created");
    expect(r1.filename).toBe("report.pdf");
    expect(r2.status).toBe("renamed");
    expect(r2.filename).toBe("report (2).pdf");
  });

  it("허용되지 않은 project 는 거부", async () => {
    await expect(
      saveUploadedFile({
        project: "unknown-project",
        filename: "a.pdf",
        base64: makePdfBase64("x"),
      }),
    ).rejects.toThrow(/허용되지 않은 project/);
  });

  it("허용되지 않은 확장자는 거부 (.exe)", async () => {
    await expect(
      saveUploadedFile({
        project: "hannam-644",
        filename: "evil.exe",
        base64: makePdfBase64("x"),
      }),
    ).rejects.toThrow(/허용되지 않은 확장자/);
  });

  it("경로 분리자가 포함된 파일명 거부 (path traversal)", async () => {
    await expect(
      saveUploadedFile({
        project: "hannam-644",
        filename: "../../etc/passwd.txt",
        base64: makePdfBase64("x"),
      }),
    ).rejects.toThrow(/잘못된 파일명/);
    await expect(
      saveUploadedFile({
        project: "hannam-644",
        filename: "sub/dir/a.pdf",
        base64: makePdfBase64("x"),
      }),
    ).rejects.toThrow(/잘못된 파일명/);
  });

  it("빈 base64 는 거부", async () => {
    await expect(
      saveUploadedFile({
        project: "hannam-644",
        filename: "a.pdf",
        base64: "",
      }),
    ).rejects.toThrow(/base64 payload 누락/);
  });

  it("data URL prefix 가 있어도 정상 디코딩", async () => {
    const inner = makePdfBase64("hello");
    const result = await saveUploadedFile({
      project: "hannam-644",
      filename: "b.pdf",
      base64: `data:application/pdf;base64,${inner}`,
    });
    const saved = await fs.readFile(result.savedPath, "utf-8");
    expect(saved).toBe("hello");
  });

  it("research-inbox 는 yaml 외라도 항상 허용", async () => {
    setUploadAllowedProjects([]); // yaml 0개라도 research-inbox/_unmapped 는 살아있음.
    const result = await saveUploadedFile({
      project: "research-inbox",
      filename: "research.md",
      base64: Buffer.from("body", "utf-8").toString("base64"),
    });
    expect(result.project).toBe("research-inbox");
  });
});
