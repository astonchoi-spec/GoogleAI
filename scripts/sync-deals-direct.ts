import "dotenv/config";
import { syncDealsToSheet } from "../server/deals/dealSheetSync.ts";
import { getSheetRecord } from "../server/_core/googleSheets.ts";
import { getSpreadsheetUrl } from "../server/_core/googleSheets.ts";

console.log("[sync] GOOGLE_SHEETS_USER_ID:", process.env.GOOGLE_SHEETS_USER_ID);
console.log("[sync] 딜 시트 강제 동기화 시작...");

try {
  const result = await syncDealsToSheet();
  console.log("[sync] 성공:", JSON.stringify(result));
  const record = await getSheetRecord("Aston-Deals-Dashboard");
  if (record?.spreadsheetId) {
    console.log("[sync] URL:", getSpreadsheetUrl(record.spreadsheetId));
    console.log("[sync] spreadsheetId:", record.spreadsheetId);
  }
} catch (e) {
  console.error("[sync] 실패:", (e as Error).message);
  console.error("[sync] stack:", (e as Error).stack?.split("\n").slice(0, 3).join("\n"));
}
