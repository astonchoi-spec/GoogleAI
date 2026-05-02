import fs from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";
import { getGoogleOAuthClient } from "./googleOAuth.ts";

type SheetEntry = string | { spreadsheetId: string; formatAppliedAt?: string };
type SheetStore = Record<string, SheetEntry>;
type ConditionalFormatRule = { formula: string; background: [number, number, number]; bold?: boolean };

const STORE_PATH = path.resolve(process.cwd(), "data", "google-sheets.json");
const DEFAULT_USER_ID = process.env.GOOGLE_SHEETS_USER_ID?.trim() || "1";
const HEADER_COLOR: [number, number, number] = [0.2, 0.22, 0.27];
const HEADER_TEXT: [number, number, number] = [1, 1, 1];
const COLUMN_WIDTHS = [100, 200, 80, 110, 90, 110, 110, 190, 170];

function toKey(name: string): string {
  if (name === "Aston-Deals-Dashboard") return "deals-dashboard";
  if (name === "Aston-Deals-Archive") return "deals-archive";
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeEntry(entry?: SheetEntry | null): { spreadsheetId: string; formatAppliedAt?: string } | null {
  if (!entry) return null;
  if (typeof entry === "string") return { spreadsheetId: entry };
  return entry.spreadsheetId ? entry : null;
}

async function readStore(): Promise<SheetStore> {
  try {
    return JSON.parse(await fs.readFile(STORE_PATH, "utf8")) as SheetStore;
  } catch {
    return {};
  }
}

async function writeStore(store: SheetStore): Promise<void> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

async function runWithSheets<T>(
  userId: string,
  task: (sheets: ReturnType<typeof google.sheets>) => Promise<T>,
  options: { attempt?: number; refreshed?: boolean } = {},
): Promise<T> {
  const attempt = options.attempt ?? 0;
  try {
    const auth = await getGoogleOAuthClient(userId, { forceRefresh: options.refreshed });
    if (!auth) throw new Error("Google OAuth 연결이 없습니다.");
    return await task(google.sheets({ version: "v4", auth: auth.auth }));
  } catch (error: any) {
    const status = error?.code ?? error?.status ?? error?.response?.status;
    if (status === 401 && !options.refreshed) return runWithSheets(userId, task, { attempt, refreshed: true });
    if (status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      return runWithSheets(userId, task, { attempt: attempt + 1, refreshed: options.refreshed });
    }
    throw error;
  }
}

export async function ensureSpreadsheet(name: string, userId = DEFAULT_USER_ID): Promise<string> {
  const key = toKey(name);
  const store = await readStore();
  const existing = normalizeEntry(store[key]);
  if (existing?.spreadsheetId) {
    try {
      await runWithSheets(userId, (sheets) => sheets.spreadsheets.get({ spreadsheetId: existing.spreadsheetId, fields: "spreadsheetId" }));
      return existing.spreadsheetId;
    } catch (error: any) {
      const status = error?.code ?? error?.status ?? error?.response?.status;
      if (status !== 404) throw error;
    }
  }
  const created = await runWithSheets(userId, (sheets) =>
    sheets.spreadsheets.create({ requestBody: { properties: { title: name }, sheets: [{ properties: { title: "Dashboard" } }] } }),
  );
  const spreadsheetId = created.data.spreadsheetId;
  if (!spreadsheetId) throw new Error("Google Sheets 생성에 실패했습니다.");
  store[key] = { spreadsheetId };
  await writeStore(store);
  return spreadsheetId;
}

export async function getSheetRecord(name: string): Promise<{ spreadsheetId: string; formatAppliedAt?: string } | null> {
  return normalizeEntry((await readStore())[toKey(name)]);
}

export async function markSheetFormatApplied(name: string, spreadsheetId: string, at = new Date().toISOString()): Promise<void> {
  const store = await readStore();
  store[toKey(name)] = { spreadsheetId, formatAppliedAt: at };
  await writeStore(store);
}

export async function upsertRow(spreadsheetId: string, rowKey: string, values: string[], userId = DEFAULT_USER_ID): Promise<void> {
  const rows = await runWithSheets(userId, (sheets) => sheets.spreadsheets.values.get({ spreadsheetId, range: "Dashboard!A:A" }));
  const allRows = rows.data.values ?? [];
  const rowIndex = allRows.findIndex((row, index) => index > 0 && row[0] === rowKey);
  const targetRow = rowIndex >= 0 ? rowIndex + 1 : allRows.length + 1;
  await runWithSheets(userId, (sheets) =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Dashboard!A${targetRow}:I${targetRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [values] },
    }),
  );
}

export async function clearSheet(spreadsheetId: string, userId = DEFAULT_USER_ID): Promise<void> {
  await runWithSheets(userId, (sheets) => sheets.spreadsheets.values.clear({ spreadsheetId, range: "Dashboard!A:Z" }));
}

export async function applyConditionalFormat(
  spreadsheetId: string,
  rules: ConditionalFormatRule[],
  userId = DEFAULT_USER_ID,
): Promise<void> {
  await runWithSheets(userId, async (sheets) => {
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(sheetId,title),conditionalFormats)" });
    const dashboard = meta.data.sheets?.find((sheet) => sheet.properties?.title === "Dashboard");
    const sheetId = dashboard?.properties?.sheetId;
    if (sheetId == null) throw new Error("Dashboard 시트를 찾지 못했습니다.");
    const existingRules = dashboard?.conditionalFormats?.length ?? 0;
    const requests: any[] = [];
    for (let index = existingRules - 1; index >= 0; index -= 1) requests.push({ deleteConditionalFormatRule: { sheetId, index } });
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 9 },
        cell: { userEnteredFormat: { backgroundColor: toColor(HEADER_COLOR), textFormat: { foregroundColor: toColor(HEADER_TEXT), bold: true } } },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    });
    COLUMN_WIDTHS.forEach((pixelSize, index) => {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 },
          properties: { pixelSize },
          fields: "pixelSize",
        },
      });
    });
    rules.forEach((rule, index) => {
      requests.push({
        addConditionalFormatRule: {
          index,
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 9 }],
            booleanRule: {
              condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: rule.formula }] },
              format: { backgroundColor: toColor(rule.background), textFormat: { bold: !!rule.bold } },
            },
          },
        },
      });
    });
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  });
}

function toColor([red, green, blue]: [number, number, number]) {
  return { red, green, blue };
}

export function getSpreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}
