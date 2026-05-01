import { discoverOpenClaw, saveDiscovery } from "../server/agents/openclawDiscovery.ts";
import fs from "node:fs/promises";

async function updateEnvExample(url: string | null): Promise<void> {
  if (!url) return;
  try {
    const file = ".env.example";
    const raw = await fs.readFile(file, "utf-8");
    const next = raw.replace(
      /# Agent Control \(OpenClaw 자동 탐지:.*\)/,
      `# Agent Control (OpenClaw 자동 탐지 성공 예: ${url} — .env 직접 입력 불필요)`,
    );
    if (next !== raw) await fs.writeFile(file, next, "utf-8");
  } catch (err) {
    console.error("[detect-openclaw] env example update:", err);
  }
}

async function main(): Promise<void> {
  const result = await discoverOpenClaw();
  await saveDiscovery(result);
  if (result.found) {
    await updateEnvExample(result.url);
    console.log(`✅ OpenClaw 탐지 성공: ${result.url} (${result.source}, health=${result.healthEndpoint ?? "unknown"})`);
  } else {
    console.log(`⚠️ OpenClaw 미탐지: ${result.reason}`);
  }
  console.log("📄 data/openclaw-discovery.json 저장 완료");
}

main().catch((err) => {
  console.error("[detect-openclaw] failed:", err);
  process.exitCode = 1;
});
