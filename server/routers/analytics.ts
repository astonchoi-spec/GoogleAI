import { count, gte, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc.ts";
import { getApiUsageSnapshot } from "../_core/apiUsage.ts"; // MODIFIED: expose runtime API usage telemetry in the monitoring dashboard.
import { getDb } from "../db.ts";
import { conversations, messages } from "../../drizzle/schema.ts";
import { sessionManager } from "../llm/session.ts";

type DailyPoint = {
  date: string;
  messages: number;
  userMessages: number;
  assistantMessages: number;
};

export const analyticsRouter = router({
  dashboard: protectedProcedure.query(async () => {
    const db = getDb();

    const [conversationStats] = await db
      .select({
        totalConversations: count(),
        activeConversations: sql<number>`sum(case when ${conversations.isActive} = 1 then 1 else 0 end)`,
        pinnedConversations: sql<number>`sum(case when ${conversations.pinned} = 1 then 1 else 0 end)`,
      })
      .from(conversations);

    const [messageStats] = await db
      .select({
        totalMessages: count(),
        webMessages: sql<number>`sum(case when ${messages.source} = 'web' then 1 else 0 end)`,
        telegramMessages: sql<number>`sum(case when ${messages.source} = 'telegram' then 1 else 0 end)`,
        userMessages: sql<number>`sum(case when ${messages.role} = 'user' then 1 else 0 end)`,
        assistantMessages: sql<number>`sum(case when ${messages.role} = 'assistant' then 1 else 0 end)`,
      })
      .from(messages);

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    const recentMessages = await db
      .select({
        conversationId: messages.conversationId,
        role: messages.role,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(gte(messages.createdAt, sevenDaysAgo))
      .orderBy(messages.createdAt);

    const trendMap = new Map<string, DailyPoint>();
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
      const key = day.toISOString().slice(0, 10);
      trendMap.set(key, {
        date: key,
        messages: 0,
        userMessages: 0,
        assistantMessages: 0,
      });
    }

    for (const message of recentMessages) {
      const key = new Date(message.createdAt).toISOString().slice(0, 10);
      const point = trendMap.get(key);
      if (!point) continue;
      point.messages += 1;
      if (message.role === "user") point.userMessages += 1;
      if (message.role === "assistant") point.assistantMessages += 1;
    }

    const allMessages = await db
      .select({
        conversationId: messages.conversationId,
        role: messages.role,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .orderBy(messages.createdAt);

    const openRequests = new Map<number, number>();
    let responseCount = 0;
    let totalResponseMs = 0;
    let lastResponseMs = 0;

    for (const message of allMessages) {
      const createdAt = new Date(message.createdAt).getTime();
      if (message.role === "user") {
        openRequests.set(message.conversationId, createdAt);
        continue;
      }

      const startedAt = openRequests.get(message.conversationId);
      if (!startedAt) continue;

      const responseMs = createdAt - startedAt;
      if (responseMs >= 0 && responseMs <= 15 * 60 * 1000) {
        responseCount += 1;
        totalResponseMs += responseMs;
        lastResponseMs = responseMs;
      }
      openRequests.delete(message.conversationId);
    }

    const avgResponseMs = responseCount > 0 ? Math.round(totalResponseMs / responseCount) : 0;
    const apiUsage = await getApiUsageSnapshot();

    return {
      conversationStats: {
        totalConversations: Number(conversationStats.totalConversations ?? 0),
        activeConversations: Number(conversationStats.activeConversations ?? 0),
        pinnedConversations: Number(conversationStats.pinnedConversations ?? 0),
      },
      messageStats: {
        totalMessages: Number(messageStats.totalMessages ?? 0),
        webMessages: Number(messageStats.webMessages ?? 0),
        telegramMessages: Number(messageStats.telegramMessages ?? 0),
        userMessages: Number(messageStats.userMessages ?? 0),
        assistantMessages: Number(messageStats.assistantMessages ?? 0),
      },
      performance: {
        avgResponseMs,
        lastResponseMs,
        responseCount,
      },
      apiUsage,
      trend: Array.from(trendMap.values()),
      system: {
        uptimeSeconds: Math.round(process.uptime()),
        memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        nodeVersion: process.version,
        platform: process.platform,
        sessionCount: await sessionManager.getSessionCount(),
      },
    };
  }),
});
