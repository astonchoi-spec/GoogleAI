import axios, { AxiosError } from "axios";

// ─── 타입 정의 ────────────────────────────────────────────────────────────────

export interface DartDisclosure {
  corpName: string;
  reportNm: string;
  rceptNo: string;
  rceptDt: string;
  flrNm: string;
}

export interface DartCompany {
  corpName: string;
  corpCode: string;
  stockCode: string;
  ceoNm: string;
  corpCls: string;
  adres: string;
}

export interface DartFinancial {
  accountNm: string;
  thisTermAmount: string;
  prevTermAmount: string;
}

export interface DartErrorResponse {
  status: "error";
  message: string;
}

// 기존 코드와 호환을 위한 레거시 타입 별칭
export type DartDisclosureLegacy = Record<string, unknown>;
export type DartFinancialStatement = Record<string, unknown>;
export type DartCompanyInfo = Record<string, unknown>;

// ─── 상수 ────────────────────────────────────────────────────────────────────

const BASE_URL = "https://opendart.fss.or.kr/api/";
const DART_SUCCESS_STATUS = "000";

// ─── 공통 요청 함수 (fetch 기반, 신규 API 전용) ──────────────────────────────

export async function dartRequest(
  endpoint: string,
  params: Record<string, string>
): Promise<Record<string, unknown> | DartErrorResponse> {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) {
    return { status: "error", message: "DART API 키 미설정" };
  }

  const url = new URL(endpoint, BASE_URL);
  url.searchParams.set("crtfc_key", apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  try {
    const res = await fetch(url.toString());
    const json = (await res.json()) as Record<string, unknown>;
    return json;
  } catch (error) {
    throw new Error(
      `DART API 요청 실패 [${endpoint}]: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ─── 신규 export 함수 ─────────────────────────────────────────────────────────

export async function getRecentDisclosures(
  corpCode?: string,
  beginDate?: string,
  endDate?: string
): Promise<DartDisclosure[] | DartErrorResponse> {
  const params: Record<string, string> = {};
  if (corpCode) params.corp_code = corpCode;
  if (beginDate) params.bgn_de = beginDate;
  if (endDate) params.end_de = endDate;

  const data = await dartRequest("list.json", params);
  if (isDartError(data)) return data;

  const list = data.list;
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    const r = item as Record<string, unknown>;
    return {
      corpName: str(r.corp_name),
      reportNm: str(r.report_nm),
      rceptNo: str(r.rcept_no),
      rceptDt: str(r.rcept_dt),
      flrNm: str(r.flr_nm),
    };
  });
}

export async function getCompanyInfo(
  corpCode: string
): Promise<DartCompany | DartErrorResponse> {
  const data = await dartRequest("company.json", { corp_code: corpCode });
  if (isDartError(data)) return data;

  return {
    corpName: str(data.corp_name),
    corpCode: str(data.corp_code),
    stockCode: str(data.stock_code),
    ceoNm: str(data.ceo_nm),
    corpCls: str(data.corp_cls),
    adres: str(data.adres),
  };
}

export async function getFinancialStatements(
  corpCode: string,
  year: string | number,
  reportCode = "11011"
): Promise<DartFinancial[] | DartErrorResponse> {
  const data = await dartRequest("fnlttSinglAcnt.json", {
    corp_code: corpCode,
    bsns_year: String(year),
    reprt_code: reportCode,
  });
  if (isDartError(data)) return data;

  const list = data.list;
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    const r = item as Record<string, unknown>;
    return {
      accountNm: str(r.account_nm),
      thisTermAmount: str(r.thstrm_amount),
      prevTermAmount: str(r.frmtrm_amount),
    };
  });
}

// ─── 레거시 함수 (intentRouter 호환) ─────────────────────────────────────────

export async function getDisclosures(
  corpCode: string,
  startDate: string,
  endDate: string
): Promise<DartDisclosureLegacy[]> {
  validateRequired({ corpCode, startDate, endDate });
  try {
    const data = await requestDart(
      "https://opendart.fss.or.kr/api/list.json",
      { corp_code: corpCode, bgn_de: startDate, end_de: endDate, page_count: 100 }
    );
    return arrayValue(data, "list");
  } catch (error) {
    throw new Error(
      `Failed to fetch DART disclosures for "${corpCode}": ${errorMessage(error)}`
    );
  }
}

export async function searchCompanyByName(
  name: string
): Promise<DartCompanyInfo> {
  validateRequired({ name });
  try {
    return await requestDart("https://opendart.fss.or.kr/api/company.json", {
      corp_name: name,
    });
  } catch (error) {
    throw new Error(
      `Failed to search DART company by name "${name}": ${errorMessage(error)}`
    );
  }
}

// ─── 레거시 내부 헬퍼 (axios 기반) ───────────────────────────────────────────

async function requestDart(
  url: string,
  params: Record<string, string | number>
): Promise<Record<string, unknown>> {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) {
    throw new Error("DART_API_KEY is missing");
  }

  try {
    const response = await axios.get<Record<string, unknown>>(url, {
      params: { crtfc_key: apiKey, ...params },
      timeout: 15_000,
    });
    assertDartSuccess(response.data);
    return response.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const dartMessage = responseErrorMessage(error.response?.data);
      throw new Error(
        `${status ? `HTTP ${status}: ` : ""}${error.message}${dartMessage ? ` - ${dartMessage}` : ""}`
      );
    }
    throw error;
  }
}

// ─── 유틸리티 ─────────────────────────────────────────────────────────────────

function isDartError(
  v: Record<string, unknown> | DartErrorResponse
): v is DartErrorResponse {
  return v.status === "error" && typeof v.message === "string";
}

function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function assertDartSuccess(data: Record<string, unknown>): void {
  const status = stringValue(data.status);
  const message = stringValue(data.message);
  if (status && status !== DART_SUCCESS_STATUS) {
    throw new Error(`DART API error ${status}${message ? `: ${message}` : ""}`);
  }
}

function arrayValue(
  data: Record<string, unknown>,
  key: string
): Record<string, unknown>[] {
  const value = data[key];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      item !== null && typeof item === "object"
  );
}

function validateRequired(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    if (!value.trim()) {
      throw new Error(`${key} is required`);
    }
  }
}

function responseErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const status = stringValue(record.status);
  const message = stringValue(record.message);
  if (!status && !message) return null;
  return `${status ? `DART ${status}` : "DART"}${message ? `: ${message}` : ""}`;
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
