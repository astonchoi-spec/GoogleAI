/**
 * Telegram Bot with Multi-Model LLM Support
 * Commands: /engine, /model, /use, /status
 */

import { Telegraf, Context } from "telegraf";
import type { Update } from "telegraf/types";
import { SessionManager, sessionManager } from "./session.ts";
import LLMCaller from "./caller.ts";
import type { LLMEngine } from "./models.ts";
import { getModel, getModelsByEngine, getAllEngines, getDefaultModel } from "./models.ts";
import { getCommandArgs, normalizeEngineArg, normalizeModelArg } from "./telegram-command-utils.ts"; // MODIFIED: reuse normalized command parsing across Telegram command handlers.
import { getOrCreateConversation, getOrCreateTelegramConversation, getConversationByTelegramChatId, saveMessage } from "../db-chat.ts";
import { registerTelegramBot } from "../telegram-service.ts";
import { googleAuthManager } from "../routers/google-workspace.ts";
import { classifyIntent, formatIntentRouteMessage, routeIntentMessage } from "../intent/intentService.ts"; // MODIFIED: reuse shared formatter to keep Telegram output aligned with web intent responses.
import { handleApprovalCallback } from "../intent/handlers/approval.ts"; // MODIFIED: 1탭 승인 매매 callback_query 처리
import { llmAdapter } from "../_core/llmAdapter.ts"; // MODIFIED: use central LLM adapter for command parsing instead of hardcoded Gemini Flash.
import GmailConnector from "../google/gmail.ts";
import CalendarConnector from "../google/calendar.ts";
import DriveConnector from "../google/drive.ts";
import SheetsConnector from "../google/sheets.ts";

// Single-user setup: Telegram messages link to admin's web conversation
const ADMIN_USER_ID = 1;
const GOOGLE_USER_ID = "1";
const FALLBACK_GOOGLE_USER_ID = "anonymous";

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
    this.setupApprovalCallbacks();
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
      const args = getCommandArgs(messageText); // MODIFIED: handle repeated whitespace and missing tokens consistently.
      const engine = normalizeEngineArg(args[0]); // MODIFIED: accept case-insensitive engine arguments.

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
      const args = getCommandArgs(messageText); // MODIFIED: handle repeated whitespace and missing tokens consistently.
      const modelKey = normalizeModelArg(args[0]); // MODIFIED: accept case-insensitive model key arguments.

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
      const args = getCommandArgs(messageText); // MODIFIED: handle repeated whitespace and missing tokens consistently.
      const engine = normalizeEngineArg(args[0]); // MODIFIED: accept case-insensitive engine arguments.
      const modelKey = normalizeModelArg(args[1]); // MODIFIED: accept case-insensitive model key arguments.

      if (!engine || !modelKey) {
        return await ctx.reply(`사용법: /use <엔진> <모델키>\n예: /use gemini flash`); // MODIFIED: keep malformed /use guidance short and explicit.
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
   * Detect and execute Google Workspace commands using LLM intent parsing
   * chatId: Telegram chat ID for file sending
   */
  private async handleWorkspaceCommand(message: string, chatId: number): Promise<string | null> {
    console.log("[TG WORKSPACE] handleWorkspaceCommand:", message.slice(0, 80));
    const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    const intentPrompt = `You are a Google Workspace command parser. Analyze the user's message and return ONLY a valid JSON object.

Current date/time: ${now}
Timezone: Asia/Seoul

Supported actions:
- send_email: user wants to send an email
- get_emails: user wants to read/check emails
- create_event: user wants to create a calendar event
- list_drive: user wants to see/search Drive files
- send_drive_file: user wants to receive/send a specific Drive file via Telegram (extract file name)
- read_sheet: user wants to read a Google Sheet (needs spreadsheetId)
- none: not a Google Workspace command

Return format examples:
{"action":"send_email","to":"email@example.com","subject":"제목","body":"내용"}
{"action":"get_emails","query":"","maxResults":5}
{"action":"create_event","title":"미팅","startTime":"2026-04-23T14:00:00+09:00","endTime":"2026-04-23T15:00:00+09:00","description":"","isAllDay":false}
{"action":"list_drive","query":"trashed = false","maxResults":10}
{"action":"send_drive_file","fileName":"파일명.csv"}
{"action":"read_sheet","spreadsheetId":"<id>","range":"Sheet1!A1:Z50"}
{"action":"none"}

For date-only events with no explicit time, set isAllDay to true and set endTime to the next day at 00:00:00+09:00.

Return ONLY the JSON object, no other text.`;

    try {
      const intent = await llmAdapter.parseJson<any>(message, intentPrompt);
      console.log("[TG WORKSPACE] Detected intent:", intent?.action, "params:", JSON.stringify(intent).slice(0, 120));

      if (!intent || intent.action === "none") {
        console.log("[TG WORKSPACE] intent=none, skipping workspace handler");
        return null;
      }

      const googleUserId = await this.getConnectedGoogleUserId();
      console.log("[TG WORKSPACE] googleUserId:", googleUserId);
      if (!googleUserId) {
        return "❌ Google 계정이 연결되어 있지 않습니다. 웹 앱에서 먼저 Google 계정을 연결해주세요.";
      }

      const auth = await googleAuthManager.getAuthenticatedClient(googleUserId);

      if (intent.action === "send_email") {
        const gmail = new GmailConnector(auth);
        await gmail.sendEmail({ to: intent.to, subject: intent.subject, body: intent.body });
        return `✅ 이메일 전송 완료!\n📧 받는 사람: ${intent.to}\n📋 제목: ${intent.subject}`;
      }

      if (intent.action === "get_emails") {
        const gmail = new GmailConnector(auth);
        const emails = await gmail.getEmails(intent.maxResults || 5, intent.query || undefined);
        if (emails.length === 0) return "📭 메일이 없습니다.";
        const list = emails
          .map((e, i) => `${i + 1}. ${e.isRead ? "" : "🔵"} ${e.subject}\n   발신: ${e.from}`)
          .join("\n\n");
        return `📬 최근 이메일 ${emails.length}개:\n\n${list}`;
      }

      if (intent.action === "create_event") {
        const calendar = new CalendarConnector(auth);
        const startTime = new Date(intent.startTime);
        const endTime = new Date(intent.endTime);
        if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
          return "❌ 일정 날짜를 정확히 해석하지 못했습니다. 예: 캘린더에 2026년 5월 8일 예나 유나 상해여행 일정잡아";
        }

        const event = await calendar.createEvent({
          title: intent.title,
          startTime,
          endTime,
          description: intent.description || "",
          isAllDay: !!intent.isAllDay,
        });
        return [
          "✅ 캘린더 일정 생성 완료!",
          `📅 제목: ${intent.title}`,
          `⏰ 시작: ${intent.startTime}`,
          `🆔 이벤트 ID: ${event.id}`,
          event.htmlLink ? `🔗 확인: ${event.htmlLink}` : "",
        ].filter(Boolean).join("\n");
      }

      if (intent.action === "list_drive") {
        const drive = new DriveConnector(auth);
        const files = await drive.searchFiles(intent.query || "trashed = false", intent.maxResults || 10);
        if (files.length === 0) return "📁 Drive에 파일이 없습니다.";
        const list = files
          .map((f, i) => `${i + 1}. 📄 ${f.name}`)
          .join("\n");
        return `📁 Google Drive 파일 ${files.length}개:\n\n${list}`;
      }

      if (intent.action === "send_drive_file") {
        if (!intent.fileName) return "❌ 파일명을 인식하지 못했습니다.";
        const drive = new DriveConnector(auth);
        // Search for file by name
        const results = await drive.searchFiles(
          `name contains '${intent.fileName.replace(/'/g, "\\'")}' and trashed = false`,
          5
        );
        if (results.length === 0) return `❌ "${intent.fileName}" 파일을 Drive에서 찾을 수 없습니다.`;
        const file = results[0];
        // Download file
        const { buffer, fileName, exportMime } = await drive.downloadFile(file.id, file.mimeType);
        // Send to Telegram
        await this.bot.telegram.sendDocument(chatId, {
          source: buffer,
          filename: fileName,
        });
        return `✅ "${fileName}" 파일을 전송했습니다. (${(buffer.length / 1024).toFixed(1)}KB)`;
      }

      if (intent.action === "read_sheet") {
        if (!intent.spreadsheetId) return "❌ Spreadsheet ID가 필요합니다.";
        const sheets = new SheetsConnector(auth);
        const data = await sheets.readSheet(intent.spreadsheetId, intent.range || "Sheet1!A1:Z50");
        if (!data.data.length) return "📊 시트 데이터가 없습니다.";
        const header = data.headers.join(" | ");
        const rows = data.data.slice(0, 5).map(row => row.join(" | ")).join("\n");
        return `📊 ${data.sheetTitle} (상위 5행):\n\n${header}\n${"─".repeat(30)}\n${rows}`;
      }

      return null;
    } catch (error) {
      console.error("[TG WORKSPACE] Error:", error);
      // Return error message instead of null so it's visible (not swallowed by LLM fallback)
      if (error instanceof Error && (
        error.message.toLowerCase().includes("no tokens") ||
        error.message.toLowerCase().includes("authenticate first") ||
        error.message.toLowerCase().includes("failed to get authenticated")
      )) {
        return "Google 재인증이 필요합니다. 웹 앱에서 Google 계정을 다시 연결해주세요.";
      }
      return null;
    }
  }

  private async getConnectedGoogleUserId(): Promise<string | null> {
    // First: scan disk store for any userId that has valid tokens (covers web-login with any DB userId)
    const diskUserId = await sessionManager.getAnyAuthenticatedGoogleUserId();
    if (diskUserId) return diskUserId;

    // Fallback: check well-known fixed IDs
    for (const userId of [GOOGLE_USER_ID, FALLBACK_GOOGLE_USER_ID]) {
      if (await googleAuthManager.isAuthenticated(userId)) {
        return userId;
      }
    }

    return null;
  }

  /**
   * 승인 모드 callback_query 등록 — approve/reject/detail:<id>
   * 매매 신호 발송 후 회장님이 인라인 버튼을 누르면 여기로 들어온다.
   */
  private setupApprovalCallbacks(): void {
    this.bot.action(/^(approve|reject|detail):(.+)$/, async (ctx) => {
      const match = ctx.match as RegExpMatchArray;
      const kind = match[1] as "approve" | "reject" | "detail";
      const id = match[2];
      try {
        await handleApprovalCallback(ctx, kind, id);
      } catch (err) {
        console.error("[Telegram] approval callback error:", err);
        try {
          await ctx.answerCbQuery("처리 중 오류 발생", { show_alert: true });
        } catch {}
      }
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

        // 인텐트를 먼저 분류해서 google_ 계열만 Workspace 핸들러(Google 인증 체크 포함)로 라우팅
        // trading_* / analysis_* / chat 등은 Google 인증 없이 바로 routeIntentMessage로 처리
        const preIntent = await classifyIntent(userMessage);
        const isGoogleIntent = preIntent.action.startsWith("google_");

        const workspaceResult = isGoogleIntent
          ? await this.handleWorkspaceCommand(userMessage, ctx.chat?.id ?? 0)
          : null;
        if (workspaceResult !== null) {
          const sentMessage = await ctx.reply(workspaceResult, {
            reply_parameters: { message_id: ctx.message.message_id },
          });
          if (conversationId !== null) {
            try {
              await saveMessage(conversationId, "assistant", workspaceResult, "telegram", sentMessage.message_id);
            } catch {}
          }
          return;
        }

        const routingUserId = (await this.getConnectedGoogleUserId()) ?? ctx.session.userId;
        console.log("[TG INTENT] routeIntentMessage userId:", routingUserId, "msg:", userMessage.slice(0, 60));
        const routed = await routeIntentMessage({
          userId: routingUserId,
          message: userMessage,
          allowExecute: true, // Telegram: 직접 실행 (확인 없음)
        });
        console.log("[TG INTENT] result: domain=", routed.intent.domain, "action=", routed.intent.action, "handled=", routed.handled);
        if (routed.handled || (routed.requiresConfirmation && routed.response)) {
          const routedText = formatIntentRouteMessage(routed) || routed.response;
          console.log("[TG INTENT] returning result, length:", routedText.length);
          if (routedText && routed.intent.domain !== "chat") {
            const sentMessage = await ctx.reply(routedText, {
              reply_parameters: { message_id: ctx.message.message_id },
            });
            if (conversationId !== null) {
              try {
                await saveMessage(conversationId, "assistant", routedText, "telegram", sentMessage.message_id); // MODIFIED: persist routed assistant output in unified conversation history.
              } catch {}
            }
            return;
          }
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
        const systemPrompt = `당신은 구글 생태계와 텔레그램을 통합하는 AI 어시스턴트입니다. Gmail 전송, 캘린더 일정 생성, Drive 파일 조회 등 Google Workspace 기능을 실행할 수 있습니다. 사용자의 질문에 친절하고 정확하게 답변해주세요.

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
