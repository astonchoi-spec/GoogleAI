import { discoverOpenClaw, saveDiscovery } from "../server/agents/openclawDiscovery.ts";
import { loadOpenClawLocalConfig } from "../server/agents/openclawRuntime.ts";

async function main(): Promise<void> {
  const local = await loadOpenClawLocalConfig();
  const result = await discoverOpenClaw();
  const enriched = {
    ...result,
    modelHint: local.modelHint,
    configFiles: local.configFiles,
  };
  await saveDiscovery(enriched);

  if (enriched.found) {
    console.log(`OpenClaw detected: ${enriched.url} (${enriched.source}, health=${enriched.healthEndpoint ?? "unknown"})`);
  } else {
    console.log(`OpenClaw not detected: ${enriched.reason}`);
  }
  console.log(`Config files checked: ${enriched.configFiles?.filter((file) => file.exists).length ?? 0} found`);
  console.log("Saved: data/openclaw-discovery.json");
}

main().catch((err) => {
  console.error("[detect-openclaw] failed:", err);
  process.exitCode = 1;
});
