import { getDb } from "./db.ts";
import { conversations, messages, type Conversation, type Message } from "../drizzle/schema.ts";
import { eq, and, desc, gte, lt, lte, sql } from "drizzle-orm";

export type MessageSourceFilter = "all" | "web" | "telegram";

export interface SearchMessagesOptions {
  userId: number;
  keyword: string;
  conversationId?: number;
  source?: MessageSourceFilter;
  from?: Date;
  to?: Date;
  limit?: number;
}

export interface SearchMessageResult {
  conversationId: number;
  conversationTitle: string | null;
  messageId: number;
  role: "user" | "assistant";
  content: string;
  source: "web" | "telegram";
  telegramMessageId: number | null;
  metadata: string | null;
  createdAt: Date;
}

export interface ConversationMessagePage {
  messages: Message[];
  hasMore: boolean;
}

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

export async function updateMessageContent(
  messageId: number,
  conversationId: number,
  content: string
): Promise<Message> {
  const db = getDb();
  const [updated] = await db
    .update(messages)
    .set({ content })
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)))
    .returning();

  if (!updated) {
    throw new Error("Failed to update message");
  }

  return updated;
}

export async function deleteMessage(
  messageId: number,
  conversationId: number
): Promise<void> {
  const db = getDb();
  await db
    .delete(messages)
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)));
}

export async function getConversationMessages(
  conversationId: number,
  limit: number = 50,
  before?: Date
): Promise<ConversationMessagePage> {
  const db = getDb();
  const conditions = [eq(messages.conversationId, conversationId)];

  if (before) {
    conditions.push(lt(messages.createdAt, before));
  }

  const rows = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  return {
    messages: hasMore ? rows.slice(0, limit) : rows,
    hasMore,
  };
}

export async function getAllConversationMessages(conversationId: number): Promise<Message[]> {
  const db = getDb();
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt));
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
): Promise<Conversation> {
  const db = getDb();
  const [updated] = await db
    .update(conversations)
    .set({ pinned, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId))
    .returning();

  if (!updated) {
    throw new Error("Failed to update conversation pin state");
  }

  return updated;
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

export async function searchMessages(options: SearchMessagesOptions): Promise<SearchMessageResult[]> {
  const db = getDb();
  const conditions = [eq(conversations.userId, options.userId)];

  if (options.conversationId) {
    conditions.push(eq(conversations.id, options.conversationId));
  }

  if (options.source && options.source !== "all") {
    conditions.push(eq(messages.source, options.source));
  }

  if (options.from) {
    conditions.push(gte(messages.createdAt, options.from));
  }

  if (options.to) {
    conditions.push(lte(messages.createdAt, options.to));
  }

  const keyword = options.keyword.trim();
  if (keyword) {
    const pattern = `%${keyword.toLowerCase()}%`;
    conditions.push(
      sql`(lower(${messages.content}) like ${pattern} or lower(coalesce(${conversations.title}, '')) like ${pattern})`
    );
  }

  const rows = await db
    .select({
      conversationId: conversations.id,
      conversationTitle: conversations.title,
      messageId: messages.id,
      role: messages.role,
      content: messages.content,
      source: messages.source,
      telegramMessageId: messages.telegramMessageId,
      metadata: messages.metadata,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(options.limit ?? 25);

  return rows.map((row) => ({
    ...row,
    conversationTitle: row.conversationTitle ?? null,
    telegramMessageId: row.telegramMessageId ?? null,
    metadata: row.metadata ?? null,
  }));
}
