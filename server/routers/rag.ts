import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { publicProcedure, router } from "../_core/trpc.ts";
import {
  loadRagMapping,
  validateMapping,
} from "../rag/mappingLoader.ts";
import {
  RAG_CATEGORY_LABELS,
  RAG_DATA_STORE_LABELS,
  type RagDataStoreId,
} from "../rag/types.ts";
import { isRagConfigured } from "../rag/gcpAuth.ts";
import { query as queryDiscoveryEngine } from "../rag/discoveryEngineClient.ts";
import { NotebookLmAdapter } from "../knowledge/adapters/notebooklm.ts";
import { PipelineRunner } from "../knowledge/pipeline/runner.ts";
import { resolveWikiRoot } from "../knowledge/storage/wikiWriter.ts";
import {
  getDriveSyncStatus,
  triggerManualScan,
  listSourceFiles,
  exportsRootDir,
  exportsProjectDir,
  sourcesRootDir,
  sourcesProjectDir,
} from "../knowledge/driveSync.ts";

// Wiki 회수 자료 — Track A 경로
function notebookProjectDir(projectId: string): string {
  return path.join(resolveWikiRoot(), "projects", projectId, "notebooklm");
}

function isWithin(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

const pipelineRunner = new PipelineRunner();

export const ragRouter = router({
  // Phase 1 — 28개 노트북 매핑 + 데이터 스토어 그룹 메타데이터 조회.
  listMappings: publicProcedure.query(() => {
    const mapping = loadRagMapping();
    const validationIssues = validateMapping(mapping);

    // 데이터 스토어별 그룹핑 카운트
    const dataStoreCounts: Record<string, number> = {};
    for (const nb of mapping.notebooks) {
      dataStoreCounts[nb.data_store] =
        (dataStoreCounts[nb.data_store] ?? 0) + 1;
    }

    // 카테고리별 카운트
    const categoryCounts: Record<string, number> = {};
    for (const nb of mapping.notebooks) {
      categoryCounts[nb.category] = (categoryCounts[nb.category] ?? 0) + 1;
    }

    return {
      notebooks: mapping.notebooks,
      categoryLabels: RAG_CATEGORY_LABELS,
      dataStoreLabels: RAG_DATA_STORE_LABELS,
      dataStoreCounts,
      categoryCounts,
      totalNotebooks: mapping.notebooks.length,
      validationIssues,
    };
  }),

  // Phase 1 — 데이터 스토어 9개 정보만.
  listDataStores: publicProcedure.query(() => {
    const mapping = loadRagMapping();
    const grouped: Record<RagDataStoreId, string[]> = {} as Record<
      RagDataStoreId,
      string[]
    >;
    for (const nb of mapping.notebooks) {
      if (!grouped[nb.data_store]) grouped[nb.data_store] = [];
      grouped[nb.data_store].push(nb.project);
    }

    return Object.entries(RAG_DATA_STORE_LABELS).map(([id, label]) => ({
      id: id as RagDataStoreId,
      label,
      projects: grouped[id as RagDataStoreId] ?? [],
      count: (grouped[id as RagDataStoreId] ?? []).length,
    }));
  }),

  // Phase 2 — Track B Discovery Engine 인증·환경 상태 조회.
  // UI 배지(🟢/🔴)에 사용. 실제 GCP 호출 0건.
  trackBStatus: publicProcedure.query(() => {
    const configured = isRagConfigured();
    const projectId = (process.env.VERTEX_SEARCH_PROJECT_ID ?? "").trim();
    const location = (process.env.VERTEX_SEARCH_LOCATION ?? "global").trim();
    return {
      configured,
      projectId: configured ? projectId : null,
      location,
      authMode: "ADC" as const,
    };
  }),

  // Phase 2 — 데이터 스토어 검색 + 요약 응답.
  // /knowledge-rag 페이지의 수동 쿼리 트리거 + 향후 채팅 RAG 컨텍스트 주입에 재사용.
  queryDataStore: publicProcedure
    .input(
      z.object({
        dataStoreId: z.string().min(1),
        query: z.string().min(1),
        filter: z.string().optional(),
        summaryResultCount: z.number().int().min(1).max(10).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return await queryDiscoveryEngine(input);
    }),

  // Phase W-1 — 외부 NotebookLM 분석 결과 회수 (웹 붙여넣기 → Wiki 자동 저장).
  // 텔레그램 `/nb save {project}\n{body}` 와 동일한 어댑터·파이프라인 흐름.
  // 저장 위치: {WIKI_ROOT}/projects/{project}/notebooklm/*.md
  saveAnalysis: publicProcedure
    .input(
      z.object({
        project: z.string().min(1).max(80),
        body: z.string().min(10).max(50_000),
        sourceLabel: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // 매핑 yaml 에 등록된 프로젝트만 허용 (오타·임의 폴더 생성 방지)
      const mapping = loadRagMapping();
      const valid = mapping.notebooks.find((n) => n.project === input.project);
      if (!valid) {
        return {
          ok: false as const,
          error: `등록되지 않은 project ID: ${input.project}. data/rag-mapping.yaml 을 확인하세요.`,
        };
      }

      const sourceRef = `web:${crypto
        .createHash("sha256")
        .update(`${input.project}::${input.body}`)
        .digest("hex")
        .slice(0, 16)}`;

      const adapter = new NotebookLmAdapter();
      const bodyWithLabel = input.sourceLabel
        ? `${input.body}\n\n출처: ${input.sourceLabel}`
        : input.body;

      const pipelineInput = adapter.toPipelineInput({
        project: input.project,
        body: bodyWithLabel,
        source_ref: sourceRef,
        received_at: new Date().toISOString(),
      });

      try {
        const result = await pipelineRunner.run(pipelineInput);
        if (result.ok) {
          return {
            ok: true as const,
            savedPath: result.entry.saved_path,
            wasSkipped: result.was_skipped ?? false,
            quality: result.doc.quality,
            stepFailures: result.doc.step_failures,
          };
        }
        return {
          ok: false as const,
          error: `I/O 저장 실패. pending 큐로 이동: ${result.pending_path}`,
          pendingPath: result.pending_path,
        };
      } catch (err) {
        console.error("[rag/saveAnalysis] pipeline error:", err);
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),

  // Phase W-1 — 회수된 자료 목록 조회 (선택 노트북 / 전체).
  listSavedNotes: publicProcedure
    .input(
      z.object({
        project: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    )
    .query(async ({ input }) => {
      const limit = input.limit ?? 30;

      // 단일 프로젝트만 스캔하면 빠름. 전체는 매핑 yaml 의 28개 project 모두 순회.
      const projects = input.project
        ? [input.project]
        : loadRagMapping().notebooks.map((n) => n.project);

      const items: Array<{
        project: string;
        filename: string;
        relativePath: string;
        sizeBytes: number;
        mtime: string;
        titleHint: string;
      }> = [];

      for (const proj of projects) {
        const dir = notebookProjectDir(proj);
        let entries: import("node:fs").Dirent[];
        try {
          entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
          continue; // 폴더 없음 = 회수 0건
        }
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
          const full = path.join(dir, entry.name);
          try {
            const stat = await fs.stat(full);
            items.push({
              project: proj,
              filename: entry.name,
              relativePath: path
                .relative(resolveWikiRoot(), full)
                .replaceAll("\\", "/"),
              sizeBytes: stat.size,
              mtime: stat.mtime.toISOString(),
              titleHint: entry.name.replace(/\.md$/, ""),
            });
          } catch {
            // skip individual file errors
          }
        }
      }

      items.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
      return {
        items: items.slice(0, limit),
        totalScanned: items.length,
      };
    }),

  // Phase W-2 — Drive Watcher 상태 (페이지 상단 카드 표시용).
  driveWatcherStatus: publicProcedure.query(() => {
    const sync = getDriveSyncStatus();
    const wikiRoot = resolveWikiRoot();
    // mojibake 감지: ??? 또는 U+FFFD 가 포함되면 .env 인코딩 문제.
    const encodingIssue =
      wikiRoot.includes("???") || /[�]/.test(wikiRoot);
    return {
      ...sync,
      exportsRoot: exportsRootDir(),
      sourcesRoot: sourcesRootDir(),
      wikiRoot,
      encodingIssue,
    };
  }),

  // Phase W-2 — 즉시 1회 폴링 (회장님이 NotebookLM 에서 export 직후 페이지 버튼 클릭).
  triggerDriveScan: publicProcedure.mutation(async () => {
    return await triggerManualScan();
  }),

  // Phase W-2 — 특정 노트북의 NotebookLM 소스 자료 목록.
  // notebooklm-sources/{project}/ 폴더에 회장님이 둔 PDF·Docs 메타.
  listSourceFiles: publicProcedure
    .input(z.object({ project: z.string().min(1).max(80) }))
    .query(async ({ input }) => {
      // 매핑 yaml 화이트리스트
      const mapping = loadRagMapping();
      const valid = mapping.notebooks.find((n) => n.project === input.project);
      if (!valid) {
        return { ok: false as const, error: "등록되지 않은 project ID", files: [] };
      }
      const files = await listSourceFiles(input.project);
      return {
        ok: true as const,
        files,
        sourceFolder: sourcesProjectDir(input.project),
        exportFolder: exportsProjectDir(input.project),
      };
    }),

  // Phase W-1 — 회수 자료 본문 읽기 (페이지 미리보기 모달).
  // 경로 traversal 차단: WIKI_ROOT 하위 + 매핑된 project 만 허용.
  readSavedNote: publicProcedure
    .input(
      z.object({
        project: z.string().min(1).max(80),
        filename: z.string().min(1).max(200),
      }),
    )
    .query(async ({ input }) => {
      // 1) project 화이트리스트
      const mapping = loadRagMapping();
      const valid = mapping.notebooks.find((n) => n.project === input.project);
      if (!valid) {
        return { ok: false as const, error: "등록되지 않은 project ID" };
      }

      // 2) 파일명 검증 (경로 분리자·상위 이동·확장자)
      if (
        input.filename.includes("/") ||
        input.filename.includes("\\") ||
        input.filename.includes("..") ||
        !input.filename.endsWith(".md")
      ) {
        return { ok: false as const, error: "허용되지 않는 파일명" };
      }

      const dir = notebookProjectDir(input.project);
      const full = path.join(dir, input.filename);

      // 3) 절대 경로 검증 (이중 안전)
      if (!isWithin(dir, full)) {
        return { ok: false as const, error: "경로 위반" };
      }

      try {
        const content = await fs.readFile(full, "utf-8");
        return {
          ok: true as const,
          content,
          relativePath: path
            .relative(resolveWikiRoot(), full)
            .replaceAll("\\", "/"),
        };
      } catch (err) {
        return {
          ok: false as const,
          error: `파일 읽기 실패: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }),
});
