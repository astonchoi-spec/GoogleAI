import { syncDealsToSheet } from "../server/deals/dealSheetSync.ts";
import { getSheetRecord } from "../server/_core/googleSheets.ts";

console.log("[sync] 딜 시트 강제 동기화 시작...");
try {
  const result = await syncDealsToSheet();
console.log("[sync] result:", result);
  const record = await getSheetRecord("Aston-Deals-Dashboard");
  console.log("[sync] 완료. spreadsheetId:", record?.spreadsheetId);
  console.log("[sync] URL:", `https://docs.google.com/spreadsheets/d/${record?.spreadsheetId}/edit`);
} catch (e) {
  console.error("[sync] 실패:", e.message);
}
