import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  mockCollectMarketSnapshot: vi.fn(),
  mockCollectDartDigest: vi.fn(),
  mockCollectWikiDigest: vi.fn(),
  mockCollectRiskGuardSnapshot: vi.fn(),
  mockSaveBriefingArchive: vi.fn(),
}));

vi.mock("../_core/briefingSources.ts", () => ({
  collectMarketSnapshot: mocks.mockCollectMarketSnapshot,
  collectDartDigest: mocks.mockCollectDartDigest,
  collectWikiDigest: mocks.mockCollectWikiDigest,
  collectRiskGuardSnapshot: mocks.mockCollectRiskGuardSnapshot,
  saveBriefingArchive: mocks.mockSaveBriefingArchive,
}));

import {
  buildMorningBriefingData,
  executeMorningBriefing,
  formatMorningBriefing,
  isBriefingTestMessage,
} from "../intelligence/briefing.ts";

describe("morning briefing", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.mockCollectMarketSnapshot.mockResolvedValue({
      symbol: "BTC",
      currentPrice: 100000,
      priceChangePercent: 1.23,
      rsi1h: 55.5,
      rsi4h: 61.2,
      fundingRatePercent: 0.012,
      kimchiPremiumPercent: 2.5,
      volume24h: 123456789,
      notes: ["시장 데이터 정상 수집"],
    });

    mocks.mockCollectDartDigest.mockResolvedValue({
      startDate: "2026-04-29",
      endDate: "2026-04-30",
      items: [
        {
          corpName: "Aston Corp",
          reportName: "유상증자 결정",
          reportDate: "2026-04-30",
          receiptNo: "202604300001",
          filerName: "Aston Corp",
          matchedKeyword: "유상증자",
        },
      ],
    });

    mocks.mockCollectWikiDigest.mockResolvedValue({
      items: [
        {
          title: "부동산 PF 메모",
          bodyPreview: "서울 PF 건 검토 완료",
          categories: ["realestate"],
          date: "2026-04-29T08:00:00.000Z",
        },
      ],
    });

    mocks.mockCollectRiskGuardSnapshot.mockResolvedValue({
      dailyPnlPercent: -1.2,
      dailyLossLimitPercent: 3,
      consecutiveLosses: 1,
      consecutiveLossBlock: 3,
      locked: false,
      lockReason: undefined,
    });

    mocks.mockSaveBriefingArchive.mockResolvedValue("/tmp/2026-04-30-briefing.md");
  });

  it("recognizes briefing test commands", () => {
    expect(isBriefingTestMessage("브리핑 테스트")).toBe(true);
    expect(isBriefingTestMessage(" 모닝 브리핑 테스트 ")).toBe(true);
    expect(isBriefingTestMessage("hello")).toBe(false);
  });

  it("formats a concise briefing with all required sections", () => {
    const text = formatMorningBriefing({
      dateKey: "2026-04-30",
      market: {
        symbol: "BTC",
        currentPrice: 100000,
        priceChangePercent: 1.23,
        rsi1h: 55.5,
        rsi4h: 61.2,
        fundingRatePercent: 0.012,
        kimchiPremiumPercent: 2.5,
        volume24h: 123456789,
        notes: [],
      },
      dart: {
        startDate: "2026-04-29",
        endDate: "2026-04-30",
        items: [],
      },
      wiki: {
        items: [],
      },
      risk: {
        dailyPnlPercent: -1.2,
        dailyLossLimitPercent: 3,
        consecutiveLosses: 1,
        consecutiveLossBlock: 3,
        locked: false,
      },
    });

    expect(text).toContain("모닝 브리핑");
    expect(text).toContain("시장 현황");
    expect(text).toContain("DART 공시");
    expect(text).toContain("Risk Guard");
    expect(text).toContain("더보기는 웹 대시보드에서 확인할 수 있습니다.");
  });

  it("builds and archives a briefing without network side effects", async () => {
    const data = await buildMorningBriefingData(new Date("2026-04-30T00:00:00+09:00"));
    expect(data.market.symbol).toBe("BTC");
    expect(data.dart.items).toHaveLength(1);
    expect(data.wiki.items).toHaveLength(1);
    expect(data.risk.locked).toBe(false);

    const result = await executeMorningBriefing({
      now: new Date("2026-04-30T00:00:00+09:00"),
      trigger: "manual",
      deliver: false,
    });

    expect(mocks.mockSaveBriefingArchive).toHaveBeenCalledTimes(1);
    expect(mocks.mockSaveBriefingArchive).toHaveBeenCalledWith({
      dateKey: "2026-04-30",
      text: result.text,
      trigger: "manual",
    });
    expect(result.archivePath).toBe("/tmp/2026-04-30-briefing.md");
    expect(result.text).toContain("Aston Corp");
    expect(result.text).toContain("부동산 PF 메모");
  });
});
