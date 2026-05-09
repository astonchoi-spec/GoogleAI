import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCollectionPath,
  buildDataStorePath,
  buildServingConfigPath,
  getRagGcpConfig,
  isRagConfigured,
  RagAuthError,
} from "../rag/gcpAuth.ts";

describe("rag/gcpAuth — Phase 2", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.VERTEX_SEARCH_PROJECT_ID;
    delete process.env.VERTEX_SEARCH_LOCATION;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("VERTEX_SEARCH_PROJECT_ID 가 없으면 isRagConfigured()=false", () => {
    expect(isRagConfigured()).toBe(false);
  });

  it("VERTEX_SEARCH_PROJECT_ID 가 있으면 isRagConfigured()=true", () => {
    process.env.VERTEX_SEARCH_PROJECT_ID = "aston-work-station";
    expect(isRagConfigured()).toBe(true);
  });

  it("getRagGcpConfig() — projectId 미설정 시 RagAuthError throw", () => {
    expect(() => getRagGcpConfig()).toThrow(RagAuthError);
  });

  it("getRagGcpConfig() — 정상 환경에서 location 기본값 'global'", () => {
    process.env.VERTEX_SEARCH_PROJECT_ID = "aston-work-station";
    const cfg = getRagGcpConfig();
    expect(cfg.projectId).toBe("aston-work-station");
    expect(cfg.location).toBe("global");
    expect(cfg.collection).toBe("default_collection");
    expect(cfg.servingConfig).toBe("default_search");
  });

  it("getRagGcpConfig() — 명시적 location 환경변수 우선", () => {
    process.env.VERTEX_SEARCH_PROJECT_ID = "aston-work-station";
    process.env.VERTEX_SEARCH_LOCATION = "us";
    const cfg = getRagGcpConfig();
    expect(cfg.location).toBe("us");
  });

  it("buildDataStorePath — 정확한 형식", () => {
    process.env.VERTEX_SEARCH_PROJECT_ID = "aston-work-station";
    const cfg = getRagGcpConfig();
    expect(buildDataStorePath(cfg, "ds-real-estate-deals")).toBe(
      "projects/aston-work-station/locations/global/collections/default_collection/dataStores/ds-real-estate-deals",
    );
  });

  it("buildServingConfigPath — 검색 서빙 config 경로 형식", () => {
    process.env.VERTEX_SEARCH_PROJECT_ID = "aston-work-station";
    const cfg = getRagGcpConfig();
    expect(buildServingConfigPath(cfg, "ds-trading-research")).toBe(
      "projects/aston-work-station/locations/global/collections/default_collection/dataStores/ds-trading-research/servingConfigs/default_search",
    );
  });

  it("buildCollectionPath — 컬렉션 부모 path", () => {
    process.env.VERTEX_SEARCH_PROJECT_ID = "aston-work-station";
    const cfg = getRagGcpConfig();
    expect(buildCollectionPath(cfg)).toBe(
      "projects/aston-work-station/locations/global/collections/default_collection",
    );
  });
});

describe("rag/discoveryEngineClient — Phase 2 (env guard)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.VERTEX_SEARCH_PROJECT_ID;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("createDataStore — projectId 미설정 시 ok=false + 명확한 에러 메시지", async () => {
    const { createDataStore } = await import(
      "../rag/discoveryEngineClient.ts"
    );
    const result = await createDataStore({
      dataStoreId: "ds-test",
      displayName: "test",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("VERTEX_SEARCH_PROJECT_ID");
  });

  it("importDocument — projectId 미설정 시 ok=false", async () => {
    const { importDocument } = await import(
      "../rag/discoveryEngineClient.ts"
    );
    const result = await importDocument({
      dataStoreId: "ds-test",
      documentId: "doc-1",
      content: "hello",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("VERTEX_SEARCH_PROJECT_ID");
  });

  it("query — projectId 미설정 시 ok=false + sources 빈 배열", async () => {
    const { query } = await import("../rag/discoveryEngineClient.ts");
    const result = await query({
      dataStoreId: "ds-test",
      query: "hello",
    });
    expect(result.ok).toBe(false);
    expect(result.sources).toEqual([]);
    expect(result.error).toContain("VERTEX_SEARCH_PROJECT_ID");
  });
});
