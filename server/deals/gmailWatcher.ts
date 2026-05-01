import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { google, type gmail_v1 } from "googleapis";
import { getAnyGoogleOAuthClient } from "../_core/googleOAuth.ts";
import { classifyAndSaveFile, shouldIgnoreFile } from "./fileClassifier.ts";
import { getTelegramBot } from "../telegram-service.ts";

type GmailClient = gmail_v1.Gmail;
type GmailWatcherDeps = {
  gmail?: GmailClient;
  classify?: typeof classifyAndSaveFile;
  authProvider?: typeof getAnyGoogleOAuthClient;
  notify?: (text: string) => Promise<void>;
};

let pollTimer: ReturnType<typeof setInterval> | null = null;
let authNotified = false;

function intervalMs(): number {
  const minutes = Number(process.env.GMAIL_POLL_INTERVAL_MIN || "5");
  return Math.max(1, Number.isFinite(minutes) ? minutes : 5) * 60 * 1000;
}

function labelName(): string {
  return (process.env.GMAIL_AUTO_LABEL || "Aston-Deals").trim() || "Aston-Deals";
}

function isEnabled(): boolean {
  return (process.env.GMAIL_ENABLED || "").trim().toLowerCase() === "true";
}

async function defaultNotify(text: string): Promise<void> {
  const bot = getTelegramBot();
  const chatId = Number(process.env.OWNER_TELEGRAM_CHAT_ID);
  if (!bot || !Number.isFinite(chatId) || chatId === 0) return;
  await bot.telegram.sendMessage(chatId, text);
}

function getHeader(message: gmail_v1.Schema$Message, name: string): string {
  return message.payload?.headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function collectAttachments(part: gmail_v1.Schema$MessagePart | undefined): Array<{ id: string; name: string; mimeType: string; size: number }> {
  if (!part) return [];
  const own = part.filename && part.body?.attachmentId
    ? [{ id: part.body.attachmentId, name: part.filename, mimeType: part.mimeType ?? "", size: Number(part.body.size ?? 0) }]
    : [];
  return [...own, ...(part.parts ?? []).flatMap(collectAttachments)];
}

function hasOnlyImages(attachments: Array<{ mimeType: string; name: string }>): boolean {
  return attachments.length > 0 && attachments.every((item) => item.mimeType.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(item.name));
}

async function ensureProcessedLabel(gmail: GmailClient): Promise<string | null> {
  try {
    const processedName = `${labelName()}/Processed`;
    const labels = await gmail.users.labels.list({ userId: "me" });
    const existing = labels.data.labels?.find((label) => label.name === processedName);
    if (existing?.id) return existing.id;
    const created = await gmail.users.labels.create({
      userId: "me",
      requestBody: { name: processedName, labelListVisibility: "labelShow", messageListVisibility: "show" },
    });
    return created.data.id ?? null;
  } catch (err) {
    console.warn("[gmail-watcher] processed label unavailable:", (err as Error).message);
    return null;
  }
}

async function downloadAttachment(gmail: GmailClient, messageId: string, attachmentId: string, fileName: string): Promise<string> {
  const response = await gmail.users.messages.attachments.get({ userId: "me", messageId, id: attachmentId });
  const data = response.data.data;
  if (!data) throw new Error("첨부파일 데이터가 비어 있습니다.");
  const buffer = Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aston-gmail-"));
  const filePath = path.join(tempDir, fileName.replace(/[\\/:*?"<>|]/g, ""));
  await fs.writeFile(filePath, buffer);
  return filePath;
}

export async function processGmailMessage(gmail: GmailClient, messageId: string, deps: GmailWatcherDeps = {}): Promise<number> {
  const classify = deps.classify ?? classifyAndSaveFile;
  const msg = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
  const message = msg.data;
  const sender = getHeader(message, "From");
  const subject = getHeader(message, "Subject");
  const attachments = collectAttachments(message.payload);
  if (shouldIgnoreFile("gmail", attachments.map((item) => item.name).join(" "), { sender, subject }) || hasOnlyImages(attachments)) {
    return 0;
  }

  let processed = 0;
  for (const attachment of attachments) {
    const filePath = await downloadAttachment(gmail, messageId, attachment.id, attachment.name);
    await classify({
      source: "gmail",
      filepath: filePath,
      originalName: attachment.name,
      metadata: { sender, subject, sizeBytes: attachment.size },
    });
    processed += 1;
  }

  const processedLabelId = await ensureProcessedLabel(gmail);
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      removeLabelIds: ["UNREAD"],
      addLabelIds: processedLabelId ? [processedLabelId] : undefined,
    },
  });
  return processed;
}

export async function pollGmailOnce(deps: GmailWatcherDeps = {}): Promise<number> {
  const authResult = deps.gmail ? null : await (deps.authProvider ?? getAnyGoogleOAuthClient)();
  if (!deps.gmail && !authResult) {
    if (!authNotified) {
      authNotified = true;
      await (deps.notify ?? defaultNotify)("⚠️ Gmail 인증 만료 또는 미연결 상태입니다. 웹 앱에서 Google 계정을 다시 연결해주세요.");
    }
    return 0;
  }
  authNotified = false;
  const gmail = deps.gmail ?? google.gmail({ version: "v1", auth: authResult!.auth });
  try {
    const list = await gmail.users.messages.list({
      userId: "me",
      q: `label:${labelName()} is:unread has:attachment`,
      maxResults: 10,
    });
    let count = 0;
    for (const item of list.data.messages ?? []) {
      if (item.id) count += await processGmailMessage(gmail, item.id, deps);
    }
    return count;
  } catch (err) {
    console.error("[gmail-watcher] pollGmailOnce:", err);
    throw new Error("Gmail 자동 분류 중 오류가 발생했습니다.");
  }
}

export function startGmailWatcher(deps: GmailWatcherDeps = {}): ReturnType<typeof setInterval> | null {
  if (!isEnabled()) {
    console.warn("[gmail-watcher] disabled: GMAIL_ENABLED is not true.");
    return null;
  }
  if (pollTimer) return pollTimer;
  void pollGmailOnce(deps).catch((err) => console.error("[gmail-watcher] initial poll:", err));
  pollTimer = setInterval(() => {
    void pollGmailOnce(deps).catch((err) => console.error("[gmail-watcher] poll:", err));
  }, intervalMs());
  console.log(`[gmail-watcher] polling every ${Math.round(intervalMs() / 60000)}min, label: ${labelName()}`);
  return pollTimer;
}

export function stopGmailWatcher(): void {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
  console.log("[gmail-watcher] stopped");
}
