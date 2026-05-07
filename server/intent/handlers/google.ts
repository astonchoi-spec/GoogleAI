import CalendarConnector from "../../google/calendar.ts";
import SheetsConnector from "../../google/sheets.ts";
import DriveConnector from "../../google/drive.ts";
import GmailConnector from "../../google/gmail.ts";
import { googleAuthManager } from "../../routers/google-workspace.ts";
import { ensureWorkspaceSchema, formatSchemaCheckMessage } from "../../google/workspaceSchema.ts";
import { saveWorkspaceSchemaResult, getConfiguredWorkspaceSheet } from "../../google/workspace-sheet-config.ts";
import {
  asString,
  asNumber,
  asBoolean,
  asStringArray,
  as2DArray,
  spreadsheetIdFromEnv,
  getGoogleAuth,
  isGoogleAuthError,
  GOOGLE_REAUTH_MSG,
  type HandlerMap,
  type IntentHandler,
} from "../types.ts";

const createEvent: IntentHandler = async (intent, options) => {
  const auth = await googleAuthManager.getAuthenticatedClient(options.userId);
  const calendar = new CalendarConnector(auth);
  // LLM이 title/summary, startTime/start, endTime/end 등 다른 필드명을 쓸 수 있어 둘 다 허용.
  const title = asString(
    intent.params.title ?? intent.params.summary,
    "새 일정",
  );
  const startTimeStr = asString(
    intent.params.startTime ?? intent.params.start,
    new Date().toISOString(),
  );
  const startTime = new Date(startTimeStr);
  const endTimeStr = asString(
    intent.params.endTime ?? intent.params.end,
    new Date(startTime.getTime() + 60 * 60 * 1000).toISOString(),
  );
  const endTime = new Date(endTimeStr);
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    throw new Error("Invalid calendar event date");
  }

  const event = await calendar.createEvent({
    title,
    description: asString(intent.params.description, ""),
    startTime,
    endTime,
    attendees: asStringArray(intent.params.attendees),
    location: asString(intent.params.location, ""),
    isAllDay: asBoolean(intent.params.isAllDay, false),
  });

  // 응답에 제목·시간을 명시해 어떤 일정이 만들어졌는지 회장님이 즉시 확인 가능하게.
  const startKst = startTime.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: `📅 캘린더 일정 생성됨\n📌 ${title}\n🕐 ${startKst}`,
    data: { event },
  };
};

const readSheet: IntentHandler = async (intent, options) => {
  const spreadsheetId = asString(intent.params.spreadsheetId, "") || (process.env.WORKSPACE_SPREADSHEET_ID ?? "");
  const range = asString(intent.params.range, "A1:Z50");
  const maxRows = asNumber(intent.params.maxRows, 5);
  if (!spreadsheetId) {
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: "📊 시트 ID가 없습니다. WORKSPACE_SPREADSHEET_ID 환경변수를 설정하거나 시트 ID를 함께 입력해주세요.",
    };
  }
  try {
    const auth = await getGoogleAuth(options.userId);
    const sheets = new SheetsConnector(auth);
    const data = await sheets.readSheet(spreadsheetId, range);
    if (!data.data.length) {
      return {
        intent, handled: true, requiresConfirmation: false,
        response: `📊 ${data.sheetTitle}: 데이터가 없습니다.`,
        data: { spreadsheetId, range, rows: [] },
      };
    }
    const header = data.headers.join(" | ");
    const rows = data.data.slice(0, maxRows).map((row) => row.join(" | ")).join("\n");
    const totalRows = data.data.length;
    const shown = Math.min(maxRows, totalRows);
    return {
      intent, handled: true, requiresConfirmation: false,
      response: `📊 ${data.sheetTitle} (상위 ${shown}/${totalRows}행)\n\n${header}\n${"─".repeat(Math.min(header.length, 40))}\n${rows}`,
      data: { spreadsheetId, range, headers: data.headers, rows: data.data, sheetTitle: data.sheetTitle },
    };
  } catch (err) {
    if (isGoogleAuthError(err)) {
      return { intent, handled: true, requiresConfirmation: false, response: GOOGLE_REAUTH_MSG };
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[google_read_sheet] error:", errMsg);
    return {
      intent, handled: true, requiresConfirmation: false,
      response: `📊 시트 읽기 오류: ${errMsg}\n\n시트 ID: ${spreadsheetId}\n범위: ${range}`,
    };
  }
};

const writeSheet: IntentHandler = async (intent, options) => {
  const auth = await googleAuthManager.getAuthenticatedClient(options.userId);
  const sheets = new SheetsConnector(auth);
  const spreadsheetId = asString(intent.params.spreadsheetId, spreadsheetIdFromEnv());
  const range = asString(intent.params.range, "Sheet1!A1");
  const values = as2DArray(intent.params.values);
  const normalizedValues = values.length > 0 ? values : [[asString(intent.params.value, "sample")]];

  await sheets.writeSheet({
    spreadsheetId,
    range,
    values: normalizedValues,
  });

  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: "시트 쓰기가 완료되었습니다.",
    data: { spreadsheetId, range, rows: normalizedValues.length },
  };
};

const driveSearch: IntentHandler = async (intent, options) => {
  console.log("[INTENT] executing google_drive_search, query:", intent.params.query);
  const query = asString(intent.params.query, "");
  const maxResults = asNumber(intent.params.maxResults, 10);
  try {
    const auth = await getGoogleAuth(options.userId);
    const drive = new DriveConnector(auth);
    const driveQuery = query
      ? `(name contains '${query.replace(/'/g, "\\'")}' or fullText contains '${query.replace(/'/g, "\\'")}') and trashed = false`
      : "trashed = false";
    console.log("[INTENT] Drive API query:", driveQuery);
    const files = await drive.searchFiles(driveQuery, maxResults);
    console.log("[INTENT] Drive search result:", files.length, "files");
    if (files.length === 0) {
      return {
        intent, handled: true, requiresConfirmation: false,
        response: `Google Drive에서 "${query}" 관련 파일을 찾을 수 없습니다.`,
        data: { files: [] },
      };
    }
    const fileList = (files as any[]).map((f, i) => `${i + 1}. 📄 ${f.name}`).join("\n");
    return {
      intent, handled: true, requiresConfirmation: false,
      response: `Google Drive에서 "${query}" 관련 파일 ${files.length}개를 찾았습니다.`,
      data: { files, fileList },
    };
  } catch (err) {
    console.error("[INTENT] google_drive_search error:", err);
    if (isGoogleAuthError(err)) {
      return { intent, handled: true, requiresConfirmation: false, response: GOOGLE_REAUTH_MSG };
    }
    throw err;
  }
};

const getEmails: IntentHandler = async (intent, options) => {
  console.log("[INTENT] executing google_get_emails");
  const maxResults = asNumber(intent.params.maxResults, 5);
  const searchQuery = asString(intent.params.searchQuery, "") || undefined;
  try {
    const auth = await getGoogleAuth(options.userId);
    const gmail = new GmailConnector(auth);
    const emails = await gmail.getEmails(maxResults, searchQuery);
    if (emails.length === 0) {
      return { intent, handled: true, requiresConfirmation: false, response: "📭 받은 메일이 없습니다.", data: { emails: [] } };
    }
    const emailList = (emails as any[]).map((e, i) =>
      `${i + 1}. ${e.isRead ? "" : "🔵"} ${e.subject}\n   발신: ${e.from}`
    ).join("\n\n");
    return {
      intent, handled: true, requiresConfirmation: false,
      response: `📬 최근 이메일 ${emails.length}개를 조회했습니다.`,
      data: { emails, emailList },
    };
  } catch (err) {
    if (isGoogleAuthError(err)) {
      return { intent, handled: true, requiresConfirmation: false, response: GOOGLE_REAUTH_MSG };
    }
    throw err;
  }
};

const sendEmail: IntentHandler = async (intent, options) => {
  const to = asString(intent.params.to, "");
  const subject = asString(intent.params.subject, "");
  const body = asString(intent.params.body, "");
  if (!to || !subject || !body) {
    return {
      intent, handled: false, requiresConfirmation: true,
      response: "이메일 전송에 필요한 정보가 부족합니다. 받는 사람, 제목, 본문을 알려주세요.",
      confirmation: { action: "google_send_email", domain: "google", params: intent.params },
    };
  }
  try {
    const auth = await getGoogleAuth(options.userId);
    const gmail = new GmailConnector(auth);
    await gmail.sendEmail({ to, subject, body });
    return {
      intent, handled: true, requiresConfirmation: false,
      response: `✅ 이메일 전송 완료!\n📧 받는 사람: ${to}\n📋 제목: ${subject}`,
      data: { to, subject },
    };
  } catch (err) {
    if (isGoogleAuthError(err)) {
      return { intent, handled: true, requiresConfirmation: false, response: GOOGLE_REAUTH_MSG };
    }
    throw err;
  }
};

function kstTodayRange(): { start: Date; end: Date; dateKey: string } {
  // KST 기준 오늘 00:00 ~ 익일 00:00
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  const y = nowKst.getUTCFullYear();
  const m = nowKst.getUTCMonth();
  const d = nowKst.getUTCDate();
  const start = new Date(Date.UTC(y, m, d) - KST_OFFSET_MS);
  const end = new Date(Date.UTC(y, m, d + 1) - KST_OFFSET_MS);
  const dateKey = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { start, end, dateKey };
}

function formatEventTimeKst(date: Date, isAllDay: boolean): string {
  if (isAllDay) return "종일";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(date);
}

const todayEvents: IntentHandler = async (intent, options) => {
  console.log("[INTENT] executing google_today_events");
  try {
    const auth = await getGoogleAuth(options.userId);
    const calendar = new CalendarConnector(auth);
    const { start, end, dateKey } = kstTodayRange();
    const events = await calendar.getEventsByDateRange(start, end);
    if (events.length === 0) {
      return {
        intent, handled: true, requiresConfirmation: false,
        response: `📅 오늘(${dateKey}) 등록된 일정이 없습니다.`,
        data: { events: [], dateKey },
      };
    }
    const sorted = [...events].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    const lines = sorted.map((e, i) => {
      const time = formatEventTimeKst(e.startTime, e.isAllDay);
      const title = e.title || "(제목 없음)";
      const loc = e.location ? ` @ ${e.location}` : "";
      return `${i + 1}. ${time} — ${title}${loc}`;
    });
    return {
      intent, handled: true, requiresConfirmation: false,
      response: `📅 오늘(${dateKey}) 일정 ${events.length}개\n\n${lines.join("\n")}`,
      data: { events: sorted, dateKey },
    };
  } catch (err) {
    if (isGoogleAuthError(err)) {
      return { intent, handled: true, requiresConfirmation: false, response: GOOGLE_REAUTH_MSG };
    }
    throw err;
  }
};

const listEvents: IntentHandler = async (intent, options) => {
  console.log("[INTENT] executing google_list_events");
  const maxResults = asNumber(intent.params.maxResults, 5);
  try {
    const auth = await getGoogleAuth(options.userId);
    const calendar = new CalendarConnector(auth);
    const events = await calendar.getUpcomingEvents(maxResults);
    if (events.length === 0) {
      return { intent, handled: true, requiresConfirmation: false, response: "📅 예정된 일정이 없습니다.", data: { events: [] } };
    }
    const eventList = (events as any[]).map((e, i) =>
      `${i + 1}. 📅 ${e.title || e.summary || "(제목 없음)"}\n   ${e.start?.dateTime || e.start?.date || ""}`
    ).join("\n\n");
    return {
      intent, handled: true, requiresConfirmation: false,
      response: `📅 다가오는 일정 ${events.length}개를 조회했습니다.`,
      data: { events, eventList },
    };
  } catch (err) {
    if (isGoogleAuthError(err)) {
      return { intent, handled: true, requiresConfirmation: false, response: GOOGLE_REAUTH_MSG };
    }
    throw err;
  }
};

const ensureSchema: IntentHandler = async (intent, options) => {
  const configured = await getConfiguredWorkspaceSheet();
  const spreadsheetId = configured?.spreadsheetId || process.env.WORKSPACE_SPREADSHEET_ID || "";
  if (!spreadsheetId) {
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: "📋 WORKSPACE_SPREADSHEET_ID 또는 workspace-sheet.json 설정이 필요합니다.",
    };
  }
  try {
    const result = await ensureWorkspaceSchema(options.userId, spreadsheetId);
    await saveWorkspaceSchemaResult({ spreadsheetId: result.spreadsheetId, tabs: result.resolvedTabs });
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: formatSchemaCheckMessage(result),
      data: { result },
    };
  } catch (err) {
    if (isGoogleAuthError(err)) {
      return { intent, handled: true, requiresConfirmation: false, response: GOOGLE_REAUTH_MSG };
    }
    throw err;
  }
};

const reauthGuide: IntentHandler = async (intent, _options) => {
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: GOOGLE_REAUTH_MSG,
  };
};

export const googleHandlers: HandlerMap = {
  google_create_event: createEvent,
  google_write_sheet: writeSheet,
  google_read_sheet: readSheet,
  google_drive_search: driveSearch,
  google_get_emails: getEmails,
  google_send_email: sendEmail,
  google_list_events: listEvents,
  google_today_events: todayEvents,
  google_ensure_schema: ensureSchema,
  google_reauth_guide: reauthGuide,
};
