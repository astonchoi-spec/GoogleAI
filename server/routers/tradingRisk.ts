import type { Express, Request, Response } from "express";
import { riskGuard, type OrderIntent } from "../trading/riskGuard.ts";
import type { AssetClass } from "../trading/riskStore.ts";

function bad(res: Response, msg: string, status = 400) {
  res.status(status).json({ error: msg });
}

function parseOrderIntent(body: unknown): OrderIntent | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.exchange !== "string" || typeof b.symbol !== "string" || typeof b.side !== "string") {
    return null;
  }
  return {
    exchange: b.exchange,
    symbol: b.symbol,
    side: b.side as OrderIntent["side"],
    asset: b.asset as AssetClass | undefined,
    quantity: typeof b.quantity === "number" ? b.quantity : undefined,
    price: typeof b.price === "number" ? b.price : undefined,
    leverage: typeof b.leverage === "number" ? b.leverage : undefined,
    notional: typeof b.notional === "number" ? b.notional : undefined,
    accountBalance: typeof b.accountBalance === "number" ? b.accountBalance : undefined,
    stopLossPrice: typeof b.stopLossPrice === "number" ? b.stopLossPrice : undefined,
    riskPercent: typeof b.riskPercent === "number" ? b.riskPercent : undefined,
  };
}

export function registerTradingRiskRoutes(app: Express): void {
  app.get("/api/trading/risk/status", async (_req: Request, res: Response) => {
    try {
      const status = await riskGuard.getStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "unknown_error" });
    }
  });

  app.post("/api/trading/risk/check", async (req: Request, res: Response) => {
    const intent = parseOrderIntent(req.body);
    if (!intent) {
      bad(res, "invalid order intent (exchange, symbol, side required)");
      return;
    }
    try {
      const result = await riskGuard.checkRisk(intent);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "unknown_error" });
    }
  });

  app.post("/api/trading/risk/lock", async (req: Request, res: Response) => {
    try {
      const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
      const state = await riskGuard.lock(reason);
      res.json(state);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "unknown_error" });
    }
  });

  app.post("/api/trading/risk/unlock", async (_req: Request, res: Response) => {
    try {
      const state = await riskGuard.unlock();
      res.json(state);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "unknown_error" });
    }
  });

  app.post("/api/trading/risk/settings", async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const partial: Record<string, unknown> = {};
      if (typeof body.dailyLossLimitPercent === "number") partial.dailyLossLimitPercent = body.dailyLossLimitPercent;
      if (typeof body.consecutiveLossWarn === "number") partial.consecutiveLossWarn = body.consecutiveLossWarn;
      if (typeof body.consecutiveLossBlock === "number") partial.consecutiveLossBlock = body.consecutiveLossBlock;
      if (typeof body.defaultRiskPercent === "number") partial.defaultRiskPercent = body.defaultRiskPercent;
      if (body.leverageCaps && typeof body.leverageCaps === "object") partial.leverageCaps = body.leverageCaps;
      const state = await riskGuard.updateSettings(partial);
      res.json(state);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "unknown_error" });
    }
  });

  app.post("/api/trading/risk/record-trade", async (req: Request, res: Response) => {
    try {
      const pnl = Number(req.body?.pnl);
      const isLoss = Boolean(req.body?.isLoss ?? pnl < 0);
      const balance = typeof req.body?.balance === "number" ? req.body.balance : undefined;
      if (!Number.isFinite(pnl)) {
        bad(res, "pnl must be a number");
        return;
      }
      const state = await riskGuard.recordTradeResult({ pnl, isLoss, balance });
      res.json(state);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "unknown_error" });
    }
  });
}
