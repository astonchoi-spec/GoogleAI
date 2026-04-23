import { getDb } from "./db.ts";
import { conversations, messages } from "../drizzle/schema.ts";
import type { Conversation, Message } from "../drizzle/schema.ts";
import { eq, and, desc, gte } from "drizzle-orm";

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

export async function getConversationById(id: number): Promise<Conversation | null> {
  const db = getDb();
  const result = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  return result[0] || null;
}
