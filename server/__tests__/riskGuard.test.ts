import { describe, it, expect, beforeEach } from "vitest";
import { RiskGuard, type OrderIntent, executeOrderWithGuard, mockOrderExecutor } from "../trading/riskGuard.ts";
import { MemoryRiskStore, DEFAULT_RISK_SETTINGS } from "../trading/riskStore.ts";

function makeGuard(): { guard: RiskGuard; store: MemoryRiskStore } {
  const store = new MemoryRiskStore();
  return { guard: new RiskGuard(store), store };
}

const baseIntent: OrderIntent = {
  exchange: "binance",
  symbol: "BTC/USDT",
  side: "long",
  asset: "coin",
  price: 65000,
  stopLossPrice: 63000,
  accountBalance: 10000,
  leverage: 3,
};

describe("RiskGuard.checkRisk", () => {
  let guard: RiskGuard;
  let store: MemoryRiskStore;

  beforeEach(() => {
    ({ guard, store } = makeGuard());
  });

  it("allows a normal order", async () => {
    const result = await guard.checkRisk(baseIntent);
    expect(result.decision).toBe("allow");
    expect(result.reasons).toHaveLength(0);
    expect(result.positionSize).toBeGreaterThan(0);
  });

  it("blocks when daily loss limit is exceeded", async () => {
    await store.resetDaily(10000);
    await store.recordTradeResult({ pnl: -400, isLoss: true, balance: 10000 });
    const result = await guard.checkRisk(baseIntent);
    expect(result.decision).toBe("block");
    expect(result.reasons.join(" ")).toMatch(/일일 한도/);
  });

  it("warns and reduces size on 2 consecutive losses", async () => {
    await store.resetDaily(10000);
    await store.recordTradeResult({ pnl: -50, isLoss: true, balance: 10000 });
    await store.recordTradeResult({ pnl: -50, isLoss: true });
    const result = await guard.checkRisk(baseIntent);
    expect(result.decision).toBe("warn");
    expect(result.warnings.join(" ")).toMatch(/연속 손실/);
    if (result.positionSize !== undefined && result.recommendedQuantity !== undefined) {
      expect(result.recommendedQuantity).toBeLessThan(result.positionSize);
    }
  });

  it("blocks on 3 consecutive losses", async () => {
    await store.resetDaily(10000);
    await store.recordTradeResult({ pnl: -50, isLoss: true, balance: 10000 });
    await store.recordTradeResult({ pnl: -50, isLoss: true });
    await store.recordTradeResult({ pnl: -50, isLoss: true });
    const result = await guard.checkRisk(baseIntent);
    expect(result.decision).toBe("block");
    expect(result.reasons.join(" ")).toMatch(/연속 손실/);
  });

  it("blocks when leverage exceeds asset cap", async () => {
    const result = await guard.checkRisk({ ...baseIntent, leverage: 100 });
    expect(result.decision).toBe("block");
    expect(result.reasons.join(" ")).toMatch(/레버리지/);
  });

  it("blocks when manual lock is active", async () => {
    await guard.lock("점심시간");
    const result = await guard.checkRisk(baseIntent);
    expect(result.decision).toBe("block");
    expect(result.reasons.join(" ")).toMatch(/수동 거래 잠금/);
    await guard.unlock();
    const after = await guard.checkRisk(baseIntent);
    expect(after.decision).toBe("allow");
  });

  it("returns leverage cap from default settings", async () => {
    const result = await guard.checkRisk(baseIntent);
    expect(result.metadata.leverageCap).toBe(DEFAULT_RISK_SETTINGS.leverageCaps.coin);
  });

  it("blocks when event provider says blocked", async () => {
    const blockingGuard = new RiskGuard(store, {
      isBlocked: async () => ({ active: true, reason: "FOMC 발표" }),
    });
    const result = await blockingGuard.checkRisk(baseIntent);
    expect(result.decision).toBe("block");
    expect(result.reasons.join(" ")).toMatch(/이벤트 차단/);
  });
});

describe("executeOrderWithGuard", () => {
  it("allows order when risk is allow", async () => {
    const { guard } = makeGuard();
    const result = await executeOrderWithGuard(baseIntent, mockOrderExecutor, guard);
    expect(result.ok).toBe(true);
  });

  it("blocks order when manual lock is active", async () => {
    const { guard } = makeGuard();
    await guard.lock("test");
    const result = await executeOrderWithGuard(baseIntent, mockOrderExecutor, guard);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/risk_block/);
  });

  it("requires approval when warn", async () => {
    const { guard, store } = makeGuard();
    await store.resetDaily(10000);
    await store.recordTradeResult({ pnl: -10, isLoss: true, balance: 10000 });
    await store.recordTradeResult({ pnl: -10, isLoss: true });
    const result = await executeOrderWithGuard(baseIntent, mockOrderExecutor, guard);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/risk_warn_requires_approval/);
  });
});
