import {
  riskStore as defaultRiskStore,
  type AssetClass,
  type RiskSettings,
  type RiskState,
  type RiskStore,
} from "./riskStore.ts";

export type OrderSide = "buy" | "sell" | "long" | "short";

export type OrderIntent = {
  exchange: string;
  symbol: string;
  side: OrderSide;
  asset?: AssetClass;
  quantity?: number;
  price?: number;
  leverage?: number;
  notional?: number;
  accountBalance?: number;
  stopLossPrice?: number;
  riskPercent?: number;
};

export type RiskDecision = "allow" | "warn" | "block";

export type RiskCheckResult = {
  decision: RiskDecision;
  reasons: string[];
  warnings: string[];
  positionSize?: number;
  recommendedQuantity?: number;
  metadata: {
    dailyPnlPercent: number;
    dailyLossLimitPercent: number;
    consecutiveLosses: number;
    leverage?: number;
    leverageCap?: number;
    manualLock: boolean;
    asset: AssetClass;
    eventBlock?: { active: boolean; reason?: string };
  };
};

export interface EventBlockProvider {
  isBlocked(now: Date): Promise<{ active: boolean; reason?: string }>;
}

export class NoopEventBlockProvider implements EventBlockProvider {
  async isBlocked(): Promise<{ active: boolean }> {
    return { active: false };
  }
}

function classifyAsset(intent: OrderIntent): AssetClass {
  if (intent.asset) return intent.asset;
  const exchange = intent.exchange.toLowerCase();
  if (["binance", "upbit", "bybit", "gate", "gateio"].includes(exchange)) {
    return intent.leverage && intent.leverage > 1 ? "futures" : "coin";
  }
  if (exchange.includes("kiwoom") || exchange.includes("kr")) return "kr-stock";
  if (exchange.includes("us")) return "us-stock";
  return "default";
}

function computePositionSize(intent: OrderIntent, settings: RiskSettings): number | undefined {
  if (intent.accountBalance && intent.stopLossPrice && intent.price) {
    const riskPercent = intent.riskPercent ?? settings.defaultRiskPercent;
    const lossDist = Math.abs(intent.price - intent.stopLossPrice);
    if (lossDist <= 0) return undefined;
    const riskAmount = intent.accountBalance * (riskPercent / 100);
    return riskAmount / lossDist;
  }
  return undefined;
}

export class RiskGuard {
  private readonly store: RiskStore;
  private readonly eventProvider: EventBlockProvider;

  constructor(
    store: RiskStore = defaultRiskStore,
    eventProvider: EventBlockProvider = new NoopEventBlockProvider()
  ) {
    this.store = store;
    this.eventProvider = eventProvider;
  }

  async getStatus(): Promise<RiskState & { dailyPnlPercent: number }> {
    const state = await this.store.getState();
    const dailyPnlPercent =
      state.daily.startingBalance > 0
        ? (state.daily.realizedPnl / state.daily.startingBalance) * 100
        : 0;
    return { ...state, dailyPnlPercent };
  }

  async checkRisk(intent: OrderIntent): Promise<RiskCheckResult> {
    const state = await this.store.getState();
    const settings = state.settings;
    const asset = classifyAsset(intent);
    const reasons: string[] = [];
    const warnings: string[] = [];

    const dailyPnlPercent =
      state.daily.startingBalance > 0
        ? (state.daily.realizedPnl / state.daily.startingBalance) * 100
        : 0;

    // 1. Manual lock
    if (state.manualLock.locked) {
      reasons.push(
        `수동 거래 잠금 상태입니다${state.manualLock.reason ? ` (${state.manualLock.reason})` : ""}.`
      );
    }

    // 2. Daily loss limit
    if (dailyPnlPercent <= -settings.dailyLossLimitPercent) {
      reasons.push(
        `오늘 누적 손실 ${dailyPnlPercent.toFixed(2)}%가 일일 한도 -${settings.dailyLossLimitPercent}%를 초과했습니다.`
      );
    }

    // 3. Consecutive loss block
    if (state.consecutiveLosses >= settings.consecutiveLossBlock) {
      reasons.push(
        `연속 손실 ${state.consecutiveLosses}회가 차단 임계치 ${settings.consecutiveLossBlock}회에 도달했습니다.`
      );
    }

    // 4. Leverage cap
    const leverageCap = settings.leverageCaps[asset] ?? settings.leverageCaps.default;
    if (intent.leverage && leverageCap && intent.leverage > leverageCap) {
      reasons.push(
        `자산군 ${asset}의 레버리지 상한 ${leverageCap}x를 초과했습니다 (요청 ${intent.leverage}x).`
      );
    }

    // 5. Event block
    const eventBlock = await this.eventProvider.isBlocked(new Date());
    if (eventBlock.active) {
      reasons.push(`이벤트 차단 활성: ${eventBlock.reason ?? "예정된 거래 금지 시간"}.`);
    }

    // 6. Consecutive loss warn
    if (
      state.consecutiveLosses >= settings.consecutiveLossWarn &&
      state.consecutiveLosses < settings.consecutiveLossBlock
    ) {
      warnings.push(
        `연속 손실 ${state.consecutiveLosses}회: 포지션 크기 축소 후 진행 권장합니다.`
      );
    }

    // Position size
    const positionSize = computePositionSize(intent, settings);
    let recommendedQuantity = positionSize;
    if (warnings.length > 0 && positionSize !== undefined) {
      recommendedQuantity = positionSize * 0.5;
    }

    let decision: RiskDecision = "allow";
    if (reasons.length > 0) decision = "block";
    else if (warnings.length > 0) decision = "warn";

    return {
      decision,
      reasons,
      warnings,
      positionSize,
      recommendedQuantity,
      metadata: {
        dailyPnlPercent,
        dailyLossLimitPercent: settings.dailyLossLimitPercent,
        consecutiveLosses: state.consecutiveLosses,
        leverage: intent.leverage,
        leverageCap,
        manualLock: state.manualLock.locked,
        asset,
        eventBlock,
      },
    };
  }

  async lock(reason?: string) {
    return this.store.setLock(true, reason);
  }

  async unlock() {
    return this.store.setLock(false);
  }

  async updateSettings(partial: Partial<RiskSettings>) {
    return this.store.updateSettings(partial);
  }

  async recordTradeResult(args: { pnl: number; isLoss: boolean; balance?: number }) {
    return this.store.recordTradeResult(args);
  }

  async resetDaily(balance?: number) {
    return this.store.resetDaily(balance);
  }
}

export const riskGuard = new RiskGuard();

export function formatRiskCheck(result: RiskCheckResult): string {
  const lines: string[] = [];
  const head =
    result.decision === "allow"
      ? "✅ 리스크 게이트 통과"
      : result.decision === "warn"
        ? "⚠️ 리스크 경고 — 텔레그램 승인 필요"
        : "🛑 리스크 차단";
  lines.push(head);
  if (result.reasons.length > 0) {
    lines.push("");
    lines.push("차단 사유:");
    result.reasons.forEach((r) => lines.push(`• ${r}`));
  }
  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("경고:");
    result.warnings.forEach((w) => lines.push(`• ${w}`));
  }
  lines.push("");
  lines.push(
    `오늘 손익: ${result.metadata.dailyPnlPercent.toFixed(2)}% (한도 -${result.metadata.dailyLossLimitPercent}%)`
  );
  lines.push(`연속 손실: ${result.metadata.consecutiveLosses}회`);
  if (result.metadata.leverage !== undefined) {
    lines.push(`레버리지: ${result.metadata.leverage}x (상한 ${result.metadata.leverageCap}x)`);
  }
  if (result.recommendedQuantity !== undefined) {
    lines.push(`권장 포지션: ${result.recommendedQuantity.toFixed(6)}`);
  }
  return lines.join("\n");
}

export type OrderExecutionResult =
  | { ok: true; orderId: string; intent: OrderIntent; risk: RiskCheckResult }
  | { ok: false; error: string; risk: RiskCheckResult };

export async function executeOrderWithGuard(
  intent: OrderIntent,
  executor: (intent: OrderIntent) => Promise<{ orderId: string }>,
  guard: RiskGuard = riskGuard
): Promise<OrderExecutionResult> {
  const risk = await guard.checkRisk(intent);
  if (risk.decision === "block") {
    return { ok: false, error: `risk_block: ${risk.reasons.join("; ")}`, risk };
  }
  if (risk.decision === "warn") {
    return { ok: false, error: `risk_warn_requires_approval: ${risk.warnings.join("; ")}`, risk };
  }
  const result = await executor(intent);
  return { ok: true, orderId: result.orderId, intent, risk };
}

export async function mockOrderExecutor(intent: OrderIntent): Promise<{ orderId: string }> {
  return { orderId: `mock-${Date.now()}-${intent.symbol}` };
}
