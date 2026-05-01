import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => void>();
  const watcher: any = {
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      handlers.set(event, handler);
      return watcher;
    }),
    close: vi.fn(async () => {}),
  };
  return {
    handlers,
    watcher,
    watch: vi.fn(() => watcher),
  };
});

vi.mock("chokidar", () => ({
  default: { watch: mocks.watch },
  watch: mocks.watch,
}));

describe("folderWatcher", () => {
  afterEach(async () => {
    const { stopKakaoFolderWatcher } = await import("../deals/folderWatcher.ts");
    await stopKakaoFolderWatcher();
    mocks.handlers.clear();
    mocks.watch.mockClear();
    mocks.watcher.on.mockClear();
    mocks.watcher.close.mockClear();
  });

  it("warns and stays disabled when folder does not exist", async () => {
    const { startKakaoFolderWatcher } = await import("../deals/folderWatcher.ts");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const missing = path.join(os.tmpdir(), `missing-kakao-${Date.now()}`);

    const watcher = startKakaoFolderWatcher({ watchPath: missing });

    expect(watcher).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[kakao-watcher] disabled: folder not found"));
    warn.mockRestore();
  });

  it("uses awaitWriteFinish and forwards completed file add events", async () => {
    const { startKakaoFolderWatcher } = await import("../deals/folderWatcher.ts");
    const tmpDir = path.join(os.tmpdir(), `kakao-watch-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tmpDir, { recursive: true });
    const onFile = vi.fn(async () => {});

    startKakaoFolderWatcher({ watchPath: tmpDir, onFile });

    expect(mocks.watch).toHaveBeenCalledWith(
      tmpDir,
      expect.objectContaining({
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
      }),
    );
    mocks.handlers.get("add")?.(path.join(tmpDir, "자료.pdf"));
    await vi.waitFor(() => expect(onFile).toHaveBeenCalledWith(path.join(tmpDir, "자료.pdf")));
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
