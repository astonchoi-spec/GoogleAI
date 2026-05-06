/**
 * Chat Sync Router
 * Handles unified message synchronization between web and Telegram
 */

import { router, protectedProcedure, publicProcedure } from "../_core/trpc.ts";
import { z } from "zod";
import {
  getOrCreateConversation,
  getConversationMessages,
  getConversationMessagesAsc,
  getRecentMessages,
  deleteMessage,
  clearConversationMessages,
  updateMessage,
  searchConversationMessages,
  saveMessage,
  getConversationByTelegramChatId,
  getConversationById,
  getPinnedConversations,
  updateConversationTitle,
  updateConversationPinned,
  mergeTelegramConversationIntoUser,
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
      const conversation = await getConversationById(input.conversationId);
      if (!conversation || conversation.userId !== ctx.user.id) {
        throw new Error("Conversation not found");
      }

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
    .query(async ({ input, ctx }) => {
      const conversation = await getConversationById(input.conversationId);
      if (!conversation || conversation.userId !== ctx.user.id) {
        throw new Error("Conversation not found");
      }

      const msgs = await getRecentMessages(input.conversationId, input.since);
      return msgs.map((msg) => ({
        ...msg,
        metadata: msg.metadata ? JSON.parse(msg.metadata) : null,
      }));
    }),

  /**
   * Search conversation messages by keyword/date/source
   */
  searchMessages: protectedProcedure // MODIFIED: add server-side message search with filters for unified chat UI.
    .input(
      z.object({
        conversationId: z.number(),
        query: z.string().max(500).optional(),
        source: z.enum(["all", "web", "telegram"]).default("all"),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        limit: z.number().min(1).max(200).default(100),
      })
    )
    .query(async ({ input, ctx }) => {
      const conversation = await getConversationById(input.conversationId);
      if (!conversation || conversation.userId !== ctx.user.id) {
        throw new Error("Conversation not found");
      }

      const msgs = await searchConversationMessages({
        conversationId: input.conversationId,
        query: input.query,
        source: input.source,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        limit: input.limit,
      });
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
   * Toggle conversation pin/favorite state
   */
  togglePinned: protectedProcedure // MODIFIED: let users mark the active conversation as a favorite.
    .input(
      z.object({
        conversationId: z.number(),
        pinned: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const conversation = await getConversationById(input.conversationId);
      if (!conversation || conversation.userId !== ctx.user.id) {
        throw new Error("Conversation not found");
      }

      await updateConversationPinned(input.conversationId, input.pinned);
      return { success: true, pinned: input.pinned };
    }),

  /**
   * List pinned conversations for the current user
   */
  getPinnedConversations: protectedProcedure.query(async ({ ctx }) => { // MODIFIED: expose favorites for future sidebar/history surfaces.
    return getPinnedConversations(ctx.user.id);
  }),

  /**
   * Export conversation as JSON with full message history
   */
  exportConversation: protectedProcedure // MODIFIED: expose structured conversation export for chat history download.
    .input(
      z.object({
        conversationId: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      const conversation = await getConversationById(input.conversationId);
      if (!conversation || conversation.userId !== ctx.user.id) {
        throw new Error("Conversation not found");
      }

      const messages = await getConversationMessagesAsc(input.conversationId);
      return {
        conversation: {
          ...conversation,
          createdAt: conversation.createdAt?.toISOString?.() ?? conversation.createdAt,
          updatedAt: conversation.updatedAt?.toISOString?.() ?? conversation.updatedAt,
        },
        messages: messages.map((msg) => ({
          ...msg,
          metadata: msg.metadata ? JSON.parse(msg.metadata) : null,
          createdAt: msg.createdAt?.toISOString?.() ?? msg.createdAt,
        })),
      };
    }),

  /**
   * Delete a single message from the current conversation
   */
  deleteMessage: protectedProcedure // MODIFIED: allow users to prune a message from the unified timeline.
    .input(
      z.object({
        conversationId: z.number(),
        messageId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const conversation = await getConversationById(input.conversationId);
      if (!conversation || conversation.userId !== ctx.user.id) {
        throw new Error("Conversation not found");
      }

      await deleteMessage(input.conversationId, input.messageId);
      return { success: true };
    }),

  /**
   * Clear all messages in the current conversation
   */
  clearConversation: protectedProcedure // MODIFIED: give the UI a durable chat reset action instead of only clearing local state.
    .input(
      z.object({
        conversationId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const conversation = await getConversationById(input.conversationId);
      if (!conversation || conversation.userId !== ctx.user.id) {
        throw new Error("Conversation not found");
      }

      await clearConversationMessages(input.conversationId);
      return { success: true };
    }),

  /**
   * Edit a single message in the current conversation
   */
  editMessage: protectedProcedure // MODIFIED: add message editing capability for the unified chat timeline.
    .input(
      z.object({
        conversationId: z.number(),
        messageId: z.number(),
        content: z.string().trim().min(1).max(10_000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const conversation = await getConversationById(input.conversationId);
      if (!conversation || conversation.userId !== ctx.user.id) {
        throw new Error("Conversation not found");
      }

      await updateMessage(input.conversationId, input.messageId, input.content);
      return { success: true };
    }),

  /**
   * Link a Telegram chat to the current user's conversation (manual merge)
   */
  linkTelegramChat: protectedProcedure
    .input(z.object({ telegramChatId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const ok = await mergeTelegramConversationIntoUser(input.telegramChatId, ctx.user.id);
      return { success: ok };
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
