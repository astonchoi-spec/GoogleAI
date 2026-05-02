import fs from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";
import { getGoogleOAuthClient } from "./googleOAuth.ts";

type SheetStore = Record<string, string>;

const STORE_PATH = path.resolve(process.cwd(), "data", "google-sheets.json");
const DEFAULT_USER_ID = process.env.GOOGLE_SHEETS_USER_ID?.trim() || "1";

function toKey(name: string): string {
  if (name === "Aston-Deals-Dashboard") return "deals-dashboard";
  if (name === "Aston-Deals-Archive") return "deals-archive";
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
    const sheets = google.sheets({ version: "v4", auth: auth.auth });
    return await task(sheets);
  } catch (error: any) {
    const status = error?.code ?? error?.status ?? error?.response?.status;
    if (status === 401 && !options.refreshed) {
      return runWithSheets(userId, task, { attempt, refreshed: true });
    }
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
  const spreadsheetId = store[key];

  if (spreadsheetId) {
    try {
      await runWithSheets(userId, (sheets) => sheets.spreadsheets.get({ spreadsheetId, fields: "spreadsheetId" }));
      return spreadsheetId;
    } catch (error: any) {
      const status = error?.code ?? error?.status ?? error?.response?.status;
      if (status !== 404) throw error;
    }
  }

  const created = await runWithSheets(userId, (sheets) =>
    sheets.spreadsheets.create({
      requestBody: {
        properties: { title: name },
        sheets: [{ properties: { title: "Dashboard" } }],
      },
    })
  );
  const createdId = created.data.spreadsheetId;
  if (!createdId) throw new Error("Google Sheets 생성에 실패했습니다.");
  store[key] = createdId;
  await writeStore(store);
  return createdId;
}

export async function upsertRow(
  spreadsheetId: string,
  rowKey: string,
  values: string[],
  userId = DEFAULT_USER_ID,
): Promise<void> {
  const rows = await runWithSheets(userId, (sheets) =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Dashboard!A:A",
    })
  );
  const allRows = rows.data.values ?? [];
  const rowIndex = allRows.findIndex((row, index) => index > 0 && row[0] === rowKey);
  const targetRow = rowIndex >= 0 ? rowIndex + 1 : allRows.length + 1;
  await runWithSheets(userId, (sheets) =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Dashboard!A${targetRow}:I${targetRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [values] },
    })
  );
}

export async function clearSheet(spreadsheetId: string, userId = DEFAULT_USER_ID): Promise<void> {
  await runWithSheets(userId, (sheets) =>
    sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: "Dashboard!A:Z",
    })
  );
}

export function getSpreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}
