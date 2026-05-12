import { getOpenClawClient } from "../server/agents/openclawClient.ts";
import { discoverOpenClaw, loadDiscovery, saveDiscovery } from "../server/agents/openclawDiscovery.ts";
import { loadOpenClawLocalConfig } from "../server/agents/openclawRuntime.ts";
import { saveOpenClawSmoke, type OpenClawSmokeResult } from "../server/agents/openclawSmoke.ts";

function preview(text: string | null): string | null {
  if (!text) return null;
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

async function ensureDiscovery() {
  const cached = await loadDiscovery();
  if (cached) return cached;
  const local = await loadOpenClawLocalConfig();
  const detected = await discoverOpenClaw();
  const enriched = { ...detected, modelHint: local.modelHint, configFiles: local.configFiles };
  await saveDiscovery(enriched);
  return enriched;
}

async function main(): Promise<void> {
  const discovery = await ensureDiscovery();
  const local = await loadOpenClawLocalConfig();
  const client = getOpenClawClient();
  await client.probe();
  const status = client.getStatus();

  const result: OpenClawSmokeResult = {
    checkedAt: new Date().toISOString(),
    available: Boolean(discovery.found && status.available && status.url),
    url: status.url ?? discovery.url,
    modelHint: status.modelHint ?? local.modelHint,
    responsePreview: { arithmetic: null, domain: null },
    errorReason: null,
    status: "skipped",
  };

  if (!status.available || !status.url) {
    result.errorReason = status.reason ?? "OpenClaw 미탐지";
    await saveOpenClawSmoke(result);
    console.log(`Smoke skipped: ${result.errorReason}`);
    return;
  }

  try {
    const first = await client.runPrompt("1+1은?");
    if (!first.ok) throw new Error(first.reason ?? "1차 요청 실패");
    result.responsePreview.arithmetic = preview(first.markdown);

    const second = await client.runPrompt("한남동 부동산 시세를 한 줄로 요약해줘");
    if (!second.ok) throw new Error(second.reason ?? "2차 요청 실패");
    result.responsePreview.domain = preview(second.markdown);
    result.status = "passed";
    result.available = true;
  } catch (err) {
    result.status = "failed";
    result.errorReason = err instanceof Error ? err.message : String(err);
  }

  await saveOpenClawSmoke(result);
  console.log(`Smoke ${result.status}: ${result.url ?? "n/a"}`);
}

main().catch((err) => {
  console.error("[smoke-openclaw] failed:", err);
  process.exitCode = 1;
});
