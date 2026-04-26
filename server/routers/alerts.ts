import { z } from "zod";

import { protectedProcedure, router } from "../_core/trpc.ts";
import { getTvWebhookHistory } from "../alerts/tvWebhookServer.ts";

export const alertsRouter = router({
  /**
   * Returns recent TradingView webhook alert history from Redis.
   * Useful for dashboard inspection and AI intent queries.
   */
  tvWebhookHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      return getTvWebhookHistory(input.limit);
    }),
});
