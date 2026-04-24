import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc.ts";
import { classifyIntent, formatIntentRouteMessage, routeIntentMessage } from "../intent/intentService.ts"; // MODIFIED: include shared formatter so web clients can render identical intent output.

export const intentRouter = router({
  classify: protectedProcedure
    .input(z.object({ message: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const intent = await classifyIntent(input.message);
      return { intent };
    }),

  route: protectedProcedure
    .input(z.object({
      message: z.string().min(1),
      allowExecute: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const routed = await routeIntentMessage({
        userId: String(ctx.user.id),
        message: input.message,
        allowExecute: input.allowExecute,
      });
      return {
        ...routed,
        formattedMessage: formatIntentRouteMessage(routed), // MODIFIED: expose server-formatted response for consistent web/telegram presentation.
      };
    }),
});
