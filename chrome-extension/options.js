const DEFAULT = "http://localhost:4000/api/rag/extension-ingest";

async function load() {
  const stored = await chrome.storage.local.get(["astonEndpoint"]);
  document.getElementById("endpoint").value = stored.astonEndpoint || DEFAULT;
}

document.getElementById("save").addEventListener("click", async () => {
  const value = document.getElementById("endpoint").value.trim() || DEFAULT;
  await chrome.storage.local.set({ astonEndpoint: value });
  const status = document.getElementById("status");
  status.style.display = "block";
  status.className = "status ok";
  status.textContent = "✅ 저장됨: " + value;
  setTimeout(() => (status.style.display = "none"), 2000);
});

load();
