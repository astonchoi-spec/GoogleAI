import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureSpreadsheet: vi.fn(),
  clearSheet: vi.fn(),
  upsertRow: vi.fn(),
  getSpreadsheetUrl: vi.fn(),
  getSheetRecord: vi.fn(),
  markSheetFormatApplied: vi.fn(),
  applyConditionalFormat: vi.fn(),
  listDeals: vi.fn(),
  loadRecentAgentResultLabelsByTarget: vi.fn(),
  calcDday: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("../_core/googleSheets.ts", () => ({
  ensureSpreadsheet: mocks.ensureSpreadsheet,
  clearSheet: mocks.clearSheet,
  upsertRow: mocks.upsertRow,
  getSpreadsheetUrl: mocks.getSpreadsheetUrl,
  getSheetRecord: mocks.getSheetRecord,
  markSheetFormatApplied: mocks.markSheetFormatApplied,
  applyConditionalFormat: mocks.applyConditionalFormat,
}));
vi.mock("../deals/dealStore.ts", () => ({ listDeals: mocks.listDeals }));
vi.mock("../_core/agentResultLookup.ts", () => ({ loadRecentAgentResultLabelsByTarget: mocks.loadRecentAgentResultLabelsByTarget }));
vi.mock("../deals/dateParser.ts", () => ({ calcDday: mocks.calcDday }));

import { applyDealSheetFormatting, syncDealsToSheet } from "../deals/dealSheetSync.ts";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetchMock);
  mocks.ensureSpreadsheet.mockResolvedValue("sheet-1");
  mocks.clearSheet.mockResolvedValue(undefined);
  mocks.upsertRow.mockResolvedValue(undefined);
  mocks.getSpreadsheetUrl.mockReturnValue("https://docs.google.com/spreadsheets/d/sheet-1/edit");
  mocks.getSheetRecord.mockResolvedValue(null);
  mocks.markSheetFormatApplied.mockResolvedValue(undefined);
  mocks.applyConditionalFormat.mockResolvedValue(undefined);
  mocks.loadRecentAgentResultLabelsByTarget.mockResolvedValue(new Map());
  mocks.calcDday.mockReturnValue(5);
  mocks.fetchMock.mockResolvedValue({ ok: true });
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  delete process.env.OWNER_TELEGRAM_CHAT_ID;
});

describe("dealSheetSync", () => {
  it("creates header and syncs active deals only", async () => {
    mocks.listDeals.mockResolvedValue({
      all: [
        {
          name: "성남44",
          status: "active",
          drivePath: "G:/Deals/성남44",
          fileCount: { contract: 1, feasibility: 2, legal: 0, market: 0, disclosure: 0, misc: 0 },
          deadline: "2026-06-30T00:00:00.000Z",
          milestones: [{ done: true }, { done: false }],
          notebookUrl: "https://notebooklm.google.com/notebook/1",
          updatedAt: "2026-05-02T00:00:00.000Z",
        },
        {
          name: "종결딜",
          status: "completed",
          drivePath: "G:/Deals/종결딜",
          fileCount: { contract: 1, feasibility: 0, legal: 0, market: 0, disclosure: 0, misc: 0 },
          updatedAt: "2026-05-02T00:00:00.000Z",
        },
      ],
    });
    mocks.loadRecentAgentResultLabelsByTarget.mockResolvedValue(new Map([["성남44", "PF 종합 분석"]]));

    const result = await syncDealsToSheet();

    expect(result).toEqual({ url: "https://docs.google.com/spreadsheets/d/sheet-1/edit", count: 1 });
    expect(mocks.upsertRow).toHaveBeenNthCalledWith(1, "sheet-1", "딜명", expect.any(Array));
    expect(mocks.upsertRow).toHaveBeenNthCalledWith(
      2,
      "sheet-1",
      "성남44",
      ["성남44", "G:/Deals/성남44", "3", "2026-06-30T00:00:00.000Z", "D-5", "1/2", "🔗 연결", "PF 종합 분석", "2026-05-02T00:00:00.000Z"],
    );
  });

  it("handles zero deals with header only", async () => {
    mocks.listDeals.mockResolvedValue({ all: [] });
    const result = await syncDealsToSheet();
    expect(result.count).toBe(0);
    expect(mocks.upsertRow).toHaveBeenCalledTimes(1);
  });

  it("renders missing deadline and notebook as fallback text", async () => {
    mocks.listDeals.mockResolvedValue({
      all: [{
        name: "부산8",
        status: "reviewing",
        drivePath: "G:/Deals/부산8",
        fileCount: { contract: 0, feasibility: 0, legal: 0, market: 0, disclosure: 0, misc: 0 },
        milestones: [],
        updatedAt: "2026-05-02T00:00:00.000Z",
      }],
    });
    await syncDealsToSheet();
    expect(mocks.upsertRow).toHaveBeenLastCalledWith(
      "sheet-1",
      "부산8",
      ["부산8", "G:/Deals/부산8", "0", "-", "-", "0/0", "⚠️ 미연결", "-", "2026-05-02T00:00:00.000Z"],
    );
  });

  it("uses calcDday result for D-day formatting", async () => {
    mocks.listDeals.mockResolvedValue({
      all: [{
        name: "수원11",
        status: "active",
        drivePath: "G:/Deals/수원11",
        fileCount: { contract: 0, feasibility: 1, legal: 0, market: 0, disclosure: 0, misc: 0 },
        deadline: "2026-05-02T00:00:00.000Z",
        milestones: [],
        updatedAt: "2026-05-02T00:00:00.000Z",
      }],
    });
    mocks.calcDday.mockReturnValueOnce(0);
    await syncDealsToSheet();
    expect(mocks.upsertRow).toHaveBeenLastCalledWith(
      "sheet-1",
      "수원11",
      ["수원11", "G:/Deals/수원11", "1", "2026-05-02T00:00:00.000Z", "D-DAY", "0/0", "⚠️ 미연결", "-", "2026-05-02T00:00:00.000Z"],
    );
  });

  it("shows milestone progress in done/total format", async () => {
    mocks.listDeals.mockResolvedValue({
      all: [{
        name: "인천22",
        status: "active",
        drivePath: "G:/Deals/인천22",
        fileCount: { contract: 0, feasibility: 0, legal: 0, market: 0, disclosure: 0, misc: 2 },
        milestones: [{ done: true }, { done: true }, { done: false }],
        updatedAt: "2026-05-02T00:00:00.000Z",
      }],
    });
    await syncDealsToSheet();
    expect(mocks.upsertRow).toHaveBeenLastCalledWith(
      "sheet-1",
      "인천22",
      ["인천22", "G:/Deals/인천22", "2", "-", "-", "2/3", "⚠️ 미연결", "-", "2026-05-02T00:00:00.000Z"],
    );
  });

  it("uses latest matching agent template label", async () => {
    mocks.listDeals.mockResolvedValue({
      all: [{
        name: "광주33",
        status: "active",
        drivePath: "G:/Deals/광주33",
        fileCount: { contract: 0, feasibility: 0, legal: 0, market: 1, disclosure: 0, misc: 0 },
        milestones: [],
        updatedAt: "2026-05-02T00:00:00.000Z",
      }],
    });
    mocks.loadRecentAgentResultLabelsByTarget.mockResolvedValue(new Map([["광주33", "법률 리스크"]]));
    await syncDealsToSheet();
    expect(mocks.upsertRow).toHaveBeenLastCalledWith(
      "sheet-1",
      "광주33",
      ["광주33", "G:/Deals/광주33", "1", "-", "-", "0/0", "⚠️ 미연결", "법률 리스크", "2026-05-02T00:00:00.000Z"],
    );
  });

  it("applies formatting on first sync and stores timestamp", async () => {
    mocks.listDeals.mockResolvedValue({ all: [] });
    await syncDealsToSheet();
    expect(mocks.applyConditionalFormat).toHaveBeenCalledTimes(1);
    expect(mocks.markSheetFormatApplied).toHaveBeenCalledWith("Aston-Deals-Dashboard", "sheet-1");
  });

  it("skips formatting when metadata already says applied", async () => {
    mocks.getSheetRecord.mockResolvedValue({ spreadsheetId: "sheet-1", formatAppliedAt: "2026-05-02T03:00:00.000Z" });
    mocks.listDeals.mockResolvedValue({ all: [] });
    await syncDealsToSheet();
    expect(mocks.applyConditionalFormat).not.toHaveBeenCalled();
  });

  it("does not fail sync when formatting fails", async () => {
    mocks.applyConditionalFormat.mockRejectedValue(new Error("format failed"));
    mocks.listDeals.mockResolvedValue({ all: [] });
    await expect(syncDealsToSheet()).resolves.toEqual({
      url: "https://docs.google.com/spreadsheets/d/sheet-1/edit",
      count: 0,
    });
  });

  it("reapplies formatting on explicit command", async () => {
    const result = await applyDealSheetFormatting();
    expect(result).toEqual({ url: "https://docs.google.com/spreadsheets/d/sheet-1/edit" });
    expect(mocks.applyConditionalFormat).toHaveBeenCalledTimes(1);
    expect(mocks.markSheetFormatApplied).toHaveBeenCalledWith("Aston-Deals-Dashboard", "sheet-1");
  });

  it("notifies telegram once on sync failure", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "token";
    process.env.TELEGRAM_CHAT_ID = "chat";
    mocks.ensureSpreadsheet.mockRejectedValue(new Error("권한 오류"));
    await expect(syncDealsToSheet()).rejects.toThrow("권한 오류");
    await expect(syncDealsToSheet()).rejects.toThrow("권한 오류");
    expect(mocks.fetchMock).toHaveBeenCalledTimes(1);
  });
});
