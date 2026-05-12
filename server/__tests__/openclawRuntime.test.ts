import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inspectOpenClawConfigFiles, loadOpenClawLocalConfig, resolveAstonGeminiKey } from "../agents/openclawRuntime.ts";

const ORIG_ENV = {
  USERPROFILE: process.env.USERPROFILE,
  HOMEDRIVE: process.env.HOMEDRIVE,
  HOMEPATH: process.env.HOMEPATH,
  OPENCLAW_API_KEY: process.env.OPENCLAW_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
};

let tempRoot = "";

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-runtime-"));
  process.env.USERPROFILE = tempRoot;
  process.env.HOMEDRIVE = "";
  process.env.HOMEPATH = "";
  delete process.env.OPENCLAW_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
  for (const [key, value] of Object.entries(ORIG_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("openclawRuntime", () => {
  it("detects config file existence and extracts model hint without leaking tokens", async () => {
    const configDir = path.join(tempRoot, ".openclaw");
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, "openclaw.json"),
      JSON.stringify({
        gateway: { auth: { token: "very-secret-token" } },
        agents: { defaults: { model: { primary: "google/gemini-2.5-pro" } } },
      }),
      "utf-8",
    );

    const statuses = await inspectOpenClawConfigFiles();
    const existing = statuses.find((entry) => entry.exists);
    expect(existing?.modelHint).toBe("google/gemini");
    expect(JSON.stringify(statuses)).not.toContain("very-secret-token");
  });

  it("prefers GEMINI_API_KEY and falls back to GOOGLE_API_KEY", () => {
    process.env.GEMINI_API_KEY = "gemini-key";
    expect(resolveAstonGeminiKey()).toEqual({ value: "gemini-key", source: "gemini_api_key" });
    delete process.env.GEMINI_API_KEY;
    process.env.GOOGLE_API_KEY = "google-key";
    expect(resolveAstonGeminiKey()).toEqual({ value: "google-key", source: "google_api_key" });
  });

  it("loads gateway token and model hint from local config", async () => {
    const configDir = path.join(tempRoot, ".openclaw");
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, "config.json"),
      JSON.stringify({
        gateway: { auth: { token: "gateway-token" } },
        agents: { defaults: { model: { primary: "gemini-2.5-flash" } } },
      }),
      "utf-8",
    );
    process.env.GEMINI_API_KEY = "gemini-key";
    const config = await loadOpenClawLocalConfig();
    expect(config.apiKey).toBe("gateway-token");
    expect(config.authSource).toBe("openclaw-config");
    expect(config.geminiApiKey).toBe("gemini-key");
    expect(config.modelHint).toBe("gemini");
  });
});
