import { googleAuthManager } from "../routers/google-workspace.ts";

export type IntentDomain = "trading" | "realestate" | "finance" | "google" | "wiki" | "intelligence" | "deals" | "agents" | "chat" | "knowledge" | "notebooklm";
export type IntentType = "query" | "execute";
export type IntentAction =
  | "trading_balance"
  | "trading_positions"
  | "trading_technical_analysis"
  | "trading_risk_calculation"
  | "trading_add_alert"
  | "trading_risk_calculate"
  | "trading_risk_status"
  | "trading_risk_lock"
  | "trading_risk_unlock"
  | "trading_risk_settings_update"
  | "trading_pre_check"
  | "trading_review_report"
  | "trading_buy_signal"
  | "trading_sell_signal"
  | "trading_approval_list"
  | "intelligence_morning_briefing"
  | "notebooklm_query"
  | "monitoring_status"
  | "analysis_indicators"
  | "analysis_rsi"
  | "analysis_macd"
  | "analysis_bollinger"
  | "realestate_portfolio_summary"
  | "realestate_feasibility"
  | "realestate_simple_feasibility"
  | "realestate_land_use"
  | "realestate_land_price"
  | "realestate_real_transaction"
  | "realestate_add_deal"
  | "realestate_update_deal_stage"
  | "finance_dart_disclosures"
  | "google_create_event"
  | "google_write_sheet"
  | "google_read_sheet"
  | "google_ensure_schema"
  | "google_drive_search"
  | "google_get_emails"
  | "google_send_email"
  | "google_list_events"
  | "google_today_events"
  | "wiki_save"
  | "wiki_search"
  | "wiki_auto_classify"
  | "tg_pipeline_capture"
  | "deals_command"
  | "agent_command"
  | "chat_telegram_recent"
  | "nb_command"
  | "execute_placeholder"
  | "chat";

export type IntentResult = {
  domain: IntentDomain;
  action: IntentAction;
  type: IntentType;
  confidence: number;
  params: Record<string, unknown>;
};

export type IntentRouteResponse = {
  intent: IntentResult;
  handled: boolean;
  requiresConfirmation: boolean;
  response: string;
  data?: unknown;
  confirmation?: {
    action: IntentAction;
    domain: IntentDomain;
    params: Record<string, unknown>;
  };
};

export type RouteIntentOptions = {
  userId: string;
  message: string;
  allowExecute?: boolean;
};

export type IntentHandler = (
  intent: IntentResult,
  options: RouteIntentOptions
) => Promise<IntentRouteResponse>;

export type HandlerMap = Partial<Record<IntentAction, IntentHandler>>;

// ---------------------------------------------------------------------------
// 파라미터 정규화 헬퍼 — LLM이 반환한 느슨한 JSON을 안전하게 변환
// ---------------------------------------------------------------------------

export function asString(value: unknown, fallbackValue: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallbackValue;
}

export function asNumber(value: unknown, fallbackValue: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallbackValue;
}

export function asBoolean(value: unknown, fallbackValue: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return fallbackValue;
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

export function as2DArray(value: unknown): unknown[][] {
  if (!Array.isArray(value)) return [];
  return value.filter((row) => Array.isArray(row)) as unknown[][];
}

export function yyyymmdd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function stringifyPreview(data: unknown, maxLength: number = 1200): string {
  if (data === undefined || data === null) return "";
  const preview = JSON.stringify(data, null, 2);
  return preview.length > maxLength ? `${preview.slice(0, maxLength)}...` : preview;
}

export function spreadsheetIdFromEnv(): string {
  const spreadsheetId = process.env.WORKSPACE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error("WORKSPACE_SPREADSHEET_ID is missing");
  }
  return spreadsheetId;
}

// ---------------------------------------------------------------------------
// Google 인증 헬퍼
// ---------------------------------------------------------------------------

export const GOOGLE_REAUTH_MSG = "Google 재인증이 필요합니다. 웹 앱에서 Google 계정을 다시 연결해주세요.";

export function isGoogleAuthError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("no tokens") ||
    msg.includes("authenticate first") ||
    msg.includes("token expired") ||
    msg.includes("no refresh token") ||
    msg.includes("failed to get authenticated") ||
    msg.includes("failed to refresh")
  );
}

export async function getGoogleAuth(userId: string) {
  console.log("[INTENT] getGoogleAuth for userId:", userId);
  try {
    return await googleAuthManager.getAuthenticatedClient(userId);
  } catch {
    for (const uid of ["1", "anonymous"]) {
      if (uid === userId) continue;
      try {
        const client = await googleAuthManager.getAuthenticatedClient(uid);
        console.log("[INTENT] getGoogleAuth fallback succeeded for uid:", uid);
        return client;
      } catch {
        // continue
      }
    }
    throw new Error("No tokens found for user. Please authenticate first.");
  }
}
