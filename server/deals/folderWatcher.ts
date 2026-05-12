import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { handleNewFile } from "./kakaoFileHandler.ts";

let activeWatcher: FSWatcher | null = null;

function defaultKakaoPath(): string {
  const profile = process.env.USERPROFILE || os.homedir();
  return path.join(profile, "Documents", "카카오톡 받은 파일");
}

function normalizePath(value: string): string {
  return path.resolve(value).toLowerCase();
}

function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!!rel && !rel.startsWith("..") && !path.isAbsolute(rel));
}

export function resolveKakaoDownloadPath(raw = process.env.KAKAO_DOWNLOAD_PATH): string | null {
  if (raw !== undefined) {
    const trimmed = raw.trim();
    return trimmed ? path.resolve(trimmed) : null;
  }
  return path.resolve(defaultKakaoPath());
}

export type StartKakaoWatcherOptions = {
  watchPath?: string | null;
  onFile?: (filePath: string) => Promise<unknown>;
};

export function startKakaoFolderWatcher(options: StartKakaoWatcherOptions = {}): FSWatcher | null {
  const target = options.watchPath === undefined ? resolveKakaoDownloadPath() : options.watchPath;
  if (!target) {
    console.warn("[kakao-watcher] disabled: KAKAO_DOWNLOAD_PATH is empty.");
    return null;
  }
  if (!fs.existsSync(target)) {
    console.warn(`[kakao-watcher] disabled: folder not found: ${target}`);
    return null;
  }
  if (activeWatcher) {
    return activeWatcher;
  }

  const dealsRoot = process.env.DEALS_ROOT ? normalizePath(process.env.DEALS_ROOT) : null;
  const ignored = (candidate: string): boolean => {
    const normalized = normalizePath(candidate);
    if (dealsRoot && isInside(dealsRoot, normalized)) return true;
    return /\.(tmp|crdownload|part)$/i.test(candidate);
  };

  activeWatcher = chokidar.watch(target, {
    ignoreInitial: true,
    ignored,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
  });

  const onFile = options.onFile ?? handleNewFile;
  activeWatcher.on("add", (filePath) => {
    void onFile(filePath).catch((err) => {
      console.error("[kakao-watcher] handle add:", err);
    });
  });
  activeWatcher.on("error", (err) => {
    console.error("[kakao-watcher] error:", err);
  });
  console.log(`[kakao-watcher] watching: ${target}`);
  return activeWatcher;
}

export async function stopKakaoFolderWatcher(): Promise<void> {
  if (!activeWatcher) return;
  const watcher = activeWatcher;
  activeWatcher = null;
  try {
    await watcher.close();
    console.log("[kakao-watcher] stopped");
  } catch (err) {
    console.error("[kakao-watcher] stop:", err);
  }
}
