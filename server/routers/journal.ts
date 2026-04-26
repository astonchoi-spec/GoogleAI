/**
 * Journal tRPC Router — 매매일지 Google Sheets 연동
 * 기존 gateio.*, kiwoom.*, alerts.* 프로시저와 무관하게 독립적으로 동작.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc.ts";
import { googleAuthManager } from "./google-workspace.ts";
import { TradeJournalKorean, type TradeRecord } from "../trading/tradeJournal.ts";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function getSpreadsheetId(): string {
  const id = process.env.WORKSPACE_SPREADSHEET_ID;
  if (!id) throw new Error("WORKSPACE_SPREADSHEET_ID 환경변수가 설정되지 않았습니다.");
  return id;
}

async function createJournal(userId: string): Promise<TradeJournalKorean> {
  const auth = await googleAuthManager.getAuthenticatedClient(userId);
  return new TradeJournalKorean(auth, getSpreadsheetId());
}

// ---------------------------------------------------------------------------
// TradeRecord input schema
// ---------------------------------------------------------------------------

const tradeRecordSchema = z.object({
  id: z.string().optional(),
  date: z.string().min(1),
  time: z.string().min(1),
  exchange: z.string().min(1),
  symbol: z.string().min(1),
  side: z.enum(["buy", "sell"]),
  qty: z.number().positive(),
  price: z.number().positive(),
  fee: z.number().min(0),
  pnl: z.number().optional(),
  memo: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const journalRouter = router({
  /** 매매일지 최근 기록 조회 */
  list: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(1000).default(100) }))
    .query(async ({ ctx, input }) => {
      const journal = await createJournal(String(ctx.user.id));
      return journal.getTradeHistory(input.limit);
    }),

  /** 매매 수동 입력 */
  addManual: protectedProcedure
    .input(tradeRecordSchema)
    .mutation(async ({ ctx, input }) => {
      const journal = await createJournal(String(ctx.user.id));
      return journal.appendTrade(input as TradeRecord);
    }),

  /** CSV 임포트 */
  importCSV: protectedProcedure
    .input(z.object({ csv: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const journal = await createJournal(String(ctx.user.id));
      return journal.importCSV(input.csv);
    }),

  /** Gate.io 체결 내역 동기화 */
  syncGateio: protectedProcedure
    .input(z.object({ symbol: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const journal = await createJournal(String(ctx.user.id));
      return journal.syncGateioTrades(input.symbol);
    }),

  /** 키움증권 체결 내역 동기화 */
  syncKiwoom: protectedProcedure
    .mutation(async ({ ctx }) => {
      const journal = await createJournal(String(ctx.user.id));
      return journal.syncKiwoomTrades();
    }),
});

// ---------------------------------------------------------------------------
// TODO: BullMQ 반복 작업 (5분마다 Gate.io BTC/USDT 자동 동기화)
// 구현 전제 조건: Google Sheets 비대화형 접근을 위한 서비스 계정(Service Account)이 필요.
// 현재 앱은 사용자별 OAuth 토큰을 사용하므로, 무인 주기 동기화는 서비스 계정 인증으로
// 별도 구현해야 한다. 아래는 alertEngine의 BullMQ 패턴을 따른 스캐폴딩 예시:
//
// import { Queue, Worker } from "bullmq";
// const JOURNAL_QUEUE = "journal-sync";
//
// export async function startJournalSyncScheduler(): Promise<void> {
//   const queue = new Queue(JOURNAL_QUEUE, { connection: bullConnection() });
//   const worker = new Worker(
//     JOURNAL_QUEUE,
//     async () => {
//       // TODO: const auth = await getServiceAccountAuth();
//       // const journal = new TradeJournalKorean(auth, getSpreadsheetId());
//       // await journal.syncGateioTrades("BTC/USDT");
//     },
//     { connection: bullConnection() }
//   );
//   worker.on("failed", (job, err) => console.warn("[JournalSync] failed:", err.message));
//   await queue.add("sync-gateio-btc", {}, { repeat: { every: 5 * 60 * 1000 } });
// }
