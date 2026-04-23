import { google, type Auth, type sheets_v4 } from "googleapis";
import { exchangeConnector, type SupportedExchangeId } from "../exchanges/exchangeConnector.ts";
import { redis } from "../_core/redis.ts";

type TradeSide = "매수" | "매도";

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

export class TradeJournal {
  private readonly sheets: sheets_v4.Sheets;
  private readonly spreadsheetId: string;
  private readonly sheetName = "매매일지";

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
          values: [["시간", "거래소", "심볼", "매수/매도", "가격", "수량", "금액", "수수료"]],
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
    const side: TradeSide = trade.side === "sell" ? "매도" : "매수";
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
    return firstCell === "시간" ? rows.slice(1) : rows;
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
      const side = String(row[3] ?? "");
      const amount = Number(row[5] ?? 0);
      const cost = Number(row[6] ?? 0);
      const fee = Number(row[7] ?? 0);
      if (!symbol || amount <= 0 || cost <= 0) continue;

      const current = inventory.get(symbol) ?? { amount: 0, cost: 0 };
      if (side === "매수") {
        inventory.set(symbol, {
          amount: current.amount + amount,
          cost: current.cost + cost + fee,
        });
        continue;
      }

      if (side === "매도" && current.amount > 0) {
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
