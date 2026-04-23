import axios, { AxiosError } from "axios";

export type DartDisclosure = Record<string, unknown>;
export type DartFinancialStatement = Record<string, unknown>;
export type DartCompanyInfo = Record<string, unknown>;

const DART_DISCLOSURE_URL = "https://opendart.fss.or.kr/api/list.json";
const DART_FINANCIAL_STATEMENT_URL = "https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json";
const DART_COMPANY_URL = "https://opendart.fss.or.kr/api/company.json";
const DART_SUCCESS_STATUS = "000";

export async function getDisclosures(
  corpCode: string,
  startDate: string,
  endDate: string
): Promise<DartDisclosure[]> {
  validateRequired({ corpCode, startDate, endDate });

  try {
    const data = await requestDart(DART_DISCLOSURE_URL, {
      corp_code: corpCode,
      bgn_de: startDate,
      end_de: endDate,
      page_count: 100,
    });

    return arrayValue(data, "list");
  } catch (error) {
    throw new Error(`Failed to fetch DART disclosures for "${corpCode}": ${errorMessage(error)}`);
  }
}

export async function getFinancialStatements(
  corpCode: string,
  year: string | number,
  reportCode: string = "11011"
): Promise<DartFinancialStatement[]> {
  validateRequired({ corpCode, year: String(year), reportCode });

  try {
    const data = await requestDart(DART_FINANCIAL_STATEMENT_URL, {
      corp_code: corpCode,
      bsns_year: year,
      reprt_code: reportCode,
      fs_div: "CFS",
    });

    return arrayValue(data, "list");
  } catch (error) {
    throw new Error(`Failed to fetch DART financial statements for "${corpCode}": ${errorMessage(error)}`);
  }
}

export async function searchCompanyByName(name: string): Promise<DartCompanyInfo> {
  validateRequired({ name });

  try {
    return await requestDart(DART_COMPANY_URL, {
      corp_name: name,
    });
  } catch (error) {
    throw new Error(`Failed to search DART company by name "${name}": ${errorMessage(error)}`);
  }
}

async function requestDart(url: string, params: Record<string, string | number>): Promise<Record<string, unknown>> {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) {
    throw new Error("DART_API_KEY is missing");
  }

  try {
    const response = await axios.get<Record<string, unknown>>(url, {
      params: {
        crtfc_key: apiKey,
        ...params,
      },
      timeout: 15_000,
    });

    assertDartSuccess(response.data);
    return response.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const dartMessage = responseErrorMessage(error.response?.data);
      throw new Error(`${status ? `HTTP ${status}: ` : ""}${error.message}${dartMessage ? ` - ${dartMessage}` : ""}`);
    }
    throw error;
  }
}

function assertDartSuccess(data: Record<string, unknown>): void {
  const status = stringValue(data.status);
  const message = stringValue(data.message);

  if (status && status !== DART_SUCCESS_STATUS) {
    throw new Error(`DART API error ${status}${message ? `: ${message}` : ""}`);
  }
}

function arrayValue(data: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = data[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object");
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
