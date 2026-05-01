/**
 * 텔레그램 승인 모드 핸들러
 *
 * - trading_buy_signal / trading_sell_signal : 신호를 큐에 등록하고 텔레그램으로 인라인 키보드 발송
 * - trading_approval_list : 대기 중인 승인 항목 조회
 *
 * Telegram callback 처리는 telegram-bot.ts 의 bot.action() 에서 handleApprovalCallback 를 호출한다.
 */

import type { Context } from "telegraf";
import { approvalQueue, type ApprovalRequest, type ApprovalSide } from "../../trading/approvalQueue.ts";
import { orderExecutor } from "../../trading/orderExecutor.ts";
import { riskGuard } from "../../trading/riskGuard.ts";
import { getTelegramBot } from "../../telegram-service.ts";
import { writeWiki } from "../../wiki/wikiStore.ts";
import { asString, asNumber, type HandlerMap, type IntentHandler } from "../types.ts";

const MAX_ORDER_KRW = (() => {
  const env = Number(process.env.MAX_ORDER_KRW);
  return Number.isFinite(env) && env > 0 ? env : 500_000;
})();

const MAX_DAILY_AUTO_TRADES = (() => {
  const env = Number(process.env.MAX_DAILY_AUTO_TRADES);
  return Number.isFinite(env) && env > 0 ? env : 5;
})();

function fmtKrw(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("ko-KR") + "원";
}

function buildSignalMessage(req: ApprovalRequest): string {
  const sideEmoji = req.side === "bid" ? "🟢" : "🔴";
  const sideText = req.side === "bid" ? "매수" : "매도";
  const expireMin = Math.max(1, Math.round((req.expiresAt - req.createdAt) / 60_000));
  const lines = [
    `${sideEmoji} 매매 신호 — ${sideText}`,
    `━━━━━━━━━━━━`,
    `📊 종목: ${req.market}`,
  ];
  if (req.side === "bid" && req.amountKrw) {
    lines.push(`💰 금액: ${fmtKrw(req.amountKrw)} (시장가 매수)`);
  }
  if (req.side === "ask" && req.volume) {
    lines.push(`📦 수량: ${req.volume} (시장가 매도)`);
  }
  lines.push(`📝 사유: ${req.reason}`);
  lines.push(`⏱ 승인 만료: ${expireMin}분 내 응답 필요`);
  lines.push(`━━━━━━━━━━━━`);
  lines.push(`✅ 승인 시 즉시 Upbit 주문이 실행됩니다.`);
  return lines.join("\n");
}

function buildKeyboard(id: string) {
  return {
    inline_keyboard: [
      [
        { text: "✅ 승인", callback_data: `approve:${id}` },
        { text: "❌ 거부", callback_data: `reject:${id}` },
        { text: "📊 상세", callback_data: `detail:${id}` },
      ],
    ],
  };
}

async function dispatchSignalToTelegram(req: ApprovalRequest): Promise<{ chatId: number | null; messageId: number | null; warning?: string }> {
  const bot = getTelegramBot();
  if (!bot) {
    return { chatId: null, messageId: null, warning: "Telegram 봇이 초기화되지 않아 알림을 발송하지 못했습니다." };
  }
  const ownerChatId = Number(process.env.OWNER_TELEGRAM_CHAT_ID);
  if (!Number.isFinite(ownerChatId) || ownerChatId === 0) {
    return { chatId: null, messageId: null, warning: "OWNER_TELEGRAM_CHAT_ID 가 설정되지 않아 알림 대상이 없습니다." };
  }
  try {
    const sent = await bot.telegram.sendMessage(ownerChatId, buildSignalMessage(req), {
      reply_markup: buildKeyboard(req.id),
    });
    approvalQueue.setStatus(req.id, "pending", { messageId: sent.message_id });
    return { chatId: ownerChatId, messageId: sent.message_id };
  } catch (err) {
    console.error("[approval] sendMessage error:", err);
    return { chatId: ownerChatId, messageId: null, warning: `텔레그램 발송 실패: ${(err as Error).message}` };
  }
}

const tradingBuySignal: IntentHandler = async (intent) => {
  const market = normalizeMarket(asString(intent.params.market, "KRW-BTC"));
  const requested = asNumber(intent.params.amountKrw, 50_000);
  if (requested > MAX_ORDER_KRW) {
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: `🚫 단일 주문 한도(${fmtKrw(MAX_ORDER_KRW)})를 초과합니다. 요청: ${fmtKrw(requested)}`,
    };
  }
  const reason = asString(intent.params.reason, "수동 트리거 — 매수 시뮬");

  const req = approvalQueue.enqueue({
    market,
    side: "bid",
    amountKrw: requested,
    reason,
  });
  const dispatch = await dispatchSignalToTelegram(req);

  const response = dispatch.warning
    ? `📡 매수 신호 큐 등록 (id=${req.id.slice(0, 8)})\n⚠️ ${dispatch.warning}`
    : `📡 매수 신호 발송 — 텔레그램에서 승인 버튼을 눌러주세요.\n종목: ${market} / 금액: ${fmtKrw(requested)}`;

  return { intent, handled: true, requiresConfirmation: false, response };
};

const tradingSellSignal: IntentHandler = async (intent) => {
  const market = normalizeMarket(asString(intent.params.market, "KRW-BTC"));
  const volume = asNumber(intent.params.volume, 0.0001);
  if (!(volume > 0)) {
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: "🚫 매도 수량이 올바르지 않습니다.",
    };
  }
  const reason = asString(intent.params.reason, "수동 트리거 — 매도 시뮬");

  const req = approvalQueue.enqueue({
    market,
    side: "ask",
    volume,
    reason,
  });
  const dispatch = await dispatchSignalToTelegram(req);

  const response = dispatch.warning
    ? `📡 매도 신호 큐 등록 (id=${req.id.slice(0, 8)})\n⚠️ ${dispatch.warning}`
    : `📡 매도 신호 발송 — 텔레그램에서 승인 버튼을 눌러주세요.\n종목: ${market} / 수량: ${volume}`;

  return { intent, handled: true, requiresConfirmation: false, response };
};

const tradingApprovalList: IntentHandler = async (intent) => {
  approvalQueue.expireOld();
  const items = approvalQueue.list().slice(0, 10);
  if (items.length === 0) {
    return { intent, handled: true, requiresConfirmation: false, response: "📋 승인 큐가 비어있습니다." };
  }
  const lines = ["📋 승인 큐 (최근 10건)", "━━━━━━━━━━━━"];
  for (const r of items) {
    const sideText = r.side === "bid" ? "매수" : "매도";
    const detail = r.side === "bid" ? fmtKrw(r.amountKrw ?? 0) : `${r.volume} 코인`;
    lines.push(`• ${r.id.slice(0, 8)} ${r.market} ${sideText} ${detail} → ${r.status}`);
  }
  return { intent, handled: true, requiresConfirmation: false, response: lines.join("\n") };
};

export const approvalHandlers: HandlerMap = {
  trading_buy_signal: tradingBuySignal,
  trading_sell_signal: tradingSellSignal,
  trading_approval_list: tradingApprovalList,
};

// ---------------------------------------------------------------------------
// Telegram callback_query 처리 — telegram-bot.ts 에서 import
// ---------------------------------------------------------------------------

export type CallbackKind = "approve" | "reject" | "detail";

/**
 * 회장님 검증: callback_query 의 from.id 와 OWNER_TELEGRAM_CHAT_ID 를 비교.
 * 다른 사용자의 클릭은 무시한다.
 */
function isOwner(ctx: Context): boolean {
  const fromId = ctx.from?.id;
  const ownerId = Number(process.env.OWNER_TELEGRAM_CHAT_ID);
  if (!Number.isFinite(ownerId) || ownerId === 0) return false;
  return fromId === ownerId;
}

async function safeAnswer(ctx: Context, text: string, alert = false): Promise<void> {
  try {
    await ctx.answerCbQuery(text, { show_alert: alert });
  } catch (err) {
    console.warn("[approval] answerCbQuery failed:", (err as Error).message);
  }
}

async function safeEdit(ctx: Context, text: string): Promise<void> {
  try {
    await ctx.editMessageText(text);
  } catch (err) {
    // 메시지가 없거나 동일 텍스트로 편집 시 발생 가능 — 단순 경고
    console.warn("[approval] editMessageText failed:", (err as Error).message);
  }
}

export async function handleApprovalCallback(
  ctx: Context,
  kind: CallbackKind,
  id: string
): Promise<void> {
  if (!isOwner(ctx)) {
    await safeAnswer(ctx, "권한이 없습니다", true);
    return;
  }

  approvalQueue.expireOld();
  const req = approvalQueue.get(id);
  if (!req) {
    await safeAnswer(ctx, "요청을 찾을 수 없습니다", true);
    return;
  }

  if (kind === "detail") {
    await safeAnswer(ctx, "상세 정보 표시");
    const lines = [
      buildSignalMessage(req),
      "",
      `🆔 ${req.id}`,
      `상태: ${req.status}`,
      `생성: ${new Date(req.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
      `만료: ${new Date(req.expiresAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
    ];
    if (req.errorMessage) lines.push(`오류: ${req.errorMessage}`);
    if (req.result) {
      lines.push(`체결가: ${fmtKrw(req.result.avgPrice)}`);
      lines.push(`체결량: ${req.result.executedVolume ?? "—"}`);
    }
    await safeEdit(ctx, lines.join("\n"));
    return;
  }

  if (req.status !== "pending") {
    await safeAnswer(ctx, `이미 ${req.status} 상태입니다`, true);
    return;
  }

  if (kind === "reject") {
    approvalQueue.setStatus(id, "rejected");
    await safeAnswer(ctx, "거부됨");
    await safeEdit(ctx, `❌ 매매 신호 거부 — ${req.market} ${req.side === "bid" ? "매수" : "매도"}\n사유: ${req.reason}`);
    return;
  }

  // kind === "approve"
  await executeApprovedOrder(ctx, req);
}

async function executeApprovedOrder(ctx: Context, req: ApprovalRequest): Promise<void> {
  // 일일 한도 검사
  const todayCount = approvalQueue.countExecutedToday();
  if (todayCount >= MAX_DAILY_AUTO_TRADES) {
    await safeAnswer(ctx, "일일 자동 매매 한도 초과", true);
    approvalQueue.setStatus(req.id, "rejected", { errorMessage: "일일 자동 매매 한도 초과" });
    await safeEdit(
      ctx,
      `🚫 일일 자동 매매 한도(${MAX_DAILY_AUTO_TRADES}건)에 도달했습니다. 거절됨.`
    );
    return;
  }

  // Risk Guard 재검사
  try {
    const status = await riskGuard.getStatus();
    const blocked =
      status.manualLock.locked ||
      status.dailyPnlPercent <= -status.settings.dailyLossLimitPercent ||
      status.consecutiveLosses >= status.settings.consecutiveLossBlock;
    if (blocked) {
      const reason = status.manualLock.locked
        ? `수동 잠금 (${status.manualLock.reason ?? ""})`
        : "일일 손실 한도 또는 연속 손실 한도 도달";
      approvalQueue.setStatus(req.id, "rejected", { errorMessage: `Risk Guard 차단: ${reason}` });
      await safeAnswer(ctx, "Risk Guard 차단", true);
      await safeEdit(ctx, `🛡 Risk Guard 차단 — ${reason}\n주문이 실행되지 않았습니다.`);
      return;
    }
  } catch (err) {
    console.warn("[approval] risk guard check failed (proceeding):", (err as Error).message);
  }

  // 한도 재검사 (50만원)
  if (req.side === "bid" && (req.amountKrw ?? 0) > MAX_ORDER_KRW) {
    approvalQueue.setStatus(req.id, "rejected", { errorMessage: "단일 주문 한도 초과" });
    await safeAnswer(ctx, "주문 한도 초과", true);
    await safeEdit(ctx, `🚫 단일 주문 한도(${fmtKrw(MAX_ORDER_KRW)}) 초과로 거절되었습니다.`);
    return;
  }

  approvalQueue.setStatus(req.id, "approved");
  await safeAnswer(ctx, "주문 실행 중…");

  try {
    const result = req.side === "bid"
      ? await orderExecutor.placeMarketBuy({ market: req.market, amountKrw: req.amountKrw! })
      : await orderExecutor.placeMarketSell({ market: req.market, volume: req.volume! });

    approvalQueue.setStatus(req.id, "executed", {
      result: {
        uuid: result.uuid,
        avgPrice: result.avgPrice,
        executedVolume: result.executedVolume,
        paid: result.paid,
      },
    });

    const sideText = req.side === "bid" ? "매수" : "매도";
    const lines = [
      `✅ ${sideText} 체결 완료`,
      `━━━━━━━━━━━━`,
      `📊 ${req.market}`,
      `💵 평균가: ${fmtKrw(result.avgPrice)}`,
      `📦 체결량: ${result.executedVolume ?? "—"}`,
      `💰 체결액: ${fmtKrw(result.paid)}`,
      `🆔 주문 ID: ${result.uuid}`,
      `상태: ${result.state}`,
    ];
    await safeEdit(ctx, lines.join("\n"));

    // 위키 자동 저장 — 실패해도 체결은 완료된 상태이므로 무시
    try {
      const todayBody = `${sideText} ${req.market} — ${fmtKrw(result.paid)} (${result.executedVolume ?? "—"} @ ${fmtKrw(result.avgPrice)}). 사유: ${req.reason}. 주문 ID: ${result.uuid}.`;
      await writeWiki({
        title: `매매 ${sideText} ${req.market}`,
        body: todayBody,
        categories: ["trading"],
        source: "telegram-approval",
      });
    } catch (err) {
      console.warn("[approval] wiki save skipped:", (err as Error).message);
    }
  } catch (err) {
    const errMsg = (err as Error).message;
    approvalQueue.setStatus(req.id, "failed", { errorMessage: errMsg });
    await safeEdit(ctx, `🚫 주문 실패\n${errMsg}`);
  }
}

function normalizeMarket(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (upper.includes("-")) return upper;
  // 단순 심볼이면 KRW 마켓 가정
  return `KRW-${upper}`;
}
