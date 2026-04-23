/**
 * Chat Sync Router
 * Handles unified message synchronization between web and Telegram
 */

import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  getOrCreateConversation,
  getOrCreateTelegramConversation,
  getConversationMessages,
  getAllConversationMessages,
  getRecentMessages,
  searchMessages,
  saveMessage,
  updateMessageContent,
  deleteMessage,
  getConversationByTelegramChatId,
  getConversationById,
  updateConversationTitle,
  updateConversationPinned,
} from "../db-chat";
import { forwardToTelegram } from "../telegram-service";

async function assertConversationOwnership(conversationId: number, userId: number) {
  const conversation = await getConversationById(conversationId);
  if (!conversation || conversation.userId !== userId) {
    throw new Error("Access denied");
  }

  return conversation;
}

export const chatSyncRouter = router({
  /**
   * Get or create conversation for current user
   */
  getConversation: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await getOrCreateConversation(ctx.user.id);
    } catch {
      return null;
    }
  }),

  /**
   * Get conversation messages with pagination
   */
  getMessages: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        limit: z.number().max(100).default(50),
        before: z.date().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      await assertConversationOwnership(input.conversationId, ctx.user.id);

      const page = await getConversationMessages(input.conversationId, input.limit, input.before);
      return {
        messages: page.messages.map((msg) => ({
          ...msg,
          metadata: msg.metadata ? JSON.parse(msg.metadata) : null,
        })),
        hasMore: page.hasMore,
      };
    }),

  /**
   * Get recent messages since timestamp (for real-time sync)
   */
  getRecentMessages: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        since: z.date(),
      })
    )
    .query(async ({ input, ctx }) => {
      await assertConversationOwnership(input.conversationId, ctx.user.id);

      const msgs = await getRecentMessages(input.conversationId, input.since);
      return msgs.map((msg) => ({
        ...msg,
        metadata: msg.metadata ? JSON.parse(msg.metadata) : null,
      }));
    }),

  /**
   * Search messages across the user's conversations
   */
  searchMessages: protectedProcedure
    .input(
      z.object({
        keyword: z.string().min(1).max(200),
        conversationId: z.number().optional(),
        source: z.enum(["all", "web", "telegram"]).default("all"),
        from: z.date().optional(),
        to: z.date().optional(),
        limit: z.number().min(1).max(100).default(25),
      })
    )
    .query(async ({ input, ctx }) => {
      const results = await searchMessages({
        userId: ctx.user.id,
        keyword: input.keyword,
        conversationId: input.conversationId,
        source: input.source,
        from: input.from,
        to: input.to,
        limit: input.limit,
      });

      return results.map((result) => ({
        ...result,
        metadata: result.metadata ? JSON.parse(result.metadata) : null,
      }));
    }),

  /**
   * Save message from web chat
   */
  saveWebMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertConversationOwnership(input.conversationId, ctx.user.id);

      const msg = await saveMessage(
        input.conversationId,
        input.role,
        input.content,
        "web"
      );
      return msg;
    }),

  /**
   * Save message from Telegram (public for webhook)
   */
  saveTelegramMessage: publicProcedure
    .input(
      z.object({
        telegramChatId: z.number(),
        telegramMessageId: z.number(),
        userId: z.number(),
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const conversation = await getOrCreateTelegramConversation(
        input.userId,
        input.telegramChatId
      );

      const msg = await saveMessage(
        conversation.id,
        input.role,
        input.content,
        "telegram",
        input.telegramMessageId
      );
      return msg;
    }),

  /**
   * Update conversation title
   */
  updateTitle: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        title: z.string().max(255),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertConversationOwnership(input.conversationId, ctx.user.id);

      await updateConversationTitle(input.conversationId, input.title);
      return { success: true };
    }),

  /**
   * Pin or unpin the current conversation
   */
  togglePin: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        pinned: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertConversationOwnership(input.conversationId, ctx.user.id);
      const conversation = await updateConversationPinned(input.conversationId, input.pinned);
      return {
        ...conversation,
      };
    }),

  /**
   * Edit a message in the conversation
   */
  editMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        messageId: z.number(),
        content: z.string().min(1).max(4000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertConversationOwnership(input.conversationId, ctx.user.id);

      const msg = await updateMessageContent(input.messageId, input.conversationId, input.content);
      return {
        ...msg,
        metadata: msg.metadata ? JSON.parse(msg.metadata) : null,
      };
    }),

  /**
   * Delete a message from the conversation
   */
  deleteMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        messageId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertConversationOwnership(input.conversationId, ctx.user.id);
      await deleteMessage(input.messageId, input.conversationId);
      return { success: true };
    }),

  /**
   * Export a conversation as JSON
   */
  exportConversation: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      const conversation = await assertConversationOwnership(input.conversationId, ctx.user.id);
      const messages = await getAllConversationMessages(input.conversationId);

      return {
        conversation: {
          ...conversation,
          messages: messages.map((msg) => ({
            ...msg,
            metadata: msg.metadata ? JSON.parse(msg.metadata) : null,
          })),
        },
      };
    }),

  /**
   * Get conversation by Telegram chat ID (for bot)
   */
  getConversationByTelegramId: publicProcedure
    .input(z.object({ telegramChatId: z.number() }))
    .query(async ({ input }) => {
      return getConversationByTelegramChatId(input.telegramChatId);
    }),

  /**
   * Forward web messages to Telegram (web -> telegram sync)
   */
  forwardToTelegram: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        userMessage: z.string(),
        aiResponse: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const conversation = await assertConversationOwnership(input.conversationId, ctx.user.id);
      if (!conversation.telegramChatId) {
        return { sent: false, reason: "Telegram chat not linked yet" };
      }

      await forwardToTelegram(conversation.telegramChatId, `👤 ${input.userMessage}`);
      await forwardToTelegram(conversation.telegramChatId, `🤖 ${input.aiResponse}`);
      return { sent: true };
    }),
});
