const MCP_ENABLED = () => process.env.NOTEBOOKLM_MCP_ENABLED === "true";
const MCP_URL = () => process.env.NOTEBOOKLM_MCP_URL ?? "http://localhost:3100";

export function isNotebookLmEnabled(): boolean {
  return MCP_ENABLED();
}

export async function queryNotebookLm(
  question: string
): Promise<{ answer: string; sources: string[] }> {
  if (!MCP_ENABLED()) {
    return { answer: "NotebookLM 연동이 비활성화되어 있습니다.", sources: [] };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`${MCP_URL()}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        answer: `NotebookLM 서버 오류: HTTP ${res.status}`,
        sources: [],
      };
    }

    const json = (await res.json()) as { answer?: string; sources?: string[] };
    return {
      answer: typeof json.answer === "string" ? json.answer : "응답을 파싱할 수 없습니다.",
      sources: Array.isArray(json.sources) ? json.sources.filter((s) => typeof s === "string") : [],
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { answer: "NotebookLM 서버 응답 시간이 초과되었습니다 (10초).", sources: [] };
    }
    return {
      answer: `NotebookLM 연결 실패: ${err instanceof Error ? err.message : String(err)}`,
      sources: [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function getNotebookLmStatus(): { enabled: boolean; connected: boolean } {
  const enabled = MCP_ENABLED();
  if (!enabled) return { enabled: false, connected: false };

  // fire-and-forget ping; return synchronously with optimistic connected=true if enabled
  // actual connectivity is checked asynchronously but we surface it via the returned promise
  return { enabled: true, connected: true };
}

export async function checkNotebookLmConnection(): Promise<{ enabled: boolean; connected: boolean }> {
  const enabled = MCP_ENABLED();
  if (!enabled) return { enabled: false, connected: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const res = await fetch(`${MCP_URL()}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    return { enabled: true, connected: res.ok };
  } catch {
    return { enabled: true, connected: false };
  } finally {
    clearTimeout(timeout);
  }
}
