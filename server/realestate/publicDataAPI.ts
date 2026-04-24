import axios, { AxiosError } from "axios";

export type LandRegulation = {
  pnu: string;
  jimok: string | null;
  area: number | null;
  useAreaName: string | null;
  buldRatLimit: number | null;
  flAreaRatLimit: number | null;
  regulationInfo: string[];
};

export type BuildingInfo = Record<string, unknown>;

export type RealTransactionType = "apt" | "land" | "office";
export type RealTransaction = Record<string, unknown>;

const LAND_REGULATION_URL = "http://apis.data.go.kr/1611000/nsdi/LandUseService/attr/getLandUseAttr";
const BUILDING_INFO_URL = "http://apis.data.go.kr/1613000/BldRgstHubService/getBrBasisOulnInfo";
const REAL_TRANSACTION_URLS: Record<RealTransactionType, string> = {
  apt: "http://openapi.molit.go.kr/OpenAPI_ToolInstall498/service/rest/RTMSOBJSvc/getRTMSDataSvcAptTradeDev",
  land: "http://apis.data.go.kr/1613000/RTMSDataSvcLandTrade/getRTMSDataSvcLandTrade",
  office: "http://apis.data.go.kr/1613000/RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade",
};

export async function getLandRegulation(pnu: string): Promise<LandRegulation> {
  if (!pnu.trim()) {
    throw new Error("pnu is required");
  }

  try {
    const data = await requestPublicData(LAND_REGULATION_URL, {
      pnu,
      format: "json",
      numOfRows: 100,
    });
    const item = firstItem(data) ?? {};

    return {
      pnu,
      jimok: pickString(item, ["jimok", "jimokNm", "lndcgrCodeNm", "lndcgrNm"]),
      area: pickNumber(item, ["area", "lndAr", "lndpclAr", "pnuArea"]),
      useAreaName: pickString(item, ["useAreaName", "prposAreaNm", "prposArea1Nm", "spfc1Nm"]),
      buldRatLimit: pickNumber(item, ["buldRatLimit", "buldRat", "bcr", "archPrmsnBuldRat"]),
      flAreaRatLimit: pickNumber(item, ["flAreaRatLimit", "flrRat", "far", "archPrmsnFlrRat"]),
      regulationInfo: collectRegulationInfo(data),
    };
  } catch (error) {
    throw new Error(`Failed to fetch land regulation for PNU "${pnu}": ${errorMessage(error)}`);
  }
}

export async function getBuildingInfo(
  sigunguCd: string,
  bjdongCd: string,
  bun: string,
  ji: string
): Promise<BuildingInfo> {
  validateRequired({ sigunguCd, bjdongCd, bun, ji });

  try {
    const data = await requestPublicData(BUILDING_INFO_URL, {
      sigunguCd,
      bjdongCd,
      bun,
      ji,
      format: "json",
    });

    return firstItem(data) ?? {};
  } catch (error) {
    throw new Error(
      `Failed to fetch building info for ${sigunguCd}-${bjdongCd}-${bun}-${ji}: ${errorMessage(error)}`
    );
  }
}

export async function getRealTransactionPrice(
  lawdCd: string,
  dealYmd: string,
  type: RealTransactionType
): Promise<RealTransaction[]> {
  validateRequired({ lawdCd, dealYmd });

  try {
    const data = await requestPublicData(REAL_TRANSACTION_URLS[type], {
      LAWD_CD: lawdCd,
      DEAL_YMD: dealYmd,
      pageNo: 1,
      numOfRows: 100,
      _type: "json",
    });

    return items(data);
  } catch (error) {
    throw new Error(`Failed to fetch ${type} transaction prices for ${lawdCd}/${dealYmd}: ${errorMessage(error)}`);
  }
}

async function requestPublicData(url: string, params: Record<string, string | number>): Promise<unknown> {
  const serviceKey = process.env.DATA_GO_KR_API_KEY;
  if (!serviceKey) {
    throw new Error("DATA_GO_KR_API_KEY is missing");
  }

  try {
    const response = await axios.get<string>(url, {
      params: {
        serviceKey,
        ...params,
      },
      timeout: 15_000,
      responseType: "text",
      transformResponse: (data) => data,
    });

    const data = parseResponseData(response.data);
    assertApiSuccess(data);
    return data;
  } catch (error) {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const responseText = typeof error.response?.data === "string" ? ` ${extractXmlError(error.response.data)}` : "";
      throw new Error(`${status ? `HTTP ${status}: ` : ""}${error.message}${responseText}`);
    }
    throw error;
  }
}

function assertApiSuccess(data: unknown): void {
  if (typeof data === "string") {
    const xmlError = extractXmlError(data);
    if (xmlError) throw new Error(xmlError);
    return;
  }

  const root = asRecord(data);
  const response = asRecord(root.response);
  const header = asRecord(response.header ?? root.header);
  const resultCode = stringValue(header.resultCode ?? header.returnReasonCode);
  const resultMessage = stringValue(header.resultMsg ?? header.resultMessage ?? header.errMsg);

  if (resultCode && !["00", "000", "NORMAL_CODE"].includes(resultCode)) {
    throw new Error(`API error ${resultCode}${resultMessage ? `: ${resultMessage}` : ""}`);
  }

  const serviceResponse = asRecord(root.OpenAPI_ServiceResponse);
  const errorHeader = asRecord(serviceResponse.cmmMsgHeader);
  const errorCode = stringValue(errorHeader.returnReasonCode);
  if (errorCode) {
    const errorMessageText = stringValue(errorHeader.errMsg ?? errorHeader.returnAuthMsg);
    throw new Error(`API error ${errorCode}${errorMessageText ? `: ${errorMessageText}` : ""}`);
  }
}

function firstItem(data: unknown): Record<string, unknown> | null {
  return items(data)[0] ?? null;
}

function items(data: unknown): Record<string, unknown>[] {
  if (typeof data === "string") {
    return parseXmlItems(data);
  }

  const root = asRecord(data);
  const response = asRecord(root.response);
  const body = asRecord(response.body ?? root.body);
  const itemContainer = asRecord(body.items ?? root.items);
  const rawItems = itemContainer.item ?? body.item ?? root.item;

  if (Array.isArray(rawItems)) {
    return rawItems.map(asRecord);
  }

  if (rawItems && typeof rawItems === "object") {
    return [asRecord(rawItems)];
  }

  return [];
}

function collectRegulationInfo(data: unknown): string[] {
  return items(data)
    .flatMap((item) => [
      pickString(item, ["regulationInfo", "regulation", "lawNm", "relLawNm"]),
      pickString(item, ["prposAreaNm", "prposArea1Nm", "spfc1Nm"]),
      pickString(item, ["districtName", "districtNm", "jiguNm"]),
    ])
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.indexOf(value) === index);
}

function validateRequired(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    if (!value.trim()) {
      throw new Error(`${key} is required`);
    }
  }
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) return value;
  }
  return null;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = numberValue(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

function numberValue(value: unknown): number | null {
  const numeric = typeof value === "string" ? Number(value.replaceAll(",", "")) : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function extractXmlError(value: string): string {
  const message = matchXmlTag(value, "returnAuthMsg") ?? matchXmlTag(value, "errMsg") ?? matchXmlTag(value, "resultMsg");
  const code = matchXmlTag(value, "returnReasonCode") ?? matchXmlTag(value, "resultCode");
  if (!message && !code) return "";
  return `API error${code ? ` ${code}` : ""}${message ? `: ${message}` : ""}`;
}

function matchXmlTag(value: string, tagName: string): string | null {
  const match = value.match(new RegExp(`<${tagName}>(.*?)</${tagName}>`, "s"));
  return match?.[1] ? decodeXml(match[1].trim()) : null;
}

function parseResponseData(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return {};

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function parseXmlItems(value: string): Record<string, unknown>[] {
  const itemMatches = value.matchAll(/<item>([\s\S]*?)<\/item>/g);
  return Array.from(itemMatches).map((match) => parseXmlItem(match[1] ?? ""));
}

function parseXmlItem(value: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const fieldMatches = value.matchAll(/<([^/?][^>]*)>([\s\S]*?)<\/\1>/g);

  for (const match of fieldMatches) {
    const key = match[1]?.trim();
    if (!key || key === "item") continue;
    result[key] = decodeXml((match[2] ?? "").trim());
  }

  return result;
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
