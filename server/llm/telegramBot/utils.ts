import type { Context } from "telegraf";
import { saveMessage } from "../../db-chat.ts";
import { googleAuthManager } from "../../routers/google-workspace.ts";
import { sessionManager } from "../session.ts";

export const ADMIN_USER_ID = 1;
const GOOGLE_USER_ID = "1";
const FALLBACK_GOOGLE_USER_ID = "anonymous";

export interface BotContext extends Context {
  session?: {
    userId: string;
  };
}

export async function getConnectedGoogleUserId(): Promise<string | null> {
  const diskUserId = await sessionManager.getAnyAuthenticatedGoogleUserId();
  if (diskUserId) return diskUserId;

  for (const userId of [GOOGLE_USER_ID, FALLBACK_GOOGLE_USER_ID]) {
    if (await googleAuthManager.isAuthenticated(userId)) {
      return userId;
    }
  }

  return null;
}

export async function saveAssistantMessage(
  conversationId: number | null,
  text: string,
  messageId: number
): Promise<void> {
  if (conversationId === null) return;
  try {
    await saveMessage(conversationId, "assistant", text, "telegram", messageId);
  } catch {}
}
