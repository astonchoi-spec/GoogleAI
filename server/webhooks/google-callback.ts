/**
 * Google OAuth Callback Handler
 * Handles OAuth 2.0 callback from Google
 */

import express from "express";
import type { Request, Response } from "express";
import GoogleAuthManager from "../google/auth.ts";
import { SessionManager } from "../llm/session.ts";

const router = express.Router();
const sessionManager = new SessionManager();

let googleAuthManager: GoogleAuthManager | null = null;

function renderPopupClosePage(status: "success" | "error", message: string): string {
  const safeStatus = JSON.stringify(status);
  const safeMessage = JSON.stringify(message);

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Google 연결 ${status === "success" ? "완료" : "실패"}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #020617;
        color: #e2e8f0;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(420px, calc(100vw - 32px));
        padding: 28px;
        border: 1px solid #1e293b;
        border-radius: 14px;
        background: #0f172a;
        text-align: center;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 20px;
      }
      p {
        margin: 0 0 18px;
        color: #94a3b8;
        line-height: 1.6;
      }
      button {
        border: 0;
        border-radius: 10px;
        background: #0891b2;
        color: white;
        font-weight: 700;
        padding: 10px 16px;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${status === "success" ? "Google 연결 완료" : "Google 연결 실패"}</h1>
      <p>${message}</p>
      <button type="button" onclick="window.close()">창 닫기</button>
    </main>
    <script>
      const payload = { type: "google-oauth:${status}", status: ${safeStatus}, message: ${safeMessage} };
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, window.location.origin);
      }
      window.close();
    </script>
  </body>
</html>`;
}

/**
 * Initialize Google Auth Manager
 */
export function initializeGoogleAuth(authManager: GoogleAuthManager): void {
  googleAuthManager = authManager;
}

/**
 * OAuth callback endpoint
 * GET /api/webhooks/google/callback
 */
router.get("/google/callback", async (req: Request, res: Response) => {
  try {
    const { code, state, error } = req.query;

    // Handle error from Google
    if (error) {
      const errorDescription = req.query.error_description || "Unknown error";
      return res.status(400).json({
        ok: false,
        error: `Google OAuth error: ${error}`,
        description: errorDescription,
      });
    }

    if (!code || !state) {
      return res.status(400).json({
        ok: false,
        error: "Missing code or state parameter",
      });
    }

    if (!googleAuthManager) {
      return res.status(503).json({
        ok: false,
        error: "Google Auth not initialized",
      });
    }

    const userId = state as string;

    // Exchange code for tokens
    await googleAuthManager.exchangeCodeForTokens(code as string, userId);

    res
      .status(200)
      .type("html")
      .send(renderPopupClosePage("success", "원래 창으로 돌아갑니다. 이 창은 자동으로 닫힙니다."));
  } catch (error) {
    console.error("[Google Callback] Error:", error);
    res
      .status(500)
      .type("html")
      .send(
        renderPopupClosePage(
          "error",
          error instanceof Error ? error.message : "Google 연결 중 오류가 발생했습니다."
        )
      );
  }
});

/**
 * Check authentication status
 * GET /api/webhooks/google/auth-status
 */
router.get("/google/auth-status", async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        ok: false,
        error: "userId is required",
      });
    }

    if (!googleAuthManager) {
      return res.status(503).json({
        ok: false,
        error: "Google Auth not initialized",
      });
    }

    const authenticated = await googleAuthManager.isAuthenticated(userId as string);

    res.json({
      ok: true,
      authenticated,
      userId,
    });
  } catch (error) {
    console.error("[Auth Status] Error:", error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

export default router;
