import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type OpenClawLocalConfig = {
  apiKey: string | null;
  authSource: "env" | "openclaw-config" | "none";
  model: string | null;
};

type GatewayCall = (options: {
  method: string;
  params: Record<string, unknown>;
  timeoutMs?: number;
  url?: string;
  token?: string;
}) => Promise<unknown>;

function openClawConfigPath(): string {
  return path.join(os.homedir(), ".openclaw", "openclaw.json");
}

export function toGatewayWsUrl(url: string): string {
  if (url.startsWith("ws://") || url.startsWith("wss://")) return url;
  if (url.startsWith("https://")) return `wss://${url.slice("https://".length)}`;
  if (url.startsWith("http://")) return `ws://${url.slice("http://".length)}`;
  return `ws://${url.replace(/^\/+/, "")}`;
}

export async function loadOpenClawLocalConfig(): Promise<OpenClawLocalConfig> {
  const envKey = process.env.OPENCLAW_API_KEY?.trim();
  if (envKey) {
    return {
      apiKey: envKey,
      authSource: "env",
      model: process.env.OPENCLAW_MODEL?.trim() || null,
    };
  }
  try {
    const raw = await fs.readFile(openClawConfigPath(), "utf-8");
    const parsed = JSON.parse(raw) as {
      gateway?: { auth?: { token?: string } };
      agents?: { defaults?: { model?: { primary?: string } } };
    };
    return {
      apiKey: parsed.gateway?.auth?.token?.trim() || null,
      authSource: parsed.gateway?.auth?.token ? "openclaw-config" : "none",
      model: parsed.agents?.defaults?.model?.primary?.trim() || null,
    };
  } catch (err) {
    console.error("[openclawRuntime] loadOpenClawLocalConfig:", err);
    return { apiKey: null, authSource: "none", model: null };
  }
}

export async function syncOpenClawEnv(values: Record<string, string>): Promise<void> {
  const envPath = path.resolve(process.cwd(), ".env");
  try {
    const raw = await fs.readFile(envPath, "utf-8").catch(() => "");
    let next = raw;
    for (const [key, value] of Object.entries(values)) {
      const line = `${key}=${value}`;
      const pattern = new RegExp(`^${key}=.*$`, "m");
      next = pattern.test(next) ? next.replace(pattern, line) : `${next.trimEnd()}\n${line}\n`;
    }
    if (next !== raw) await fs.writeFile(envPath, next, "utf-8");
    for (const [key, value] of Object.entries(values)) process.env[key] = value;
  } catch (err) {
    console.error("[openclawRuntime] syncOpenClawEnv:", err);
  }
}

export async function loadGatewayCaller(): Promise<GatewayCall> {
  const moduleUrl = pathToFileURL(path.join(process.env.APPDATA ?? "", "npm", "node_modules", "openclaw", "dist", "call-DS_a955m.js")).href;
  const mod = (await import(moduleUrl)) as { callGateway: GatewayCall };
  return mod.callGateway;
}

