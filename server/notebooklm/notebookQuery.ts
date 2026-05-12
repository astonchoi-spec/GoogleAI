import path from "path";
import { loadMapping } from "./mappingLoader.ts";
import { CATEGORY_LABELS, type NotebookCategory, type NotebookEntry } from "./types.ts";

export type NbSubCommand =
  | { kind: "help" }
  | { kind: "list"; category?: NotebookCategory }
  | { kind: "show"; query: string }
  | { kind: "search"; keyword: string };

const CATEGORY_KO: Record<string, NotebookCategory> = {
  "부동산": "real-estate",
  "pf": "real-estate",
  "real-estate": "real-estate",
  "시스템": "system",
  "system": "system",
  "트레이딩": "trading",
  "trading": "trading",
  "학습": "learning",
  "ai": "learning",
  "learning": "learning",
  "법무": "legal",
  "legal": "legal",
  "개인": "personal",
  "personal": "personal",
  "리서치": "research",
  "research": "research",
  "매크로": "research",
  "회사": "business",
  "사업": "business",
  "business": "business",
  "건강": "health",
  "health": "health",
  "몽골": "mongolia",
  "mongolia": "mongolia",
};

export function parseNbCommand(message: string): NbSubCommand {
  const raw = message.trim();
  // "/nb" 단독 or "/nb help"
  if (/^\/nb(\s+(help|도움말))?$/i.test(raw)) return { kind: "help" };

  // "/nb list [카테고리]"
  const listMatch = raw.match(/^\/nb\s+list(?:\s+(.+))?$/i);
  if (listMatch) {
    const catRaw = listMatch[1]?.trim().toLowerCase();
    const category = catRaw ? CATEGORY_KO[catRaw] : undefined;
    return { kind: "list", category };
  }

  // "/nb show {id}"
  const showMatch = raw.match(/^\/nb\s+show\s+(.+)$/i);
  if (showMatch) return { kind: "show", query: showMatch[1].trim() };

  // "/nb search {keyword}"
  const searchMatch = raw.match(/^\/nb\s+search\s+(.+)$/i);
  if (searchMatch) return { kind: "search", keyword: searchMatch[1].trim() };

  // 인식 불가 → 도움말
  return { kind: "help" };
}

function wikiPath(nb: NotebookEntry): string {
  const wikiRoot = process.env.ASTON_WIKI_ROOT ?? "G:\\내 드라이브\\Aston-Wiki";
  return path.join(wikiRoot, "projects", nb.project, "notebooklm");
}

function formatEntry(nb: NotebookEntry, showDetail = false): string {
  const statusBadge = nb.status === "active" ? "🟢" : nb.status === "paused" ? "🟡" : "🔴";
  const base = `${statusBadge} *${nb.display_name}*\n   project: \`${nb.project}\``;
  if (!showDetail) return base;

  const lines = [
    `📓 *${nb.display_name}*`,
    `상태: ${statusBadge} ${nb.status}`,
    `카테고리: ${CATEGORY_LABELS[nb.category] ?? nb.category}`,
    `project: \`${nb.project}\``,
    `Wiki 경로: \`${wikiPath(nb)}\``,
  ];
  if (nb.notebook_name) lines.push(`노트북명: ${nb.notebook_name}`);
  if (nb.tags?.length) lines.push(`태그: ${nb.tags.join(", ")}`);
  if (nb.notes) lines.push(`메모: ${nb.notes}`);
  if (nb.created_at) lines.push(`생성일: ${nb.created_at}`);
  return lines.join("\n");
}

export function nbHelp(): string {
  const { notebooks } = loadMapping();
  const total = notebooks.length;
  const active = notebooks.filter((n) => n.status === "active").length;

  const catCounts: Partial<Record<NotebookCategory, number>> = {};
  for (const nb of notebooks) {
    catCounts[nb.category] = (catCounts[nb.category] ?? 0) + 1;
  }

  const catSummary = (Object.entries(catCounts) as [NotebookCategory, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([cat, cnt]) => `  • ${CATEGORY_LABELS[cat]}: ${cnt}개`)
    .join("\n");

  return [
    `📚 *NotebookLM 매핑* — 총 ${total}개 (활성 ${active}개)`,
    "",
    catSummary,
    "",
    "📌 사용법",
    "`/nb list` — 전체 목록",
    "`/nb list 부동산` — 카테고리 필터",
    "`/nb show hannam-644` — project ID로 상세",
    "`/nb search 한남` — 이름·태그 검색",
  ].join("\n");
}

export function nbList(category?: NotebookCategory): string {
  const { notebooks } = loadMapping();
  const filtered = category ? notebooks.filter((n) => n.category === category) : notebooks;

  if (filtered.length === 0) {
    return `해당 카테고리(${category})에 노트북이 없습니다.`;
  }

  const grouped: Partial<Record<NotebookCategory, NotebookEntry[]>> = {};
  for (const nb of filtered) {
    if (!grouped[nb.category]) grouped[nb.category] = [];
    grouped[nb.category]!.push(nb);
  }

  const sections: string[] = [];
  for (const [cat, items] of Object.entries(grouped) as [NotebookCategory, NotebookEntry[]][]) {
    sections.push(`*[${CATEGORY_LABELS[cat] ?? cat}]*`);
    for (const nb of items) sections.push(formatEntry(nb));
    sections.push("");
  }

  const header = category
    ? `📂 *${CATEGORY_LABELS[category]}* — ${filtered.length}개`
    : `📚 *전체 노트북* — ${filtered.length}개`;

  return [header, "", ...sections].join("\n").trimEnd();
}

export function nbShow(query: string): string {
  const { notebooks } = loadMapping();
  const q = query.toLowerCase();

  const nb =
    notebooks.find((n) => n.project.toLowerCase() === q) ??
    notebooks.find((n) => n.display_name.toLowerCase().includes(q)) ??
    notebooks.find((n) => n.notebook_name.toLowerCase().includes(q));

  if (!nb) return `❌ "${query}"에 해당하는 노트북을 찾지 못했습니다.\n\`/nb search ${query}\`로 검색해보세요.`;
  return formatEntry(nb, true);
}

export function nbSearch(keyword: string): string {
  const { notebooks } = loadMapping();
  const q = keyword.toLowerCase();

  const results = notebooks.filter((n) => {
    return (
      n.notebook_name.toLowerCase().includes(q) ||
      n.display_name.toLowerCase().includes(q) ||
      n.project.toLowerCase().includes(q) ||
      n.tags?.some((t) => t.toLowerCase().includes(q))
    );
  });

  if (results.length === 0) return `🔍 "${keyword}" 검색 결과 없음.`;

  const lines = [`🔍 *"${keyword}" 검색 결과* — ${results.length}개`, ""];
  for (const nb of results) lines.push(formatEntry(nb));
  return lines.join("\n");
}

export function handleNbCommand(message: string): string {
  const cmd = parseNbCommand(message);
  switch (cmd.kind) {
    case "help":    return nbHelp();
    case "list":    return nbList(cmd.category);
    case "show":    return nbShow(cmd.query);
    case "search":  return nbSearch(cmd.keyword);
  }
}
