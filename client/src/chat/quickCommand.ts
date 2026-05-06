export const HOME_QUICK_COMMANDS = [
  "오늘 메일 요약",
  "BTC 포지션 확인",
  "한남 PF 진행상황",
  "오늘 일정 브리핑",
  "Telegram 최근 메시지",
] as const;

export type HomeQuickCommand = (typeof HOME_QUICK_COMMANDS)[number];

type RouteLikeResult = {
  handled?: boolean;
  requiresConfirmation?: boolean;
  response?: string;
  formattedMessage?: string;
  data?: unknown;
};

type ResolveAssistantResponseOptions = {
  userMessage: string;
  isAuthenticated: boolean;
  intentRoute: (input: { message: string }) => Promise<RouteLikeResult>;
  llmChat: (input: { message: string }) => Promise<{ response: string }>;
};

const GENERIC_ERROR_MESSAGE = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";

function safeDisplayBody(data: unknown): string {
  if (typeof data === "string") return data;
  return "";
}

export function formatIntentRouteResult(routed: RouteLikeResult): string {
  if (routed.formattedMessage?.trim()) {
    return routed.formattedMessage.trim();
  }

  const data = routed.data as Record<string, unknown> | undefined;
  const primaryBody =
    typeof data?.fileList === "string" ? data.fileList
      : typeof data?.emailList === "string" ? data.emailList
        : typeof data?.eventList === "string" ? data.eventList
          : typeof data?.briefing === "string" ? data.briefing
            : typeof data?.report === "string" ? data.report
              : typeof data?.summary === "string" ? data.summary
                : safeDisplayBody(routed.data);

  return [routed.response?.trim() || "", primaryBody.trim()]
    .filter(Boolean)
    .join("\n\n");
}

export function buildQuickCommandPath(command: string, requestId: string | number): string {
  const params = new URLSearchParams({
    command,
    autoSubmit: "1",
    requestId: String(requestId),
  });
  return `/chat?${params.toString()}`;
}

export function readChatCommandParams(search: string): {
  command: string | null;
  source: string | null;
  openApiSettings: boolean;
  autoSubmit: boolean;
  requestId: string | null;
} {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  return {
    command: params.get("command"),
    source: params.get("source"),
    openApiSettings: params.get("openApiSettings") === "1",
    autoSubmit: params.get("autoSubmit") === "1",
    requestId: params.get("requestId"),
  };
}

export async function resolveAssistantResponse({
  userMessage,
  isAuthenticated,
  intentRoute,
  llmChat,
}: ResolveAssistantResponseOptions): Promise<{ text: string; failed: boolean; sources?: { title: string; uri: string }[] }> {
  if (isAuthenticated) {
    try {
      const routed = await intentRoute({ message: userMessage });
      if (routed.handled || routed.requiresConfirmation) {
        const formatted = formatIntentRouteResult(routed);
        if (formatted) {
          return { text: formatted, failed: false };
        }
      }
    } catch (error) {
      console.error("Intent route failed, fallback to llm.chat:", error);
    }
  }

  try {
    const result = await llmChat({ message: userMessage });
    return { text: result.response, failed: false, sources: result.sources ?? undefined };
  } catch (error) {
    console.error("Chat command resolution failed:", error);
    return { text: GENERIC_ERROR_MESSAGE, failed: true };
  }
}

export { GENERIC_ERROR_MESSAGE };
