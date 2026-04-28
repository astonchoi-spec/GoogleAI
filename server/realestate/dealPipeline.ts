import { google, type Auth, type calendar_v3, type sheets_v4 } from "googleapis";
import { nanoid } from "nanoid";

export type KoreanDealStage = "소싱" | "심사" | "약정" | "실행" | "회수" | "완료";

export type PFDeal = {
  id: string;
  projectName: string;
  location: string;
  stage: KoreanDealStage;
  totalProjectCost: number;
  loanAmount: number;
  ltv: number;
  equityAmount: number;
  lenders: string;
  nextMilestone: string;
  nextMilestoneDate: string;
  notes: string;
};

export type NewPFDeal = Omit<PFDeal, "id"> & { id?: string };

const SHEET_NAME = "PF딜관리";
const DEAL_RANGE = `${SHEET_NAME}!A2:L`;
const HEADER_RANGE = `${SHEET_NAME}!A1:L1`;
const HEADERS = [
  "ID",
  "프로젝트명",
  "위치",
  "단계",
  "총사업비(억)",
  "대출금(억)",
  "LTV",
  "에쿼티(억)",
  "대주단",
  "다음 마일스톤",
  "마일스톤일",
  "메모",
];
const STAGES: KoreanDealStage[] = ["소싱", "심사", "약정", "실행", "회수", "완료"];

export class DealPipeline {
  private readonly sheets: sheets_v4.Sheets;
  private readonly calendar: calendar_v3.Calendar;
  private readonly spreadsheetId: string;

  constructor(auth: Auth.OAuth2Client, spreadsheetId: string) {
    this.sheets = google.sheets({ version: "v4", auth });
    this.calendar = google.calendar({ version: "v3", auth });
    this.spreadsheetId = spreadsheetId;
  }

  async getAllDeals(): Promise<PFDeal[]> {
    await this.ensureSheet();

    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: DEAL_RANGE,
    });

    return (response.data.values ?? [])
      .map((row) => this.fromSheetRow(row))
      .filter((deal): deal is PFDeal => deal !== null);
  }

  async addDeal(deal: NewPFDeal): Promise<PFDeal> {
    await this.ensureSheet();

    const newDeal: PFDeal = {
      ...deal,
      id: deal.id || `PF-${Date.now().toString(36).toUpperCase()}`,
    };

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEET_NAME}!A:L`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [this.toSheetRow(newDeal)],
      },
    });

    if (newDeal.nextMilestoneDate) {
      await this.createMilestoneEvent(newDeal);
    }

    return newDeal;
  }

  async updateDealStage(id: string, newStage: KoreanDealStage): Promise<PFDeal> {
    if (!STAGES.includes(newStage)) {
      throw new Error(`Invalid deal stage: ${newStage}`);
    }

    await this.ensureSheet();
    const rowIndex = await this.findDealRowIndex(id);
    if (rowIndex === null) {
      throw new Error(`PF deal not found: ${id}`);
    }

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEET_NAME}!D${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[newStage]],
      },
    });

    const deals = await this.getAllDeals();
    const updated = deals.find((deal) => deal.id === id);
    if (!updated) {
      throw new Error(`PF deal updated but could not be reloaded: ${id}`);
    }
    return updated;
  }

  async getPortfolioSummary(): Promise<string> {
    const deals = await this.getAllDeals();
    const totalExposure = deals.reduce((sum, deal) => sum + deal.loanAmount, 0);
    const grouped = this.groupByStage(deals);

    const lines = [
      "🏗️ PF 딜 파이프라인 요약",
      "",
      `총 딜 수: ${deals.length}건`,
      `총 익스포저: ${this.formatEok(totalExposure)}`,
      "",
      "📌 단계별 현황",
    ];

    for (const stage of STAGES) {
      const stageDeals = grouped.get(stage) ?? [];
      const names = stageDeals.length > 0
        ? stageDeals.map((deal) => `${deal.projectName}(${this.formatEok(deal.loanAmount)})`).join(", ")
        : "없음";
      lines.push(`${stage}: ${stageDeals.length}건 - ${names}`);
    }

    return lines.join("\n");
  }

  private async ensureSheet(): Promise<void> {
    const metadata = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });
    const exists = metadata.data.sheets?.some((sheet) => sheet.properties?.title === SHEET_NAME);

    if (!exists) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: SHEET_NAME } } }],
        },
      });
    }

    const header = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: HEADER_RANGE,
    });

    if ((header.data.values ?? []).length === 0) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: HEADER_RANGE,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [HEADERS],
        },
      });
    }
  }

  private async findDealRowIndex(id: string): Promise<number | null> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEET_NAME}!A2:A`,
    });

    const rows = response.data.values ?? [];
    const index = rows.findIndex((row) => String(row[0] ?? "") === id);
    return index === -1 ? null : index + 2;
  }

  private async createMilestoneEvent(deal: PFDeal): Promise<void> {
    const milestoneDate = this.parseDate(deal.nextMilestoneDate);
    if (!milestoneDate) {
      throw new Error(`Invalid nextMilestoneDate: ${deal.nextMilestoneDate}`);
    }

    const endDate = new Date(milestoneDate);
    endDate.setDate(endDate.getDate() + 1);

    await this.calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: `[PF] ${deal.projectName} - ${deal.nextMilestone}`,
        description: [
          `프로젝트: ${deal.projectName}`,
          `위치: ${deal.location}`,
          `단계: ${deal.stage}`,
          `총사업비: ${this.formatEok(deal.totalProjectCost)}`,
          `대출금: ${this.formatEok(deal.loanAmount)}`,
          `LTV: ${this.formatPercent(deal.ltv)}`,
          `대주단: ${deal.lenders || "-"}`,
          `메모: ${deal.notes || "-"}`,
        ].join("\n"),
        start: { date: this.toDateOnly(milestoneDate), timeZone: "Asia/Seoul" },
        end: { date: this.toDateOnly(endDate), timeZone: "Asia/Seoul" },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 24 * 60 },
            { method: "popup", minutes: 60 },
          ],
        },
      },
    });
  }

  private fromSheetRow(row: unknown[]): PFDeal | null {
    const id = String(row[0] ?? "").trim();
    const projectName = String(row[1] ?? "").trim();
    if (!id || !projectName) return null;

    return {
      id,
      projectName,
      location: String(row[2] ?? ""),
      stage: this.normalizeStage(row[3]),
      totalProjectCost: this.toNumber(row[4]),
      loanAmount: this.toNumber(row[5]),
      ltv: this.toNumber(row[6]),
      equityAmount: this.toNumber(row[7]),
      lenders: String(row[8] ?? ""),
      nextMilestone: String(row[9] ?? ""),
      nextMilestoneDate: String(row[10] ?? ""),
      notes: String(row[11] ?? ""),
    };
  }

  private toSheetRow(deal: PFDeal): unknown[] {
    return [
      deal.id,
      deal.projectName,
      deal.location,
      deal.stage,
      deal.totalProjectCost,
      deal.loanAmount,
      deal.ltv,
      deal.equityAmount,
      deal.lenders,
      deal.nextMilestone,
      deal.nextMilestoneDate,
      deal.notes,
    ];
  }

  private normalizeStage(value: unknown): KoreanDealStage {
    const stage = String(value ?? "");
    return STAGES.includes(stage as KoreanDealStage) ? (stage as KoreanDealStage) : "소싱";
  }

  private groupByStage(deals: PFDeal[]): Map<KoreanDealStage, PFDeal[]> {
    const grouped = new Map<KoreanDealStage, PFDeal[]>();
    for (const stage of STAGES) {
      grouped.set(stage, []);
    }

    for (const deal of deals) {
      grouped.get(deal.stage)?.push(deal);
    }

    return grouped;
  }

  private parseDate(value: string): Date | null {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  private toDateOnly(date: Date): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  private toNumber(value: unknown): number {
    const numeric = typeof value === "string" ? Number(value.replaceAll(",", "")) : Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private formatEok(value: number): string {
    return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억원`;
  }

  private formatPercent(value: number): string {
    return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
  }
}

// ─────────────────────────────────────────────
// New PF 딜 CRUD module (sheet: "PF딜")
// ─────────────────────────────────────────────

export type DealStage = "discovery" | "review" | "dueDiligence" | "contract" | "construction" | "completion";

export interface Deal {
  id: string;
  projectName: string;
  location: string;
  stage: DealStage;
  amount: number;
  manager: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
}

const PF_SHEET = "PF딜";
const PF_HEADERS = ["id", "projectName", "location", "stage", "amount", "manager", "memo", "createdAt", "updatedAt"];
const VALID_STAGES: DealStage[] = ["discovery", "review", "dueDiligence", "contract", "construction", "completion"];

async function ensurePFSheet(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets?.find((s) => s.properties?.title === PF_SHEET);

  let sheetId: number;
  if (!existing) {
    const res = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: PF_SHEET } } }] },
    });
    sheetId = res.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
  } else {
    sheetId = existing.properties?.sheetId ?? 0;
  }

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${PF_SHEET}!A1:I1`,
  });
  if ((headerRes.data.values ?? []).length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${PF_SHEET}!A1:I1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [PF_HEADERS] },
    });
  }

  return sheetId;
}

function rowToDeal(row: unknown[]): Deal | null {
  const id = String(row[0] ?? "").trim();
  const projectName = String(row[1] ?? "").trim();
  if (!id || !projectName) return null;

  const stageRaw = String(row[3] ?? "");
  const stage: DealStage = VALID_STAGES.includes(stageRaw as DealStage) ? (stageRaw as DealStage) : "discovery";

  return {
    id,
    projectName,
    location: String(row[2] ?? ""),
    stage,
    amount: pfToNum(row[4]),
    manager: String(row[5] ?? ""),
    memo: String(row[6] ?? ""),
    createdAt: String(row[7] ?? ""),
    updatedAt: String(row[8] ?? ""),
  };
}

function dealToRow(deal: Deal): unknown[] {
  return [deal.id, deal.projectName, deal.location, deal.stage, deal.amount, deal.manager, deal.memo, deal.createdAt, deal.updatedAt];
}

function pfToNum(value: unknown): number {
  const n = typeof value === "string" ? Number(value.replaceAll(",", "")) : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function listDeals(auth: Auth.OAuth2Client, spreadsheetId: string): Promise<Deal[]> {
  const sheets = google.sheets({ version: "v4", auth });
  await ensurePFSheet(sheets, spreadsheetId);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${PF_SHEET}!A2:I` });
  return (res.data.values ?? []).map(rowToDeal).filter((d): d is Deal => d !== null);
}

export async function getDeal(auth: Auth.OAuth2Client, spreadsheetId: string, id: string): Promise<Deal | null> {
  const deals = await listDeals(auth, spreadsheetId);
  return deals.find((d) => d.id === id) ?? null;
}

export async function createDeal(
  auth: Auth.OAuth2Client,
  spreadsheetId: string,
  data: Omit<Deal, "id" | "createdAt" | "updatedAt">,
): Promise<Deal> {
  const sheets = google.sheets({ version: "v4", auth });
  await ensurePFSheet(sheets, spreadsheetId);
  const now = new Date().toISOString();
  const deal: Deal = { ...data, id: nanoid(), createdAt: now, updatedAt: now };
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${PF_SHEET}!A:I`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [dealToRow(deal)] },
  });
  return deal;
}

export async function updateDeal(
  auth: Auth.OAuth2Client,
  spreadsheetId: string,
  id: string,
  updates: Partial<Omit<Deal, "id" | "createdAt">>,
): Promise<Deal> {
  const sheets = google.sheets({ version: "v4", auth });
  await ensurePFSheet(sheets, spreadsheetId);
  const rowsRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${PF_SHEET}!A2:I` });
  const rows = rowsRes.data.values ?? [];
  const rowIdx = rows.findIndex((row) => String(row[0] ?? "") === id);
  if (rowIdx === -1) throw new Error(`Deal not found: ${id}`);
  const existing = rowToDeal(rows[rowIdx]);
  if (!existing) throw new Error(`Failed to parse deal: ${id}`);
  const updated: Deal = { ...existing, ...updates, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
  const sheetRow = rowIdx + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${PF_SHEET}!A${sheetRow}:I${sheetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [dealToRow(updated)] },
  });
  return updated;
}

export async function deleteDeal(auth: Auth.OAuth2Client, spreadsheetId: string, id: string): Promise<boolean> {
  const sheets = google.sheets({ version: "v4", auth });
  const sheetId = await ensurePFSheet(sheets, spreadsheetId);
  const rowsRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${PF_SHEET}!A2:A` });
  const rows = rowsRes.data.values ?? [];
  const rowIdx = rows.findIndex((row) => String(row[0] ?? "") === id);
  if (rowIdx === -1) return false;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: "ROWS", startIndex: rowIdx + 1, endIndex: rowIdx + 2 },
        },
      }],
    },
  });
  return true;
}
