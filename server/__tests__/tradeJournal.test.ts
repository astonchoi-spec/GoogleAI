/**
 * TradeJournalKorean 테스트
 * Google Sheets API, Redis, gateioConnector, kiwoomConnector 모두 모킹한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── vi.hoisted: vi.mock 보다 먼저 실행되는 mock 생성 ──────────────────────────
const {
  mockAppend,
  mockGetValues,
  mockGetSpreadsheets,
  mockBatchUpdate,
  mockUpdateValues,
  mockHget,
  mockHset,
  mockGetMyTrades,
  mockGetExecutions,
} = vi.hoisted(() => ({
  mockAppend: vi.fn().mockResolvedValue({ data: { updates: { updatedRows: 1 } } }),
  mockGetValues: vi.fn().mockResolvedValue({
    data: {
      values: [
        ["날짜", "시간", "거래소", "종목", "매수/매도", "수량", "가격", "수수료", "손익", "메모"],
        ["2024-01-01", "09:00:00", "gate", "BTC/USDT", "buy", "0.1", "65000", "6.5", "", ""],
      ],
    },
  }),
  mockGetSpreadsheets: vi.fn().mockResolvedValue({
    data: { sheets: [{ properties: { title: "매매일지" } }] },
  }),
  mockBatchUpdate: vi.fn().mockResolvedValue({}),
  mockUpdateValues: vi.fn().mockResolvedValue({}),
  mockHget: vi.fn().mockResolvedValue(null),       // 기본: 미기록
  mockHset: vi.fn().mockResolvedValue(1),
  mockGetMyTrades: vi.fn().mockResolvedValue([]),
  mockGetExecutions: vi.fn().mockResolvedValue([]),
}));

// ── Mock googleapis ────────────────────────────────────────────────────────
vi.mock("googleapis", () => ({
  google: {
    sheets: vi.fn().mockReturnValue({
      spreadsheets: {
        get: mockGetSpreadsheets,
        batchUpdate: mockBatchUpdate,
        values: {
          append: mockAppend,
          get: mockGetValues,
          update: mockUpdateValues,
        },
      },
    }),
  },
}));

// ── Mock Redis ─────────────────────────────────────────────────────────────
vi.mock("../_core/redis.ts", () => ({
  redis: {
    hget: (...args: unknown[]) => mockHget(...args),
    hset: (...args: unknown[]) => mockHset(...args),
  },
}));

// ── Mock gateioConnector ───────────────────────────────────────────────────
vi.mock("../exchanges/gateioConnector.ts", () => ({
  gateioConnector: {
    getMyTrades: (...args: unknown[]) => mockGetMyTrades(...args),
  },
}));

// ── Mock kiwoomConnector ───────────────────────────────────────────────────
vi.mock("../exchanges/kiwoomConnector.ts", () => ({
  kiwoomConnector: {
    getExecutions: (...args: unknown[]) => mockGetExecutions(...args),
  },
}));

// ── Mock kiwoomRest (transitively imported by tradeJournal) ───────────────
vi.mock("../exchanges/kiwoomRest.ts", () => ({
  kiwoomRestConnector: { getMyTrades: vi.fn().mockResolvedValue([]) },
}));

// ── Mock exchangeConnector ────────────────────────────────────────────────
vi.mock("../exchanges/exchangeConnector.ts", () => ({
  exchangeConnector: {
    getMyTrades: vi.fn().mockResolvedValue([]),
  },
}));

// Import AFTER mocks are registered
import { TradeJournalKorean, type TradeRecord } from "../trading/tradeJournal.ts";

// ── shared fixtures ────────────────────────────────────────────────────────

const MOCK_SPREADSHEET_ID = "test-sheet-id-123";

const baseTrade: TradeRecord = {
  date: "2024-01-15",
  time: "10:30:00",
  exchange: "gate",
  symbol: "BTC/USDT",
  side: "buy",
  qty: 0.1,
  price: 65000,
  fee: 6.5,
  memo: "테스트 매매",
};

// ── tests ──────────────────────────────────────────────────────────────────

describe("TradeJournalKorean", () => {
  let journal: TradeJournalKorean;

  beforeEach(() => {
    vi.clearAllMocks();

    // 기본: 시트는 이미 존재, 헤더도 있음
    mockGetSpreadsheets.mockResolvedValue({
      data: { sheets: [{ properties: { title: "매매일지" } }] },
    });
    mockGetValues.mockResolvedValue({
      data: {
        values: [["날짜", "시간", "거래소", "종목", "매수/매도", "수량", "가격", "수수료", "손익", "메모"]],
      },
    });
    mockHget.mockResolvedValue(null); // 기본: 미기록
    mockGetMyTrades.mockResolvedValue([]);

    journal = new TradeJournalKorean({} as never, MOCK_SPREADSHEET_ID);
  });

  // ── test a: appendTrade → Sheets append 호출 확인 ─────────────────────────
  it("a) appendTrade()가 Sheets append를 올바른 row 데이터로 호출한다", async () => {
    const result = await journal.appendTrade(baseTrade);

    expect(result.appended).toBe(1);
    expect(result.skipped).toBe(0);
    expect(mockAppend).toHaveBeenCalledOnce();

    const callArg = mockAppend.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.spreadsheetId).toBe(MOCK_SPREADSHEET_ID);
    expect(callArg.range).toContain("매매일지");

    const rows = (callArg.requestBody as { values: unknown[][] }).values;
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row[0]).toBe("2024-01-15");    // 날짜
    expect(row[1]).toBe("10:30:00");      // 시간
    expect(row[2]).toBe("gate");          // 거래소
    expect(row[3]).toBe("BTC/USDT");      // 종목
    expect(row[4]).toBe("buy");           // 매수/매도
    expect(row[5]).toBe(0.1);             // 수량
    expect(row[6]).toBe(65000);           // 가격
    expect(row[7]).toBe(6.5);             // 수수료
    expect(row[9]).toBe("테스트 매매");   // 메모
  });

  // ── test b: 중복 ID skip ────────────────────────────────────────────────
  it("b) 중복 거래 ID로 appendTrade() 시 Sheets append를 호출하지 않는다", async () => {
    // Redis에 이미 기록된 상태
    mockHget.mockResolvedValue("1");

    const tradeWithId: TradeRecord = { ...baseTrade, id: "gate-dup-9999" };
    const result = await journal.appendTrade(tradeWithId);

    expect(result.appended).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockAppend).not.toHaveBeenCalled();
    expect(mockHset).not.toHaveBeenCalled();
  });

  // ── test c: importCSV 3행 append ──────────────────────────────────────
  it("c) importCSV()가 CSV 3줄을 파싱하여 3행 append한다", async () => {
    const csv = [
      "날짜,시간,거래소,종목,매수/매도,수량,가격,수수료,손익,메모",
      "2024-01-01,09:00:00,gate,BTC/USDT,buy,0.1,65000,6.5,,첫번째",
      "2024-01-02,10:00:00,gate,ETH/USDT,sell,1.0,3000,3.0,50,두번째",
      "2024-01-03,11:00:00,kiwoom,005930,buy,10,75000,0,,삼성전자",
    ].join("\n");

    const result = await journal.importCSV(csv);

    expect(result.imported).toBe(3);
    expect(result.skipped).toBe(0);
    expect(mockAppend).toHaveBeenCalledOnce();

    const callArg = mockAppend.mock.calls[0][0] as Record<string, unknown>;
    const rows = (callArg.requestBody as { values: unknown[][] }).values;
    expect(rows).toHaveLength(3);
    expect(rows[0][0]).toBe("2024-01-01");
    expect(rows[1][0]).toBe("2024-01-02");
    expect(rows[2][0]).toBe("2024-01-03");
  });

  // ── test d: syncGateioTrades → 신규 건만 append ──────────────────────
  it("d) syncGateioTrades()가 gateioConnector.getMyTrades를 호출하고 신규 건만 append한다", async () => {
    const now = Date.now();

    // 2개 체결 반환
    mockGetMyTrades.mockResolvedValue([
      {
        id: "trade-already-recorded",
        timestamp: now - 10000,
        symbol: "BTC/USDT",
        side: "buy",
        price: 64000,
        amount: 0.05,
        cost: 3200,
        fee: { currency: "USDT", cost: 3.2 },
      },
      {
        id: "trade-new",
        timestamp: now - 5000,
        symbol: "BTC/USDT",
        side: "sell",
        price: 65000,
        amount: 0.05,
        cost: 3250,
        fee: { currency: "USDT", cost: 3.25 },
      },
    ]);

    // 첫 번째 trade ID는 이미 기록됨, 두 번째는 신규
    mockHget
      .mockResolvedValueOnce("1")   // gate-trade-already-recorded → 스킵
      .mockResolvedValueOnce(null); // gate-trade-new → 새로 추가

    const result = await journal.syncGateioTrades("BTC/USDT");

    expect(mockGetMyTrades).toHaveBeenCalledOnce();
    expect(mockGetMyTrades).toHaveBeenCalledWith("BTC/USDT", undefined, undefined);

    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(1);

    // append는 신규 1건만 호출
    expect(mockAppend).toHaveBeenCalledOnce();
    const rows = (mockAppend.mock.calls[0][0] as { requestBody: { values: unknown[][] } }).requestBody.values;
    expect(rows).toHaveLength(1);

    // 신규 ID가 Redis에 기록됨
    expect(mockHset).toHaveBeenCalledWith("journal-recorded-ids", "gate-trade-new", "1");
  });
});
