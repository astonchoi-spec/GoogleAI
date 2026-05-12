import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc.ts";
import { queryNotebookLm, checkNotebookLmConnection } from "../integrations/notebookLmMcp.ts";

export const notebooklmRouter = router({
  query: publicProcedure
    .input(z.object({ question: z.string().min(1) }))
    .mutation(async ({ input }) => {
      return queryNotebookLm(input.question);
    }),

  status: publicProcedure.query(async () => {
    return checkNotebookLmConnection();
  }),
});
