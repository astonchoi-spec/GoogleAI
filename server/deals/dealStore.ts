import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import {
  DEAL_CATEGORIES,
  DEAL_CATEGORY_DIRS,
  DEAL_STATUSES,
  type DealCategory,
  type DealFileCount,
  type DealListResult,
  type DealMatch,
  type DealMeta,
  type Milestone,
} from "./dealTypes.ts";
import { normalizeDealName, sanitizeFileName } from "./dealFileRouter.ts";

const META_FILE = "_deal.json";

function nowIso(): string {
  return new Date().toISOString();
}

function emptyFileCount(): DealFileCount {
  return {
    contract: 0,
    feasibility: 0,
    legal: 0,
    market: 0,
    disclosure: 0,
    misc: 0,
  };
}

function dealPath(dealName: string): string {
  return path.join(getDealsRoot(), normalizeDealName(dealName));
}

function metaPath(dealName: string): string {
  return path.join(dealPath(dealName), META_FILE);
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export function getDealsRoot(): string {
  const root = process.env.DEALS_ROOT?.trim();
  if (!root) {
    throw new Error("DEALS_ROOT 환경변수가 설정되지 않았습니다. .env에 DEALS_ROOT 경로를 추가해주세요.");
  }
  return root;
}

export async function ensureDealFolder(dealName: string): Promise<string> {
  const normalized = normalizeDealName(dealName);
  if (!normalized) throw new Error("딜명이 비어 있습니다.");
  const root = getDealsRoot();
  const base = path.join(root, normalized);
  try {
    await fs.mkdir(base, { recursive: true });
    await Promise.all(DEAL_CATEGORIES.map((category) => fs.mkdir(path.join(base, DEAL_CATEGORY_DIRS[category]), { recursive: true })));
    return base;
  } catch (err) {
    console.error("[dealStore] ensureDealFolder:", err);
    throw new Error("딜 폴더를 생성하지 못했습니다.");
  }
}

export async function countDealFiles(dealName: string): Promise<DealFileCount> {
  const counts = emptyFileCount();
  const base = dealPath(dealName);
  for (const category of DEAL_CATEGORIES) {
    try {
      const entries = await fs.readdir(path.join(base, DEAL_CATEGORY_DIRS[category]), { withFileTypes: true });
      counts[category] = entries.filter((entry) => entry.isFile()).length;
    } catch (err) {
      console.error("[dealStore] countDealFiles:", err);
      counts[category] = 0;
    }
  }
  return counts;
}

async function readMeta(dealName: string): Promise<DealMeta> {
  const raw = await fs.readFile(metaPath(dealName), "utf-8");
  return JSON.parse(raw) as DealMeta;
}

async function writeMeta(meta: DealMeta): Promise<DealMeta> {
  await fs.writeFile(path.join(meta.drivePath, META_FILE), `${JSON.stringify(meta, null, 2)}\n`, "utf-8");
  return meta;
}

export async function createDeal(dealName: string): Promise<DealMeta> {
  const normalized = normalizeDealName(dealName);
  const folder = await ensureDealFolder(normalized);
  const existingMeta = path.join(folder, META_FILE);
  if (await pathExists(existingMeta)) {
    return getDeal(normalized);
  }
  const createdAt = nowIso();
  const meta: DealMeta = {
    id: normalized.toLowerCase().replace(/\s+/g, "-"),
    name: normalized,
    status: "reviewing",
    drivePath: folder,
    createdAt,
    updatedAt: createdAt,
    tags: [],
    fileCount: emptyFileCount(),
    recentFiles: [],
  };
  try {
    return await writeMeta(meta);
  } catch (err) {
    console.error("[dealStore] createDeal:", err);
    throw new Error("딜 메타 정보를 생성하지 못했습니다.");
  }
}

export async function getDeal(dealName: string): Promise<DealMeta> {
  try {
    const meta = await readMeta(dealName);
    const fileCount = await countDealFiles(meta.name);
    const updated = { ...meta, fileCount, drivePath: dealPath(meta.name) };
    await writeMeta(updated);
    return updated;
  } catch (err) {
    console.error("[dealStore] getDeal:", err);
    throw new Error("딜 정보를 찾지 못했습니다.");
  }
}

export async function listDeals(): Promise<DealListResult> {
  try {
    const root = getDealsRoot();
    await fs.mkdir(root, { recursive: true });
    const entries = await fs.readdir(root, { withFileTypes: true });
    const deals: DealMeta[] = [];
    for (const entry of entries.filter((item) => item.isDirectory())) {
      const metaFile = path.join(root, entry.name, META_FILE);
      if (!(await pathExists(metaFile))) continue;
      try {
        deals.push(await getDeal(entry.name));
      } catch (err) {
        console.error("[dealStore] listDeals read:", err);
      }
    }
    deals.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const grouped = DEAL_STATUSES.reduce((acc, status) => {
      acc[status] = deals.filter((deal) => deal.status === status);
      return acc;
    }, {} as DealListResult["grouped"]);
    return { all: deals, grouped };
  } catch (err) {
    console.error("[dealStore] listDeals:", err);
    throw new Error("딜 목록을 불러오지 못했습니다.");
  }
}

export async function updateDealMeta(dealName: string, patch: Partial<Omit<DealMeta, "id" | "name" | "drivePath" | "createdAt">>): Promise<DealMeta> {
  try {
    const current = await getDeal(dealName);
    const updated: DealMeta = {
      ...current,
      ...patch,
      fileCount: patch.fileCount ?? current.fileCount,
      recentFiles: patch.recentFiles ?? current.recentFiles,
      updatedAt: nowIso(),
    };
    return await writeMeta(updated);
  } catch (err) {
    console.error("[dealStore] updateDealMeta:", err);
    throw new Error("딜 메타 정보를 갱신하지 못했습니다.");
  }
}

function formatTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}-${get("hour")}-${get("minute")}-${get("second")}`;
}

async function uniqueFilePath(dir: string, fileName: string): Promise<{ filePath: string; savedName: string }> {
  const parsed = path.parse(fileName);
  const base = parsed.name.slice(0, 200 - parsed.ext.length);
  let candidate = `${base}${parsed.ext}`;
  let target = path.join(dir, candidate);
  let suffix = 2;
  while (await pathExists(target)) {
    const suffixText = `-${suffix}`;
    candidate = `${base.slice(0, 200 - parsed.ext.length - suffixText.length)}${suffixText}${parsed.ext}`;
    target = path.join(dir, candidate);
    suffix += 1;
  }
  return { filePath: target, savedName: candidate };
}

export async function saveFile(dealName: string, category: DealCategory, fileName: string, buffer: Buffer, date: Date = new Date()): Promise<{ meta: DealMeta; savedName: string; filePath: string }> {
  try {
    const meta = await getDeal(dealName);
    const safeOriginal = sanitizeFileName(fileName);
    const savedBaseName = `${formatTimestamp(date)}-${safeOriginal}`;
    const categoryDir = path.join(meta.drivePath, DEAL_CATEGORY_DIRS[category]);
    await fs.mkdir(categoryDir, { recursive: true });
    const { filePath, savedName } = await uniqueFilePath(categoryDir, savedBaseName);
    await fs.writeFile(filePath, buffer);
    const fileCount = await countDealFiles(meta.name);
    const updated = await updateDealMeta(meta.name, {
      fileCount,
      recentFiles: [
        {
          originalName: safeOriginal,
          savedName,
          category,
          savedAt: nowIso(),
          path: filePath,
        },
        ...(meta.recentFiles ?? []),
      ].slice(0, 20),
    });
    return { meta: updated, savedName, filePath };
  } catch (err) {
    console.error("[dealStore] saveFile:", err);
    throw new Error("딜 자료를 저장하지 못했습니다.");
  }
}

export async function findDealByPartialName(partial: string): Promise<DealMatch> {
  const query = normalizeDealName(partial);
  const { all } = await listDeals();
  const exact = all.find((deal) => deal.name === query);
  if (exact) return { type: "exact", deal: exact };
  const compactQuery = query.replace(/\s+/g, "").toLowerCase();
  const candidates = all.filter((deal) => {
    const compactName = deal.name.replace(/\s+/g, "").toLowerCase();
    return compactName.includes(compactQuery) || compactQuery.split("").every((char) => compactName.includes(char));
  });
  if (candidates.length === 0) return { type: "none", query };
  if (candidates.length === 1) return { type: "single", deal: candidates[0] };
  return { type: "ambiguous", query, candidates };
}

export function toFileUrl(targetPath: string): string {
  return pathToFileURL(path.resolve(targetPath)).href;
}

export async function setDealDeadline(dealName: string, isoDate: string, label?: string): Promise<DealMeta> {
  const meta = await getDeal(dealName);
  const patch: Partial<DealMeta> = { deadline: isoDate };
  if (label !== undefined) patch.deadlineLabel = label.trim() || undefined;
  return updateDealMeta(meta.name, patch);
}

export async function clearDealDeadline(dealName: string): Promise<DealMeta> {
  const meta = await getDeal(dealName);
  return updateDealMeta(meta.name, { deadline: undefined, deadlineLabel: undefined });
}

export async function addMilestone(dealName: string, label: string, isoDate: string): Promise<{ meta: DealMeta; milestone: Milestone }> {
  const trimmed = label.trim();
  if (!trimmed) throw new Error("이정표 라벨이 비어 있습니다.");
  const meta = await getDeal(dealName);
  const milestone: Milestone = {
    id: randomBytes(4).toString("base64url"),
    label: trimmed,
    date: isoDate,
    done: false,
  };
  const milestones = [...(meta.milestones ?? []), milestone].sort((a, b) => a.date.localeCompare(b.date));
  const updated = await updateDealMeta(meta.name, { milestones });
  return { meta: updated, milestone };
}

function findMilestone(milestones: Milestone[], query: string): Milestone | null {
  const compact = query.replace(/\s+/g, "").toLowerCase();
  if (!compact) return null;
  const exact = milestones.find((m) => m.id === query);
  if (exact) return exact;
  const matches = milestones.filter((m) => m.label.replace(/\s+/g, "").toLowerCase().includes(compact));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const pending = matches.filter((m) => !m.done);
    if (pending.length === 1) return pending[0];
  }
  return null;
}

export async function completeMilestone(dealName: string, query: string): Promise<{ meta: DealMeta; milestone: Milestone }> {
  const meta = await getDeal(dealName);
  const list = meta.milestones ?? [];
  const target = findMilestone(list, query);
  if (!target) throw new Error("이정표를 찾지 못했습니다.");
  const completed: Milestone = { ...target, done: true, completedAt: nowIso() };
  const milestones = list.map((m) => (m.id === target.id ? completed : m));
  const updated = await updateDealMeta(meta.name, { milestones });
  return { meta: updated, milestone: completed };
}

export async function removeMilestone(dealName: string, query: string): Promise<{ meta: DealMeta; milestone: Milestone }> {
  const meta = await getDeal(dealName);
  const list = meta.milestones ?? [];
  const target = findMilestone(list, query);
  if (!target) throw new Error("이정표를 찾지 못했습니다.");
  const milestones = list.filter((m) => m.id !== target.id);
  const updated = await updateDealMeta(meta.name, { milestones });
  return { meta: updated, milestone: target };
}
