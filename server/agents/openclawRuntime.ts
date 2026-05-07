import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type OpenClawConfigFileStatus = {
  path: string;
  exists: boolean;
  modelHint: string | null;
};

export type OpenClawLocalConfig = {
  apiKey: string | null;
  authSource: "env" | "openclaw-config" | "none";
  geminiApiKey: string | null;
  geminiKeySource: "gemini_api_key" | "google_api_key" | "none";
  model: string | null;
  modelHint: string | null;
  configFiles: OpenClawConfigFileStatus[];
};

type GatewayCall = (options: {
  method: string;
  params: Record<string, unknown>;
  timeoutMs?: number;
  url?: string;
  token?: string;
}) => Promise<unknown>;

const OPENCLAW_FILENAMES = ["openclaw.json", "config.json"];
const MODEL_HINT_RE = /(google\/gemini|gemini|gpt[\w-]*)/i;

function compactString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function getOpenClawConfigPaths(): string[] {
  const home = os.homedir();
  const userProfile = process.env.USERPROFILE?.trim() || "";
  const homeDrivePath = `${process.env.HOMEDRIVE ?? ""}${process.env.HOMEPATH ?? ""}`.trim();
  const bases = unique([home, userProfile, homeDrivePath].filter(Boolean));
  return bases.flatMap((base) => OPENCLAW_FILENAMES.map((name) => path.join(base, ".openclaw", name)));
}

function findModelHint(value: unknown): string | null {
  if (typeof value === "string") {
    const match = value.match(MODEL_HINT_RE);
    return match?.[1]?.toLowerCase() ?? null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findModelHint(entry);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      const found = findModelHint(nested);
      if (found) return found;
    }
  }
  return null;
}

function parseConfig(raw: string): {
  token: string | null;
  model: string | null;
  modelHint: string | null;
} {
  const parsed = JSON.parse(raw) as {
    gateway?: { auth?: { token?: string }; token?: string };
    auth?: { token?: string };
    agents?: { defaults?: { model?: { primary?: string } } };
    model?: string;
  };
  return {
    token:
      compactString(parsed.gateway?.auth?.token) ??
      compactString(parsed.gateway?.token) ??
      compactString(parsed.auth?.token) ??
      null,
    model:
      compactString(parsed.agents?.defaults?.model?.primary) ??
      compactString(parsed.model) ??
      null,
    modelHint: findModelHint(parsed),
  };
}

export function resolveAstonGeminiKey(): { value: string | null; source: OpenClawLocalConfig["geminiKeySource"] } {
  const gemini = compactString(process.env.GEMINI_API_KEY);
  if (gemini) return { value: gemini, source: "gemini_api_key" };
  const google = compactString(process.env.GOOGLE_API_KEY);
  if (google) return { value: google, source: "google_api_key" };
  return { value: null, source: "none" };
}

export async function inspectOpenClawConfigFiles(): Promise<OpenClawConfigFileStatus[]> {
  const statuses: OpenClawConfigFileStatus[] = [];
  for (const filePath of getOpenClawConfigPaths()) {
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      statuses.push({
        path: filePath,
        exists: true,
        modelHint: parseConfig(raw).modelHint,
      });
    } catch {
      statuses.push({
        path: filePath,
        exists: false,
        modelHint: null,
      });
    }
  }
  return statuses;
}

export function toGatewayWsUrl(url: string): string {
  if (url.startsWith("ws://") || url.startsWith("wss://")) return url;
  if (url.startsWith("https://")) return `wss://${url.slice("https://".length)}`;
  if (url.startsWith("http://")) return `ws://${url.slice("http://".length)}`;
  return `ws://${url.replace(/^\/+/, "")}`;
}

export async function loadOpenClawLocalConfig(): Promise<OpenClawLocalConfig> {
  const envKey = compactString(process.env.OPENCLAW_API_KEY);
  const envModel = compactString(process.env.OPENCLAW_DEFAULT_MODEL) ?? compactString(process.env.OPENCLAW_MODEL);
  const gemini = resolveAstonGeminiKey();
  const configFiles = await inspectOpenClawConfigFiles();
  const defaultConfig: OpenClawLocalConfig = {
    apiKey: envKey ?? null,
    authSource: envKey ? "env" : "none",
    geminiApiKey: gemini.value,
    geminiKeySource: gemini.source,
    model: envModel ?? null,
    modelHint: envModel ? findModelHint(envModel) : configFiles.find((file) => file.exists && file.modelHint)?.modelHint ?? null,
    configFiles,
  };

  if (envKey) return defaultConfig;

  for (const file of configFiles) {
    if (!file.exists) continue;
    try {
      const raw = await fs.readFile(file.path, "utf-8");
      const parsed = parseConfig(raw);
      return {
        apiKey: parsed.token,
        authSource: parsed.token ? "openclaw-config" : "none",
        geminiApiKey: gemini.value,
        geminiKeySource: gemini.source,
        model: parsed.model ?? envModel ?? null,
        modelHint: parsed.modelHint ?? file.modelHint ?? null,
        configFiles,
      };
    } catch (err) {
      console.error("[openclawRuntime] loadOpenClawLocalConfig:", err);
    }
  }

  return defaultConfig;
}

function getOpenClawDistDirs(): string[] {
  // MODIFIED: APPDATA may be empty in non-Windows shells; try multiple npm prefix locations.
  const candidates = [
    process.env.APPDATA && path.join(process.env.APPDATA, "npm", "node_modules", "openclaw", "dist"),
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, "AppData", "Roaming", "npm", "node_modules", "openclaw", "dist"),
    process.env.NPM_PREFIX && path.join(process.env.NPM_PREFIX, "node_modules", "openclaw", "dist"),
    "/usr/local/lib/node_modules/openclaw/dist",
    "/usr/lib/node_modules/openclaw/dist",
  ];
  return candidates.filter((p): p is string => typeof p === "string" && p.length > 0);
}

export async function loadGatewayCaller(): Promise<GatewayCall> {
  // MODIFIED: openclaw bundles `call-*.js` with content-hashed names that change between versions —
  // resolve dynamically rather than hardcoding the hash, and fail with a clear message if not found.
  for (const dir of getOpenClawDistDirs()) {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    const callFile = entries.find((name) => /^call-[\w-]+\.js$/.test(name));
    if (!callFile) continue;
    const moduleUrl = pathToFileURL(path.join(dir, callFile)).href;
    const mod = (await import(moduleUrl)) as { callGateway?: GatewayCall };
    if (typeof mod.callGateway !== "function") continue;
    return mod.callGateway;
  }
  throw new Error("openclaw gateway caller (call-*.js) not found in any known npm prefix");
}
