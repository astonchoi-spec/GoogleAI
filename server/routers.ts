import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { llmRouter } from "./routers/llm";
import { googleWorkspaceRouter } from "./routers/google-workspace";
import { apiSettingsRouter } from "./routers/api-settings";
import { chatSyncRouter } from "./routers/chat-sync";

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
});

export type AppRouter = typeof appRouter;
