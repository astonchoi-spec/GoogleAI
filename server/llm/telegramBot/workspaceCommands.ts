import type { Telegraf } from "telegraf";
import { llmAdapter } from "../../_core/llmAdapter.ts";
import GmailConnector from "../../google/gmail.ts";
import CalendarConnector from "../../google/calendar.ts";
import DriveConnector from "../../google/drive.ts";
import SheetsConnector from "../../google/sheets.ts";
import { googleAuthManager } from "../../routers/google-workspace.ts";
import { getConnectedGoogleUserId, type BotContext } from "./utils.ts";

export async function handleWorkspaceCommand(
  message: string,
  chatId: number,
  telegram: Telegraf<BotContext>["telegram"]
): Promise<string | null> {
  console.log("[TG WORKSPACE] handleWorkspaceCommand:", message.slice(0, 80));
  const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const intentPrompt = `You are a Google Workspace command parser. Analyze the user's message and return ONLY a valid JSON object.

Current date/time: ${now}
Timezone: Asia/Seoul

Supported actions:
- send_email: user wants to send an email
- get_emails: user wants to read/check emails
- create_event: user wants to create a calendar event
- list_drive: user wants to see/search Drive files
- send_drive_file: user wants to receive/send a specific Drive file via Telegram (extract file name)
- read_sheet: user wants to read a Google Sheet (needs spreadsheetId)
- none: not a Google Workspace command

Return format examples:
{"action":"send_email","to":"email@example.com","subject":"제목","body":"내용"}
{"action":"get_emails","query":"","maxResults":5}
{"action":"create_event","title":"미팅","startTime":"2026-04-23T14:00:00+09:00","endTime":"2026-04-23T15:00:00+09:00","description":"","isAllDay":false}
{"action":"list_drive","query":"trashed = false","maxResults":10}
{"action":"send_drive_file","fileName":"파일명.csv"}
{"action":"read_sheet","spreadsheetId":"<id>","range":"Sheet1!A1:Z50"}
{"action":"none"}

For date-only events with no explicit time, set isAllDay to true and set endTime to the next day at 00:00:00+09:00.

Return ONLY the JSON object, no other text.`;

  try {
    const intent = await llmAdapter.parseJson<any>(message, intentPrompt);
    console.log("[TG WORKSPACE] Detected intent:", intent?.action, "params:", JSON.stringify(intent).slice(0, 120));

    if (!intent || intent.action === "none") {
      console.log("[TG WORKSPACE] intent=none, skipping workspace handler");
      return null;
    }

    const googleUserId = await getConnectedGoogleUserId();
    console.log("[TG WORKSPACE] googleUserId:", googleUserId);
    if (!googleUserId) {
      return "❌ Google 계정이 연결되어 있지 않습니다. 웹 앱에서 먼저 Google 계정을 연결해주세요.";
    }

    const auth = await googleAuthManager.getAuthenticatedClient(googleUserId);

    if (intent.action === "send_email") {
      const gmail = new GmailConnector(auth);
      await gmail.sendEmail({ to: intent.to, subject: intent.subject, body: intent.body });
      return `✅ 이메일 전송 완료!\n📧 받는 사람: ${intent.to}\n📋 제목: ${intent.subject}`;
    }

    if (intent.action === "get_emails") {
      const gmail = new GmailConnector(auth);
      const emails = await gmail.getEmails(intent.maxResults || 5, intent.query || undefined);
      if (emails.length === 0) return "📭 메일이 없습니다.";
      const list = emails.map((e, i) => `${i + 1}. ${e.isRead ? "" : "🔵"} ${e.subject}\n   발신: ${e.from}`).join("\n\n");
      return `📬 최근 이메일 ${emails.length}개:\n\n${list}`;
    }

    if (intent.action === "create_event") {
      const calendar = new CalendarConnector(auth);
      const startTime = new Date(intent.startTime);
      const endTime = new Date(intent.endTime);
      if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
        return "❌ 일정 날짜를 정확히 해석하지 못했습니다. 예: 캘린더에 2026년 5월 8일 예나 유나 상해여행 일정잡아";
      }

      const event = await calendar.createEvent({
        title: intent.title,
        startTime,
        endTime,
        description: intent.description || "",
        isAllDay: !!intent.isAllDay,
      });
      return [
        "✅ 캘린더 일정 생성 완료!",
        `📅 제목: ${intent.title}`,
        `⏰ 시작: ${intent.startTime}`,
        `🆔 이벤트 ID: ${event.id}`,
        event.htmlLink ? `🔗 확인: ${event.htmlLink}` : "",
      ].filter(Boolean).join("\n");
    }

    if (intent.action === "list_drive") {
      const drive = new DriveConnector(auth);
      const files = await drive.searchFiles(intent.query || "trashed = false", intent.maxResults || 10);
      if (files.length === 0) return "📁 Drive에 파일이 없습니다.";
      const list = files.map((f, i) => `${i + 1}. 📄 ${f.name}`).join("\n");
      return `📁 Google Drive 파일 ${files.length}개:\n\n${list}`;
    }

    if (intent.action === "send_drive_file") {
      if (!intent.fileName) return "❌ 파일명을 인식하지 못했습니다.";
      const drive = new DriveConnector(auth);
      const results = await drive.searchFiles(`name contains '${intent.fileName.replace(/'/g, "\\'")}' and trashed = false`, 5);
      if (results.length === 0) return `❌ "${intent.fileName}" 파일을 Drive에서 찾을 수 없습니다.`;
      const file = results[0];
      const { buffer, fileName } = await drive.downloadFile(file.id, file.mimeType);
      await telegram.sendDocument(chatId, { source: buffer, filename: fileName });
      return `✅ "${fileName}" 파일을 전송했습니다. (${(buffer.length / 1024).toFixed(1)}KB)`;
    }

    if (intent.action === "read_sheet") {
      if (!intent.spreadsheetId) return "❌ Spreadsheet ID가 필요합니다.";
      const sheets = new SheetsConnector(auth);
      const data = await sheets.readSheet(intent.spreadsheetId, intent.range || "Sheet1!A1:Z50");
      if (!data.data.length) return "📊 시트 데이터가 없습니다.";
      const header = data.headers.join(" | ");
      const rows = data.data.slice(0, 5).map((row) => row.join(" | ")).join("\n");
      return `📊 ${data.sheetTitle} (상위 5행):\n\n${header}\n${"─".repeat(30)}\n${rows}`;
    }

    return null;
  } catch (error) {
    console.error("[TG WORKSPACE] Error:", error);
    if (
      error instanceof Error &&
      (error.message.toLowerCase().includes("no tokens") ||
        error.message.toLowerCase().includes("authenticate first") ||
        error.message.toLowerCase().includes("failed to get authenticated"))
    ) {
      return "Google 재인증이 필요합니다. 웹 앱에서 Google 계정을 다시 연결해주세요.";
    }
    return null;
  }
}
