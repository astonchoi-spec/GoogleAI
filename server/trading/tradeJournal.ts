import { google, type Auth, type sheets_v4 } from "googleapis";
import { exchangeConnector, type SupportedExchangeId } from "../exchanges/exchangeConnector.ts";
import { kiwoomRestConnector, type KiwoomMarket } from "../exchanges/kiwoomRest.ts";
import { redis } from "../_core/redis.ts";
import { gateioConnector } from "../exchanges/gateioConnector.ts"; // MODIFIED: 1-D Gate.io trade sync
import { kiwoomConnector } from "../exchanges/kiwoomConnector.ts"; // MODIFIED: 1-D Kiwoom trade sync

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

// ─────────────────────────────────────────────────────────────────────────────
// MODIFIED: 1-D 자동 매매일지 — 한글 시트 기반 트레이드 저널 (Google Sheets)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TradeRecord  — 매매일지 시트의 한 행을 나타내는 데이터 구조.
 * id 는 거래소가 부여한 체결 ID. 존재하면 Redis 중복 방지에 사용된다.
 */
export interface TradeRecord {
  /** 거래소 체결 ID (중복 방지용, 선택) */
  id?: string;
  /** 날짜 YYYY-MM-DD */
  date: string;
  /** 시간 HH:MM:SS */
  time: string;
  /** 거래소 이름 */
  exchange: string;
  /** 종목 심볼 */
  symbol: string;
  /** 매수/매도 */
  side: "buy" | "sell";
  /** 수량 */
  qty: number;
  /** 가격 */
  price: number;
  /** 수수료 */
  fee: number;
  /** 손익 (선택) */
  pnl?: number;
  /** 메모 (선택) */
  memo?: string;
}

const JOURNAL_SHEET_NAME = "매매일지";
const JOURNAL_COLUMNS = ["날짜", "시간", "거래소", "종목", "매수/매도", "수량", "가격", "수수료", "손익", "메모"];
const JOURNAL_RANGE = `${JOURNAL_SHEET_NAME}!A:J`;
const JOURNAL_DEDUP_KEY = "journal-recorded-ids";

const CSV_HEADER_KEYWORDS = new Set(["날짜", "date"]);

/**
 * 한글 컬럼 기반 매매일지 서비스.
 * Google Sheets + Redis 중복 방지로 매매 내역을 영구 저장한다.
 */
export class TradeJournalKorean {
  private readonly sheets: sheets_v4.Sheets;
  private readonly spreadsheetId: string;

  constructor(auth: Auth.OAuth2Client, spreadsheetId: string) {
    this.sheets = google.sheets({ version: "v4", auth });
    this.spreadsheetId = spreadsheetId;
  }

  // ── public API ─────────────────────────────────────────────────────────────

  /**
   * 단일 TradeRecord를 매매일지 시트에 추가한다.
   * trade.id 가 있으면 Redis에서 중복 체크 후 skip.
   */
  async appendTrade(trade: TradeRecord): Promise<{ appended: number; skipped: number }> {
    if (trade.id) {
      const existing = await redis.hget(JOURNAL_DEDUP_KEY, trade.id);
      if (existing) {
        return { appended: 0, skipped: 1 };
      }
    }

    await this.ensureJournalSheet();
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: JOURNAL_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [this.tradeToRow(trade)] },
    });

    if (trade.id) {
      await redis.hset(JOURNAL_DEDUP_KEY, trade.id, "1");
    }

    return { appended: 1, skipped: 0 };
  }

  /**
   * 여러 TradeRecord를 한 번의 Sheets API 호출로 batch append.
   * id 가 있는 항목은 개별 중복 체크.
   */
  async appendTrades(trades: TradeRecord[]): Promise<{ appended: number; skipped: number }> {
    if (trades.length === 0) return { appended: 0, skipped: 0 };

    let skipped = 0;
    const rows: unknown[][] = [];
    const idsToRecord: string[] = [];

    for (const trade of trades) {
      if (trade.id) {
        const existing = await redis.hget(JOURNAL_DEDUP_KEY, trade.id);
        if (existing) {
          skipped++;
          continue;
        }
        idsToRecord.push(trade.id);
      }
      rows.push(this.tradeToRow(trade));
    }

    if (rows.length > 0) {
      await this.ensureJournalSheet();
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: JOURNAL_RANGE,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: rows },
      });

      // 중복 방지용 ID 일괄 기록
      for (const id of idsToRecord) {
        await redis.hset(JOURNAL_DEDUP_KEY, id, "1");
      }
    }

    return { appended: rows.length, skipped };
  }

  /**
   * 매매일지 시트에서 최근 기록을 읽어 반환한다 (헤더 행 제외).
   */
  async getTradeHistory(limit = 100): Promise<TradeRecord[]> {
    await this.ensureJournalSheet();
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: JOURNAL_RANGE,
    });

    const rows = res.data.values ?? [];
    const dataRows = this.stripJournalHeader(rows);
    return dataRows
      .map((row) => this.rowToTrade(row))
      .filter((r): r is TradeRecord => r !== null)
      .reverse()  // 최신 순 정렬
      .slice(0, Math.max(1, Math.min(1000, limit)));
  }

  /**
   * CSV 문자열을 파싱하여 batch append.
   * 첫 번째 행이 헤더(날짜, date 등)이면 자동 스킵.
   */
  async importCSV(csvString: string): Promise<{ imported: number; skipped: number }> {
    const lines = csvString.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { imported: 0, skipped: 0 };

    const parsed = lines.map(parseCsvLine);
    const firstField = (parsed[0]?.[0] ?? "").trim().toLowerCase();
    const dataRows = CSV_HEADER_KEYWORDS.has(firstField) ? parsed.slice(1) : parsed;

    if (dataRows.length === 0) return { imported: 0, skipped: 0 };

    const trades: TradeRecord[] = dataRows
      .map((row) => this.csvRowToTrade(row))
      .filter((t): t is TradeRecord => t !== null);

    // CSV 수동 임포트는 exchange ID 없으므로 중복 체크 없이 그대로 추가
    const result = await this.appendTrades(trades);
    return { imported: result.appended, skipped: result.skipped };
  }

  /**
   * Gate.io 체결 내역을 동기화한다.
   * Redis 중복 체크로 이미 기록된 ID는 skip.
   */
  async syncGateioTrades(symbol: string): Promise<{ synced: number; skipped: number }> {
    const rawTrades = await gateioConnector.getMyTrades(symbol, undefined, undefined);
    if (rawTrades.length === 0) return { synced: 0, skipped: 0 };

    const trades: TradeRecord[] = rawTrades.map((t) => {
      const dt = new Date(t.timestamp);
      return {
        id: `gate-${t.id}`,
        date: formatDate(dt),
        time: formatTime(dt),
        exchange: "gate",
        symbol: t.symbol,
        side: (t.side === "sell" ? "sell" : "buy") as "buy" | "sell",
        qty: t.amount,
        price: t.price,
        fee: t.fee?.cost ?? 0,
      };
    });

    const result = await this.appendTrades(trades);
    return { synced: result.appended, skipped: result.skipped };
  }

  /**
   * 키움증권 체결 내역을 동기화한다.
   * Redis 중복 체크로 이미 기록된 ID는 skip.
   */
  async syncKiwoomTrades(): Promise<{ synced: number; skipped: number }> {
    const executions = await kiwoomConnector.getExecutions();
    if (executions.length === 0) return { synced: 0, skipped: 0 };

    const trades: TradeRecord[] = executions.map((ex) => {
      return {
        id: `kiwoom-${ex.executionId}`,
        date: ex.executionDate,
        time: ex.executionTime,
        exchange: "kiwoom",
        symbol: ex.stockCode,
        side: ex.side,
        qty: ex.executedQuantity,
        price: ex.executedPrice,
        fee: 0, // 수수료는 별도 조회 필요
      };
    });

    const result = await this.appendTrades(trades);
    return { synced: result.appended, skipped: result.skipped };
  }

  // ── private helpers ────────────────────────────────────────────────────────

  private async ensureJournalSheet(): Promise<void> {
    const meta = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });
    const exists = (meta.data.sheets ?? []).some(
      (s) => s.properties?.title === JOURNAL_SHEET_NAME
    );

    if (!exists) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: JOURNAL_SHEET_NAME } } }],
        },
      });
    }

    const header = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${JOURNAL_SHEET_NAME}!A1:J1`,
    });

    if ((header.data.values ?? []).length === 0) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${JOURNAL_SHEET_NAME}!A1:J1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [JOURNAL_COLUMNS] },
      });
    }
  }

  private tradeToRow(trade: TradeRecord): unknown[] {
    return [
      trade.date,
      trade.time,
      trade.exchange,
      trade.symbol,
      trade.side,
      trade.qty,
      trade.price,
      trade.fee,
      trade.pnl ?? "",
      trade.memo ?? "",
    ];
  }

  private rowToTrade(row: unknown[]): TradeRecord | null {
    const date = String(row[0] ?? "").trim();
    const time = String(row[1] ?? "").trim();
    const exchange = String(row[2] ?? "").trim();
    const symbol = String(row[3] ?? "").trim();
    const sideRaw = String(row[4] ?? "").trim().toLowerCase();
    const side = sideRaw === "sell" ? "sell" : sideRaw === "buy" ? "buy" : null;
    const qty = Number(row[5] ?? 0);
    const price = Number(row[6] ?? 0);
    const fee = Number(row[7] ?? 0);
    const pnlRaw = row[8];
    const pnl = pnlRaw !== "" && pnlRaw !== null && pnlRaw !== undefined
      ? Number(pnlRaw) : undefined;
    const memo = String(row[9] ?? "").trim() || undefined;

    if (!date || !time || !exchange || !symbol || !side) return null;
    if (!Number.isFinite(qty) || !Number.isFinite(price) || !Number.isFinite(fee)) return null;

    return { date, time, exchange, symbol, side, qty, price, fee, pnl, memo };
  }

  private csvRowToTrade(cols: string[]): TradeRecord | null {
    // 컬럼 순서: 날짜, 시간, 거래소, 종목, 매수/매도, 수량, 가격, 수수료, 손익, 메모
    const date = (cols[0] ?? "").trim();
    const time = (cols[1] ?? "").trim();
    const exchange = (cols[2] ?? "").trim();
    const symbol = (cols[3] ?? "").trim();
    const sideRaw = (cols[4] ?? "").trim().toLowerCase();
    const side = sideRaw === "sell" ? "sell" : sideRaw === "buy" ? "buy" : null;
    const qty = Number(cols[5] ?? 0);
    const price = Number(cols[6] ?? 0);
    const fee = Number(cols[7] ?? 0);
    const pnlRaw = cols[8];
    const pnl = pnlRaw && pnlRaw.trim() ? Number(pnlRaw) : undefined;
    const memo = (cols[9] ?? "").trim() || undefined;

    if (!date || !time || !exchange || !symbol || !side) return null;
    if (!Number.isFinite(qty) || !Number.isFinite(price) || !Number.isFinite(fee)) return null;

    return { date, time, exchange, symbol, side, qty, price, fee, pnl, memo };
  }

  private stripJournalHeader(rows: unknown[][]): unknown[][] {
    if (rows.length === 0) return [];
    const firstCell = String(rows[0]?.[0] ?? "").trim().toLowerCase();
    return CSV_HEADER_KEYWORDS.has(firstCell) ? rows.slice(1) : rows;
  }
}

// ── private module utilities ───────────────────────────────────────────────

function formatDate(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTime(dt: Date): string {
  const h = String(dt.getHours()).padStart(2, "0");
  const min = String(dt.getMinutes()).padStart(2, "0");
  const s = String(dt.getSeconds()).padStart(2, "0");
  return `${h}:${min}:${s}`;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
