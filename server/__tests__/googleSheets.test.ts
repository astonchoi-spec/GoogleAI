import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGoogleOAuthClient: vi.fn(),
  getMock: vi.fn(),
  createMock: vi.fn(),
  valuesGetMock: vi.fn(),
  valuesUpdateMock: vi.fn(),
  valuesClearMock: vi.fn(),
}));

vi.mock("../_core/googleOAuth.ts", () => ({
  getGoogleOAuthClient: mocks.getGoogleOAuthClient,
}));

vi.mock("googleapis", () => ({
  google: {
    sheets: vi.fn(() => ({
      spreadsheets: {
        get: mocks.getMock,
        create: mocks.createMock,
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
  mocks.getGoogleOAuthClient.mockReset();
  mocks.getMock.mockReset();
  mocks.createMock.mockReset();
  mocks.valuesGetMock.mockReset();
  mocks.valuesUpdateMock.mockReset();
  mocks.valuesClearMock.mockReset();
  cwdBefore = process.cwd();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "google-sheets-"));
  process.chdir(tmpDir);
  vi.resetModules();
  subject = await import("../_core/googleSheets.ts");
  mocks.getGoogleOAuthClient.mockResolvedValue({ userId: "1", auth: { token: "x" } });
  mocks.getMock.mockResolvedValue({ data: { spreadsheetId: "sheet-1" } });
  mocks.createMock.mockResolvedValue({ data: { spreadsheetId: "sheet-2" } });
  mocks.valuesGetMock.mockResolvedValue({ data: { values: [["딜명"], ["성남44"]] } });
  mocks.valuesUpdateMock.mockResolvedValue({ data: {} });
  mocks.valuesClearMock.mockResolvedValue({ data: {} });
});

afterEach(async () => {
  process.chdir(cwdBefore);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("googleSheets", () => {
  it("creates a spreadsheet and stores deals-dashboard key", async () => {
    mocks.getMock.mockRejectedValueOnce({ status: 404 });
    const spreadsheetId = await subject.ensureSpreadsheet("Aston-Deals-Dashboard");
    expect(spreadsheetId).toBe("sheet-2");
    const saved = JSON.parse(await fs.readFile(path.join(tmpDir, "data", "google-sheets.json"), "utf8"));
    expect(saved["deals-dashboard"]).toBe("sheet-2");
  });

  it("reuses stored spreadsheet id when sheet exists", async () => {
    await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "data", "google-sheets.json"), JSON.stringify({ "deals-dashboard": "sheet-keep" }));
    const spreadsheetId = await subject.ensureSpreadsheet("Aston-Deals-Dashboard");
    expect(spreadsheetId).toBe("sheet-keep");
    expect(mocks.createMock).not.toHaveBeenCalled();
  });

  it("upserts an existing row by row key", async () => {
    await subject.upsertRow("sheet-1", "성남44", ["성남44", "/deal", "3", "-", "-", "0/0", "⚠️ 미연결", "-", "2026-05-02"]);
    expect(mocks.valuesUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      spreadsheetId: "sheet-1",
      range: "Dashboard!A2:I2",
    }));
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
    expect(mocks.valuesClearMock).toHaveBeenCalledTimes(2);
  });

  it("retries on 429 and eventually succeeds", async () => {
    mocks.valuesGetMock
      .mockRejectedValueOnce({ status: 429 })
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValueOnce({ data: { values: [["딜명"]] } });
    await subject.upsertRow("sheet-1", "부산88", ["부산88", "/deal", "1", "-", "-", "0/0", "🔗 연결", "-", "2026-05-02"]);
    expect(mocks.valuesGetMock).toHaveBeenCalledTimes(3);
  });
});
