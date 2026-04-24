import { google, type Auth, type calendar_v3, type sheets_v4 } from "googleapis";

export type DealStage = "소싱" | "심사" | "약정" | "실행" | "회수" | "완료";

export type PFDeal = {
  id: string;
  projectName: string;
  location: string;
  stage: DealStage;
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
const STAGES: DealStage[] = ["소싱", "심사", "약정", "실행", "회수", "완료"];

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

  async updateDealStage(id: string, newStage: DealStage): Promise<PFDeal> {
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

  private normalizeStage(value: unknown): DealStage {
    const stage = String(value ?? "");
    return STAGES.includes(stage as DealStage) ? (stage as DealStage) : "소싱";
  }

  private groupByStage(deals: PFDeal[]): Map<DealStage, PFDeal[]> {
    const grouped = new Map<DealStage, PFDeal[]>();
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
