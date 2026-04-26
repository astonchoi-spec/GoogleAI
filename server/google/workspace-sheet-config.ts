import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CONFIG_PATH = path.resolve(process.cwd(), "data", "workspace-sheet.json");

type WorkspaceSheetConfig = {
  spreadsheetId: string;
  title: string;
  sheetTitle: string;
  createdAt: string;
  updatedAt: string;
};

export async function getConfiguredWorkspaceSheet(): Promise<WorkspaceSheetConfig | null> {
  if (process.env.WORKSPACE_SPREADSHEET_ID) {
    return {
      spreadsheetId: process.env.WORKSPACE_SPREADSHEET_ID,
      title: process.env.WORKSPACE_SPREADSHEET_TITLE || "Aston Workspace",
      sheetTitle: process.env.WORKSPACE_SHEET_TITLE || "Workspace",
      createdAt: "",
      updatedAt: "",
    };
  }

  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<WorkspaceSheetConfig>;
    if (!parsed.spreadsheetId) return null;
    return {
      spreadsheetId: parsed.spreadsheetId,
      title: parsed.title || "Aston Workspace",
      sheetTitle: parsed.sheetTitle || "Workspace",
      createdAt: parsed.createdAt || "",
      updatedAt: parsed.updatedAt || "",
    };
  } catch {
    return null;
  }
}

export async function saveConfiguredWorkspaceSheet(input: {
  spreadsheetId: string;
  title: string;
  sheetTitle: string;
}): Promise<WorkspaceSheetConfig> {
  const now = new Date().toISOString();
  const config: WorkspaceSheetConfig = {
    spreadsheetId: input.spreadsheetId,
    title: input.title,
    sheetTitle: input.sheetTitle,
    createdAt: now,
    updatedAt: now,
  };

  await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");

  return config;
}
