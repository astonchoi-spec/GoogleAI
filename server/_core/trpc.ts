import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "../../shared/const.ts";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context.ts";

function normalizeTrpcErrorMessage(message: string): string {
  const normalized = message.toLowerCase(); // MODIFIED: use case-insensitive matching to normalize provider-specific raw errors.

  if (
    normalized.includes("no tokens found for user")
    || normalized.includes("please authenticate first")
    || normalized.includes("token expired and no refresh token")
    || normalized.includes("failed to get authenticated client")
  ) {
    return "Google OAuth 연결이 필요합니다. /google 페이지에서 먼저 계정을 연결해 주세요.";
  }

  if (
    normalized.includes("api key not configured")
    || normalized.includes("_api_key is missing")
    || normalized.includes("built_in_forge_api_key is not configured")
  ) {
    return "API 키가 설정되지 않았습니다. 설정 페이지 또는 .env 값을 확인해 주세요.";
  }

  if (normalized.includes("workspace_spreadsheet_id is missing")) {
    return "WORKSPACE_SPREADSHEET_ID 설정이 필요합니다. .env를 확인해 주세요.";
  }

  if (normalized.includes("redis connection failed")) {
    return "Redis 연결에 실패했습니다. Redis 실행 상태 또는 REDIS_URL 설정을 확인해 주세요.";
  }

  return message;
}

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      message: normalizeTrpcErrorMessage(error.message), // MODIFIED: expose actionable user-facing errors while preserving underlying logs.
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
