import fs from "node:fs/promises";
import path from "node:path";

export function getWikiRoot(): string {
  const root = process.env.WIKI_ROOT;
  if (!root) {
    throw new Error(
      "WIKI_ROOT 환경변수가 설정되지 않았습니다. .env에 WIKI_ROOT 추가 후 서버 재시작 필요."
    );
  }
  return root;
}

// frontmatter 정규식 파싱 (gray-matter 의존성 없이)
function parseFrontmatter(content: string): { meta: Record<string, unknown>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content.trim() };

  const meta: Record<string, unknown> = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      meta[key] = val
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      meta[key] = val;
    }
  }
  return { meta, body: match[2].trim() };
}

// 윈도우 파일명 금지문자 제거 + 공백→언더스코어 + 30자 컷
function toSlug(title: string): string {
  return title
    .replace(/\s+/g, "_")
    .replace(/[\\/:*?"<>|]/g, "")
    .slice(0, 30);
}

// KST 기준 날짜/시간 문자열 반환
function kstDateParts(now: Date): { dateStr: string; timeStr: string } {
  // toLocaleString으로 KST 변환 후 Date 객체 재생성
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const y = kst.getFullYear();
  const mo = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  const h = String(kst.getHours()).padStart(2, "0");
  const mi = String(kst.getMinutes()).padStart(2, "0");
  const s = String(kst.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return {
    dateStr: `${y}-${mo}-${d}`,
    timeStr: `${h}-${mi}-${s}-${ms}`,
  };
}

export interface WikiEntry {
  id: string;
  date: string;
  title: string;
  categories: string[];
  source: string;
  body: string;
  filePath: string;
}

export interface WikiWriteInput {
  title: string;
  body: string;
  categories: string[];
  source?: string;
}

export async function writeWiki(input: WikiWriteInput): Promise<WikiEntry> {
  const root = getWikiRoot();
  const now = new Date();
  const { dateStr, timeStr } = kstDateParts(now);
  const slug = toSlug(input.title);
  const id = `${dateStr}T${timeStr}`;
  const source = input.source ?? "telegram";

  const dayDir = path.join(root, dateStr);
  await fs.mkdir(dayDir, { recursive: true });

  // 충돌 방지: 같은 ms라면 -2, -3 suffix
  let fileName = `${timeStr}-${slug}.md`;
  let filePath = path.join(dayDir, fileName);
  let suffix = 2;
  for (;;) {
    try {
      await fs.access(filePath);
      // 파일 존재 → suffix 부여
      fileName = `${timeStr}-${slug}-${suffix}.md`;
      filePath = path.join(dayDir, fileName);
      suffix++;
    } catch {
      break; // 파일 없음 → 사용 가능
    }
  }

  const categoriesLine = `[${input.categories.join(", ")}]`;
  const fileContent = `---
id: ${id}
date: ${now.toISOString()}
title: ${input.title}
categories: ${categoriesLine}
source: ${source}
---

${input.body}`;

  await fs.writeFile(filePath, fileContent, "utf-8");

  return {
    id,
    date: now.toISOString(),
    title: input.title,
    categories: input.categories,
    source,
    body: input.body,
    filePath,
  };
}

export interface WikiSearchOptions {
  query: string;
  categoryFilter?: string;
  limit?: number;
}

export interface WikiSearchResult {
  entry: WikiEntry;
  matchInTitle: boolean;
}

export async function searchWiki(
  options: WikiSearchOptions
): Promise<{ results: WikiSearchResult[]; total: number }> {
  const root = getWikiRoot();
  const q = options.query.toLowerCase();
  const limit = options.limit ?? 10;
  const allFiles: string[] = [];

  try {
    const dayDirs = await fs.readdir(root, { withFileTypes: true });
    for (const d of dayDirs) {
      if (!d.isDirectory()) continue;
      const dayPath = path.join(root, d.name);
      try {
        const files = await fs.readdir(dayPath);
        for (const f of files) {
          if (f.endsWith(".md")) allFiles.push(path.join(dayPath, f));
        }
      } catch (e) {
        console.error("[wikiStore] readdir day error:", e);
      }
    }
  } catch (e) {
    console.error("[wikiStore] readdir root error:", e);
    return { results: [], total: 0 };
  }

  const total = allFiles.length;
  const matches: WikiSearchResult[] = [];

  for (const filePath of allFiles) {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const { meta, body } = parseFrontmatter(content);

      const categories = Array.isArray(meta.categories)
        ? (meta.categories as string[])
        : [];

      if (options.categoryFilter) {
        const cf = options.categoryFilter.toLowerCase();
        if (!categories.some((c) => c.toLowerCase() === cf)) continue;
      }

      const title = typeof meta.title === "string" ? meta.title : "";
      const titleLower = title.toLowerCase();
      const bodyLower = body.toLowerCase();
      if (!titleLower.includes(q) && !bodyLower.includes(q)) continue;

      matches.push({
        entry: {
          id: typeof meta.id === "string" ? meta.id : "",
          date: typeof meta.date === "string" ? meta.date : "",
          title,
          categories,
          source: typeof meta.source === "string" ? meta.source : "",
          body: body.slice(0, 200),
          filePath,
        },
        matchInTitle: titleLower.includes(q),
      });
    } catch (e) {
      console.error("[wikiStore] readFile error:", filePath, e);
    }
  }

  matches.sort((a, b) => b.entry.date.localeCompare(a.entry.date));

  return { results: matches.slice(0, limit), total };
}
