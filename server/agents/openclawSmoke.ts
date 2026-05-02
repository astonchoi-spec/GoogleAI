import fs from "node:fs/promises";
import path from "node:path";

export type OpenClawSmokeResult = {
  checkedAt: string;
  available: boolean;
  url: string | null;
  modelHint: string | null;
  responsePreview: {
    arithmetic: string | null;
    domain: string | null;
  };
  errorReason: string | null;
  status: "passed" | "failed" | "skipped";
};

export function getOpenClawSmokePath(): string {
  return path.resolve(process.cwd(), "data", "openclaw-smoke.json");
}

export async function saveOpenClawSmoke(result: OpenClawSmokeResult): Promise<void> {
  const target = getOpenClawSmokePath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(result, null, 2)}\n`, "utf-8");
}

export async function loadOpenClawSmoke(): Promise<OpenClawSmokeResult | null> {
  try {
    const raw = await fs.readFile(getOpenClawSmokePath(), "utf-8");
    return JSON.parse(raw) as OpenClawSmokeResult;
  } catch {
    return null;
  }
}
