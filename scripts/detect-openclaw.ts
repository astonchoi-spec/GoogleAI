import fs from "node:fs/promises";
import { discoverOpenClaw, saveDiscovery } from "../server/agents/openclawDiscovery.ts";
import { loadOpenClawLocalConfig, syncOpenClawEnv } from "../server/agents/openclawRuntime.ts";

async function updateEnvExample(url: string | null): Promise<void> {
  if (!url) return;
  try {
    const file = ".env.example";
    const raw = await fs.readFile(file, "utf-8");
    const next = raw.replace(
      /# Agent Control \(OpenClaw .*?\)/,
      `# Agent Control (OpenClaw 자동 탐지 성공 예: ${url} — .env 직접 입력 불필요)`,
    );
    if (next !== raw) await fs.writeFile(file, next, "utf-8");
  } catch (err) {
    console.error("[detect-openclaw] env example update:", err);
  }
}

async function main(): Promise<void> {
  const local = await loadOpenClawLocalConfig();
  const result = await discoverOpenClaw();
  await saveDiscovery(result);
  if (result.found) {
    if (local.apiKey) {
      await syncOpenClawEnv({
        OPENCLAW_API_URL: result.url ?? "http://127.0.0.1:8000",
        OPENCLAW_API_KEY: local.apiKey,
        AGENT_PERMISSION_LEVEL: "2",
        OPENCLAW_REQUEST_TIMEOUT_MS: "60000",
      });
    }
    await updateEnvExample(result.url);
    console.log(`✅ OpenClaw 탐지 성공: ${result.url} (${result.source}, health=${result.healthEndpoint ?? "unknown"})`);
  } else {
    console.log(`⚠️ OpenClaw 미탐지: ${result.reason}`);
  }
  console.log("📁 data/openclaw-discovery.json 저장 완료");
}

main().catch((err) => {
  console.error("[detect-openclaw] failed:", err);
  process.exitCode = 1;
});
