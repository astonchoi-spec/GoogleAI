import CalendarConnector from "../../google/calendar.ts";
import SheetsConnector from "../../google/sheets.ts";
import DriveConnector from "../../google/drive.ts";
import GmailConnector from "../../google/gmail.ts";
import { googleAuthManager } from "../../routers/google-workspace.ts";
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
  const title = asString(intent.params.title, "새 일정");
  const startTime = new Date(asString(intent.params.startTime, new Date().toISOString()));
  const endTime = new Date(
    asString(intent.params.endTime, new Date(startTime.getTime() + 60 * 60 * 1000).toISOString())
  );
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

  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: "캘린더 일정이 생성되었습니다.",
    data: { event },
  };
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

export const googleHandlers: HandlerMap = {
  google_create_event: createEvent,
  google_write_sheet: writeSheet,
  google_drive_search: driveSearch,
  google_get_emails: getEmails,
  google_send_email: sendEmail,
  google_list_events: listEvents,
};
