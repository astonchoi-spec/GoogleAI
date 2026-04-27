import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const.ts";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies.ts";
import { systemRouter } from "./_core/systemRouter.ts";
import { publicProcedure, router } from "./_core/trpc.ts";
import { sdk } from "./_core/sdk.ts";
import * as db from "./db.ts";
import { llmRouter } from "./routers/llm.ts";
import { googleWorkspaceRouter } from "./routers/google-workspace.ts";
import { apiSettingsRouter } from "./routers/api-settings.ts";
import { chatSyncRouter } from "./routers/chat-sync.ts";
import { tradingRouter } from "./routers/trading.ts"; // MODIFIED: Phase 3 trading domain router registration
import { realestateRouter } from "./routers/realestate.ts"; // MODIFIED: Phase 3 real estate PF router registration
import { financeRouter } from "./routers/finance.ts"; // MODIFIED: Phase 3 finance router registration
import { intentRouter } from "./routers/intent.ts"; // MODIFIED: Phase 3 intent routing entrypoint registration
import { analyticsRouter } from "./routers/analytics.ts"; // MODIFIED: expose analytics dashboard data via appRouter.
import { telegramRouter } from "./routers/telegram.ts"; // MODIFIED: register Telegram status endpoint in appRouter.
import { homeRouter } from "./routers/home.ts"; // MODIFIED: register Home dashboard KPI endpoint in appRouter.
import { alertsRouter } from "./routers/alerts.ts"; // MODIFIED: register alerts (TV webhook history) router.
import { journalRouter } from "./routers/journal.ts"; // MODIFIED: 1-D 매매일지 라우터 등록.
import { analysisRouter } from "./routers/analysis.ts"; // MODIFIED: register technical analysis router.

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    login: publicProcedure
      .input(z.object({ username: z.string(), password: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (input.username !== ADMIN_USERNAME || input.password !== ADMIN_PASSWORD) {
          throw new Error("Invalid credentials");
        }

        // DB가 없어도 JWT는 발급 (MySQL 없이 로컬 실행 대응)
        try {
          await db.upsertUser({
            openId: "admin",
            name: "Admin",
            email: null,
            loginMethod: "password",
            lastSignedIn: new Date(),
            role: "admin",
          });
        } catch {
          // DB unavailable — continue without persisting
        }

        const token = await sdk.createSessionToken("admin", { name: "Admin" });

        ctx.res.cookie(COOKIE_NAME, token, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: ONE_YEAR_MS,
        });

        return { success: true } as const;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  llm: llmRouter,
  googleWorkspace: googleWorkspaceRouter,
  apiSettings: apiSettingsRouter,
  chatSync: chatSyncRouter,
  trading: tradingRouter, // MODIFIED: expose trading procedures via appRouter
  realestate: realestateRouter, // MODIFIED: expose real estate PF procedures via appRouter
  finance: financeRouter, // MODIFIED: expose finance(DART) procedures via appRouter
  intent: intentRouter, // MODIFIED: expose intent classify/route procedures for AI action routing
  analytics: analyticsRouter, // MODIFIED: expose monitoring metrics for the dashboard page.
  telegram: telegramRouter, // MODIFIED: expose Telegram status endpoint in appRouter.
  home: homeRouter, // MODIFIED: expose Home dashboard KPI endpoint in appRouter.
  alerts: alertsRouter, // MODIFIED: expose TV webhook history procedure.
  journal: journalRouter, // MODIFIED: 1-D 매매일지 프로시저 노출.
  analysis: analysisRouter, // MODIFIED: expose technical analysis procedures via appRouter.
});

export type AppRouter = typeof appRouter;
