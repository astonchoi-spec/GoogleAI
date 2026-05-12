import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("googleapis", () => ({
  google: {
    sheets: vi.fn(),
  },
}));

vi.mock("nanoid", () => ({
  nanoid: () => "test-generated-id",
}));

import { google } from "googleapis";
import { listDeals, getDeal, createDeal, updateDeal } from "../realestate/dealPipeline.ts";

const SPREADSHEET_ID = "fake-spreadsheet-id";
const FAKE_AUTH = {} as any;

const EXISTING_ROW: unknown[] = [
  "deal-001",
  "판교 오피스텔",
  "성남시 분당구",
  "review",
  5000,
  "김철수",
  "메모 내용",
  "2024-01-01T00:00:00.000Z",
  "2024-01-01T00:00:00.000Z",
];

function buildMockSheets(dataRows: unknown[][] = []) {
  const mockValues = {
    get: vi.fn()
      .mockResolvedValueOnce({
        data: { values: [["id", "projectName", "location", "stage", "amount", "manager", "memo", "createdAt", "updatedAt"]] },
      })
      .mockResolvedValue({ data: { values: dataRows } }),
    append: vi.fn().mockResolvedValue({ data: {} }),
    update: vi.fn().mockResolvedValue({ data: {} }),
    clear: vi.fn().mockResolvedValue({ data: {} }),
  };
  const mockSpreadsheets = {
    get: vi.fn().mockResolvedValue({
      data: { sheets: [{ properties: { title: "PF딜", sheetId: 0 } }] },
    }),
    values: mockValues,
    batchUpdate: vi.fn().mockResolvedValue({
      data: { replies: [{ addSheet: { properties: { sheetId: 0 } } }] },
    }),
  };
  vi.mocked(google.sheets).mockReturnValue({ spreadsheets: mockSpreadsheets } as any);
  return { mockValues, mockSpreadsheets };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dealPipeline CRUD", () => {
  it("listDeals()는 Deal[] 배열을 반환한다", async () => {
    buildMockSheets([EXISTING_ROW]);

    const deals = await listDeals(FAKE_AUTH, SPREADSHEET_ID);

    expect(Array.isArray(deals)).toBe(true);
    expect(deals).toHaveLength(1);
    expect(deals[0].id).toBe("deal-001");
    expect(deals[0].projectName).toBe("판교 오피스텔");
    expect(deals[0].stage).toBe("review");
    expect(deals[0].amount).toBe(5000);
  });

  it("createDeal()은 id와 createdAt을 자동 생성한다", async () => {
    buildMockSheets([]);

    const result = await createDeal(FAKE_AUTH, SPREADSHEET_ID, {
      projectName: "강남 주상복합",
      location: "서울시 강남구",
      stage: "discovery",
      amount: 10000,
      manager: "이영희",
      memo: "",
    });

    expect(result.id).toBeTruthy();
    expect(result.id).toBe("test-generated-id");
    expect(result.createdAt).toBeTruthy();
    expect(result.updatedAt).toBeTruthy();
    expect(result.createdAt).toBe(result.updatedAt);
    expect(result.projectName).toBe("강남 주상복합");
    expect(result.stage).toBe("discovery");
  });

  it("updateDeal()은 updatedAt을 갱신한다", async () => {
    const originalUpdatedAt = EXISTING_ROW[8] as string;
    buildMockSheets([EXISTING_ROW]);

    await new Promise((r) => setTimeout(r, 1));

    const result = await updateDeal(FAKE_AUTH, SPREADSHEET_ID, "deal-001", {
      memo: "수정된 메모",
      stage: "contract",
    });

    expect(result.id).toBe("deal-001");
    expect(result.memo).toBe("수정된 메모");
    expect(result.stage).toBe("contract");
    expect(result.updatedAt).not.toBe(originalUpdatedAt);
    expect(result.createdAt).toBe(EXISTING_ROW[7]);
  });

  it("getDeal()에 존재하지 않는 ID를 넣으면 null을 반환한다", async () => {
    buildMockSheets([]);

    const result = await getDeal(FAKE_AUTH, SPREADSHEET_ID, "does-not-exist");

    expect(result).toBeNull();
  });
});
