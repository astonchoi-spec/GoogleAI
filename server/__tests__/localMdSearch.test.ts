import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { searchLocalNotes } from "../rag/localMdSearch.ts";

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
