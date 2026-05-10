import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { searchLocalNotes, tokenize } from "../rag/localMdSearch.ts";

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = path.join(
    os.tmpdir(),
    `rag-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(tmpRoot, { recursive: true });
  process.env.ASTON_WIKI_ROOT = tmpRoot;
});

afterEach(async () => {
  delete process.env.ASTON_WIKI_ROOT;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe("rag/localMdSearch — Phase 4-A", () => {
  it("ASTON_WIKI_ROOT 가 비어있으면 [] 를 반환한다 (throw 금지)", async () => {
    const hits = await searchLocalNotes("한남 PF");
    expect(hits).toEqual([]);
  });

  it("ASTON_WIKI_ROOT 미설정이어도 [] 를 반환한다", async () => {
    delete process.env.ASTON_WIKI_ROOT;
    const hits = await searchLocalNotes("아무거나");
    expect(hits).toEqual([]);
  });
});

describe("tokenize", () => {
  it("한국어 어절 길이≥2, 영어 길이≥3, 그 외 제거", () => {
    const tokens = tokenize("한남 PF 진행 상황 어때 go BTC");
    expect(tokens).toContain("한남");
    expect(tokens).toContain("진행");
    expect(tokens).toContain("상황");
    expect(tokens).toContain("어때");
    expect(tokens).toContain("btc");
    expect(tokens).not.toContain("go"); // 영어 길이<3
    expect(tokens).not.toContain("pf"); // 영어 길이<3
  });

  it("영어는 lowercase 정규화", () => {
    const tokens = tokenize("HANNAM Project");
    expect(tokens).toContain("hannam");
    expect(tokens).toContain("project");
  });

  it("문장부호와 빈 토큰 제거", () => {
    const tokens = tokenize("한남, PF! 진행?");
    expect(tokens).toEqual(["한남", "진행"]);
  });
});
