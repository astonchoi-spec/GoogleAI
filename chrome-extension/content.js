// Aston NotebookLM Bridge — content script
// notebooklm.google.com/notebook/* 페이지에 [📥 Aston Wiki로 가져오기] 버튼을 주입한다.
// 클릭 시 현재 화면의 노트 본문 텍스트 + 노트북 제목 + URL을 스크래핑해서
// background.js 를 거쳐 워크스테이션 백엔드(POST /api/rag/extension-ingest)로 전송.

(function () {
  "use strict";

  console.log("[Aston Bridge] content.js 활성화 — " + location.href);

  const BUTTON_ID = "aston-wiki-sync-btn";
  const STATUS_ATTR = "data-aston-status"; // idle | sending | ok | err
  const HOST_ID = "aston-wiki-host"; // floating container
  const RESET_AFTER_MS = 3000;
  const RECHECK_INTERVAL_MS = 2000;

  function isNotebookPage() {
    // /notebook/{id} 또는 /u/0/notebook/{id} 등 계정 prefix 케이스도 매칭
    // id에 대문자, 숫자, '-', '_' 포함 가능 (Google이 포맷 변경해도 살아남도록 광범위 허용)
    return /\/notebook\/[\w-]+/i.test(location.pathname);
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

  // 가시성 검사 — 화면에 실제 보이는 요소만 채택
  function isVisible(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    if (el.offsetParent === null && el.tagName !== "BODY") return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
    return true;
  }

  // UI noise 블랙리스트 — 이모티콘 피커·로딩 placeholder·검색창 라벨 등
  const NOISE_TOKENS = [
    "이모티콘을 찾을 수 없음",
    "최근에 사용함",
    "로드 중",
    "검색 결과",
    "노트북 만들기",
    "Search emojis",
    "Loading",
    "만족스러운 콘텐츠",
    "불만족스러운 콘텐츠",
    "소스 1개 기반",
    "소스 기반",
  ];

  // Google Material Symbols / Material Icons 이름 — NotebookLM UI 버튼에 자주 노출됨
  // (회장님이 PDF 소스 뷰어에서 버튼 누르면 본문 대신 이것들이 긁힘)
  const MATERIAL_ICON_NAMES = new Set([
    "ios_share","edit","share","more_horiz","more_vert","play_arrow","pause",
    "collapse_content","expand_content","close","add","remove","check","cancel",
    "thumb_up","thumb_down","arrow_back","arrow_forward","arrow_drop_down",
    "settings","menu","search","mic","stop","refresh","download","upload",
    "save","delete","copy","content_copy","favorite","star","help","info",
    "open_in_new","fullscreen","fullscreen_exit","keyboard_arrow_down",
    "keyboard_arrow_up","chevron_left","chevron_right","attach_file",
    "format_bold","format_italic","format_list_bulleted","format_list_numbered",
    "수정","공유","삭제","복사","저장","닫기","열기","추가","제거","좋아요","싫어요",
  ]);

  function isNoiseText(text) {
    const compact = text.replace(/\s+/g, " ").trim();
    if (compact.length < 30) return true;
    // 텍스트의 50% 이상이 noise 토큰들로만 구성되면 UI 노이즈로 판정
    let noiseLen = 0;
    for (const tok of NOISE_TOKENS) {
      let idx = 0;
      while ((idx = compact.indexOf(tok, idx)) !== -1) {
        noiseLen += tok.length;
        idx += tok.length;
      }
    }
    if (noiseLen / compact.length > 0.4) return true;
    // 의미 있는 알파벳/한글 문자 비율이 너무 낮으면 (공백/특수문자만 가득) noise
    const meaningful = compact.replace(/[\s\W_]+/g, "");
    if (meaningful.length / compact.length < 0.3) return true;

    // Material Icons + 페이지 번호 패턴 검사 — NotebookLM PDF 뷰어에서 흔히 발생
    // 줄 단위로 잘라서 각 줄이 단일 토큰(icon 이름 또는 1~3자리 숫자)인 비율 측정
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 5) {
      let junkLines = 0;
      for (const line of lines) {
        if (MATERIAL_ICON_NAMES.has(line.toLowerCase())) { junkLines++; continue; }
        if (/^\d{1,3}$/.test(line)) { junkLines++; continue; } // 페이지 번호
        if (/^[a-z_]{2,30}$/.test(line)) { junkLines++; continue; } // material_icon 미등록 변종
      }
      if (junkLines / lines.length > 0.5) {
        console.log("[Aston Bridge] noise 판정 — UI 아이콘/페이지번호 비율", (junkLines / lines.length).toFixed(2));
        return true;
      }
    }

    // 평균 줄 길이가 너무 짧으면(평균 ≤ 8자) UI 라벨 모음
    if (lines.length >= 8) {
      const avg = compact.length / lines.length;
      if (avg <= 8) {
        console.log("[Aston Bridge] noise 판정 — 평균 줄 길이", avg.toFixed(1));
        return true;
      }
    }
    return false;
  }

  // 노트 본문 텍스트 추출 — 가시성·노이즈 필터링 적용.
  // 우선순위:
  //   1) 사용자가 드래그한 selection (가장 신뢰 가능)
  //   2) NotebookLM 챗/응답 영역 selector (visible + 본문 길이 기준)
  //   3) main 영역 fallback
  function extractNoteText() {
    // 1) 사용자 selection 우선
    const sel = window.getSelection?.()?.toString().trim();
    if (sel && sel.length >= 30 && !isNoiseText(sel)) {
      console.log("[Aston Bridge] selection 으로 본문 채택 (length=" + sel.length + ")");
      return sel;
    }

    // 2) NotebookLM 챗/응답 selector 우선순위
    const candidates = [
      // 저작물(보고서·로드맵·시장분석 등) 펼침 모달 — 최우선
      '[role="dialog"][aria-modal="true"]',
      '[data-test-id*="artifact"]',
      '[data-test-id*="studio-output"]',
      // NotebookLM 챗 응답 (최우선 — Google 이 자주 쓰는 패턴)
      'chat-message',
      '[data-testid*="chat-message"]',
      '[data-testid*="chat-response"]',
      '[data-test-id*="chat-message"]',
      '[data-test-id*="response"]',
      '[role="log"]',
      // 노트 콘텐츠
      '[data-testid*="note-content"]',
      '[data-test-id*="note-content"]',
      'article',
      'main [role="article"]',
      // 그 다음 일반 main
      '[role="main"] [contenteditable="true"]',
      '[role="main"]',
    ];

    for (const selDef of candidates) {
      const els = Array.from(document.querySelectorAll(selDef)).filter(isVisible);
      if (els.length === 0) continue;
      const ranked = els
        .map((el) => ({ el, text: (el.innerText || el.textContent || "").trim() }))
        .filter((x) => x.text.length >= 50 && !isNoiseText(x.text))
        .sort((a, b) => b.text.length - a.text.length);
      if (ranked.length > 0) {
        console.log("[Aston Bridge] selector 매칭:", selDef, "(length=" + ranked[0].text.length + ")");
        return ranked[0].text;
      }
    }

    // 3) Fallback — main 영역의 visible 텍스트 (자식들에 대해 직접 가시성 검사)
    const main = document.querySelector('main') || document.body;
    if (main) {
      const all = Array.from(main.querySelectorAll('p, div, span, li'))
        .filter(isVisible)
        .map((el) => (el.innerText || el.textContent || "").trim())
        .filter((t) => t.length >= 50 && !isNoiseText(t));
      if (all.length > 0) {
        // 가장 긴 의미 있는 블록
        const longest = all.sort((a, b) => b.length - a.length)[0];
        console.log("[Aston Bridge] fallback main 영역 채택 (length=" + longest.length + ")");
        return longest;
      }
    }

    return "";
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
    btn.textContent = "📥 Aston Wiki로 가져오기";
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

      // 본문 임계치 상향 (300자) — UI 아이콘/페이지번호만 잡힌 경우(이전 162자 케이스) 차단.
      // 짧으면 noise 일 확률 매우 높음. 실제 저작물은 보통 1,000자 이상.
      if (!noteText || noteText.length < 300) {
        setButtonState(btn, "err", "❌ 본문이 너무 짧음 — Studio 저작물을 펼친 상태에서 재시도");
        console.warn(
          "[Aston Bridge] 본문 추출 실패 또는 너무 짧음 (length=" + (noteText?.length ?? 0) + ").\n" +
          "  ① NotebookLM 우측 Studio 패널에서 보고서/요약/FAQ 등 저작물을 클릭해 본문이 화면에 표시된 상태에서 버튼 클릭.\n" +
          "  ② 또는 화면에서 회수하려는 텍스트를 드래그 선택 후 버튼 클릭.\n" +
          "  ⚠ 소스 PDF 뷰어 화면에서는 본문을 추출할 수 없습니다 (NotebookLM 이 원본 PDF 본문을 노출하지 않음)."
        );
        setTimeout(
          () => setButtonState(btn, "idle", "📥 Aston Wiki로 가져오기"),
          RESET_AFTER_MS + 2000,
        );
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
          const proj = response.project ?? "";
          const v = response.version ?? 1;
          const kind = response.artifactKind ? ` ${response.artifactKind}` : "";
          if (response.status === "skipped") {
            label = `⏸ 동일 본문 skip (v${v} 유지)`;
          } else if (response.status === "versioned") {
            label = `📚 신규 버전 저장 (v${v})`;
          } else if (response.isUnmapped) {
            label = `⚠️ _unmapped${kind} v${v} — yaml 매핑 필요`;
          } else {
            label = `✅ 적재 완료 (${proj}${kind} v${v})`;
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
          () => setButtonState(btn, "idle", "📥 Aston Wiki로 가져오기"),
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

  // 초기 한 번 + 안전망: 일정 주기 재검사 (NotebookLM 의 lazy DOM/iframe 케이스 대응)
  ensureButton();
  setInterval(ensureButton, RECHECK_INTERVAL_MS);
})();
