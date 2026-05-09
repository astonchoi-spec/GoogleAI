import { z } from "zod";
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
});
