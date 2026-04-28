import type { Express } from "express";

export function registerProxyRoutes(app: Express): void {
  app.get("/api/yahoo-chart", async (req, res) => {
    try {
      const symbol = req.query.symbol as string;
      const interval = (req.query.interval as string) || "1d";
      const range = (req.query.range as string) || "6mo";

      if (!symbol) {
        res.status(400).json({ error: "symbol is required" });
        return;
      }

      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;
      const response = await fetch(url);

      if (!response.ok) {
        res.status(response.status).json({ error: `Yahoo Finance returned ${response.status}` });
        return;
      }

      const data = await response.json();
      res.setHeader("Content-Type", "application/json");
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
    }
  });
}
