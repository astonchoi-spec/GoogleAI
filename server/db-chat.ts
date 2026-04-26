import { getDb } from "./db.ts";
import { conversations, messages } from "../drizzle/schema.ts";
import type { Conversation, Message } from "../drizzle/schema.ts";
import { eq, and, desc, gte, lte, like } from "drizzle-orm";

export async function getOrCreateConversation(userId: number): Promise<Conversation> {
  const db = getDb();
  const existing = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.userId, userId), eq(conversations.isActive, true)))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const [inserted] = await db
    .insert(conversations)
    .values({ userId, isActive: true })
    .returning();

  if (!inserted) throw new Error("Failed to create conversation");
  return inserted;
}

export async function getOrCreateTelegramConversation(
  userId: number,
  telegramChatId: number
): Promise<Conversation> {
  const db = getDb();
  const existing = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.userId, userId), eq(conversations.isActive, true)))
    .limit(1);

  if (existing.length > 0) {
    if (!existing[0].telegramChatId) {
      await db
        .update(conversations)
        .set({ telegramChatId, updatedAt: new Date() })
        .where(eq(conversations.id, existing[0].id));
      return { ...existing[0], telegramChatId };
    }
    return existing[0];
  }

  const [inserted] = await db
    .insert(conversations)
    .values({ userId, telegramChatId, isActive: true })
    .returning();

  if (!inserted) throw new Error("Failed to create conversation");
  return inserted;
}

export async function saveMessage(
  conversationId: number,
  role: "user" | "assistant",
  content: string,
  source: "web" | "telegram",
  telegramMessageId?: number,
  metadata?: Record<string, any>
): Promise<Message> {
  const db = getDb();

  const [inserted] = await db
    .insert(messages)
    .values({
      conversationId,
      role,
      content,
      source,
      telegramMessageId,
      metadata: metadata ? JSON.stringify(metadata) : null,
    })
    .returning();

  if (!inserted) throw new Error("Failed to save message");
  return inserted;
}

export async function updateMessage(
  conversationId: number,
  messageId: number,
  content: string
): Promise<void> {
  const db = getDb();
  await db
    .update(messages)
    .set({ content })
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)));
}

export async function deleteMessage(
  conversationId: number,
  messageId: number
): Promise<void> {
  const db = getDb();
  await db
    .delete(messages)
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)));
}

export async function clearConversationMessages(
  conversationId: number
): Promise<void> {
  const db = getDb();
  await db
    .delete(messages)
    .where(eq(messages.conversationId, conversationId)); // MODIFIED: support clearing the full chat timeline while keeping the conversation link.
}

export async function getConversationMessages(
  conversationId: number,
  limit: number = 50
): Promise<Message[]> {
  const db = getDb();
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
}

export async function getConversationMessagesAsc(
  conversationId: number
): Promise<Message[]> {
  const db = getDb();
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);
}

export async function getRecentMessages(
  conversationId: number,
  since: Date
): Promise<Message[]> {
  const db = getDb();
  return db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), gte(messages.createdAt, since)))
    .orderBy(desc(messages.createdAt));
}

export async function searchConversationMessages(params: { // MODIFIED: support message search by keyword/date/source for unified chat history.
  conversationId: number;
  query?: string;
  source?: "all" | "web" | "telegram";
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}): Promise<Message[]> {
  const db = getDb();
  const conditions = [eq(messages.conversationId, params.conversationId)];

  const normalizedQuery = params.query?.trim();
  if (normalizedQuery) {
    conditions.push(like(messages.content, `%${normalizedQuery}%`));
  }

  if (params.source && params.source !== "all") {
    conditions.push(eq(messages.source, params.source));
  }

  if (params.dateFrom) {
    conditions.push(gte(messages.createdAt, params.dateFrom));
  }

  if (params.dateTo) {
    conditions.push(lte(messages.createdAt, params.dateTo));
  }

  return db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(params.limit ?? 100);
}

export async function getConversationByTelegramChatId(
  telegramChatId: number
): Promise<Conversation | null> {
  const db = getDb();
  const result = await db
    .select()
    .from(conversations)
    .where(eq(conversations.telegramChatId, telegramChatId))
    .limit(1);
  return result[0] || null;
}

export async function updateConversationTitle(
  conversationId: number,
  title: string
): Promise<void> {
  const db = getDb();
  await db
    .update(conversations)
    .set({ title, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

export async function updateConversationPinned(
  conversationId: number,
  pinned: boolean
): Promise<void> {
  const db = getDb();
  await db
    .update(conversations)
    .set({ pinned, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

export async function getPinnedConversations(userId: number): Promise<Conversation[]> {
  const db = getDb();
  return db
    .select()
    .from(conversations)
    .where(and(eq(conversations.userId, userId), eq(conversations.pinned, true)))
    .orderBy(desc(conversations.updatedAt));
}

export async function getConversationById(id: number): Promise<Conversation | null> {
  const db = getDb();
  const result = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  return result[0] || null;
}
