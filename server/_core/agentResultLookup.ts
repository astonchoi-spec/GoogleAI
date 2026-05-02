import { loadAgentResultsForDate } from "../agents/agentResultLoader.ts";

function getKstDateKey(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export async function loadRecentAgentResultLabelsByTarget(): Promise<Map<string, string>> {
  const results = [
    ...(await loadAgentResultsForDate(getKstDateKey(0))),
    ...(await loadAgentResultsForDate(getKstDateKey(-1))),
  ];
  const map = new Map<string, string>();
  for (const item of results) {
    if (item.target && !map.has(item.target)) map.set(item.target, item.templateLabel);
  }
  return map;
}
