// GCP Discovery Engine (Vertex AI Search) 통신 코어 래퍼.
// Phase 2 — createDataStore / importDocument / query 3개 핵심 메서드.
// 인증: ADC (Application Default Credentials). 서비스 계정 JSON 미사용.

import {
  DataStoreServiceClient,
  DocumentServiceClient,
  SearchServiceClient,
} from "@google-cloud/discoveryengine";
import {
  buildCollectionPath,
  buildDataStorePath,
  buildServingConfigPath,
  getRagGcpConfig,
  isRagConfigured,
  RagAuthError,
  type RagGcpConfig,
} from "./gcpAuth.ts";

// ─── 타입 정의 ────────────────────────────────────────────────

export type IndustryVertical = "GENERIC" | "MEDIA";
export type SolutionType =
  | "SOLUTION_TYPE_SEARCH"
  | "SOLUTION_TYPE_CHAT"
  | "SOLUTION_TYPE_RECOMMENDATION";
export type ContentConfig =
  | "NO_CONTENT"
  | "CONTENT_REQUIRED"
  | "PUBLIC_WEBSITE";

export interface CreateDataStoreOptions {
  dataStoreId: string;
  displayName: string;
  industryVertical?: IndustryVertical;
  solutionTypes?: SolutionType[];
  contentConfig?: ContentConfig;
}

export interface CreateDataStoreResult {
  ok: boolean;
  dataStorePath?: string;
  alreadyExists?: boolean;
  error?: string;
}

export interface ImportDocumentInput {
  /** 데이터 스토어 ID (예: "ds-real-estate-deals") */
  dataStoreId: string;
  /** 사용자 정의 document id (멱등성 키) */
  documentId: string;
  /** 인덱싱 대상 본문 텍스트 (markdown 또는 plain text) */
  content: string;
  mimeType?: string;
  /** RAG 필터링·분류용 메타데이터 (예: project, source, queried_at) */
  structData?: Record<string, unknown>;
}

export interface ImportDocumentResult {
  ok: boolean;
  documentName?: string;
  error?: string;
}

export interface QueryOptions {
  dataStoreId: string;
  query: string;
  /** 필터 표현식 (예: "project: ANY(\"hannam-644\")") */
  filter?: string;
  /** 요약 결과에 포함시킬 검색 결과 개수 (기본 5) */
  summaryResultCount?: number;
  /** 검색 결과 페이지 크기 (기본 10) */
  pageSize?: number;
}

export interface QuerySource {
  documentId?: string;
  title?: string;
  uri?: string;
  snippet?: string;
}

export interface QueryResult {
  ok: boolean;
  summaryText?: string;
  sources: QuerySource[];
  totalSize?: number;
  error?: string;
}

// ─── Lazy 클라이언트 캐시 ──────────────────────────────────────

let _dataStoreClient: DataStoreServiceClient | null = null;
let _documentClient: DocumentServiceClient | null = null;
let _searchClient: SearchServiceClient | null = null;

function getDataStoreClient(): DataStoreServiceClient {
  if (!_dataStoreClient) _dataStoreClient = new DataStoreServiceClient();
  return _dataStoreClient;
}

function getDocumentClient(): DocumentServiceClient {
  if (!_documentClient) _documentClient = new DocumentServiceClient();
  return _documentClient;
}

function getSearchClient(): SearchServiceClient {
  if (!_searchClient) _searchClient = new SearchServiceClient();
  return _searchClient;
}

/** 테스트용 — client 캐시 초기화 + DI. 운영 코드는 호출하지 않는다. */
export function _setRagClientsForTest(clients: {
  dataStore?: DataStoreServiceClient | null;
  document?: DocumentServiceClient | null;
  search?: SearchServiceClient | null;
}): void {
  if (clients.dataStore !== undefined) _dataStoreClient = clients.dataStore;
  if (clients.document !== undefined) _documentClient = clients.document;
  if (clients.search !== undefined) _searchClient = clients.search;
}

// ─── 핵심 메서드 ──────────────────────────────────────────────

/**
 * 데이터 스토어 생성 (idempotent).
 *
 * 같은 ID 가 이미 존재하면 alreadyExists=true 로 회수. 그 외 에러는 ok=false + error.
 * Long-running operation 이라 promise resolve 시점은 인덱싱 준비 완료 직후.
 */
export async function createDataStore(
  options: CreateDataStoreOptions,
): Promise<CreateDataStoreResult> {
  if (!isRagConfigured()) {
    return { ok: false, error: "GCP 설정 미완료 (VERTEX_SEARCH_PROJECT_ID)" };
  }
  let config: RagGcpConfig;
  try {
    config = getRagGcpConfig();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof RagAuthError ? err.message : String(err),
    };
  }

  const parent = buildCollectionPath(config);
  const dataStorePath = buildDataStorePath(config, options.dataStoreId);
  const client = getDataStoreClient();

  // SDK 오버로드(callback/promise) + protobuf enum 때문에 명시 캐스트.
  // 런타임에서는 SDK 가 string literal 도 받아주므로 동작에는 문제 없음.
  const request = {
    parent,
    dataStoreId: options.dataStoreId,
    dataStore: {
      displayName: options.displayName,
      industryVertical: options.industryVertical ?? "GENERIC",
      solutionTypes: options.solutionTypes ?? ["SOLUTION_TYPE_SEARCH"],
      contentConfig: options.contentConfig ?? "CONTENT_REQUIRED",
    },
  } as unknown as Parameters<typeof client.createDataStore>[0];

  try {
    const lroResult = (await client.createDataStore(request)) as unknown as [
      { promise(): Promise<unknown> },
      unknown,
      unknown,
    ];
    const operation = lroResult[0];
    await operation.promise();
    return { ok: true, dataStorePath };
  } catch (err) {
    const code = (err as { code?: number }).code;
    // ALREADY_EXISTS = 6 — idempotent 반환
    if (code === 6) {
      return { ok: true, dataStorePath, alreadyExists: true };
    }
    console.error("[rag/discoveryEngine] createDataStore 오류:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 단일 문서 인덱싱. inline 방식 (작은 markdown/텍스트 회수에 적합).
 * 같은 documentId 로 재호출하면 덮어쓴다 (idempotent upsert는 createDocument 가 기본).
 *
 * 대용량 또는 PDF 배치는 Phase 3 에서 GCS importDocuments 로 추가 예정.
 */
export async function importDocument(
  input: ImportDocumentInput,
): Promise<ImportDocumentResult> {
  if (!isRagConfigured()) {
    return { ok: false, error: "GCP 설정 미완료 (VERTEX_SEARCH_PROJECT_ID)" };
  }
  let config: RagGcpConfig;
  try {
    config = getRagGcpConfig();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof RagAuthError ? err.message : String(err),
    };
  }

  const parent = `${buildDataStorePath(config, input.dataStoreId)}/branches/default_branch`;
  const client = getDocumentClient();
  const mimeType = input.mimeType ?? "text/markdown";
  const content = Buffer.from(input.content, "utf-8").toString("base64");

  // structData 는 RAG 필터링·인용 메타데이터. JSON 으로 직렬화 가능해야 한다.
  const structData = input.structData
    ? structDataToJson(input.structData)
    : undefined;

  try {
    const [doc] = await client.createDocument({
      parent,
      documentId: input.documentId,
      document: {
        id: input.documentId,
        content: { mimeType, rawBytes: content },
        ...(structData ? { jsonData: structData } : {}),
      },
    });
    return { ok: true, documentName: doc?.name ?? undefined };
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 6) {
      // ALREADY_EXISTS — 같은 ID 재호출 시 update 시도
      return await updateDocument(parent, input, mimeType, content, structData);
    }
    console.error("[rag/discoveryEngine] importDocument 오류:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function updateDocument(
  parent: string,
  input: ImportDocumentInput,
  mimeType: string,
  contentBase64: string,
  structDataJson: string | undefined,
): Promise<ImportDocumentResult> {
  const client = getDocumentClient();
  const name = `${parent}/documents/${input.documentId}`;
  try {
    const [doc] = await client.updateDocument({
      document: {
        name,
        id: input.documentId,
        content: { mimeType, rawBytes: contentBase64 },
        ...(structDataJson ? { jsonData: structDataJson } : {}),
      },
      allowMissing: false,
    });
    return { ok: true, documentName: doc?.name ?? undefined };
  } catch (err) {
    console.error("[rag/discoveryEngine] updateDocument 오류:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 검색 + 요약 응답. summaryText 는 markdown 형식.
 * filter 는 structData 키 기준 (예: 'project: ANY("hannam-644")').
 */
export async function query(options: QueryOptions): Promise<QueryResult> {
  if (!isRagConfigured()) {
    return {
      ok: false,
      sources: [],
      error: "GCP 설정 미완료 (VERTEX_SEARCH_PROJECT_ID)",
    };
  }
  let config: RagGcpConfig;
  try {
    config = getRagGcpConfig();
  } catch (err) {
    return {
      ok: false,
      sources: [],
      error: err instanceof RagAuthError ? err.message : String(err),
    };
  }

  const servingConfig = buildServingConfigPath(config, options.dataStoreId);
  const client = getSearchClient();
  const summaryResultCount = options.summaryResultCount ?? 5;
  const pageSize = options.pageSize ?? 10;

  try {
    const [results, , response] = await client.search({
      servingConfig,
      query: options.query,
      pageSize,
      ...(options.filter ? { filter: options.filter } : {}),
      contentSearchSpec: {
        summarySpec: {
          summaryResultCount,
          includeCitations: true,
          ignoreAdversarialQuery: true,
          ignoreNonSummarySeekingQuery: false,
        },
        snippetSpec: {
          returnSnippet: true,
          maxSnippetCount: 1,
        },
      },
    });

    const summaryText =
      response?.summary?.summaryText ??
      response?.summary?.summaryWithMetadata?.summary ??
      undefined;

    const sources: QuerySource[] = (results ?? []).map((hit) => {
      const doc = hit.document;
      return {
        documentId: doc?.id ?? undefined,
        title: extractTitle(doc),
        uri: doc?.derivedStructData?.fields?.link?.stringValue ?? undefined,
        snippet: extractSnippet(doc),
      };
    });

    return {
      ok: true,
      summaryText: summaryText ?? undefined,
      sources,
      totalSize: response?.totalSize ?? undefined,
    };
  } catch (err) {
    console.error("[rag/discoveryEngine] query 오류:", err);
    return {
      ok: false,
      sources: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── 보조 함수 ────────────────────────────────────────────────

function structDataToJson(struct: Record<string, unknown>): string {
  try {
    return JSON.stringify(struct);
  } catch (err) {
    console.warn("[rag/discoveryEngine] structData JSON.stringify 실패:", err);
    return "{}";
  }
}

function extractTitle(doc: unknown): string | undefined {
  const d = doc as
    | {
        derivedStructData?: {
          fields?: { title?: { stringValue?: string } };
        };
      }
    | null
    | undefined;
  return d?.derivedStructData?.fields?.title?.stringValue ?? undefined;
}

function extractSnippet(doc: unknown): string | undefined {
  const d = doc as
    | {
        derivedStructData?: {
          fields?: {
            snippets?: {
              listValue?: {
                values?: Array<{
                  structValue?: {
                    fields?: { snippet?: { stringValue?: string } };
                  };
                }>;
              };
            };
          };
        };
      }
    | null
    | undefined;
  const first = d?.derivedStructData?.fields?.snippets?.listValue?.values?.[0];
  return first?.structValue?.fields?.snippet?.stringValue ?? undefined;
}
