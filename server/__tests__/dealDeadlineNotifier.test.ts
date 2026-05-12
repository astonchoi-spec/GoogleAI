import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const mocks = vi.hoisted(() => ({
  listDeals: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("../deals/dealStore.ts", () => ({ listDeals: mocks.listDeals }));

let tmpCwd: string;
let originalCwd: string;

import {
  collectPendingNotifies,
  formatNotifyMessage,
  runDealDeadlineCheck,
} from "../deals/dealDeadlineNotifier.ts";

function makeDeal(overrides: Record<string, unknown>) {
  return {
    id: "d1",
    name: "한남동644",
    status: "active",
    drivePath: "/x",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    tags: [],
    fileCount: { contract: 0, feasibility: 0, legal: 0, market: 0, disclosure: 0, misc: 0 },
    recentFiles: [],
    ...overrides,
  };
}

function isoDaysFromNow(now: Date, days: number): string {
  const d = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  // KST 자정 정렬을 위해 UTC 15:00 (= KST 다음날 00:00) 사용은 불필요. dateParser는 ISO만 보면 됨.
  return d.toISOString().slice(0, 10) + "T00:00:00.000Z";
}

beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetchMock);
  mocks.fetchMock.mockResolvedValue({ ok: true });

  // 임시 cwd로 격리 (data/deal-deadline-notify.json 분리)
  originalCwd = process.cwd();
  tmpCwd = await fs.mkdtemp(path.join(os.tmpdir(), "deal-notify-"));
  process.chdir(tmpCwd);

  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  delete process.env.OWNER_TELEGRAM_CHAT_ID;
});

afterEach(async () => {
  process.chdir(originalCwd);
  try {
    await fs.rm(tmpCwd, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

import { afterEach } from "vitest";

describe("collectPendingNotifies", () => {
  it("D-7 / D-3 / D-1 / D-DAY / D+1 임계치만 수집", async () => {
    const now = new Date("2026-05-08T03:00:00.000Z"); // KST 12:00
    mocks.listDeals.mockResolvedValue({
      all: [
        makeDeal({ name: "딜A", deadline: isoDaysFromNow(now, 7) }),  // D-7 ✅
        makeDeal({ name: "딜B", deadline: isoDaysFromNow(now, 5) }),  // D-5 ❌
        makeDeal({ name: "딜C", deadline: isoDaysFromNow(now, 3) }),  // D-3 ✅
        makeDeal({ name: "딜D", deadline: isoDaysFromNow(now, 1) }),  // D-1 ✅
        makeDeal({ name: "딜E", deadline: isoDaysFromNow(now, 0) }),  // D-DAY ✅
        makeDeal({ name: "딜F", deadline: isoDaysFromNow(now, -1) }), // D+1 ✅
        makeDeal({ name: "딜G", deadline: isoDaysFromNow(now, -3) }), // D+3 ❌ (지난건 안 보냄)
      ],
    });
    const events = await collectPendingNotifies(now);
    const names = events.map((e) => e.dealName).sort();
    expect(names).toEqual(["딜A", "딜C", "딜D", "딜E", "딜F"]);
  });

  it("completed/rejected 딜은 제외", async () => {
    const now = new Date("2026-05-08T03:00:00.000Z");
    mocks.listDeals.mockResolvedValue({
      all: [
        makeDeal({ name: "딜A", status: "completed", deadline: isoDaysFromNow(now, 3) }),
        makeDeal({ name: "딜B", status: "rejected", deadline: isoDaysFromNow(now, 7) }),
        makeDeal({ name: "딜C", status: "active", deadline: isoDaysFromNow(now, 3) }),
      ],
    });
    const events = await collectPendingNotifies(now);
    expect(events.map((e) => e.dealName)).toEqual(["딜C"]);
  });

  it("이정표 D-3 + 미완료만 수집", async () => {
    const now = new Date("2026-05-08T03:00:00.000Z");
    mocks.listDeals.mockResolvedValue({
      all: [
        makeDeal({
          name: "딜A",
          milestones: [
            { id: "m1", label: "인허가 신청", date: isoDaysFromNow(now, 3), done: false },
            { id: "m2", label: "완료된거", date: isoDaysFromNow(now, 7), done: true },
            { id: "m3", label: "임박외", date: isoDaysFromNow(now, 5), done: false },
          ],
        }),
      ],
    });
    const events = await collectPendingNotifies(now);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("milestone");
    expect(events[0].label).toBe("인허가 신청");
  });
});

describe("formatNotifyMessage", () => {
  it("D-day 가까운 순으로 정렬", () => {
    const text = formatNotifyMessage([
      {
        dealName: "딜A", status: "active", kind: "deadline", label: "마감",
        date: "2026-05-15T00:00:00.000Z", days: 7, dedupKey: "딜A:deadline:D-7",
      },
      {
        dealName: "딜B", status: "active", kind: "milestone", label: "신청",
        date: "2026-05-09T00:00:00.000Z", days: 1, dedupKey: "딜B:milestone:m1:D-1",
      },
      {
        dealName: "딜C", status: "active", kind: "deadline", label: "마감",
        date: "2026-05-08T00:00:00.000Z", days: 0, dedupKey: "딜C:deadline:D-DAY",
      },
    ]);
    const idxC = text.indexOf("딜C");
    const idxB = text.indexOf("딜B");
    const idxA = text.indexOf("딜A");
    expect(idxC).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxA);
    expect(text).toContain("D-DAY");
    expect(text).toContain("D-7");
  });

  it("빈 배열은 빈 문자열", () => {
    expect(formatNotifyMessage([])).toBe("");
  });
});

describe("runDealDeadlineCheck dedup", () => {
  it("같은 dedupKey는 같은 날 두 번째 호출 시 발송 안 함", async () => {
    const now = new Date("2026-05-08T03:00:00.000Z");
    mocks.listDeals.mockResolvedValue({
      all: [makeDeal({ name: "딜A", deadline: isoDaysFromNow(now, 3) })],
    });
    process.env.TELEGRAM_BOT_TOKEN = "tok";
    process.env.OWNER_TELEGRAM_CHAT_ID = "cid";

    const r1 = await runDealDeadlineCheck({ now, deliver: true });
    expect(r1.sent).toBe(true);
    expect(r1.events).toHaveLength(1);
    expect(mocks.fetchMock).toHaveBeenCalledTimes(1);

    const r2 = await runDealDeadlineCheck({ now, deliver: true });
    expect(r2.sent).toBe(false);
    expect(r2.events).toHaveLength(0);
    expect(mocks.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("token/chat 없으면 sent=true이지만 fetch 호출 안 함 (warning만)", async () => {
    const now = new Date("2026-05-08T03:00:00.000Z");
    mocks.listDeals.mockResolvedValue({
      all: [makeDeal({ name: "딜A", deadline: isoDaysFromNow(now, 3) })],
    });

    const r = await runDealDeadlineCheck({ now, deliver: true });
    expect(r.events).toHaveLength(1);
    expect(mocks.fetchMock).not.toHaveBeenCalled();
  });
});
