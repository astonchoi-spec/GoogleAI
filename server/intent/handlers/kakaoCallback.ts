import type { Context } from "telegraf";
import type { DealCategory } from "../../deals/dealTypes.ts";
import { DEAL_CATEGORY_LABELS, DEAL_CATEGORIES } from "../../deals/dealTypes.ts";
import {
  buildCategoryButtons,
  clearPendingKakaoFile,
  getPendingKakaoFile,
  savePendingKakaoFile,
} from "../../deals/kakaoFileHandler.ts";

function isOwner(ctx: Context): boolean {
  const ownerId = Number(process.env.OWNER_TELEGRAM_CHAT_ID);
  if (!Number.isFinite(ownerId) || ownerId === 0) return false;
  return ctx.chat?.id === ownerId || ctx.from?.id === ownerId;
}

async function safeAnswer(ctx: Context, text: string, alert = false): Promise<void> {
  try {
    await ctx.answerCbQuery(text, { show_alert: alert });
  } catch (err) {
    console.warn("[kakao-callback] answerCbQuery failed:", (err as Error).message);
  }
}

async function safeEdit(ctx: Context, text: string, replyMarkup?: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> }): Promise<void> {
  try {
    await ctx.editMessageText(text, replyMarkup ? { reply_markup: replyMarkup } : undefined);
  } catch (err) {
    console.warn("[kakao-callback] editMessageText failed:", (err as Error).message);
  }
}

function parseCategory(value: string | undefined): DealCategory | null {
  if (!value) return null;
  return (DEAL_CATEGORIES as string[]).includes(value) ? value as DealCategory : null;
}

export async function handleKakaoCallback(ctx: Context): Promise<void> {
  if (!isOwner(ctx)) {
    await safeAnswer(ctx, "권한이 없습니다", true);
    return;
  }

  const data = (ctx.callbackQuery as any)?.data as string | undefined;
  const parts = data?.split(":") ?? [];
  if (parts[0] !== "kakao" || !parts[1]) {
    await safeAnswer(ctx, "잘못된 요청입니다", true);
    return;
  }

  const tempId = parts[1];
  const action = parts[2];

  if (action === "ignore") {
    clearPendingKakaoFile(tempId);
    await safeAnswer(ctx, "무시했습니다");
    await safeEdit(ctx, "🗑 카톡 파일 분류를 무시했습니다.");
    return;
  }

  if (action === "other") {
    clearPendingKakaoFile(tempId);
    await safeAnswer(ctx, "기타로 보류");
    await safeEdit(ctx, "📥 카톡 파일을 기타로 보류했습니다.\n필요하면 딜 추가 후 다시 분류해주세요.");
    return;
  }

  const pending = getPendingKakaoFile(tempId);
  if (!pending) {
    await safeAnswer(ctx, "대기 시간이 만료되었습니다", true);
    await safeEdit(ctx, "⌛ 카톡 파일 분류 대기 시간이 만료되었습니다.");
    return;
  }

  if (action === "d") {
    const dealIndex = Number(parts[3]);
    const deal = pending.candidates[dealIndex];
    if (!Number.isInteger(dealIndex) || !deal) {
      await safeAnswer(ctx, "딜을 찾지 못했습니다", true);
      return;
    }
    await safeAnswer(ctx, "카테고리를 선택해주세요");
    await safeEdit(
      ctx,
      [
        "📥 카톡 신규 파일",
        `📄 ${pending.fileName}`,
        `📁 ${deal.name}`,
        "📂 어떤 카테고리로 저장할까요?",
      ].join("\n"),
      buildCategoryButtons(tempId, dealIndex)
    );
    return;
  }

  if (action === "c") {
    const dealIndex = Number(parts[3]);
    const category = parseCategory(parts[4]);
    if (!Number.isInteger(dealIndex) || !category) {
      await safeAnswer(ctx, "카테고리를 찾지 못했습니다", true);
      return;
    }
    await safeAnswer(ctx, `${DEAL_CATEGORY_LABELS[category]}로 저장 중`);
    try {
      const saved = await savePendingKakaoFile(tempId, dealIndex, category);
      await safeEdit(ctx, saved.text);
    } catch (err) {
      console.error("[kakao-callback] save:", err);
      await safeEdit(ctx, "⚠️ 카톡 자료 저장 중 오류가 발생했습니다.");
    }
    return;
  }

  await safeAnswer(ctx, "알 수 없는 요청입니다", true);
}
