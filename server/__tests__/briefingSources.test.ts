import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  mockSearchWiki: vi.fn(),
}));

vi.mock("../wiki/wikiStore.ts", () => ({
  searchWiki: mocks.mockSearchWiki,
}));

vi.mock("../trading/technicalAnalysis.ts", () => ({
  taEngine: {
    analyzeSymbol: vi.fn(),
  },
}));

vi.mock("../trading/riskGuard.ts", () => ({
  riskGuard: {
    getStatus: vi.fn(),
  },
}));

vi.mock("../finance/dartAPI.ts", () => ({
  getRecentDisclosures: vi.fn(),
}));

import { collectWikiDigest, saveBriefingArchive } from "../_core/briefingSources.ts";

let tmpDir: string;

beforeEach(async () => {
  vi.resetAllMocks();
  tmpDir = path.join(os.tmpdir(), `briefing-sources-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmpDir, { recursive: true });
  process.env.WIKI_ROOT = tmpDir;
});

afterEach(async () => {
  delete process.env.WIKI_ROOT;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("collectWikiDigest", () => {
  it("excludes briefing archives and keeps one item with multiple categories", async () => {
    mocks.mockSearchWiki.mockResolvedValue({
      total: 2,
      results: [
        {
          entry: {
            id: "memo-1",
            date: "2026-04-30T08:00:00.000+09:00",
            title: "신논현 매물 검토",
            categories: ["realestate", "seoul"],
            source: "telegram",
            body: "검토 완료",
            filePath: "/wiki/2026-04-30/memo.md",
          },
          matchInTitle: false,
        },
        {
          entry: {
            id: "2026-04-30-briefing",
            date: "2026-04-30",
            title: "2026-04-30 briefing",
            categories: ["briefing"],
            source: "morning-briefing",
            body: "이전 브리핑 본문",
            filePath: "/wiki/daily/2026-04-30-briefing.md",
          },
          matchInTitle: true,
        },
      ],
    });

    const digest = await collectWikiDigest(new Date("2026-05-01T07:00:00+09:00"));

    expect(digest.items).toHaveLength(1);
    expect(digest.items[0]).toMatchObject({
      title: "신논현 매물 검토",
      categories: ["realestate", "seoul"],
    });
  });
});

describe("saveBriefingArchive", () => {
  it("writes daily briefing with categories frontmatter", async () => {
    const filePath = await saveBriefingArchive({
      dateKey: "2026-05-01",
      text: "브리핑 본문",
      trigger: "manual",
    });

    expect(filePath).toBe(path.join(tmpDir, "daily", "2026-05-01-briefing.md"));

    const content = await fs.readFile(filePath!, "utf-8");
    expect(content).toContain("title: 2026-05-01 briefing");
    expect(content).toContain("categories: [briefing]");
    expect(content).not.toContain("category: [briefing]");
  });
});
