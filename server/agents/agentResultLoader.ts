import fs from "node:fs/promises";
import path from "node:path";
import { AGENT_TEMPLATES } from "./agentTemplates.ts";

export type LoadedAgentResult = {
  date: string;
  templateId: string;
  templateLabel: string;
  taskId: string;
  target: string;
  preview: string;
  metrics: string;
  wikiPath: string;
  simulation: boolean;
};

const TEMPLATE_LABELS = new Map(AGENT_TEMPLATES.map((template) => [template.id, template.label]));

export function getAgentResultsDateKey(now: Date = new Date()): string {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(yesterday);
}

export function parseAgentResultFileName(fileName: string): { date: string; templateId: string; taskId: string } | null {
  const prefix = fileName.slice(0, 11);
  if (!/^\d{4}-\d{2}-\d{2}-$/.test(prefix) || !fileName.endsWith(".md")) return null;
  const rest = fileName.slice(11, -3);
  for (const template of AGENT_TEMPLATES) {
    const marker = `${template.id}-`;
    if (rest.startsWith(marker)) {
      const taskId = rest.slice(marker.length);
      return taskId ? { date: prefix.slice(0, 10), templateId: template.id, taskId } : null;
    }
  }
  const fallback = rest.match(/^(.+)-([A-Za-z0-9_-]+)$/);
  return fallback ? { date: prefix.slice(0, 10), templateId: fallback[1], taskId: fallback[2] } : null;
}

export async function loadAgentResultsForDate(dateISO = getAgentResultsDateKey()): Promise<LoadedAgentResult[]> {
  const root = process.env.AGENT_WIKI_PATH?.trim();
  if (!root) return [];
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    const results = await Promise.all(files.map((fileName) => loadOne(root, fileName, dateISO)));
    return results.filter((item): item is LoadedAgentResult => Boolean(item)).sort((a, b) => b.taskId.localeCompare(a.taskId));
  } catch (error) {
    if (isNotFoundError(error)) return [];
    console.error("[agentResultLoader] wiki scan error:", error);
    return [];
  }
}

async function loadOne(root: string, fileName: string, dateISO: string): Promise<LoadedAgentResult | null> {
  const parsed = parseAgentResultFileName(fileName);
  if (!parsed || parsed.date !== dateISO) return null;
  const wikiPath = path.join(root, fileName);
  try {
    const content = await fs.readFile(wikiPath, "utf-8");
    const title = content.match(/^#\s+(.+)$/m)?.[1] ?? "";
    const target = parseTarget(title);
    const metrics = extractSection(content, "핵심 지표");
    const preview = compact(metrics || content).slice(0, 200);
    return {
      date: parsed.date,
      templateId: parsed.templateId,
      templateLabel: TEMPLATE_LABELS.get(parsed.templateId) ?? parsed.templateId,
      taskId: parsed.taskId,
      target,
      preview,
      metrics,
      wikiPath,
      simulation: /시뮬레이션|OpenClaw 호출 실패/.test(content),
    };
  } catch (error) {
    console.error("[agentResultLoader] file read error:", error);
    return null;
  }
}

function parseTarget(title: string): string {
  const parts = title.split("—");
  return (parts[1] ?? title).trim();
}

function extractSection(content: string, heading: string): string {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) return "";
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    body.push(line);
  }
  return compact(body.join("\n"));
}

function compact(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/>\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}
