import { executeMorningBriefing } from "../../intelligence/briefing.ts";
import { queryNotebookLm } from "../../integrations/notebookLmMcp.ts";
import { getApiUsageSnapshot } from "../../_core/apiUsage.ts";
import { sessionManager } from "../../llm/session.ts";
import { asString, type HandlerMap, type IntentHandler } from "../types.ts";

const morningBriefing: IntentHandler = async (intent) => {
  const briefing = await executeMorningBriefing({ trigger: "manual", deliver: true });
  // Phase 6-D-3 — 분리형 패턴: response 는 짧은 헤더, data.briefing 이 본문.
  // handlerResponse.text 가 data.briefing 과 같은 변수에서 파생되어 신/구
  // 경로 모두 동일 본문을 출력 → byte-for-byte 동등 보장.
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: "모닝 브리핑을 발송했습니다.",
    data: {
      briefing: briefing.text,
      archivePath: briefing.archivePath,
    },
    handlerResponse: {
      kind: "report",
      text: briefing.text,
      meta: {
        action: "intelligence_morning_briefing",
        trigger: "manual",
        delivered: true,
        hasArchivePath: typeof briefing.archivePath === "string" && briefing.archivePath.length > 0,
        briefingLength: typeof briefing.text === "string" ? briefing.text.length : 0,
      },
    },
  };
};

const notebookLmQuery: IntentHandler = async (intent) => {
  const question = asString(intent.params.question, "");
  if (!question) {
    // Phase 6-D-3 — 짧은 안내 (질문 누락) → kind="text" + text="" 마커.
    // 본문은 response 한 줄에 통합되어 있어 중복 방지.
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: "NotebookLM에 물어볼 질문을 함께 입력해주세요. 예: \"노트북 한남동644 사업성 요약\"",
      handlerResponse: {
        kind: "text",
        text: "",
        meta: { action: "notebooklm_query", hasQuestion: false },
      },
    };
  }
  const result = await queryNotebookLm(question);
  const sourcesLine = result.sources.length > 0
    ? `\n\n📎 출처\n${result.sources.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
    : "";
  // Phase 6-D-3 — 통합형 패턴: response 안에 answer + sources 가 모두 포함됨.
  // handlerResponse.text="" 로 본문 중복 방지. data.answer/sources 는 디버그용
  // 구조화 데이터로 유지되며 formatReply 의 safeDisplayBody 가 빈 문자열로 처리.
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: `📓 NotebookLM 응답\n\n${result.answer}${sourcesLine}`,
    data: { question, answer: result.answer, sources: result.sources },
    handlerResponse: {
      kind: "report",
      text: "",
      meta: {
        action: "notebooklm_query",
        hasQuestion: true,
        sourcesCount: result.sources.length,
        answerLength: typeof result.answer === "string" ? result.answer.length : 0,
      },
    },
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

    // Phase 6-D-3 — 통합형 패턴: response 에 다중 라인 모니터링 본문 통째.
    // data.apiUsage 는 raw 객체이지만 formatReply 의 safeDisplayBody 가 빈
    // 문자열로 처리하여 사용자 응답에 노출되지 않음. text="" 로 중복 방지.
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
      handlerResponse: {
        kind: "report",
        text: "",
        meta: {
          action: "monitoring_status",
          status: "ok",
          sessionCount,
          totalCalls: apiUsage.totalCalls,
          successRate,
          lastEngine: apiUsage.lastEngine ?? null,
        },
      },
    };
  } catch (err) {
    console.error("[intelligence] monitoringStatus error:", err);
    // Phase 7-A — 에러 분기를 kind="error" 로 정식 재분류. 응답 문자열은
    // byte-for-byte 동일 (Phase 6-D-3 임시 kind="text" 에서 마커만 변경).
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: `🛰️ 모니터링 조회 실패: ${err instanceof Error ? err.message : String(err)}`,
      handlerResponse: {
        kind: "error",
        text: "",
        meta: {
          action: "monitoring_status",
          status: "error",
          errorType: err instanceof Error ? err.name : "unknown",
        },
      },
    };
  }
};

export const intelligenceHandlers: HandlerMap = {
  intelligence_morning_briefing: morningBriefing,
  notebooklm_query: notebookLmQuery,
  monitoring_status: monitoringStatus,
};
