import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGoogleOAuthClient: vi.fn(),
  getMock: vi.fn(),
  createMock: vi.fn(),
  batchUpdateMock: vi.fn(),
  valuesGetMock: vi.fn(),
  valuesUpdateMock: vi.fn(),
  valuesClearMock: vi.fn(),
}));

vi.mock("../_core/googleOAuth.ts", () => ({ getGoogleOAuthClient: mocks.getGoogleOAuthClient }));
vi.mock("googleapis", () => ({
  google: {
    sheets: vi.fn(() => ({
      spreadsheets: {
        get: mocks.getMock,
        create: mocks.createMock,
        batchUpdate: mocks.batchUpdateMock,
        values: {
          get: mocks.valuesGetMock,
          update: mocks.valuesUpdateMock,
          clear: mocks.valuesClearMock,
        },
      },
    })),
  },
}));

let cwdBefore = "";
let tmpDir = "";
let subject: typeof import("../_core/googleSheets.ts");

beforeEach(async () => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  cwdBefore = process.cwd();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "google-sheets-"));
  process.chdir(tmpDir);
  // MODIFIED: 환경변수 격리 — 호스트 .env에 GOOGLE_SHEETS_USER_ID가 설정돼 있어도 테스트는 기본값 "1" 사용.
  process.env.GOOGLE_SHEETS_USER_ID = "1";
  vi.resetModules();
  subject = await import("../_core/googleSheets.ts");
  mocks.getGoogleOAuthClient.mockResolvedValue({ userId: "1", auth: { token: "x" } });
  mocks.getMock.mockResolvedValue({ data: { spreadsheetId: "sheet-1" } });
  mocks.createMock.mockResolvedValue({ data: { spreadsheetId: "sheet-2" } });
  mocks.batchUpdateMock.mockResolvedValue({ data: {} });
  mocks.valuesGetMock.mockResolvedValue({ data: { values: [["딜명"], ["성남44"]] } });
  mocks.valuesUpdateMock.mockResolvedValue({ data: {} });
  mocks.valuesClearMock.mockResolvedValue({ data: {} });
});

afterEach(async () => {
  process.chdir(cwdBefore);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("googleSheets", () => {
  it("creates a spreadsheet and stores metadata object", async () => {
    mocks.getMock.mockRejectedValueOnce({ status: 404 });
    const spreadsheetId = await subject.ensureSpreadsheet("Aston-Deals-Dashboard");
    expect(spreadsheetId).toBe("sheet-2");
    const saved = JSON.parse(await fs.readFile(path.join(tmpDir, "data", "google-sheets.json"), "utf8"));
    expect(saved["deals-dashboard"]).toEqual({ spreadsheetId: "sheet-2" });
  });

  it("reuses stored spreadsheet id from legacy string value", async () => {
    await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "data", "google-sheets.json"), JSON.stringify({ "deals-dashboard": "sheet-keep" }));
    const spreadsheetId = await subject.ensureSpreadsheet("Aston-Deals-Dashboard");
    expect(spreadsheetId).toBe("sheet-keep");
    expect(mocks.createMock).not.toHaveBeenCalled();
  });

  it("returns stored metadata record", async () => {
    await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "data", "google-sheets.json"),
      JSON.stringify({ "deals-dashboard": { spreadsheetId: "sheet-keep", formatAppliedAt: "2026-05-02T03:00:00.000Z" } }),
    );
    await expect(subject.getSheetRecord("Aston-Deals-Dashboard")).resolves.toEqual({
      spreadsheetId: "sheet-keep",
      formatAppliedAt: "2026-05-02T03:00:00.000Z",
    });
  });

  it("upserts an existing row by row key", async () => {
    await subject.upsertRow("sheet-1", "성남44", ["성남44", "/deal", "3", "-", "-", "0/0", "⚠️ 미연결", "-", "2026-05-02"]);
    expect(mocks.valuesUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ spreadsheetId: "sheet-1", range: "Dashboard!A2:I2" }));
  });

  it("uses googleOAuth helper for refreshed auth scenario", async () => {
    await subject.clearSheet("sheet-1", "6");
    expect(mocks.getGoogleOAuthClient).toHaveBeenCalledWith("6", { forceRefresh: undefined });
  });

  it("retries once with force refresh after 401", async () => {
    mocks.valuesClearMock.mockRejectedValueOnce({ status: 401 }).mockResolvedValueOnce({ data: {} });
    await subject.clearSheet("sheet-1");
    expect(mocks.getGoogleOAuthClient).toHaveBeenNthCalledWith(1, "1", { forceRefresh: undefined });
    expect(mocks.getGoogleOAuthClient).toHaveBeenNthCalledWith(2, "1", { forceRefresh: true });
  });

  it("retries on 429 and eventually succeeds", async () => {
    mocks.valuesGetMock.mockRejectedValueOnce({ status: 429 }).mockRejectedValueOnce({ status: 429 }).mockResolvedValueOnce({ data: { values: [["딜명"]] } });
    await subject.upsertRow("sheet-1", "부산8", ["부산8", "/deal", "1", "-", "-", "0/0", "🔗 연결", "-", "2026-05-02"]);
    expect(mocks.valuesGetMock).toHaveBeenCalledTimes(3);
  });

  it("applies header formatting and conditional rules", async () => {
    mocks.getMock.mockResolvedValueOnce({
      data: { sheets: [{ properties: { title: "Dashboard", sheetId: 99 }, conditionalFormats: [] }] },
    });
    await subject.applyConditionalFormat("sheet-1", [
      { formula: '=AND(LEFT($E2,2)="D-",VALUE(MID($E2,3,99))<=7)', background: [1, 0.8, 0.7] },
      { formula: '=$E2="D-DAY"', background: [1, 0.7, 0.7], bold: true },
    ]);
    const requests = mocks.batchUpdateMock.mock.calls[0][0].requestBody.requests;
    expect(requests.some((entry: any) => entry.repeatCell)).toBe(true);
    expect(requests.filter((entry: any) => entry.addConditionalFormatRule).length).toBe(2);
  });

  it("removes existing conditional rules before recreating them", async () => {
    mocks.getMock.mockResolvedValueOnce({
      data: { sheets: [{ properties: { title: "Dashboard", sheetId: 7 }, conditionalFormats: [{}, {}] }] },
    });
    await subject.applyConditionalFormat("sheet-1", [{ formula: '=$E2="D-DAY"', background: [1, 0.7, 0.7] }]);
    const requests = mocks.batchUpdateMock.mock.calls[0][0].requestBody.requests;
    expect(requests[0]).toEqual({ deleteConditionalFormatRule: { sheetId: 7, index: 1 } });
    expect(requests[1]).toEqual({ deleteConditionalFormatRule: { sheetId: 7, index: 0 } });
  });

  it("updates formatAppliedAt metadata", async () => {
    await subject.markSheetFormatApplied("Aston-Deals-Dashboard", "sheet-1", "2026-05-02T04:00:00.000Z");
    const saved = JSON.parse(await fs.readFile(path.join(tmpDir, "data", "google-sheets.json"), "utf8"));
    expect(saved["deals-dashboard"]).toEqual({ spreadsheetId: "sheet-1", formatAppliedAt: "2026-05-02T04:00:00.000Z" });
  });
});
