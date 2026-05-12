import { writeWiki, searchWiki } from "../wiki/wikiStore.ts";
import type { IntentResult } from "./intentService.ts";

const CATEGORY_MAP: Record<string, string> = {
  "부동산": "realestate",
  "부동산PF": "realestate",
  "PF": "realestate",
  "트레이딩": "trading",
  "매매": "trading",
  "코인": "crypto",
  "암호화폐": "crypto",
  "주식": "stock",
  "가족": "family",
  "회사": "company",
  "회사운영": "company",
  "법무": "legal",
  "계약": "legal",
  "몽골": "mongolia",
  "리서치": "research",
  "전략": "strategy",
  "개인전략": "strategy",
  "AI": "ai",
  "워크스테이션": "ai",
  "매크로": "macro",
  "거시": "macro",
  "서울": "seoul",
};

function normalizeCategory(raw: string): string {
  return (
    CATEGORY_MAP[raw] ??
    CATEGORY_MAP[raw.toUpperCase()] ??
    raw.toLowerCase().replace(/\s+/g, "")
  );
}

function extractHashtags(text: string): { tags: string[]; stripped: string } {
  const tags: string[] = [];
  const stripped = text
    .replace(/#(\S+)/g, (_, tag: string) => {
      tags.push(tag);
      return "";
    })
    .replace(/\s{2,}/g, " ")
    .trim();
  return { tags, stripped };
}

function extractTitle(body: string): string {
  // 소수점(1.2억)은 자르지 않음 — ". " 또는 "。" 또는 줄바꿈까지를 제목으로
  const match = body.match(/^([\s\S]{1,60}?)(?:\.\s|。|\n|$)/);
  if (match && match[1].trim()) return match[1].trim();
  return body.slice(0, 40).trim();
}

export function matchWikiSave(message: string): IntentResult | null {
  const m = message.match(/^위키\s*저장\s+([\s\S]+)/);
  if (!m) return null;
  return {
    domain: "wiki",
    action: "wiki_save" as IntentResult["action"],
    type: "query",
    confidence: 0.95,
    params: { raw: m[1].trim() },
  };
}

export function matchWikiSearch(message: string): IntentResult | null {
  const m = message.match(/^위키\s*검색\s+([\s\S]+)/);
  if (!m) return null;
  return {
    domain: "wiki",
    action: "wiki_search" as IntentResult["action"],
    type: "query",
    confidence: 0.95,
    params: { raw: m[1].trim() },
  };
}

export async function executeWikiSave(
  params: Record<string, unknown>,
  source?: string
): Promise<string> {
  const raw = typeof params.raw === "string" ? params.raw : "";
  const { tags, stripped } = extractHashtags(raw);
  const body = stripped.trim();

  if (body.length < 3) {
    return "⚠️ 본문이 너무 짧습니다 (3자 이상 입력해주세요)";
  }

  const categories = tags.length > 0 ? tags.map(normalizeCategory) : ["미분류"];
  const title = extractTitle(body);

  try {
    const entry = await writeWiki({ title, body, categories, source });
    const d = new Date(entry.date);
    const dateStr = d.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const categoryDisplay = entry.categories.map((c) => `#${c}`).join(" ");
    const noTagNote = tags.length === 0 ? " (#미분류로 저장됨)" : "";
    return `✅ 위키 저장 완료${noTagNote}\n📌 ${entry.title}\n🏷 ${categoryDisplay}\n📅 ${dateStr}`;
  } catch (e) {
    console.error("[intentWiki] executeWikiSave error:", e);
    return "❌ wiki 저장 실패: wiki 저장소에 접근할 수 없습니다";
  }
}

export async function executeWikiSearch(
  params: Record<string, unknown>
): Promise<string> {
  const raw = typeof params.raw === "string" ? params.raw.trim() : "";

  let categoryFilter: string | undefined;
  let query = raw;
  const categoryMatch = raw.match(/^#(\S+)\s*([\s\S]*)/);
  if (categoryMatch) {
    categoryFilter = normalizeCategory(categoryMatch[1]);
    query = categoryMatch[2].trim();
  }

  if (!query) {
    return "⚠️ 검색어를 입력해주세요 (예: 위키 검색 신논현)";
  }

  try {
    const { results, total } = await searchWiki({ query, categoryFilter, limit: 10 });

    if (results.length === 0) {
      const filterNote = categoryFilter ? ` [#${categoryFilter}]` : "";
      return `🔍 "${query}"${filterNote} 검색 결과 없음\n(저장된 wiki: ${total}건)`;
    }

    const lines: string[] = [
      `🔍 위키 검색: "${query}" — ${results.length}건${categoryFilter ? ` [#${categoryFilter}]` : ""}`,
      "",
    ];

    for (const r of results) {
      const d = new Date(r.entry.date);
      const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
      const catStr = r.entry.categories.map((c) => `#${c}`).join(" ");
      const bodyPreview = r.entry.body.slice(0, 80).replace(/\n/g, " ");
      lines.push(`📌 ${r.entry.title} (${dateStr}, ${catStr})`);
      lines.push(`   ${bodyPreview}${r.entry.body.length > 80 ? "..." : ""}`);
      lines.push("");
    }

    return lines.join("\n").trim();
  } catch (e) {
    console.error("[intentWiki] executeWikiSearch error:", e);
    return "❌ wiki 검색 실패: wiki 저장소에 접근할 수 없습니다";
  }
}
