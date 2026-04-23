/**
 * Chat Sync Router
 * Handles unified message synchronization between web and Telegram
 */

import { router, protectedProcedure, publicProcedure } from "../_core/trpc.ts";
import { z } from "zod";
import {
  getOrCreateConversation,
  getConversationMessages,
  getRecentMessages,
  saveMessage,
  getConversationByTelegramChatId,
  getConversationById,
  updateConversationTitle,
} from "../db-chat.ts";
import { forwardToTelegram } from "../telegram-service.ts";

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
      })
    )
    .query(async ({ input, ctx }) => {
      // Verify user owns this conversation
      // TODO: Add ownership check

      const msgs = await getConversationMessages(input.conversationId, input.limit);
      return msgs.map((msg) => ({
        ...msg,
        metadata: msg.metadata ? JSON.parse(msg.metadata) : null,
      }));
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
    .query(async ({ input }) => {
      const msgs = await getRecentMessages(input.conversationId, input.since);
      return msgs.map((msg) => ({
        ...msg,
        metadata: msg.metadata ? JSON.parse(msg.metadata) : null,
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
    .mutation(async ({ input }) => {
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
      // Get or create conversation linked to Telegram
      const conversation = await getOrCreateConversation(input.userId);

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
    .mutation(async ({ input }) => {
      await updateConversationTitle(input.conversationId, input.title);
      return { success: true };
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
   * Forward web messages to Telegram (양방향 sync: web → telegram)
   */
  forwardToTelegram: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        userMessage: z.string(),
        aiResponse: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const conversation = await getConversationById(input.conversationId);
      if (!conversation?.telegramChatId) {
        return { sent: false, reason: "Telegram chat not linked yet" };
      }
      await forwardToTelegram(conversation.telegramChatId, `👤 ${input.userMessage}`);
      await forwardToTelegram(conversation.telegramChatId, `🤖 ${input.aiResponse}`);
      return { sent: true };
    }),
});
