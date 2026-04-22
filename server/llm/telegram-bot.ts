/**
 * Telegram Bot with Multi-Model LLM Support
 * Commands: /engine, /model, /use, /status
 */

import { Telegraf, Context } from "telegraf";
import type { Update } from "telegraf/types";
import { SessionManager, sessionManager } from "./session";
import LLMCaller from "./caller";
import type { LLMEngine } from "./models";
import { getModel, getModelsByEngine, getAllEngines, getDefaultModel } from "./models";
import { getOrCreateConversation, getOrCreateTelegramConversation, getConversationByTelegramChatId, saveMessage } from "../db-chat";
import { registerTelegramBot } from "../telegram-service";

// Single-user setup: Telegram messages link to admin's web conversation
const ADMIN_USER_ID = 1;

export interface BotContext extends Context {
  session?: {
    userId: string;
  };
}

export class TelegramBot {
  private bot: Telegraf<BotContext>;
  private sessionManager: SessionManager;
  private llmCaller: LLMCaller;

  constructor(botToken: string, sessionManager: SessionManager, llmCaller: LLMCaller) {
    this.bot = new Telegraf<BotContext>(botToken);
    this.sessionManager = sessionManager;
    this.llmCaller = llmCaller;

    this.setupMiddleware();
    this.setupCommands();
    this.setupMessageHandler();
    registerTelegramBot(this.bot);
  }

  /**
   * Setup middleware for session management
   */
  private setupMiddleware(): void {
    this.bot.use(async (ctx, next) => {
      if (ctx.from) {
        ctx.session = { userId: ctx.from.id.toString() };
      }
      return next();
    });
  }

  /**
   * Setup bot commands
   */
  private setupCommands(): void {
    // /start - Welcome message
    this.bot.command("start", async (ctx) => {
      const defaultModel = getDefaultModel();
      await ctx.reply(
        `🤖 구글 생태계 + 텔레그램 양방향 통합 봇에 오신 것을 환영합니다!\n\n` +
          `현재 설정:\n` +
          `엔진: ${defaultModel.engine}\n` +
          `모델: ${defaultModel.name}\n\n` +
          `사용 가능한 명령어:\n` +
          `/engine <엔진> - 엔진 전환 (gemma4, gemini, codex, claude)\n` +
          `/model <모델키> - 현재 엔진의 모델 전환\n` +
          `/use <엔진> <모델키> - 한번에 엔진과 모델 전환\n` +
          `/status - 현재 설정 확인\n` +
          `/clear - 대화 기록 초기화\n\n` +
          `메시지를 입력하면 선택된 LLM이 응답합니다.`
      );
    });

    // /engine - Switch engine
    this.bot.command("engine", async (ctx) => {
      const messageText = (ctx.message as any)?.text as string | undefined;
      const args = messageText?.split(" ").slice(1);
      const engine = args?.[0] as LLMEngine | undefined;

      if (!engine) {
        const engines = getAllEngines();
        return await ctx.reply(
          `사용 가능한 엔진:\n${engines.map((e) => `• ${e}`).join("\n")}\n\n` +
            `사용법: /engine <엔진이름>`
        );
      }

      if (!getAllEngines().includes(engine)) {
        return await ctx.reply(`❌ 알 수 없는 엔진: ${engine}`);
      }

      if (!ctx.session?.userId) {
        return await ctx.reply("❌ 세션 오류");
      }

      const models = getModelsByEngine(engine);
      const firstModel = models[0];

      if (!firstModel) {
        return await ctx.reply(`❌ ${engine} 엔진에 사용 가능한 모델이 없습니다.`);
      }

      await this.sessionManager.switchEngine(ctx.session.userId, engine, firstModel.key);

      await ctx.reply(
        `✅ 엔진을 ${engine}로 전환했습니다.\n` +
          `모델: ${firstModel.name}\n\n` +
          `다른 모델로 전환하려면: /model <모델키>`
      );
    });

    // /model - Switch model within current engine
    this.bot.command("model", async (ctx) => {
      const messageText = (ctx.message as any)?.text as string | undefined;
      const args = messageText?.split(" ").slice(1);
      const modelKey = args?.[0];

      if (!modelKey) {
        if (!ctx.session?.userId) {
          return await ctx.reply("❌ 세션 오류");
        }

        const session = await this.sessionManager.getSession(ctx.session.userId);
        const models = getModelsByEngine(session.engine);

        return await ctx.reply(
          `현재 엔진: ${session.engine}\n\n` +
            `사용 가능한 모델:\n${models.map((m) => `• ${m.key} - ${m.name}`).join("\n")}\n\n` +
            `사용법: /model <모델키>`
        );
      }

      if (!ctx.session?.userId) {
        return await ctx.reply("❌ 세션 오류");
      }

      const session = await this.sessionManager.getSession(ctx.session.userId);
      const model = getModel(session.engine, modelKey);

      if (!model) {
        return await ctx.reply(`❌ 모델을 찾을 수 없습니다: ${modelKey}`);
      }

      await this.sessionManager.switchEngine(ctx.session.userId, session.engine, modelKey);

      await ctx.reply(`✅ 모델을 ${model.name}로 전환했습니다.`);
    });

    // /use - Switch engine and model at once
    this.bot.command("use", async (ctx) => {
      const messageText = (ctx.message as any)?.text as string | undefined;
      const args = messageText?.split(" ").slice(1);
      const engine = args?.[0] as LLMEngine | undefined;
      const modelKey = args?.[1];

      if (!engine || !modelKey) {
        return await ctx.reply(`사용법: /use <엔진> <모델키>\n예: /use gemini flash`);
      }

      if (!getAllEngines().includes(engine)) {
        return await ctx.reply(`❌ 알 수 없는 엔진: ${engine}`);
      }

      const model = getModel(engine, modelKey);
      if (!model) {
        return await ctx.reply(`❌ 모델을 찾을 수 없습니다: ${engine}:${modelKey}`);
      }

      if (!ctx.session?.userId) {
        return await ctx.reply("❌ 세션 오류");
      }

      await this.sessionManager.switchEngine(ctx.session.userId, engine, modelKey);

      await ctx.reply(`✅ 설정을 변경했습니다.\n엔진: ${engine}\n모델: ${model.name}`);
    });

    // /status - Show current settings
    this.bot.command("status", async (ctx) => {
      if (!ctx.session?.userId) {
        return await ctx.reply("❌ 세션 오류");
      }

      const session = await this.sessionManager.getSession(ctx.session.userId);
      const model = getModel(session.engine, session.modelKey);

      await ctx.reply(
        `📊 현재 설정:\n\n` +
          `엔진: ${session.engine}\n` +
          `모델: ${model?.name || "알 수 없음"}\n` +
          `대화 기록: ${session.conversationHistory.length}개 메시지\n` +
          `마지막 업데이트: ${new Date(session.lastUpdated).toLocaleString("ko-KR")}`
      );
    });

    // /clear - Clear conversation history
    this.bot.command("clear", async (ctx) => {
      if (!ctx.session?.userId) {
        return await ctx.reply("❌ 세션 오류");
      }

      await this.sessionManager.clearHistory(ctx.session.userId);
      await ctx.reply("✅ 대화 기록을 초기화했습니다.");
    });
  }

  /**
   * Setup message handler for LLM responses
   */
  private setupMessageHandler(): void {
    this.bot.on("message", async (ctx) => {
      if (!ctx.session?.userId) {
        return await ctx.reply("❌ 세션 오류");
      }

      const userMessage = (ctx.message as any)?.text as string | undefined;
      if (!userMessage) {
        return;
      }

      try {
        // Show typing indicator
        await ctx.sendChatAction("typing");

        // Try to persist conversation to DB; fall back silently if DB unavailable
        let conversationId: number | null = null;
        try {
          const telegramChatId = ctx.chat?.id;
          let conversation = telegramChatId
            ? await getConversationByTelegramChatId(telegramChatId)
            : null;
          if (!conversation) {
            conversation = await getOrCreateTelegramConversation(ADMIN_USER_ID, telegramChatId || 0);
          }
          conversationId = conversation.id;
          await saveMessage(conversationId, "user", userMessage, "telegram", ctx.message.message_id);
        } catch (dbErr) {
          console.warn("[Telegram] DB unavailable, skipping message persistence:", (dbErr as Error).message);
        }

        // Get user session
        const session = await this.sessionManager.getSession(ctx.session.userId);

        // Add user message to history
        await this.sessionManager.addMessage(ctx.session.userId, "user", userMessage);

        // Get conversation history
        const history = await this.sessionManager.getHistory(ctx.session.userId, 10);

        // Call LLM with enhanced system prompt
        const currentDate = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
        const currentModel = getModel(session.engine, session.modelKey);
        const systemPrompt = `당신은 구글 생태계와 텔레그램을 통합하는 AI 어시스턴트입니다. 사용자의 질문에 친절하고 정확하게 답변해주세요.

현재 날짜와 시간: ${currentDate}
현재 사용 중인 엔진: ${session.engine}, 모델: ${currentModel?.name || session.modelKey}`;

        const response = await this.llmCaller.call(
          session.engine,
          session.modelKey,
          history.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          systemPrompt
        );

        // Add assistant response to history
        await this.sessionManager.addMessage(ctx.session.userId, "assistant", response.content);

        // Send response to Telegram
        const sentMessage = await ctx.reply(response.content, {
          reply_parameters: { message_id: ctx.message.message_id },
        });

        // Persist AI response to DB if available
        if (conversationId !== null) {
          try {
            await saveMessage(conversationId, "assistant", response.content, "telegram", sentMessage.message_id);
          } catch (dbErr) {
            console.warn("[Telegram] DB unavailable, skipping response persistence:", (dbErr as Error).message);
          }
        }
      } catch (error) {
        console.error("Error processing message:", error);
        await ctx.reply(
          `❌ 오류가 발생했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}`
        );
      }
    });
  }

  /**
   * Start bot
   * - Development: polling mode (no public URL needed)
   * - Production: webhook mode (set via /api/webhooks/telegram/set-webhook)
   */
  async start(): Promise<void> {
    const isDev = process.env.NODE_ENV !== "production";

    if (isDev) {
      // Polling mode: bot pulls updates from Telegram API — works on localhost
      console.log("🤖 Telegram bot starting in polling mode (development)");
      // Delete any existing webhook so polling can take over
      await this.bot.telegram.deleteWebhook({ drop_pending_updates: false });
      this.bot.launch();
      console.log("✅ Telegram bot polling started");
    } else {
      // Webhook mode: Telegram pushes updates to our public HTTPS URL
      console.log("🤖 Telegram bot initialized in webhook mode (production)");
      console.log("✅ Telegram bot ready for webhook updates");
    }
  }

  /**
   * Stop bot
   */
  async stop(): Promise<void> {
    await this.bot.stop();
    console.log("🛑 Telegram bot stopped");
  }

  /**
   * Get bot instance
   */
  getBot(): Telegraf<BotContext> {
    return this.bot;
  }
}

export default TelegramBot;
