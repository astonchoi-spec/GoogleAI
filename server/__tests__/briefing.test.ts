import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mockCollectMarketSnapshot: vi.fn(),
  mockCollectDartDigest: vi.fn(),
  mockCollectWikiDigest: vi.fn(),
  mockGetDealsSection: vi.fn(),
  mockCollectRiskGuardSnapshot: vi.fn(),
  mockSaveBriefingArchive: vi.fn(),
  mockParseJson: vi.fn(),
}));

vi.mock("../_core/briefingSources.ts", () => ({
  collectMarketSnapshot: mocks.mockCollectMarketSnapshot,
  collectDartDigest: mocks.mockCollectDartDigest,
  collectWikiDigest: mocks.mockCollectWikiDigest,
  getDealsSection: mocks.mockGetDealsSection,
  collectRiskGuardSnapshot: mocks.mockCollectRiskGuardSnapshot,
  saveBriefingArchive: mocks.mockSaveBriefingArchive,
}));

vi.mock("../_core/llmAdapter.ts", () => ({
  llmAdapter: {
    parseJson: mocks.mockParseJson,
    chat: vi.fn(),
  },
}));

vi.mock("../exchanges/exchangeConnector.ts", () => ({
  exchangeConnector: {
    getBalance: vi.fn(),
    getPositions: vi.fn(),
    getCandles: vi.fn(),
  },
}));

vi.mock("../exchanges/gateioConnector.ts", () => ({
  gateioConnector: {
    getBalance: vi.fn(),
    getPositions: vi.fn(),
  },
}));

vi.mock("../exchanges/kiwoomConnector.ts", () => ({
  kiwoomConnector: {
    getBalance: vi.fn(),
  },
}));

vi.mock("../trading/technicalAnalysis.ts", () => ({
  taEngine: {
    analyzeSymbol: vi.fn(),
    generateBriefing: vi.fn(),
  },
}));

vi.mock("../trading/preCheckEngine.ts", () => ({
  parsePreCheckMessage: vi.fn(() => null),
  runPreCheck: vi.fn(),
  formatPreCheck: vi.fn(),
}));

vi.mock("../trading/riskCalculator.ts", () => ({
  calculateFuturesRisk: vi.fn(),
}));

vi.mock("../trading/riskGuard.ts", () => ({
  riskGuard: {
    getStatus: vi.fn(),
    lock: vi.fn(),
    unlock: vi.fn(),
    updateSettings: vi.fn(),
  },
}));

vi.mock("../realestate/dealPipeline.ts", () => ({
  DealPipeline: vi.fn(),
}));

vi.mock("../realestate/feasibilityEngine.ts", () => ({
  calculateFeasibility: vi.fn(),
  formatFeasibilityReport: vi.fn(),
  formatSimpleFeasibilityReport: vi.fn(),
  runFeasibility: vi.fn(),
}));

vi.mock("../finance/dartAPI.ts", () => ({
  getDisclosures: vi.fn(),
}));

vi.mock("../routers/google-workspace.ts", () => ({
  googleAuthManager: {
    getAuthenticatedClient: vi.fn(),
  },
}));

vi.mock("../alerts/alertEngine.ts", () => ({
  addAlert: vi.fn(),
  startAlertScheduler: vi.fn(),
}));

vi.mock("../google/calendar.ts", () => ({
  default: vi.fn(),
}));

vi.mock("../google/sheets.ts", () => ({
  default: vi.fn(),
}));

vi.mock("../google/drive.ts", () => ({
  default: vi.fn(),
}));

vi.mock("../google/gmail.ts", () => ({
  default: vi.fn(),
}));

import {
  buildMorningBriefingData,
  executeMorningBriefing,
  formatMorningBriefing,
  isBriefingTestMessage,
} from "../intelligence/briefing.ts";
import { classifyIntent, routeIntentMessage } from "../intent/intentService.ts";

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

    mocks.mockGetDealsSection.mockResolvedValue({
      items: [
        {
          name: "용인신대지구",
          totalFiles: 12,
          yesterdayFiles: 3,
          hasNotebook: true,
          updatedAt: "2026-05-01T00:00:00.000Z",
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

  it("recognizes manual briefing commands", () => {
    expect(isBriefingTestMessage("브리핑")).toBe(true);
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
      deals: {
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
    expect(text).toContain("진행 중 딜");
    expect(text).toContain("Risk Guard");
    expect(text).toContain("더보기는 웹 대시보드에서 확인할 수 있습니다.");
  });

  it("formats wiki digest once per memo with inline categories", () => {
    const text = formatMorningBriefing({
      dateKey: "2026-05-01",
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
        startDate: "2026-04-30",
        endDate: "2026-05-01",
        items: [],
      },
      wiki: {
        items: [
          {
            title: "신논현 매물 검토",
            bodyPreview: "동일 메모가 카테고리별로 중복되면 안 됩니다.",
            categories: ["realestate", "seoul"],
            date: "2026-04-30T08:00:00.000Z",
          },
          {
            title: "2026-04-30 briefing",
            bodyPreview: "이전 브리핑 본문",
            categories: ["briefing"],
            date: "2026-04-30T09:00:00.000Z",
          },
        ],
      },
      deals: {
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

    expect(text).toContain("- 신논현 매물 검토 #realestate #seoul");
    expect(text.match(/신논현 매물 검토/g)).toHaveLength(1);
    expect(text).not.toContain("#briefing");
    expect(text).not.toContain("이전 브리핑 본문");
  });

  it("places the deal section after wiki and before Risk Guard", () => {
    const text = formatMorningBriefing({
      dateKey: "2026-05-01",
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
        startDate: "2026-04-30",
        endDate: "2026-05-01",
        items: [],
      },
      wiki: {
        items: [
          {
            title: "위키 메모",
            bodyPreview: "메모",
            categories: ["realestate"],
            date: "2026-04-30T08:00:00.000Z",
          },
        ],
      },
      deals: {
        items: [
          {
            name: "포항해상케이블카",
            totalFiles: 8,
            yesterdayFiles: 1,
            hasNotebook: false,
            updatedAt: "2026-05-01T00:00:00.000Z",
          },
        ],
      },
      risk: {
        dailyPnlPercent: -1.2,
        dailyLossLimitPercent: 3,
        consecutiveLosses: 1,
        consecutiveLossBlock: 3,
        locked: false,
      },
    });

    expect(text).toContain("• 포항해상케이블카 — 자료 8건 (어제 +1) ⚠️");
    expect(text.indexOf("어제 저장된 위키 메모")).toBeLessThan(text.indexOf("진행 중 딜"));
    expect(text.indexOf("진행 중 딜")).toBeLessThan(text.indexOf("Risk Guard"));
  });

  it("shows an empty deal state when there are no active deal files", () => {
    const text = formatMorningBriefing({
      dateKey: "2026-05-01",
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
        startDate: "2026-04-30",
        endDate: "2026-05-01",
        items: [],
      },
      wiki: {
        items: [],
      },
      deals: {
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

    expect(text).toContain("## 📁 진행 중 딜 (0건)");
    expect(text).toContain("- 진행 중 딜 없음");
  });


  it("builds and archives a briefing without network side effects", async () => {
    const data = await buildMorningBriefingData(new Date("2026-04-30T00:00:00+09:00"));
    expect(data.market.symbol).toBe("BTC");
    expect(data.dart.items).toHaveLength(1);
    expect(data.wiki.items).toHaveLength(1);
    expect(data.deals.items).toHaveLength(1);
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
    expect(result.text).toContain("용인신대지구");
  });

  it("routes briefing test to the manual briefing intent before Google Workspace", async () => {
    const intent = await classifyIntent("브리핑 테스트");

    expect(intent.domain).toBe("intelligence");
    expect(intent.action).toBe("intelligence_morning_briefing");
    expect(intent.confidence).toBeGreaterThanOrEqual(0.95);
    expect(mocks.mockParseJson).not.toHaveBeenCalled();
  });

  it("routes the short briefing command to the manual briefing intent", async () => {
    const intent = await classifyIntent("브리핑");

    expect(intent.domain).toBe("intelligence");
    expect(intent.action).toBe("intelligence_morning_briefing");
    expect(intent.confidence).toBeGreaterThanOrEqual(0.95);
    expect(mocks.mockParseJson).not.toHaveBeenCalled();
  });

  it("does not let a Google calendar classification override briefing keywords", async () => {
    mocks.mockParseJson.mockResolvedValueOnce({
      domain: "google",
      action: "google_list_events",
      type: "query",
      confidence: 0.99,
      params: { maxResults: 5 },
    });

    const routed = await routeIntentMessage({
      userId: "user-1",
      message: "브리핑",
      allowExecute: true,
    });

    expect(routed.intent.domain).toBe("intelligence");
    expect(routed.intent.action).toBe("intelligence_morning_briefing");
    expect(routed.handled).toBe(true);
    expect(routed.response).toContain("모닝 브리핑을 발송했습니다.");
    expect(routed.data).toMatchObject({ archivePath: "/tmp/2026-04-30-briefing.md" });
  });
});
