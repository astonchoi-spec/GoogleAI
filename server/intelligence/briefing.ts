import cron from "node-cron";
import {
  collectDartDigest,
  collectMarketSnapshot,
  collectRiskGuardSnapshot,
  collectWikiDigest,
  saveBriefingArchive,
  type DartDigest,
  type MarketSnapshot,
  type RiskGuardSnapshot,
  type WikiDigest,
} from "../_core/briefingSources.ts";

const TELEGRAM_MESSAGE_LIMIT = 4096;
const FOOTER = "더보기는 웹 대시보드에서 확인할 수 있습니다.";

let schedulerRegistered = false;

export type MorningBriefingData = {
  dateKey: string;
  market: MarketSnapshot;
  dart: DartDigest;
  wiki: WikiDigest;
  risk: RiskGuardSnapshot;
};

export type MorningBriefingRunResult = {
  data: MorningBriefingData;
  text: string;
  archivePath: string | null;
};

export function isBriefingTestMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return (
    normalized === "브리핑" ||
    /^브리핑\s*테스트$/.test(normalized) ||
    /^모닝\s*브리핑(?:\s*테스트)?$/.test(normalized) ||
    /^아침\s*브리핑(?:\s*테스트)?$/.test(normalized) ||
    normalized === "morning briefing" ||
    normalized === "briefing test"
  );
}

function toKstDateKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function formatMoney(value: number | null): string {
  if (value === null) return "N/A";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatPercent(value: number | null, digits = 2): string {
  if (value === null) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function formatNumber(value: number | null, digits = 1): string {
  if (value === null) return "N/A";
  return value.toFixed(digits);
}

function formatMarketSection(market: MarketSnapshot): string[] {
  const lines = [
    "## 📈 시장 현황",
    `- BTC 현재가: ${formatMoney(market.currentPrice)}`,
    `- 24h 변동률: ${formatPercent(market.priceChangePercent)}`,
    `- RSI(1h / 4h): ${formatNumber(market.rsi1h)} / ${formatNumber(market.rsi4h)}`,
    `- 펀딩비: ${formatPercent(market.fundingRatePercent, 3)}`,
    `- 김치 프리미엄: ${formatPercent(market.kimchiPremiumPercent)}`,
    `- 24h 거래량: ${formatMoney(market.volume24h)}`,
  ];

  if (market.notes.length > 0) {
    lines.push(`- 메모: ${market.notes[0]}`);
  }

  return lines;
}

function formatDartSection(dart: DartDigest): string[] {
  const lines = ["## 🏢 DART 공시"];
  if (dart.items.length === 0) {
    lines.push("- 선별된 공시가 없습니다.");
    return lines;
  }

  dart.items.slice(0, 5).forEach((item, index) => {
    const keyword = item.matchedKeyword ? ` #${item.matchedKeyword}` : "";
    lines.push(`- ${index + 1}. ${item.corpName} / ${item.reportName}${keyword} (${item.reportDate})`);
  });

  return lines;
}

function isBriefingCategory(category: string): boolean {
  return category.toLowerCase() === "briefing";
}

function formatWikiSection(wiki: WikiDigest): string[] | null {
  const items = wiki.items
    .filter((item) => !item.categories.some(isBriefingCategory))
    .sort((a, b) => b.date.localeCompare(a.date));

  if (items.length === 0) {
    return null;
  }

  const lines = ["## 🗂️ 어제 저장된 위키 메모"];
  const renderedItems = items.slice(0, 5);

  for (const item of renderedItems) {
    const categoryTags = item.categories
      .filter((category) => !isBriefingCategory(category))
      .map((category) => `#${category}`)
      .join(" ");
    lines.push(`- ${item.title}${categoryTags ? ` ${categoryTags}` : ""}`);
  }

  if (items.length > renderedItems.length) {
    lines.push(`- 외 ${items.length - renderedItems.length}건`);
  }

  return lines;
}

function formatRiskSection(risk: RiskGuardSnapshot): string[] {
  const lines = [
    "## 🛡️ Risk Guard",
    `- 오늘 손익 한도: -${risk.dailyLossLimitPercent}%`,
    `- 오늘 손익: ${formatPercent(risk.dailyPnlPercent)}`,
    `- 연속 손절 카운트: ${risk.consecutiveLosses}`,
    `- 잠금 여부: ${risk.locked ? "잠금" : "해제"}`,
  ];

  if (risk.lockReason) {
    lines.push(`- 잠금 사유: ${risk.lockReason}`);
  }

  return lines;
}

function clampTelegramMessage(text: string): string {
  if (text.length <= TELEGRAM_MESSAGE_LIMIT) {
    return text;
  }

  const suffix = `\n\n${FOOTER}`;
  const limit = TELEGRAM_MESSAGE_LIMIT - suffix.length - 3;
  return `${text.slice(0, limit)}...\n\n${FOOTER}`;
}

export function formatMorningBriefing(data: MorningBriefingData): string {
  const sections: string[] = [];
  sections.push(`# 🌅 모닝 브리핑 (${data.dateKey})`);
  sections.push("━━━");
  sections.push(...formatMarketSection(data.market));
  sections.push("━━━");
  sections.push(...formatDartSection(data.dart));

  const wikiSection = formatWikiSection(data.wiki);
  if (wikiSection) {
    sections.push("━━━");
    sections.push(...wikiSection);
  }

  sections.push("━━━");
  sections.push(...formatRiskSection(data.risk));
  sections.push("━━━");
  sections.push(FOOTER);

  return clampTelegramMessage(sections.join("\n"));
}

export async function buildMorningBriefingData(now: Date = new Date()): Promise<MorningBriefingData> {
  const [market, dart, wiki, risk] = await Promise.all([
    collectMarketSnapshot(),
    collectDartDigest(now),
    collectWikiDigest(now),
    collectRiskGuardSnapshot(),
  ]);

  return {
    dateKey: toKstDateKey(now),
    market,
    dart,
    wiki,
    risk,
  };
}

async function sendTelegramBriefing(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("[briefing] Telegram token or chat id is missing. Skipping send.");
    return;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[briefing] Telegram send failed:", response.status, response.statusText, detail);
    }
  } catch (error) {
    console.error("[briefing] Telegram send error:", error);
  }
}

export async function executeMorningBriefing(
  options: {
    now?: Date;
    trigger?: "cron" | "manual";
    deliver?: boolean;
  } = {}
): Promise<MorningBriefingRunResult> {
  const now = options.now ?? new Date();
  const trigger = options.trigger ?? "cron";
  const deliver = options.deliver ?? true;

  const data = await buildMorningBriefingData(now);
  const text = formatMorningBriefing(data);
  const archivePath = await saveBriefingArchive({
    dateKey: data.dateKey,
    text,
    trigger,
  });

  if (deliver) {
    await sendTelegramBriefing(text);
  }

  return { data, text, archivePath };
}

export function registerMorningBriefingScheduler(): void {
  if (schedulerRegistered) {
    return;
  }

  schedulerRegistered = true;
  cron.schedule(
    "0 7 * * *",
    () => {
      void executeMorningBriefing({ trigger: "cron", deliver: true }).catch((error) => {
        console.error("[briefing] scheduled run failed:", error);
      });
    },
    {
      timezone: "Asia/Seoul",
    }
  );

  console.log("[briefing] Morning briefing scheduler registered for 07:00 KST");
}
