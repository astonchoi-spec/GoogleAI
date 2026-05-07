// Wiki tRPC 라우터 — /wiki 페이지에 검색·카테고리·최근 항목 노출.
// 기존 wikiStore (WIKI_ROOT 기반) 검색을 그대로 재사용.

import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc.ts";
import { searchWiki, getWikiRoot, type WikiSearchResult } from "../wiki/wikiStore.ts";

function safeRoot(): { root: string | null; error: string | null } {
  try {
    return { root: getWikiRoot(), error: null };
  } catch (err) {
    return { root: null, error: err instanceof Error ? err.message : "WIKI_ROOT not set" };
  }
}

export const wikiRouter = router({
  status: publicProcedure.query(async () => {
    const { root, error } = safeRoot();
    return {
      configured: root !== null,
      root,
      error,
      astonRoot: process.env.ASTON_WIKI_ROOT?.trim() || null,
    };
  }),

  search: publicProcedure
    .input(
      z.object({
        query: z.string().trim().min(1),
        categoryFilter: z.string().trim().optional(),
        limit: z.number().int().positive().max(50).optional(),
      }),
    )
    .query(async ({ input }) => {
      const { root, error } = safeRoot();
      if (!root) return { configured: false, error, results: [], total: 0 };
      try {
        const result = await searchWiki({
          query: input.query,
          categoryFilter: input.categoryFilter,
          limit: input.limit ?? 20,
        });
        return {
          configured: true,
          error: null,
          results: result.results.map(serializeResult),
          total: result.total,
        };
      } catch (err) {
        return {
          configured: true,
          error: err instanceof Error ? err.message : "검색 실패",
          results: [],
          total: 0,
        };
      }
    }),

  byCategory: publicProcedure
    .input(
      z.object({
        category: z.string().trim().min(1),
        limit: z.number().int().positive().max(100).optional(),
      }),
    )
    .query(async ({ input }) => {
      const { root, error } = safeRoot();
      if (!root) return { configured: false, error, results: [] };
      try {
        // searchWiki는 query를 빈 문자열로 받을 수 없어서 category 키워드를 그대로 검색어로 사용
        const result = await searchWiki({
          query: input.category,
          categoryFilter: input.category,
          limit: input.limit ?? 30,
        });
        return {
          configured: true,
          error: null,
          results: result.results.map(serializeResult),
        };
      } catch (err) {
        return {
          configured: true,
          error: err instanceof Error ? err.message : "조회 실패",
          results: [],
        };
      }
    }),

  // 폴더 열기 — 허용된 wiki root만. 다른 임의 경로 차단.
  openFolder: publicProcedure
    .input(z.object({ target: z.enum(["aston", "legacy"]) }))
    .mutation(async ({ input }) => {
      const astonRoot = process.env.ASTON_WIKI_ROOT?.trim();
      const legacyRoot = process.env.WIKI_ROOT?.trim();
      const targetPath = input.target === "aston" ? astonRoot : legacyRoot;
      if (!targetPath) {
        return { ok: false, error: `${input.target === "aston" ? "ASTON_WIKI_ROOT" : "WIKI_ROOT"} 미설정` };
      }
      const resolved = path.resolve(targetPath);
      if (process.platform !== "win32") {
        return { ok: false, error: `Windows에서만 지원됩니다 (현재: ${process.platform})` };
      }
      try {
        // explorer.exe는 인자가 따옴표로 감싸지면 안 됨. spawn으로 분리 전달.
        spawn("explorer.exe", [resolved], { detached: true, stdio: "ignore" }).unref();
        return { ok: true, opened: resolved };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }),

  recent: publicProcedure
    .input(
      z.object({
        limit: z.number().int().positive().max(50).optional(),
      }).optional(),
    )
    .query(async ({ input }) => {
      const { root, error } = safeRoot();
      if (!root) return { configured: false, error, results: [] };
      try {
        // 빈 검색을 피하기 위해 흔한 모음 한 글자로 매칭. searchWiki가 모든 항목 sweep 후 매치만 반환
        // 실용적으로는 recentLimit 기능을 wikiStore에 추가하는 게 낫지만, 본 단계에서는 wikiStore 미수정 합의.
        // 대안: title/body에 .를 거의 다 포함하므로 "."로 검색 → 거의 모든 항목 → 날짜 desc 정렬됨
        const result = await searchWiki({
          query: ".",
          limit: input?.limit ?? 20,
        });
        return {
          configured: true,
          error: null,
          results: result.results.map(serializeResult),
        };
      } catch (err) {
        return {
          configured: true,
          error: err instanceof Error ? err.message : "최근 항목 조회 실패",
          results: [],
        };
      }
    }),
});

function serializeResult(r: WikiSearchResult) {
  return {
    id: r.entry.id,
    date: r.entry.date,
    title: r.entry.title,
    categories: r.entry.categories,
    source: r.entry.source,
    bodyPreview: r.entry.body,
    filePath: r.entry.filePath,
    matchInTitle: r.matchInTitle,
  };
}
