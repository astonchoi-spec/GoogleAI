import { Telegraf } from "telegraf";

let _bot: Telegraf | null = null;

export function registerTelegramBot(bot: Telegraf): void {
  _bot = bot;
}

export function getTelegramBot(): Telegraf | null {
  return _bot;
}

export async function forwardToTelegram(chatId: number, text: string): Promise<boolean> {
  if (!_bot || !chatId) return false;
  try {
    await _bot.telegram.sendMessage(chatId, text);
    return true;
  } catch (err) {
    console.warn("[TelegramService] Failed to forward message:", (err as Error).message);
    return false;
  }
}
