// GCP 인증·환경 설정 헬퍼.
// 운영: gcloud auth application-default login (ADC) — 서비스 계정 JSON 미사용.
// SDK 클라이언트는 옵션 없이 생성하면 ADC 자동 사용.

const PROJECT_ID_ENV = "VERTEX_SEARCH_PROJECT_ID";
const LOCATION_ENV = "VERTEX_SEARCH_LOCATION";
const DEFAULT_LOCATION = "global";
const DEFAULT_COLLECTION = "default_collection";
const DEFAULT_SERVING_CONFIG = "default_search";

export interface RagGcpConfig {
  projectId: string;
  location: string;
  collection: string;
  servingConfig: string;
}

export class RagAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RagAuthError";
  }
}

/**
 * 환경변수에서 GCP 설정을 읽어 반환. 누락 시 RagAuthError throw.
 * 호출 측 try/catch 또는 isRagConfigured() 사전 체크 권장.
 */
export function getRagGcpConfig(): RagGcpConfig {
  const projectId = (process.env[PROJECT_ID_ENV] ?? "").trim();
  if (!projectId) {
    throw new RagAuthError(
      `GCP 프로젝트 ID 미설정 — .env 의 ${PROJECT_ID_ENV} 를 채우거나 VERTEX_SEARCH_PROJECT_ID 환경변수를 export 하세요.`,
    );
  }
  const location =
    (process.env[LOCATION_ENV] ?? "").trim() || DEFAULT_LOCATION;
  return {
    projectId,
    location,
    collection: DEFAULT_COLLECTION,
    servingConfig: DEFAULT_SERVING_CONFIG,
  };
}

/**
 * 호출 가능 여부 안전 체크 (에러 throw 없음). UI/모니터링용.
 */
export function isRagConfigured(): boolean {
  return Boolean((process.env[PROJECT_ID_ENV] ?? "").trim());
}

/**
 * 데이터 스토어 path 빌더.
 * 형식: projects/{p}/locations/{l}/collections/default_collection/dataStores/{dsId}
 */
export function buildDataStorePath(
  config: RagGcpConfig,
  dataStoreId: string,
): string {
  return [
    "projects",
    config.projectId,
    "locations",
    config.location,
    "collections",
    config.collection,
    "dataStores",
    dataStoreId,
  ].join("/");
}

/**
 * 서빙 config path 빌더 (검색용).
 * 형식: <dataStorePath>/servingConfigs/default_search
 */
export function buildServingConfigPath(
  config: RagGcpConfig,
  dataStoreId: string,
): string {
  return `${buildDataStorePath(config, dataStoreId)}/servingConfigs/${config.servingConfig}`;
}

/**
 * 컬렉션 부모 path 빌더 (createDataStore parent 용).
 * 형식: projects/{p}/locations/{l}/collections/default_collection
 */
export function buildCollectionPath(config: RagGcpConfig): string {
  return [
    "projects",
    config.projectId,
    "locations",
    config.location,
    "collections",
    config.collection,
  ].join("/");
}
