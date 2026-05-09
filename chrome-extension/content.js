// Aston NotebookLM Bridge — content script
// notebooklm.google.com/notebook/* 페이지에 [📥 Aston Wiki로 동기화] 버튼을 주입한다.
// 클릭 시 현재 화면의 노트 본문 텍스트 + 노트북 제목 + URL을 스크래핑해서
// background.js 를 거쳐 워크스테이션 백엔드(POST /api/rag/extension-ingest)로 전송.

(function () {
  "use strict";

  const BUTTON_ID = "aston-wiki-sync-btn";
  const STATUS_ATTR = "data-aston-status"; // idle | sending | ok | err
  const HOST_ID = "aston-wiki-host"; // floating container
  const RESET_AFTER_MS = 3000;

  function isNotebookPage() {
    return /^\/notebook\/[0-9a-f-]+/.test(location.pathname);
  }

  function findExistingButton() {
    return document.getElementById(BUTTON_ID);
  }

  // 노트북 제목 추출 — NotebookLM 좌상단 제목 영역 또는 document.title fallback.
  function extractNotebookTitle() {
    const titleEl =
      document.querySelector('h1[role="heading"]') ||
      document.querySelector('h1') ||
      document.querySelector('[data-test-id*="title"]');
    const text = titleEl?.textContent?.trim();
    if (text && text.length > 0 && text.length < 200) return text;
    return document.title.replace(/\s*[—\-]\s*NotebookLM.*$/i, "").trim() || "(제목 없음)";
  }

  // 노트 본문 텍스트 추출 — 보이는 노트 영역에서 가장 긴 텍스트 블록을 우선.
  function extractNoteText() {
    // 후보 selector — Google이 NotebookLM 클래스명을 자주 바꾸므로 다중 fallback.
    const candidates = [
      'article',
      'main [role="article"]',
      '[data-test-id*="note-content"]',
      '[data-test-id*="response"]',
      '[role="main"] [contenteditable="true"]',
      '[role="main"]',
    ];
    for (const sel of candidates) {
      const els = Array.from(document.querySelectorAll(sel));
      if (els.length === 0) continue;
      // 가장 긴 텍스트를 가진 요소 우선
      const best = els
        .map((el) => ({ el, text: (el.innerText || el.textContent || "").trim() }))
        .filter((x) => x.text.length > 50)
        .sort((a, b) => b.text.length - a.text.length)[0];
      if (best) return best.text;
    }
    // 마지막 fallback — 페이지 전체 main 영역의 텍스트
    const main = document.querySelector('main') || document.body;
    return (main?.innerText || "").trim();
  }

  function setButtonState(btn, state, label) {
    btn.setAttribute(STATUS_ATTR, state);
    btn.textContent = label;
    if (state === "ok") {
      btn.style.background = "#0d7a3e";
      btn.style.borderColor = "#16a34a";
    } else if (state === "err") {
      btn.style.background = "#7a0d1a";
      btn.style.borderColor = "#dc2626";
    } else if (state === "sending") {
      btn.style.background = "#1e3a8a";
      btn.style.borderColor = "#3b82f6";
    } else {
      btn.style.background = "#0c4a6e";
      btn.style.borderColor = "#0ea5e9";
    }
  }

  function buildButton() {
    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.textContent = "📥 Aston Wiki로 동기화";
    btn.setAttribute(STATUS_ATTR, "idle");
    btn.style.cssText = [
      "position: fixed",
      "top: 70px",
      "right: 20px",
      "z-index: 999999",
      "padding: 8px 14px",
      "border-radius: 8px",
      "border: 1px solid #0ea5e9",
      "background: #0c4a6e",
      "color: #ffffff",
      "font-size: 13px",
      "font-weight: 500",
      "cursor: pointer",
      "box-shadow: 0 2px 8px rgba(0,0,0,0.3)",
      "font-family: 'Segoe UI', system-ui, sans-serif",
    ].join(";");

    btn.addEventListener("click", async () => {
      if (btn.getAttribute(STATUS_ATTR) === "sending") return;
      const noteText = extractNoteText();
      const notebookTitle = extractNotebookTitle();
      const sourceUrl = location.href;
      console.log("[Aston Bridge] 🖱 클릭됨", {
        sourceUrl,
        notebookTitle,
        noteTextLength: noteText.length,
        firstChars: noteText.slice(0, 80),
      });

      if (!noteText || noteText.length < 20) {
        setButtonState(btn, "err", "❌ 본문 없음");
        setTimeout(() => setButtonState(btn, "idle", "📥 Aston Wiki로 동기화"), RESET_AFTER_MS);
        return;
      }

      setButtonState(btn, "sending", "⏳ 전송 중…");
      console.log("[Aston Bridge] background.js 로 메시지 송신 중…");
      try {
        const response = await chrome.runtime.sendMessage({
          type: "ASTON_INGEST",
          payload: {
            sourceUrl,
            notebookTitle,
            noteText,
            capturedAt: new Date().toISOString(),
          },
        });
        console.log("[Aston Bridge] 백엔드 응답:", response);
        if (response?.ok) {
          let label;
          if (response.status === "skipped") {
            label = "✅ 이미 동일 본문 (skip)";
          } else if (response.isUnmapped) {
            label = "⚠️ _unmapped 임시 저장 — yaml 매핑 필요";
          } else {
            label = `✅ 위키 적재 완료 (${response.project ?? ""})`;
          }
          setButtonState(btn, "ok", label);
          if (response.mappingHint) {
            console.log("[Aston Bridge] mapping hint:", response.mappingHint);
          }
        } else {
          setButtonState(btn, "err", `❌ ${response?.error ?? "전송 실패"}`);
        }
      } catch (err) {
        setButtonState(btn, "err", "❌ 백엔드 연결 실패");
        console.error("[Aston Bridge] sendMessage 오류:", err);
      } finally {
        setTimeout(
          () => setButtonState(btn, "idle", "📥 Aston Wiki로 동기화"),
          RESET_AFTER_MS,
        );
      }
    });
    return btn;
  }

  function ensureButton() {
    if (!isNotebookPage()) {
      const existing = findExistingButton();
      if (existing) {
        existing.remove();
        console.log("[Aston Bridge] 노트북 페이지 아님 — 버튼 제거", location.pathname);
      }
      return;
    }
    if (findExistingButton()) return;
    document.body.appendChild(buildButton());
    console.log("[Aston Bridge] ✅ 버튼 주입 완료:", location.href);
  }

  // SPA 라우팅 대응 — DOM 변화 감지하여 버튼 유지.
  const observer = new MutationObserver(() => {
    ensureButton();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // history.pushState 후크 (NotebookLM 은 SPA — URL 변경에도 반응).
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (...args) {
    const r = origPush.apply(this, args);
    setTimeout(ensureButton, 100);
    return r;
  };
  history.replaceState = function (...args) {
    const r = origReplace.apply(this, args);
    setTimeout(ensureButton, 100);
    return r;
  };
  window.addEventListener("popstate", () => setTimeout(ensureButton, 100));

  // 초기 한 번
  ensureButton();
  console.log("[Aston Bridge] content.js 활성화 — notebooklm.google.com");
})();
