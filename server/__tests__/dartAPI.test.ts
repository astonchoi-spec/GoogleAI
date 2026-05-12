import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getRecentDisclosures,
  getCompanyInfo,
  type DartDisclosure,
  type DartCompany,
  type DartErrorResponse,
} from "../finance/dartAPI.ts";

describe("DART API", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.DART_API_KEY = "test-api-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DART_API_KEY;
  });

  it("getRecentDisclosures()가 모킹된 응답에서 DartDisclosure[] 배열을 반환한다", async () => {
    const mockList = [
      {
        corp_name: "삼성전자",
        report_nm: "사업보고서",
        rcept_no: "20240101000001",
        rcept_dt: "20240101",
        flr_nm: "삼성전자",
      },
      {
        corp_name: "LG전자",
        report_nm: "분기보고서",
        rcept_no: "20240102000002",
        rcept_dt: "20240102",
        flr_nm: "LG전자",
      },
    ];

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "000", message: "정상", list: mockList }),
    } as Response);

    const result = await getRecentDisclosures("00126380", "20240101", "20240131");

    expect(Array.isArray(result)).toBe(true);
    const disclosures = result as DartDisclosure[];
    expect(disclosures).toHaveLength(2);
    expect(disclosures[0]).toMatchObject({
      corpName: "삼성전자",
      reportNm: "사업보고서",
      rceptNo: "20240101000001",
      rceptDt: "20240101",
      flrNm: "삼성전자",
    });
    expect(disclosures[1].corpName).toBe("LG전자");
  });

  it("getCompanyInfo()가 corpName, stockCode 필드를 포함하는 DartCompany를 반환한다", async () => {
    const mockCompany = {
      corp_name: "삼성전자",
      corp_code: "00126380",
      stock_code: "005930",
      ceo_nm: "한종희",
      corp_cls: "Y",
      adres: "경기도 수원시 영통구 삼성로 129",
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "000", ...mockCompany }),
    } as Response);

    const result = await getCompanyInfo("00126380");

    const company = result as DartCompany;
    expect(company).toHaveProperty("corpName", "삼성전자");
    expect(company).toHaveProperty("stockCode", "005930");
    expect(company).toHaveProperty("corpCode", "00126380");
    expect(company).toHaveProperty("ceoNm", "한종희");
    expect(company).toHaveProperty("corpCls", "Y");
    expect(company).toHaveProperty("adres");
  });

  it("DART_API_KEY 미설정 시 에러를 던지지 않고 적절한 에러 객체를 반환한다", async () => {
    delete process.env.DART_API_KEY;

    const result = await getRecentDisclosures("00126380");

    const errorResult = result as DartErrorResponse;
    expect(errorResult.status).toBe("error");
    expect(typeof errorResult.message).toBe("string");
    expect(errorResult.message.length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
