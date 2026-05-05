import { executeMorningBriefing } from "../../intelligence/briefing.ts";
import { queryNotebookLm } from "../../integrations/notebookLmMcp.ts";
import { getApiUsageSnapshot } from "../../_core/apiUsage.ts";
import { sessionManager } from "../../llm/session.ts";
import { asString, type HandlerMap, type IntentHandler } from "../types.ts";

const morningBriefing: IntentHandler = async (intent) => {
  const briefing = await executeMorningBriefing({ trigger: "manual", deliver: true });
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: "모닝 브리핑을 발송했습니다.",
    data: {
      briefing: briefing.text,
      archivePath: briefing.archivePath,
    },
  };
};

const notebookLmQuery: IntentHandler = async (intent) => {
  const question = asString(intent.params.question, "");
  if (!question) {
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: "NotebookLM에 물어볼 질문을 함께 입력해주세요. 예: \"노트북 한남동644 사업성 요약\"",
    };
  }
  const result = await queryNotebookLm(question);
  const sourcesLine = result.sources.length > 0
    ? `\n\n📎 출처\n${result.sources.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
    : "";
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: `📓 NotebookLM 응답\n\n${result.answer}${sourcesLine}`,
    data: { question, answer: result.answer, sources: result.sources },
  };
};

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

const monitoringStatus: IntentHandler = async (intent) => {
  try {
    const [apiUsage, sessionCount] = await Promise.all([
      getApiUsageSnapshot(),
      sessionManager.getSessionCount(),
    ]);
    const mem = process.memoryUsage();
    const rssMb = Math.round(mem.rss / 1024 / 1024);
    const heapMb = Math.round(mem.heapUsed / 1024 / 1024);
    const uptime = formatUptime(Math.round(process.uptime()));
    const successRate = apiUsage.totalCalls > 0
      ? Math.round((apiUsage.successfulCalls / apiUsage.totalCalls) * 100)
      : null;

    const lines = [
      "🛰️ 시스템 모니터링",
      "",
      `⏱ 가동시간: ${uptime}`,
      `💾 메모리: RSS ${rssMb}MB / Heap ${heapMb}MB`,
      `👥 활성 세션: ${sessionCount}`,
      "",
      "🤖 LLM API 사용 현황",
      `• 총 호출: ${apiUsage.totalCalls} (성공 ${apiUsage.successfulCalls}, 실패 ${apiUsage.failedCalls})`,
      successRate !== null ? `• 성공률: ${successRate}%` : "• 성공률: 데이터 없음",
      `• 평균 지연: ${apiUsage.averageLatencyMs}ms (최근 ${apiUsage.lastLatencyMs}ms)`,
      `• 총 토큰: ${apiUsage.totalTokens.toLocaleString()}`,
      apiUsage.lastEngine
        ? `• 마지막 엔진: ${apiUsage.lastEngine} (${apiUsage.lastModel ?? "-"})`
        : "• 마지막 엔진: 호출 기록 없음",
      `• Node ${process.version} / ${process.platform}`,
    ];

    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: lines.join("\n"),
      data: {
        uptimeSeconds: Math.round(process.uptime()),
        memoryRssMb: rssMb,
        heapUsedMb: heapMb,
        sessionCount,
        apiUsage,
      },
    };
  } catch (err) {
    console.error("[intelligence] monitoringStatus error:", err);
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: `🛰️ 모니터링 조회 실패: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
};

export const intelligenceHandlers: HandlerMap = {
  intelligence_morning_briefing: morningBriefing,
  notebooklm_query: notebookLmQuery,
  monitoring_status: monitoringStatus,
};
