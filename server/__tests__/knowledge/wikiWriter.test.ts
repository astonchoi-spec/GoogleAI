import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveWikiRoot, hashRawText, saveWikiEntry } from "../../knowledge/storage/wikiWriter.ts";
import type { TaggedDocument, RoutingDecision } from "../../knowledge/types.ts";

function makeDoc(overrides: Partial<TaggedDocument> = {}): TaggedDocument {
  const base: TaggedDocument = {
    source_type: "telegram",
    source_ref: "tg:1234:567",
    raw_text: "한남644 인허가 5/15 신청 예정.",
    received_at: "2026-05-07T14:30:00+09:00",
    cleaned_text: "한남644 인허가 5/15 신청 예정.",
    category: "real-estate",
    suggested_projects: ["hannam-644"],
    classification_confidence: 0.9,
    title: "한남644 인허가 진행",
    summary: "한남644 인허가 5/15 신청 예정.",
    key_points: [],
    action_item_candidates: [{ text: "5/13까지 변호사 검토", due_date: "2026-05-13", assignee: "본인" }],
    tags: ["부동산PF", "한남644"],
    people: [],
    companies: [],
    importance: "high",
    permanent_knowledge: false,
    privacy_level: "private",
    step_failures: [],
    quality: "complete",
  };
  return { ...base, ...overrides };
}

function makeRoute(targetFolder: string, reason: RoutingDecision["routing_reason"] = "explicit_command"): RoutingDecision {
  return { target_folder: targetFolder, routing_reason: reason };
}

describe("wikiWriter", () => {
  let tmpRoot: string;
  let originalAston: string | undefined;
  let originalWiki: string | undefined;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-wiki-"));
    originalAston = process.env.ASTON_WIKI_ROOT;
    originalWiki = process.env.WIKI_ROOT;
    process.env.ASTON_WIKI_ROOT = tmpRoot;
  });

  afterEach(async () => {
    if (originalAston === undefined) delete process.env.ASTON_WIKI_ROOT;
    else process.env.ASTON_WIKI_ROOT = originalAston;
    if (originalWiki === undefined) delete process.env.WIKI_ROOT;
    else process.env.WIKI_ROOT = originalWiki;
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  describe("resolveWikiRoot", () => {
    it("ASTON_WIKI_ROOT 우선", () => {
      expect(resolveWikiRoot()).toBe(tmpRoot);
    });

    it("ASTON_WIKI_ROOT 없으면 WIKI_ROOT", () => {
      delete process.env.ASTON_WIKI_ROOT;
      process.env.WIKI_ROOT = "/some/legacy/wiki";
      expect(resolveWikiRoot()).toBe("/some/legacy/wiki");
    });

    it("둘 다 없으면 data/test-wiki 기본값", () => {
      delete process.env.ASTON_WIKI_ROOT;
      delete process.env.WIKI_ROOT;
      expect(resolveWikiRoot()).toContain("data");
      expect(resolveWikiRoot()).toContain("test-wiki");
    });
  });

  describe("hashRawText", () => {
    it("동일 입력은 동일 해시", () => {
      expect(hashRawText("hello")).toBe(hashRawText("hello"));
    });

    it("다른 입력은 다른 해시", () => {
      expect(hashRawText("hello")).not.toBe(hashRawText("hello!"));
    });
  });

  describe("saveWikiEntry — 첫 저장", () => {
    it("explicit_command 라우팅으로 projects/{project}/notes/에 저장", async () => {
      const doc = makeDoc();
      const targetDir = path.join(tmpRoot, "projects", "hannam-644", "notes");
      const entry = await saveWikiEntry(doc, makeRoute(targetDir));
      expect(entry.was_skipped).toBeUndefined();
      expect(entry.saved_path).toContain(path.join("projects", "hannam-644", "notes"));
      const content = await fs.readFile(entry.saved_path, "utf8");
      expect(content).toContain("source_type: telegram");
      expect(content).toContain("source_ref: 'tg:1234:567'");
      expect(content).toContain("category: real-estate");
      expect(content).toContain(`raw_text_hash: ${hashRawText(doc.raw_text)}`);
      expect(content).toContain("## 원문");
      expect(content).toContain("한남644 인허가 5/15 신청 예정.");
    });

    it("inbox 라우팅으로 inbox/{source_type}/에 저장", async () => {
      const doc = makeDoc();
      const targetDir = path.join(tmpRoot, "inbox", "telegram");
      const entry = await saveWikiEntry(doc, makeRoute(targetDir, "inbox_fallback"));
      expect(entry.saved_path).toContain(path.join("inbox", "telegram"));
    });

    it("frontmatter에 action_items가 YAML로 직렬화됨", async () => {
      const doc = makeDoc();
      const entry = await saveWikiEntry(doc, makeRoute(path.join(tmpRoot, "inbox", "telegram"), "inbox_fallback"));
      const content = await fs.readFile(entry.saved_path, "utf8");
      expect(content).toContain("action_items:");
      expect(content).toContain("text: '5/13까지 변호사 검토'");
      expect(content).toContain("due_date: '2026-05-13'");
    });

    it("step_failures가 비어 있으면 frontmatter에 미포함, partial이면 포함", async () => {
      const completeDoc = makeDoc();
      const e1 = await saveWikiEntry(completeDoc, makeRoute(path.join(tmpRoot, "inbox", "telegram"), "inbox_fallback"));
      const c1 = await fs.readFile(e1.saved_path, "utf8");
      expect(c1).not.toContain("step_failures:");
      expect(c1).toContain("quality: complete");

      const partialDoc = makeDoc({
        source_ref: "tg:1234:888",
        step_failures: ["classify"],
        quality: "partial",
      });
      const e2 = await saveWikiEntry(partialDoc, makeRoute(path.join(tmpRoot, "inbox", "telegram"), "inbox_fallback"));
      const c2 = await fs.readFile(e2.saved_path, "utf8");
      expect(c2).toContain("step_failures: ['classify']");
      expect(c2).toContain("quality: partial");
    });
  });

  describe("멱등성 — Track A", () => {
    it("같은 source_ref + 같은 raw_text는 skip", async () => {
      const doc = makeDoc();
      const targetDir = path.join(tmpRoot, "inbox", "telegram");
      const e1 = await saveWikiEntry(doc, makeRoute(targetDir, "inbox_fallback"));
      expect(e1.was_skipped).toBeUndefined();
      const e2 = await saveWikiEntry(doc, makeRoute(targetDir, "inbox_fallback"));
      expect(e2.was_skipped).toBe(true);
      expect(e2.saved_path).toBe(e1.saved_path);

      // 파일은 1개만
      const files = await fs.readdir(targetDir);
      expect(files.filter((f) => f.endsWith(".md")).length).toBe(1);
    });

    it("같은 source_ref + 다른 raw_text는 skip 아님 (다른 파일 생성)", async () => {
      const doc1 = makeDoc({ raw_text: "원문 A" });
      const doc2 = makeDoc({ raw_text: "원문 B" });
      const targetDir = path.join(tmpRoot, "inbox", "telegram");
      const e1 = await saveWikiEntry(doc1, makeRoute(targetDir, "inbox_fallback"));
      const e2 = await saveWikiEntry(doc2, makeRoute(targetDir, "inbox_fallback"));
      expect(e1.was_skipped).toBeUndefined();
      expect(e2.was_skipped).toBeUndefined();
      expect(e1.saved_path).not.toBe(e2.saved_path);
    });

    it("reprocess_requested: true가 frontmatter에 있으면 skip 해제", async () => {
      const doc = makeDoc();
      const targetDir = path.join(tmpRoot, "inbox", "telegram");
      const e1 = await saveWikiEntry(doc, makeRoute(targetDir, "inbox_fallback"));

      // 기존 파일에 reprocess_requested: true 추가
      const original = await fs.readFile(e1.saved_path, "utf8");
      const modified = original.replace("status: active", "status: active\nreprocess_requested: true");
      await fs.writeFile(e1.saved_path, modified, "utf8");

      const e2 = await saveWikiEntry(doc, makeRoute(targetDir, "inbox_fallback"));
      expect(e2.was_skipped).toBeUndefined(); // 재처리됨
      // 새 파일 (suffix -2)
      expect(e2.saved_path).not.toBe(e1.saved_path);
    });
  });
});
