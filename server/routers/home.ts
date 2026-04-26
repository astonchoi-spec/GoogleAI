// home.ts — live KPI aggregation for the Home dashboard
// Uses Promise.allSettled so a single service failure does NOT fail the whole call.

import { publicProcedure, router } from "../_core/trpc.ts";
import { googleAuthManager } from "./google-workspace.ts";
import GmailConnector from "../google/gmail.ts";
import CalendarConnector from "../google/calendar.ts";
import { exchangeConnector } from "../exchanges/exchangeConnector.ts";
import { DealPipeline } from "../realestate/dealPipeline.ts";
import { alertEngine } from "../alerts/alertEngine.ts";

type KpiResult = { count: number; status: "ok" | "unavailable" | "error" };

const ADMIN_USER_ID = "admin";

function spreadsheetIdFromEnv(): string | null {
  return process.env.WORKSPACE_SPREADSHEET_ID ?? null;
}

async function getGmailCount(): Promise<KpiResult> {
  try {
    const authed = await googleAuthManager.isAuthenticated(ADMIN_USER_ID);
    if (!authed) return { count: 0, status: "unavailable" };

    const auth = await googleAuthManager.getAuthenticatedClient(ADMIN_USER_ID);
    const gmail = new GmailConnector(auth);
    // getEmails returns at most maxResults messages; use length as unread approximation
    const emails = await gmail.getEmails(20, "is:unread newer_than:30d");
    return { count: emails.length, status: "ok" };
  } catch {
    return { count: 0, status: "error" };
  }
}

async function getCalendarCount(): Promise<KpiResult> {
  try {
    const authed = await googleAuthManager.isAuthenticated(ADMIN_USER_ID);
    if (!authed) return { count: 0, status: "unavailable" };

    const auth = await googleAuthManager.getAuthenticatedClient(ADMIN_USER_ID);
    const calendar = new CalendarConnector(auth);
    const events = await calendar.getUpcomingEvents(20);

    // Count events whose startTime falls on today (Asia/Seoul)
    // fmt is lifted outside the filter to avoid constructing a new Intl.DateTimeFormat per iteration.
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });
    const todayStr = fmt.format(new Date());
    const todayCount = events.filter((ev) => fmt.format(new Date(ev.startTime)) === todayStr).length;

    return { count: todayCount, status: "ok" };
  } catch {
    return { count: 0, status: "error" };
  }
}

async function getTradingCount(): Promise<KpiResult> {
  try {
    // Try binance positions (futures). If binance is not configured, fall through to error.
    const positions = await exchangeConnector.getPositions("binance");
    return { count: positions.length, status: "ok" };
  } catch {
    return { count: 0, status: "unavailable" };
  }
}

async function getRealestateCount(): Promise<KpiResult> {
  try {
    const spreadsheetId = spreadsheetIdFromEnv();
    if (!spreadsheetId) return { count: 0, status: "unavailable" };

    const authed = await googleAuthManager.isAuthenticated(ADMIN_USER_ID);
    if (!authed) return { count: 0, status: "unavailable" };

    const auth = await googleAuthManager.getAuthenticatedClient(ADMIN_USER_ID);
    const pipeline = new DealPipeline(auth, spreadsheetId);
    const deals = await pipeline.getAllDeals();
    return { count: deals.length, status: "ok" };
  } catch {
    return { count: 0, status: "error" };
  }
}

async function getAlertsCount(): Promise<KpiResult> {
  try {
    // getAlerts is per-user; for the dashboard show admin user's active alerts
    const alerts = await alertEngine.getAlerts(ADMIN_USER_ID);
    const activeCount = alerts.filter((a) => a.active).length;
    return { count: activeCount, status: "ok" };
  } catch {
    return { count: 0, status: "error" };
  }
}

export const homeRouter = router({
  getStats: publicProcedure.query(async () => {
    const [gmailResult, calendarResult, tradingResult, realestateResult, alertsResult] =
      await Promise.allSettled([
        getGmailCount(),
        getCalendarCount(),
        getTradingCount(),
        getRealestateCount(),
        getAlertsCount(),
      ]);

    const unwrap = (result: PromiseSettledResult<KpiResult>): KpiResult =>
      result.status === "fulfilled" ? result.value : { count: 0, status: "error" };

    return {
      gmail: unwrap(gmailResult),
      calendar: unwrap(calendarResult),
      trading: unwrap(tradingResult),
      realestate: unwrap(realestateResult),
      telegram: { count: 0, status: "unavailable" } as KpiResult, // endpoint coming in next task
      alerts: unwrap(alertsResult),
    };
  }),
});
