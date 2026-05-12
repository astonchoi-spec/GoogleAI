import path from "node:path";
import type { DealCategory, DealMeta } from "./dealTypes.ts";
import { listDeals } from "./dealStore.ts";

export type DealMatchConfidence = "exact" | "partial" | "none";

export type DealFileMatch = {
  deal: DealMeta | null;
  confidence: DealMatchConfidence;
};

export type DealMatchInput = string | {
  filename: string;
  extraText?: string[];
};

const CATEGORY_KEYWORDS: Array<{ category: DealCategory; patterns: RegExp[] }> = [
  { category: "contract", patterns: [/계약/i, /약정/i, /합의/i, /mou/i] },
  { category: "feasibility", patterns: [/사업계획/i, /사업수지/i, /수익/i, /분양/i, /재무/i] },
  { category: "legal", patterns: [/법률/i, /법무/i, /검토의견/i, /자문/i, /소송/i, /판결/i] },
  { category: "market", patterns: [/시장/i, /수요/i, /신용평가/i, /분석/i, /리서치/i] },
  { category: "disclosure", patterns: [/공시/i, /공고/i, /심의/i, /의결/i, /위원회/i] },
];

function stripExtension(filename: string): string {
  const parsed = path.parse(filename);
  return parsed.name || filename;
}

export function normalizeForDealMatch(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]+/g, "");
}

function meaningfulTokens(value: string): string[] {
  return value
    .normalize("NFKC")
    .split(/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ]+/g)
    .map((token) => normalizeForDealMatch(token))
    .filter((token) => token.length >= 2);
}

function scorePartial(filenameCompact: string, deal: DealMeta): number {
  const tokens = meaningfulTokens(deal.name);
  if (tokens.length === 0) return 0;
  return tokens.filter((token) => filenameCompact.includes(token)).length;
}

function matchTexts(input: DealMatchInput): string[] {
  if (typeof input === "string") return [stripExtension(input)];
  return [stripExtension(input.filename), ...(input.extraText ?? [])].filter(Boolean);
}

export async function findDealCandidates(input: DealMatchInput, limit = 8): Promise<DealMeta[]> {
  const { all } = await listDeals();
  const compactTexts = matchTexts(input).map(normalizeForDealMatch);
  const ranked = all
    .map((deal) => {
      const dealCompact = normalizeForDealMatch(deal.name);
      const exactIndex = compactTexts.findIndex((text) => dealCompact.length > 0 && text.includes(dealCompact));
      const exact = exactIndex >= 0;
      const partialScore = Math.max(0, ...compactTexts.map((text) => scorePartial(text, deal)));
      const score = exact ? 1000 - exactIndex * 100 + dealCompact.length : partialScore;
      return { deal, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.deal.updatedAt.localeCompare(a.deal.updatedAt));
  return ranked.slice(0, limit).map((item) => item.deal);
}

export async function findMatchingDeal(input: DealMatchInput, extraText: string[] = []): Promise<DealFileMatch> {
  const normalizedInput: DealMatchInput = typeof input === "string" && extraText.length > 0
    ? { filename: input, extraText }
    : input;
  const { all } = await listDeals();
  const compactTexts = matchTexts(normalizedInput).map(normalizeForDealMatch);
  const exactMatches = all
    .map((deal) => {
      const dealCompact = normalizeForDealMatch(deal.name);
      const exactIndex = compactTexts.findIndex((text) => dealCompact.length > 0 && text.includes(dealCompact));
      return { deal, exactIndex };
    })
    .filter((item) => item.exactIndex >= 0)
    .sort((a, b) => a.exactIndex - b.exactIndex || normalizeForDealMatch(b.deal.name).length - normalizeForDealMatch(a.deal.name).length);

  if (exactMatches.length > 0) {
    return { deal: exactMatches[0].deal, confidence: "exact" };
  }

  const candidates = await findDealCandidates(normalizedInput, 1);
  if (candidates.length > 0) {
    return { deal: candidates[0], confidence: "partial" };
  }
  return { deal: null, confidence: "none" };
}

export function inferCategory(filename: string): DealCategory {
  for (const item of CATEGORY_KEYWORDS) {
    if (item.patterns.some((pattern) => pattern.test(filename))) {
      return item.category;
    }
  }
  return "misc";
}
