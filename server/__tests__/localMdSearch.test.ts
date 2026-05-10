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

async function writeNote(
  project: string,
  fileName: string,
  frontmatter: Record<string, string | string[]>,
  body: string,
): Promise<string> {
  const dir = path.join(tmpRoot, "projects", project, "notebooklm");
  await fs.mkdir(dir, { recursive: true });
  const fmLines = Object.entries(frontmatter).map(([k, v]) =>
    Array.isArray(v) ? `${k}: [${v.join(", ")}]` : `${k}: ${v}`,
  );
  const content = `---\n${fmLines.join("\n")}\n---\n${body}\n`;
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, content, "utf-8");
  return filePath;
}

describe("file scanning", () => {
  it("projects/{p}/notebooklm/*.md 만 수집한다", async () => {
    await writeNote(
      "hannam-644",
      "2026-05-08-사업성.md",
      { tags: ["pf"] },
      "한남 사업성 분석",
    );
    // 검색 대상 외부 파일 (notebooklm 하위가 아님) — 무시되어야 함
    const outsideDir = path.join(tmpRoot, "projects", "hannam-644", "notes");
    await fs.mkdir(outsideDir, { recursive: true });
    await fs.writeFile(path.join(outsideDir, "memo.md"), "한남 메모", "utf-8");

    const hits = await searchLocalNotes("한남");
    expect(hits.length).toBe(1);
    expect(hits[0].project).toBe("hannam-644");
    expect(hits[0].fileName).toBe("2026-05-08-사업성.md");
  });

  it("frontmatter tags/categories 와 본문이 NoteHit 에 채워진다", async () => {
    await writeNote(
      "hannam-644",
      "test.md",
      { tags: ["pf", "hannam"], categories: ["realestate"] },
      "한남 사업성",
    );
    const hits = await searchLocalNotes("한남");
    expect(hits[0].frontmatter.tags).toEqual(["pf", "hannam"]);
    expect(hits[0].frontmatter.categories).toEqual(["realestate"]);
  });
});

describe("cache", () => {
  it("두 번째 호출도 동일 결과 (mtime 기반 캐시 hit)", async () => {
    await writeNote("hannam-644", "test.md", {}, "한남 사업성 분석");
    const first = await searchLocalNotes("한남");
    expect(first.length).toBe(1);
    const second = await searchLocalNotes("한남");
    expect(second[0].snippet).toContain("한남");
  });

  it("파일 mtime 변경 시 캐시가 무효화된다", async () => {
    const filePath = await writeNote(
      "hannam-644",
      "test.md",
      {},
      "한남 사업성 분석",
    );
    await searchLocalNotes("한남");
    await new Promise((r) => setTimeout(r, 50));
    await fs.writeFile(filePath, "---\n---\n역삼 빌딩 검토\n", "utf-8");
    const future = new Date(Date.now() + 5000);
    await fs.utimes(filePath, future, future);
    const hits = await searchLocalNotes("역삼");
    expect(hits.length).toBe(1);
    expect(hits[0].snippet).toContain("역삼");
  });
});

describe("scoring — frontmatter weight", () => {
  it("tag 일치 시 가중치 1.5× (동일 TF 인 경우 tag 있는 쪽이 더 높다)", async () => {
    await writeNote("a", "with-tag.md", { tags: ["한남"] }, "한남 한 줄");
    await writeNote("b", "no-tag.md", {}, "한남 한 줄");
    const hits = await searchLocalNotes("한남");
    expect(hits.length).toBe(2);
    expect(hits[0].project).toBe("a");
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });

  it("categories 일치도 동일하게 1.5× 가중치", async () => {
    await writeNote(
      "a",
      "with-cat.md",
      { categories: ["realestate"] },
      "realestate 한 줄",
    );
    await writeNote("b", "no-cat.md", {}, "realestate 한 줄");
    const hits = await searchLocalNotes("realestate");
    expect(hits[0].project).toBe("a");
  });
});

describe("scoring — title/filename bonus", () => {
  it("파일명에 토큰이 들어있으면 +5 보너스 (본문 매칭 없어도 검색 결과에 포함)", async () => {
    await writeNote("a", "한남-사업성.md", {}, "그냥 본문 한 줄");
    await writeNote("b", "general.md", {}, "한남 본문 한 줄");
    const hits = await searchLocalNotes("한남");
    // a 는 본문 매칭 0건이지만 파일명 보너스 +5 로 결과에 들어가고 1위
    expect(hits[0].project).toBe("a");
    expect(hits[0].score).toBeGreaterThanOrEqual(5);
  });

  it("frontmatter title 매칭도 +5", async () => {
    await writeNote("a", "doc.md", { title: "한남 사업성" }, "본문 그냥");
    await writeNote("b", "doc2.md", {}, "한남 본문 한 줄");
    const hits = await searchLocalNotes("한남");
    expect(hits[0].project).toBe("a");
  });
});

describe("snippet", () => {
  it("snippet 길이는 500자(+ ellipsis 마커) 이하", async () => {
    const longBody = "전치사 ".repeat(200) + "한남 매칭" + " 후치사".repeat(200);
    await writeNote("a", "long.md", {}, longBody);
    const hits = await searchLocalNotes("한남");
    expect(hits.length).toBe(1);
    // 500자 본문 + 시작/끝 ellipsis 2자
    expect(hits[0].snippet.length).toBeLessThanOrEqual(502);
  });

  it("snippet 은 첫 매칭 토큰을 포함한다", async () => {
    const longBody = "x".repeat(800) + " 한남 사업성 " + "y".repeat(800);
    await writeNote("a", "long.md", {}, longBody);
    const hits = await searchLocalNotes("한남");
    expect(hits[0].snippet).toContain("한남");
  });
});

describe("top-K cutoff & projects filter", () => {
  it("기본 K=3 — 4개 매칭 시 상위 3개만 반환", async () => {
    for (const p of ["a", "b", "c", "d"]) {
      await writeNote(p, "x.md", {}, "한남 사업성 분석");
    }
    const hits = await searchLocalNotes("한남");
    expect(hits.length).toBe(3);
  });

  it("opts.k=1 일 때 1개만 반환", async () => {
    await writeNote("a", "x.md", {}, "한남");
    await writeNote("b", "x.md", {}, "한남");
    const hits = await searchLocalNotes("한남", { k: 1 });
    expect(hits.length).toBe(1);
  });

  it("opts.projects 로 프로젝트를 좁힐 수 있다", async () => {
    await writeNote("hannam-644", "x.md", {}, "한남 사업성");
    await writeNote("yeokbuk-pf", "x.md", {}, "한남 사업성");
    const hits = await searchLocalNotes("한남", { projects: ["hannam-644"] });
    expect(hits.length).toBe(1);
    expect(hits[0].project).toBe("hannam-644");
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
