import { google, type Auth, type sheets_v4 } from "googleapis";
import { exchangeConnector, type SupportedExchangeId } from "../exchanges/exchangeConnector.ts";
import { kiwoomRestConnector, type KiwoomMarket } from "../exchanges/kiwoomRest.ts";
import { redis } from "../_core/redis.ts";

type TradeSide = "buy" | "sell";

type JournalTrade = {
  timestamp: number;
  exchange: string;
  symbol: string;
  side: TradeSide;
  price: number;
  amount: number;
  cost: number;
  fee: number;
};

export type TradeStatsPeriod = "week" | "month";

export type TradeStats = {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  averagePnlRatio: number;
};

export type ManualTradeInput = {
  date: string;
  market: string;
  symbol: string;
  side: TradeSide;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  fee?: number;
  note?: string;
};

export type ManualTradeRecord = {
  id: string;
  date: string;
  market: string;
  symbol: string;
  side: TradeSide;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  fee: number;
  note: string;
  createdAt: string;
};

export class TradeJournal {
  private readonly sheets: sheets_v4.Sheets;
  private readonly spreadsheetId: string;
  private readonly sheetName = "TradeJournal";
  private readonly manualSheetName = "ManualTrades";

  constructor(auth: Auth.OAuth2Client, spreadsheetId: string) {
    this.sheets = google.sheets({ version: "v4", auth });
    this.spreadsheetId = spreadsheetId;
  }

  async syncTrades(exchangeId: SupportedExchangeId, symbols: string[]): Promise<{ synced: number }> {
    if (symbols.length === 0) {
      return { synced: 0 };
    }

    const lastSyncKey = `journal:${exchangeId}:lastSync`;
    const lastSyncRaw = await redis.get(lastSyncKey);
    const since = this.parseSince(lastSyncRaw);
    const rows: unknown[][] = [];
    let newestTimestamp = since;

    for (const symbol of symbols) {
      const trades = await exchangeConnector.getMyTrades(exchangeId, symbol, since);
      for (const trade of trades) {
        const journalTrade = this.normalizeTrade(exchangeId, symbol, trade);
        rows.push(this.toSheetRow(journalTrade));
        newestTimestamp = Math.max(newestTimestamp, journalTrade.timestamp);
      }
    }

    if (rows.length > 0) {
      await this.ensureSheet();
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:H`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: rows,
        },
      });
      await redis.set(lastSyncKey, String(newestTimestamp));
    }

    return { synced: rows.length };
  }

  async syncKiwoomTrades(market: KiwoomMarket, symbols: string[]): Promise<{ synced: number }> {
    if (symbols.length === 0) {
      return { synced: 0 };
    }

    const lastSyncKey = `journal:kiwoom:${market}:lastSync`;
    const lastSyncRaw = await redis.get(lastSyncKey);
    const since = this.parseSince(lastSyncRaw);
    const rows: unknown[][] = [];
    let newestTimestamp = since;

    for (const symbol of symbols) {
      const trades = await kiwoomRestConnector.getMyTrades(market, symbol, since, 200);
      for (const trade of trades) {
        const journalTrade: JournalTrade = {
          timestamp: trade.timestamp,
          exchange: `kiwoom-${market}`,
          symbol: trade.symbol,
          side: trade.side,
          price: trade.price,
          amount: trade.amount,
          cost: trade.cost,
          fee: trade.fee,
        };
        rows.push(this.toSheetRow(journalTrade));
        newestTimestamp = Math.max(newestTimestamp, trade.timestamp);
      }
    }

    if (rows.length > 0) {
      await this.ensureSheet();
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:H`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: rows,
        },
      });
      await redis.set(lastSyncKey, String(newestTimestamp));
    }

    return { synced: rows.length };
  }

  async getTradeStats(period: TradeStatsPeriod): Promise<TradeStats> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!A:H`,
    });

    const rows = response.data.values ?? [];
    const dataRows = this.stripHeader(rows);
    const cutoff = this.getPeriodCutoff(period);
    const filtered = dataRows.filter((row) => {
      const timestamp = new Date(String(row[0])).getTime();
      return Number.isFinite(timestamp) && timestamp >= cutoff;
    });

    const pnls = this.estimatePnlByRoundTrip(filtered);
    const wins = pnls.filter((pnl) => pnl > 0).length;
    const losses = pnls.filter((pnl) => pnl < 0).length;
    const totalPnl = pnls.reduce((sum, pnl) => sum + pnl, 0);
    const grossProfit = pnls.filter((pnl) => pnl > 0).reduce((sum, pnl) => sum + pnl, 0);
    const grossLoss = Math.abs(pnls.filter((pnl) => pnl < 0).reduce((sum, pnl) => sum + pnl, 0));

    return {
      totalTrades: filtered.length,
      wins,
      losses,
      winRate: pnls.length === 0 ? 0 : wins / pnls.length,
      totalPnl,
      averagePnlRatio: grossLoss === 0 ? grossProfit : grossProfit / grossLoss,
    };
  }

  async addManualTrades(trades: ManualTradeInput[]): Promise<{ saved: number }> {
    if (trades.length === 0) {
      return { saved: 0 };
    }

    await this.ensureManualSheet();
    const createdAt = new Date().toISOString();
    const rows = trades.map((trade) => this.toManualSheetRow(trade, createdAt));

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${this.manualSheetName}!A:K`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: rows,
      },
    });

    return { saved: rows.length };
  }

  async getManualTrades(limit: number = 200): Promise<ManualTradeRecord[]> {
    await this.ensureManualSheet();
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.manualSheetName}!A:K`,
    });

    const rows = response.data.values ?? [];
    const dataRows = this.stripManualHeader(rows);
    return dataRows
      .map((row) => this.fromManualSheetRow(row))
      .filter((row): row is ManualTradeRecord => row !== null)
      .sort((a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt)))
      .slice(0, Math.max(1, Math.min(1000, limit)));
  }

  private async ensureSheet(): Promise<void> {
    const metadata = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });
    const exists = metadata.data.sheets?.some((sheet) => sheet.properties?.title === this.sheetName);
    if (!exists) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: this.sheetName } } }],
        },
      });
    }

    const header = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!A1:H1`,
    });
    if ((header.data.values ?? []).length === 0) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A1:H1`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [["timestamp", "exchange", "symbol", "side", "price", "amount", "cost", "fee"]],
        },
      });
    }
  }

  private async ensureManualSheet(): Promise<void> {
    const metadata = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });
    const exists = metadata.data.sheets?.some((sheet) => sheet.properties?.title === this.manualSheetName);
    if (!exists) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: this.manualSheetName } } }],
        },
      });
    }

    const header = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.manualSheetName}!A1:K1`,
    });
    if ((header.data.values ?? []).length === 0) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.manualSheetName}!A1:K1`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[
            "id",
            "date",
            "market",
            "symbol",
            "side",
            "quantity",
            "entryPrice",
            "exitPrice",
            "fee",
            "note",
            "createdAt",
          ]],
        },
      });
    }
  }

  private parseSince(lastSyncRaw: string | null): number {
    const fallback = Date.now() - 24 * 60 * 60 * 1000;
    if (!lastSyncRaw) return fallback;

    const parsed = Number(lastSyncRaw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private normalizeTrade(exchangeId: SupportedExchangeId, symbol: string, trade: any): JournalTrade {
    const timestamp = Number(trade.timestamp ?? new Date(trade.datetime ?? Date.now()).getTime());
    const side: TradeSide = trade.side === "sell" ? "sell" : "buy";
    const price = Number(trade.price ?? 0);
    const amount = Number(trade.amount ?? 0);
    const cost = Number(trade.cost ?? price * amount);
    const fee = Number(trade.fee?.cost ?? 0);

    return {
      timestamp,
      exchange: exchangeId,
      symbol: String(trade.symbol ?? symbol),
      side,
      price,
      amount,
      cost,
      fee,
    };
  }

  private toSheetRow(trade: JournalTrade): unknown[] {
    return [
      new Date(trade.timestamp).toISOString(),
      trade.exchange,
      trade.symbol,
      trade.side,
      trade.price,
      trade.amount,
      trade.cost,
      trade.fee,
    ];
  }

  private stripHeader(rows: unknown[][]): unknown[][] {
    if (rows.length === 0) return [];
    const firstCell = String(rows[0]?.[0] ?? "");
    return firstCell === "timestamp" ? rows.slice(1) : rows;
  }

  private stripManualHeader(rows: unknown[][]): unknown[][] {
    if (rows.length === 0) return [];
    const firstCell = String(rows[0]?.[0] ?? "");
    return firstCell === "id" ? rows.slice(1) : rows;
  }

  private toManualSheetRow(trade: ManualTradeInput, createdAt: string): unknown[] {
    const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return [
      id,
      trade.date,
      trade.market,
      trade.symbol,
      trade.side,
      trade.quantity,
      trade.entryPrice,
      trade.exitPrice,
      trade.fee ?? 0,
      trade.note ?? "",
      createdAt,
    ];
  }

  private fromManualSheetRow(row: unknown[]): ManualTradeRecord | null {
    const id = String(row[0] ?? "").trim();
    const date = String(row[1] ?? "").trim();
    const market = String(row[2] ?? "").trim();
    const symbol = String(row[3] ?? "").trim();
    const sideRaw = String(row[4] ?? "").trim().toLowerCase();
    const side = sideRaw === "sell" ? "sell" : sideRaw === "buy" ? "buy" : null;
    const quantity = Number(row[5] ?? 0);
    const entryPrice = Number(row[6] ?? 0);
    const exitPrice = Number(row[7] ?? 0);
    const fee = Number(row[8] ?? 0);
    const note = String(row[9] ?? "");
    const createdAt = String(row[10] ?? "");

    if (!id || !date || !market || !symbol || !side) return null;
    if (!Number.isFinite(quantity) || !Number.isFinite(entryPrice) || !Number.isFinite(exitPrice) || !Number.isFinite(fee)) {
      return null;
    }

    return {
      id,
      date,
      market,
      symbol,
      side,
      quantity,
      entryPrice,
      exitPrice,
      fee,
      note,
      createdAt: createdAt || new Date().toISOString(),
    };
  }

  private getPeriodCutoff(period: TradeStatsPeriod): number {
    const now = Date.now();
    return period === "week"
      ? now - 7 * 24 * 60 * 60 * 1000
      : now - 30 * 24 * 60 * 60 * 1000;
  }

  private estimatePnlByRoundTrip(rows: unknown[][]): number[] {
    const inventory = new Map<string, { amount: number; cost: number }>();
    const pnls: number[] = [];

    for (const row of rows) {
      const symbol = String(row[2] ?? "");
      const side = String(row[3] ?? "").toLowerCase();
      const amount = Number(row[5] ?? 0);
      const cost = Number(row[6] ?? 0);
      const fee = Number(row[7] ?? 0);
      if (!symbol || amount <= 0 || cost <= 0) continue;

      const current = inventory.get(symbol) ?? { amount: 0, cost: 0 };
      if (side === "buy") {
        inventory.set(symbol, {
          amount: current.amount + amount,
          cost: current.cost + cost + fee,
        });
        continue;
      }

      if (side === "sell" && current.amount > 0) {
        const averageCost = current.cost / current.amount;
        const closedCost = averageCost * amount;
        const pnl = cost - fee - closedCost;
        pnls.push(pnl);
        const remainingAmount = Math.max(current.amount - amount, 0);
        inventory.set(symbol, {
          amount: remainingAmount,
          cost: remainingAmount === 0 ? 0 : averageCost * remainingAmount,
        });
      }
    }

    return pnls;
  }
}
