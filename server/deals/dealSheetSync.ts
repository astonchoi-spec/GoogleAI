import cron from "node-cron";
import {
  applyConditionalFormat,
  clearSheet,
  ensureSpreadsheet,
  getSheetRecord,
  getSpreadsheetUrl,
  markSheetFormatApplied,
  upsertRow,
} from "../_core/googleSheets.ts";
import { loadRecentAgentResultLabelsByTarget } from "../_core/agentResultLookup.ts";
import { listDeals } from "./dealStore.ts";
import { calcDday } from "./dateParser.ts";

const SHEET_NAME = "Aston-Deals-Dashboard";
const HEADERS = ["딜명", "폴더 경로", "자료 건수", "마감일", "D-day", "이정표 진행", "NotebookLM", "최근 에이전트 결과", "마지막 업데이트"];
const DDAY_RULES = [
  { formula: '=AND(LEFT($E2,2)="D-",VALUE(MID($E2,3,99))<=30)', background: [1, 0.976, 0.769] as [number, number, number] },
  { formula: '=AND(LEFT($E2,2)="D-",VALUE(MID($E2,3,99))<=7)', background: [1, 0.878, 0.698] as [number, number, number] },
  { formula: '=OR($E2="D-DAY",LEFT($E2,2)="D+",AND(LEFT($E2,2)="D-",VALUE(MID($E2,3,99))<=3))', background: [1, 0.804, 0.824] as [number, number, number], bold: true },
];
let schedulerRegistered = false;
let lastNotifiedAt = 0;

function formatMilestones(meta: { milestones?: Array<{ done: boolean }> }): string {
  const total = meta.milestones?.length ?? 0;
  const done = meta.milestones?.filter((item) => item.done).length ?? 0;
  return `${done}/${total}`;
}

function formatDdayValue(deadline?: string): string {
  if (!deadline) return "-";
  const days = calcDday(deadline);
  if (days > 0) return `D-${days}`;
  if (days === 0) return "D-DAY";
  return `D+${Math.abs(days)}`;
}

async function notifySyncFailure(error: unknown): Promise<void> {
  if (Date.now() - lastNotifiedAt < 60 * 60 * 1000) return;
  lastNotifiedAt = Date.now();
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const text = `⚠️ PF 딜 시트 동기화 실패\n${error instanceof Error ? error.message : "Google Sheets 호출 오류"}`;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
  } catch (notifyError) {
    console.error("[dealSheetSync] notify:", notifyError);
  }
}

async function applySheetFormatting(spreadsheetId: string, force = false): Promise<void> {
  const record = await getSheetRecord(SHEET_NAME);
  if (!force && record?.spreadsheetId === spreadsheetId && record.formatAppliedAt) return;
  await applyConditionalFormat(spreadsheetId, DDAY_RULES);
  await markSheetFormatApplied(SHEET_NAME, spreadsheetId);
}

export async function syncDealsToSheet(): Promise<{ url: string; count: number }> {
  try {
    const spreadsheetId = await ensureSpreadsheet(SHEET_NAME);
    const { all } = await listDeals();
    const deals = all.filter((deal) => !["completed", "rejected"].includes(deal.status));
    const agentMap = await loadRecentAgentResultLabelsByTarget();
    await clearSheet(spreadsheetId);
    await upsertRow(spreadsheetId, HEADERS[0], HEADERS);
    for (const deal of deals) {
      const totalFiles = Object.values(deal.fileCount).reduce((sum, count) => sum + count, 0);
      await upsertRow(spreadsheetId, deal.name, [
        deal.name,
        deal.drivePath,
        String(totalFiles),
        deal.deadline ?? "-",
        formatDdayValue(deal.deadline),
        formatMilestones(deal),
        deal.notebookUrl ? "🔗 연결" : "⚠️ 미연결",
        agentMap.get(deal.name) ?? "-",
        deal.updatedAt,
      ]);
    }
    try {
      await applySheetFormatting(spreadsheetId);
    } catch (formatError) {
      console.error("[dealSheetSync] format:", formatError);
    }
    return { url: getSpreadsheetUrl(spreadsheetId), count: deals.length };
  } catch (error) {
    console.error("[dealSheetSync] sync:", error);
    await notifySyncFailure(error);
    throw error;
  }
}

export async function applyDealSheetFormatting(): Promise<{ url: string }> {
  const spreadsheetId = await ensureSpreadsheet(SHEET_NAME);
  await applySheetFormatting(spreadsheetId, true);
  return { url: getSpreadsheetUrl(spreadsheetId) };
}

export function triggerDealSheetSync(reason: string): void {
  if (process.env.GOOGLE_SHEETS_ENABLED === "false") return;
  void syncDealsToSheet().catch((error) => {
    console.error(`[dealSheetSync] trigger:${reason}`, error);
  });
}

export function registerDealSheetSyncScheduler(): void {
  if (schedulerRegistered || process.env.GOOGLE_SHEETS_ENABLED === "false") return;
  schedulerRegistered = true;
  const hour = Number(process.env.GOOGLE_SHEETS_SYNC_HOUR || "6");
  const minute = Number(process.env.GOOGLE_SHEETS_SYNC_MINUTE || "30");
  cron.schedule(`${minute} ${hour} * * *`, () => void triggerDealSheetSync("cron"), { timezone: "Asia/Seoul" });
  console.log(`[dealSheetSync] Scheduler registered for ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} KST`);
}
