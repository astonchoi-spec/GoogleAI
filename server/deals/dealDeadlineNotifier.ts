// D-3/D-7 딜 마감/이정표 임박 자동 텔레그램 푸시.
// 매일 KST 08:30에 active/reviewing/pending 딜의 deadline + milestones 점검.
// D-7, D-3, D-1, D-DAY, D+0(당일) 매칭 시 1회 발송 (data/deal-deadline-notify.json로 dedup).

import fs from "node:fs/promises";
import path from "node:path";
import cron from "node-cron";
import { listDeals } from "./dealStore.ts";
import { calcDday } from "./dateParser.ts";
import { DEAL_STATUS_LABELS } from "./dealTypes.ts";

function stateFilePath(): string {
  return path.join(process.cwd(), "data", "deal-deadline-notify.json");
}
const NOTIFY_THRESHOLDS = [7, 3, 1, 0]; // D-7, D-3, D-1, D-DAY
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

let schedulerRegistered = false;

type NotifyState = {
  // dateKey(YYYY-MM-DD) → list of dedup keys notified that day
  [dateKey: string]: string[];
};

function todayKstKey(now: Date = new Date()): string {
  const k = new Date(now.getTime() + KST_OFFSET_MS);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`;
}

async function loadState(): Promise<NotifyState> {
  try {
    const raw = await fs.readFile(stateFilePath(), "utf-8");
    return JSON.parse(raw) as NotifyState;
  } catch {
    return {};
  }
}

async function saveState(state: NotifyState): Promise<void> {
  // 7일 이상 지난 날짜 키 정리
  const today = todayKstKey();
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + KST_OFFSET_MS);
  const cutoffKey = `${cutoff.getUTCFullYear()}-${String(cutoff.getUTCMonth() + 1).padStart(2, "0")}-${String(cutoff.getUTCDate()).padStart(2, "0")}`;
  const pruned: NotifyState = {};
  for (const [k, v] of Object.entries(state)) {
    if (k >= cutoffKey || k === today) pruned[k] = v;
  }
  const file = stateFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(pruned, null, 2), "utf-8");
}

function ddayLabel(days: number): string {
  if (days > 0) return `D-${days}`;
  if (days === 0) return "D-DAY";
  return `D+${Math.abs(days)}`;
}

function shouldNotify(days: number): boolean {
  // 미래 임계치 매칭 + 당일 + 1일 지연(D+1)까지만 (지난 일정은 푸시 X)
  return NOTIFY_THRESHOLDS.includes(days) || days === -1;
}

async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("[dealDeadlineNotifier] TELEGRAM_BOT_TOKEN 또는 chat id 없음 — 푸시 생략");
    return;
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[dealDeadlineNotifier] Telegram send failed:", response.status, detail);
    }
  } catch (error) {
    console.error("[dealDeadlineNotifier] Telegram send error:", error);
  }
}

export type NotifyEvent = {
  dealName: string;
  status: string;
  kind: "deadline" | "milestone";
  label: string;
  date: string;
  days: number;
  dedupKey: string;
};

export async function collectPendingNotifies(now: Date = new Date()): Promise<NotifyEvent[]> {
  const { all } = await listDeals();
  const events: NotifyEvent[] = [];
  for (const deal of all) {
    if (["completed", "rejected"].includes(deal.status)) continue;
    if (deal.deadline) {
      const days = calcDday(deal.deadline, now);
      if (shouldNotify(days)) {
        events.push({
          dealName: deal.name,
          status: deal.status,
          kind: "deadline",
          label: deal.deadlineLabel || "마감",
          date: deal.deadline,
          days,
          dedupKey: `${deal.name}:deadline:${ddayLabel(days)}`,
        });
      }
    }
    for (const ms of deal.milestones ?? []) {
      if (ms.done) continue;
      const days = calcDday(ms.date, now);
      if (shouldNotify(days)) {
        events.push({
          dealName: deal.name,
          status: deal.status,
          kind: "milestone",
          label: ms.label,
          date: ms.date,
          days,
          dedupKey: `${deal.name}:milestone:${ms.id}:${ddayLabel(days)}`,
        });
      }
    }
  }
  return events;
}

export function formatNotifyMessage(events: NotifyEvent[]): string {
  if (events.length === 0) return "";
  const lines = ["🔔 PF 딜 임박 알림"];
  // D-day 가까운 순 정렬
  events.sort((a, b) => a.days - b.days);
  for (const ev of events) {
    const tag = ev.kind === "deadline" ? "📅 마감" : "📍 이정표";
    const statusLabel = DEAL_STATUS_LABELS[ev.status as keyof typeof DEAL_STATUS_LABELS] || ev.status;
    lines.push(
      `\n${tag} ${ddayLabel(ev.days)} | ${ev.dealName} (${statusLabel})\n  • ${ev.label} — ${ev.date.slice(0, 10)}`,
    );
  }
  return lines.join("\n");
}

export async function runDealDeadlineCheck(
  options: { now?: Date; deliver?: boolean } = {},
): Promise<{ events: NotifyEvent[]; text: string; sent: boolean }> {
  const now = options.now ?? new Date();
  const deliver = options.deliver ?? true;
  const events = await collectPendingNotifies(now);
  if (events.length === 0) return { events: [], text: "", sent: false };

  const state = await loadState();
  const today = todayKstKey(now);
  const sentToday = new Set(state[today] ?? []);
  const fresh = events.filter((ev) => !sentToday.has(ev.dedupKey));
  if (fresh.length === 0) return { events: [], text: "", sent: false };

  const text = formatNotifyMessage(fresh);
  if (deliver) {
    await sendTelegram(text);
    state[today] = [...sentToday, ...fresh.map((ev) => ev.dedupKey)];
    await saveState(state);
  }
  return { events: fresh, text, sent: deliver };
}

export function registerDealDeadlineNotifier(): void {
  if (schedulerRegistered) return;
  if (process.env.DEAL_DEADLINE_NOTIFY_ENABLED === "false") return;
  schedulerRegistered = true;
  const hour = Number(process.env.DEAL_DEADLINE_NOTIFY_HOUR || "8");
  const minute = Number(process.env.DEAL_DEADLINE_NOTIFY_MINUTE || "30");
  cron.schedule(
    `${minute} ${hour} * * *`,
    () => {
      void runDealDeadlineCheck({ deliver: true }).catch((error) => {
        console.error("[dealDeadlineNotifier] scheduled run failed:", error);
      });
    },
    { timezone: "Asia/Seoul" },
  );
  console.log(
    `[dealDeadlineNotifier] Scheduler registered for ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} KST`,
  );
}
