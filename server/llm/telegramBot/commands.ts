import type { Telegraf } from "telegraf";
import type { SessionManager } from "../session.ts";
import { getAllEngines, getDefaultModel, getModel, getModelsByEngine } from "../models.ts";
import { getCommandArgs, normalizeEngineArg, normalizeModelArg } from "../telegram-command-utils.ts";
import type { BotContext } from "./utils.ts";

export function setupCommands(bot: Telegraf<BotContext>, sessionManager: SessionManager): void {
  bot.command("start", async (ctx) => {
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

  bot.command("engine", async (ctx) => {
    const messageText = (ctx.message as any)?.text as string | undefined;
    const args = getCommandArgs(messageText);
    const engine = normalizeEngineArg(args[0]);

    if (!engine) {
      const engines = getAllEngines();
      return await ctx.reply(`사용 가능한 엔진:\n${engines.map((e) => `• ${e}`).join("\n")}\n\n사용법: /engine <엔진이름>`);
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

    await sessionManager.switchEngine(ctx.session.userId, engine, firstModel.key);
    await ctx.reply(`✅ 엔진을 ${engine}로 전환했습니다.\n모델: ${firstModel.name}\n\n다른 모델로 전환하려면: /model <모델키>`);
  });

  bot.command("model", async (ctx) => {
    const messageText = (ctx.message as any)?.text as string | undefined;
    const args = getCommandArgs(messageText);
    const modelKey = normalizeModelArg(args[0]);

    if (!modelKey) {
      if (!ctx.session?.userId) {
        return await ctx.reply("❌ 세션 오류");
      }
      const session = await sessionManager.getSession(ctx.session.userId);
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

    const session = await sessionManager.getSession(ctx.session.userId);
    const model = getModel(session.engine, modelKey);
    if (!model) {
      return await ctx.reply(`❌ 모델을 찾을 수 없습니다: ${modelKey}`);
    }

    await sessionManager.switchEngine(ctx.session.userId, session.engine, modelKey);
    await ctx.reply(`✅ 모델을 ${model.name}로 전환했습니다.`);
  });

  bot.command("use", async (ctx) => {
    const messageText = (ctx.message as any)?.text as string | undefined;
    const args = getCommandArgs(messageText);
    const engine = normalizeEngineArg(args[0]);
    const modelKey = normalizeModelArg(args[1]);

    if (!engine || !modelKey) {
      return await ctx.reply("사용법: /use <엔진> <모델키>\n예: /use gemini flash");
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

    await sessionManager.switchEngine(ctx.session.userId, engine, modelKey);
    await ctx.reply(`✅ 설정을 변경했습니다.\n엔진: ${engine}\n모델: ${model.name}`);
  });

  bot.command("status", async (ctx) => {
    if (!ctx.session?.userId) {
      return await ctx.reply("❌ 세션 오류");
    }

    const session = await sessionManager.getSession(ctx.session.userId);
    const model = getModel(session.engine, session.modelKey);
    await ctx.reply(
      `📊 현재 설정:\n\n` +
        `엔진: ${session.engine}\n` +
        `모델: ${model?.name || "알 수 없음"}\n` +
        `대화 기록: ${session.conversationHistory.length}개 메시지\n` +
        `마지막 업데이트: ${new Date(session.lastUpdated).toLocaleString("ko-KR")}`
    );
  });

  bot.command("clear", async (ctx) => {
    if (!ctx.session?.userId) {
      return await ctx.reply("❌ 세션 오류");
    }

    await sessionManager.clearHistory(ctx.session.userId);
    await ctx.reply("✅ 대화 기록을 초기화했습니다.");
  });
}
