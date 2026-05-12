import { Telegraf } from "telegraf";
import { registerTelegramBot } from "../../telegram-service.ts";
import type LLMCaller from "../caller.ts";
import type { SessionManager } from "../session.ts";
import { setupCallbackRouter } from "./callbackRouter.ts";
import { setupCommands } from "./commands.ts";
import { setupMessageRouter } from "./messageRouter.ts";
import type { BotContext } from "./utils.ts";

export class TelegramBot {
  private bot: Telegraf<BotContext>;
  private sessionManager: SessionManager;
  private llmCaller: LLMCaller;

  constructor(botToken: string, sessionManager: SessionManager, llmCaller: LLMCaller) {
    this.bot = new Telegraf<BotContext>(botToken);
    this.sessionManager = sessionManager;
    this.llmCaller = llmCaller;

    this.setupMiddleware();
    setupCommands(this.bot, this.sessionManager);
    setupCallbackRouter(this.bot);
    setupMessageRouter(this.bot, this.sessionManager, this.llmCaller);
    registerTelegramBot(this.bot);
  }

  private setupMiddleware(): void {
    this.bot.use(async (ctx, next) => {
      if (ctx.from) {
        ctx.session = { userId: ctx.from.id.toString() };
      }
      return next();
    });
  }

  async start(): Promise<void> {
    const isDev = process.env.NODE_ENV !== "production";

    if (isDev) {
      console.log("🤖 Telegram bot starting in polling mode (development)");
      await this.bot.telegram.deleteWebhook({ drop_pending_updates: false });
      this.bot.launch();
      console.log("✅ Telegram bot polling started");
    } else {
      console.log("🤖 Telegram bot initialized in webhook mode (production)");
      console.log("✅ Telegram bot ready for webhook updates");
    }
  }

  async stop(): Promise<void> {
    await this.bot.stop();
    console.log("🛑 Telegram bot stopped");
  }

  getBot(): Telegraf<BotContext> {
    return this.bot;
  }
}

export default TelegramBot;
export type { BotContext } from "./utils.ts";
