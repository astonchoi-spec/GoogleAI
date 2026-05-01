import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { classifyAndSaveFile, shouldIgnoreFile } from "./fileClassifier.ts";

let activeWatcher: FSWatcher | null = null;

function defaultDownloadPath(): string {
  const profile = process.env.USERPROFILE || os.homedir();
  return path.join(profile, "Downloads");
}

function normalizePath(value: string): string {
  return path.resolve(value).toLowerCase();
}

function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!!rel && !rel.startsWith("..") && !path.isAbsolute(rel));
}

export function resolveDownloadWatchPath(raw = process.env.DOWNLOAD_WATCH_PATH): string | null {
  if (raw !== undefined) {
    const trimmed = raw.trim();
    return trimmed ? path.resolve(trimmed) : null;
  }
  return path.resolve(defaultDownloadPath());
}

export type StartDownloadWatcherOptions = {
  watchPath?: string | null;
  onFile?: (filePath: string) => Promise<unknown>;
};

export async function handleDownloadedFile(filePath: string): Promise<unknown> {
  const fileName = path.basename(filePath);
  const stat = await fs.promises.stat(filePath);
  const reason = shouldIgnoreFile("download", fileName, { sizeBytes: stat.size });
  if (reason) {
    console.log(`[download-watcher] ignored: ${fileName} (${reason})`);
    return { status: "ignored", fileName, reason };
  }
  return classifyAndSaveFile({
    source: "download",
    filepath: filePath,
    originalName: fileName,
    metadata: { sizeBytes: stat.size },
  });
}

export function startDownloadWatcher(options: StartDownloadWatcherOptions = {}): FSWatcher | null {
  const target = options.watchPath === undefined ? resolveDownloadWatchPath() : options.watchPath;
  if (!target) {
    console.warn("[download-watcher] disabled: DOWNLOAD_WATCH_PATH is empty.");
    return null;
  }
  if (!fs.existsSync(target)) {
    console.warn(`[download-watcher] disabled: folder not found: ${target}`);
    return null;
  }
  if (activeWatcher) return activeWatcher;

  const dealsRoot = process.env.DEALS_ROOT ? normalizePath(process.env.DEALS_ROOT) : null;
  const normalizedTarget = normalizePath(target);
  if (dealsRoot && (isInside(dealsRoot, normalizedTarget) || isInside(normalizedTarget, dealsRoot))) {
    console.warn("[download-watcher] disabled: DOWNLOAD_WATCH_PATH overlaps DEALS_ROOT.");
    return null;
  }

  activeWatcher = chokidar.watch(target, {
    ignoreInitial: true,
    ignored: (candidate) => shouldIgnoreFile("download", path.basename(candidate)) !== null,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
  });

  const onFile = options.onFile ?? handleDownloadedFile;
  activeWatcher.on("add", (filePath) => {
    void onFile(filePath).catch((err) => console.error("[download-watcher] handle add:", err));
  });
  activeWatcher.on("error", (err) => console.error("[download-watcher] error:", err));
  console.log(`[download-watcher] watching: ${target}`);
  return activeWatcher;
}

export async function stopDownloadWatcher(): Promise<void> {
  if (!activeWatcher) return;
  const watcher = activeWatcher;
  activeWatcher = null;
  try {
    await watcher.close();
    console.log("[download-watcher] stopped");
  } catch (err) {
    console.error("[download-watcher] stop:", err);
  }
}
