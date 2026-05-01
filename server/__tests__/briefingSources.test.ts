import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  mockSearchWiki: vi.fn(),
  mockListDeals: vi.fn(),
  mockGetAgentTasksByDate: vi.fn(),
  mockGetAgentResultsDateKey: vi.fn(),
  mockLoadAgentResultsForDate: vi.fn(),
}));

vi.mock("../wiki/wikiStore.ts", () => ({
  searchWiki: mocks.mockSearchWiki,
}));

vi.mock("../deals/dealStore.ts", () => ({
  listDeals: mocks.mockListDeals,
}));

vi.mock("../agents/index.ts", () => ({
  getAgentTasksByDate: mocks.mockGetAgentTasksByDate,
}));

vi.mock("../agents/agentResultLoader.ts", () => ({
  getAgentResultsDateKey: mocks.mockGetAgentResultsDateKey,
  loadAgentResultsForDate: mocks.mockLoadAgentResultsForDate,
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

import { collectWikiDigest, getAgentResultsSection, getDealsSection, saveBriefingArchive } from "../_core/briefingSources.ts";
import { DEAL_CATEGORY_DIRS, type DealMeta } from "../deals/dealTypes.ts";

let tmpDir: string;

beforeEach(async () => {
  vi.resetAllMocks();
  tmpDir = path.join(os.tmpdir(), `briefing-sources-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmpDir, { recursive: true });
  process.env.WIKI_ROOT = tmpDir;
  mocks.mockListDeals.mockResolvedValue({ all: [], grouped: {} });
  mocks.mockGetAgentResultsDateKey.mockImplementation((now = new Date()) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(now.getTime() - 24 * 60 * 60 * 1000))
  );
  mocks.mockGetAgentTasksByDate.mockReturnValue([]);
  mocks.mockLoadAgentResultsForDate.mockResolvedValue([]);
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

function makeDeal(patch: Partial<DealMeta> = {}): DealMeta {
  const name = patch.name ?? "용인신대지구";
  const drivePath = patch.drivePath ?? path.join(tmpDir, name);
  return {
    id: name.toLowerCase(),
    name,
    status: "reviewing",
    drivePath,
    createdAt: "2026-04-30T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    tags: [],
    fileCount: {
      contract: 0,
      feasibility: 1,
      legal: 0,
      market: 0,
      disclosure: 0,
      misc: 0,
    },
    recentFiles: [],
    ...patch,
  };
}

async function writeDealFile(deal: DealMeta, fileName: string, mtime: Date): Promise<void> {
  const dir = path.join(deal.drivePath, DEAL_CATEGORY_DIRS.feasibility);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, fileName);
  await fs.writeFile(filePath, "fixture");
  await fs.utimes(filePath, mtime, mtime);
}

describe("getDealsSection", () => {
  it("returns an empty section when no deals exist", async () => {
    mocks.mockListDeals.mockResolvedValue({ all: [], grouped: {} });

    const section = await getDealsSection(new Date("2026-05-01T07:00:00+09:00"));

    expect(section.items).toEqual([]);
  });

  it("excludes completed, rejected, and zero-file deals", async () => {
    mocks.mockListDeals.mockResolvedValue({
      all: [
        makeDeal({ name: "진행딜" }),
        makeDeal({ name: "완료딜", status: "completed" }),
        makeDeal({ name: "거절딜", status: "rejected" }),
        makeDeal({
          name: "빈딜",
          fileCount: { contract: 0, feasibility: 0, legal: 0, market: 0, disclosure: 0, misc: 0 },
        }),
      ],
      grouped: {},
    });

    const section = await getDealsSection(new Date("2026-05-01T07:00:00+09:00"));

    expect(section.items.map((item) => item.name)).toEqual(["진행딜"]);
  });

  it("counts files modified during yesterday in KST", async () => {
    const deal = makeDeal({ name: "용인신대지구", drivePath: path.join(tmpDir, "용인신대지구") });
    await writeDealFile(deal, "yesterday.pdf", new Date("2026-04-30T03:00:00.000Z"));
    await writeDealFile(deal, "today.pdf", new Date("2026-04-30T16:00:00.000Z"));
    mocks.mockListDeals.mockResolvedValue({ all: [deal], grouped: {} });

    const section = await getDealsSection(new Date("2026-05-01T07:00:00+09:00"));

    expect(section.items[0]).toMatchObject({
      name: "용인신대지구",
      totalFiles: 1,
      yesterdayFiles: 1,
      hasNotebook: false,
    });
  });

  it("sorts by updatedAt, keeps top 10, and marks NotebookLM links", async () => {
    const deals = Array.from({ length: 12 }, (_, index) =>
      makeDeal({
        name: `딜${index + 1}`,
        notebookUrl: index === 11 ? "https://notebooklm.google.com/notebook/test" : undefined,
        updatedAt: `2026-05-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      })
    );
    mocks.mockListDeals.mockResolvedValue({ all: deals, grouped: {} });

    const section = await getDealsSection(new Date("2026-05-13T07:00:00+09:00"));

    expect(section.items).toHaveLength(10);
    expect(section.items[0]).toMatchObject({ name: "딜12", hasNotebook: true });
    expect(section.items.at(-1)?.name).toBe("딜3");
  });
});

describe("getAgentResultsSection", () => {
  it("omits the section when there are no agent results", async () => {
    const section = await getAgentResultsSection(new Date("2026-05-01T07:00:00+09:00"));

    expect(section).toBeNull();
    expect(mocks.mockLoadAgentResultsForDate).toHaveBeenCalledWith("2026-04-30");
  });

  it("returns one completed result from wiki fallback", async () => {
    mocks.mockLoadAgentResultsForDate.mockResolvedValue([
      {
        date: "2026-04-30",
        templateId: "pf-comprehensive",
        templateLabel: "PF 종합 분석",
        taskId: "abc12",
        target: "한남동644",
        preview: "IRR 14.1%, 평당 4,800만원",
        metrics: "IRR 14.1%, 평당 4,800만원",
        wikiPath: "G:\\Aston-Wiki\\agents\\2026-04-30-pf-comprehensive-abc12.md",
        simulation: true,
      },
    ]);

    const section = await getAgentResultsSection(new Date("2026-05-01T07:00:00+09:00"));

    expect(section?.items).toHaveLength(1);
    expect(section?.items[0]).toMatchObject({
      id: "abc12",
      icon: "🧪",
      target: "한남동644",
      status: "completed",
    });
  });

  it("caps completed results at five and reports the overflow count", async () => {
    mocks.mockLoadAgentResultsForDate.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) => ({
        date: "2026-04-30",
        templateId: "trading-decision",
        templateLabel: "트레이딩 의사결정",
        taskId: `task${index}`,
        target: `BTC-${index}`,
        preview: "진입 보류",
        metrics: "",
        wikiPath: `/wiki/task${index}.md`,
        simulation: false,
      }))
    );

    const section = await getAgentResultsSection(new Date("2026-05-01T07:00:00+09:00"));

    expect(section?.items).toHaveLength(5);
    expect(section?.extraCount).toBe(1);
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
