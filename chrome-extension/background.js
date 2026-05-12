// Aston NotebookLM Bridge — service worker (Manifest V3)
// content.js 가 보낸 ASTON_INGEST 메시지를 받아 워크스테이션 백엔드에 POST 한다.
// host_permissions 에 localhost:4000 이 등록되어 있어 CORS 우회.

const DEFAULT_ENDPOINT = "http://localhost:4000/api/rag/extension-ingest";

async function getEndpoint() {
  const stored = await chrome.storage?.local?.get?.(["astonEndpoint"]);
  const v = stored?.astonEndpoint;
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return DEFAULT_ENDPOINT;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "ASTON_INGEST") return false;

  (async () => {
    try {
      const endpoint = await getEndpoint();
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg.payload),
      });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
      if (res.ok) {
        sendResponse({
          ok: true,
          status: json.status ?? "created",
          project: json.project,
          savedPath: json.savedPath,
          isUnmapped: json.isUnmapped,
          mappingHint: json.mappingHint,
          artifactKind: json.artifactKind,
          version: json.version,
        });
      } else {
        sendResponse({
          ok: false,
          error: json.error ?? `HTTP ${res.status}`,
        });
      }
    } catch (err) {
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();

  return true; // async sendResponse 사용 시 필수
});

console.log("[Aston Bridge] background service worker 시작");
