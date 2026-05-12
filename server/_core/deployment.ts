import fs from "fs/promises";
import path from "path";

const LOG_DIR = path.resolve("logs");
const LOG_FILE = path.join(LOG_DIR, "app.log");

type DeploymentWarning = {
  key: string;
  message: string;
};

export function getProductionWarnings(): DeploymentWarning[] {
  const warnings: DeploymentWarning[] = [];

  if (!process.env.JWT_SECRET) {
    warnings.push({
      key: "JWT_SECRET",
      message: "JWT_SECRET is missing. Production sessions should use a strong secret.",
    });
  }

  if (!process.env.DATABASE_URL) {
    warnings.push({
      key: "DATABASE_URL",
      message: "DATABASE_URL is missing. Production must point to a persistent database file or server.",
    });
  }

  if (!process.env.REDIS_URL) {
    warnings.push({
      key: "REDIS_URL",
      message: "REDIS_URL is missing. Production should use a reachable Redis instance.",
    });
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    warnings.push({
      key: "GOOGLE_OAUTH",
      message: "Google OAuth client credentials are incomplete. Workspace features will not authenticate.",
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    warnings.push({
      key: "GEMINI_API_KEY",
      message: "GEMINI_API_KEY is missing. The default chat engine will be unavailable.",
    });
  }

  if (!process.env.BUILT_IN_FORGE_API_URL || !process.env.BUILT_IN_FORGE_API_KEY) {
    warnings.push({
      key: "FORGE_NOTIFICATION",
      message: "Built-in notification service credentials are incomplete. Owner notifications will be disabled.",
    });
  }

  return warnings;
}

async function appendLog(level: "info" | "warn" | "error", message: string, error?: unknown): Promise<void> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    const suffix = error instanceof Error ? `\n${error.stack ?? error.message}` : error ? `\n${String(error)}` : "";
    await fs.appendFile(
      LOG_FILE,
      `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}${suffix}\n`,
      "utf8"
    );
  } catch {
    // Best-effort logging only; never block startup or shutdown on disk logging.
  }
}

export function installDeploymentGuards(): void {
  process.on("unhandledRejection", (reason) => {
    void appendLog("error", "Unhandled rejection", reason);
  });

  process.on("uncaughtException", (error) => {
    void appendLog("error", "Uncaught exception", error);
  });
}

export async function logStartupSummary(): Promise<void> {
  const warnings = getProductionWarnings();
  if (warnings.length === 0) {
    console.log("[Deploy] Production checks passed.");
    await appendLog("info", "Production checks passed.");
    return;
  }

  console.warn("[Deploy] Production warnings:");
  for (const warning of warnings) {
    console.warn(`- ${warning.key}: ${warning.message}`);
  }
  await appendLog("warn", `Production warnings: ${warnings.map((warning) => warning.key).join(", ")}`);
}

