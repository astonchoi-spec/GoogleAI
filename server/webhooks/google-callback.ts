/**
 * Google OAuth Callback Handler
 * Handles OAuth 2.0 callback from Google
 */

import express from "express";
import type { Request, Response } from "express";
import GoogleAuthManager from "../google/auth.ts";
import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.ts";
import { getSessionCookieOptions } from "../_core/cookies.ts";
import { sdk } from "../_core/sdk.ts";
import * as db from "../db.ts";

const router = express.Router();

let googleAuthManager: GoogleAuthManager | null = null;

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
    const exchangeResult = await googleAuthManager.exchangeCodeForTokens(code as string, userId);
    const openId = `google:${exchangeResult.profile.id}`;

    await db.upsertUser({
      openId,
      name: exchangeResult.profile.name || exchangeResult.profile.email || "Google User",
      email: exchangeResult.profile.email,
      loginMethod: "google",
      lastSignedIn: new Date(),
      role: "admin",
    });

    const user = await db.getUserByOpenId(openId);
    if (user) {
      await googleAuthManager.storeTokensForUser(
        String(user.id),
        exchangeResult.accessToken,
        exchangeResult.refreshToken,
        exchangeResult.expiresIn
      );
    }

    const token = await sdk.createSessionToken(openId, {
      name: exchangeResult.profile.name || exchangeResult.profile.email || "Google User",
    });

    res.cookie(COOKIE_NAME, token, {
      ...getSessionCookieOptions(req),
      maxAge: ONE_YEAR_MS,
    });

    res.type("html").send(`<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Google connected</title></head>
  <body>
    <script>
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: "google-oauth-connected" }, window.location.origin);
        window.opener.location.href = "/?google=connected";
        window.close();
      } else {
        window.location.href = "/?google=connected";
      }
    </script>
    <p>Google 연결이 완료되었습니다. 창을 닫아도 됩니다.</p>
  </body>
</html>`);
  } catch (error) {
    console.error("[Google Callback] Error:", error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
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
