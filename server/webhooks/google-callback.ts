/**
 * Google OAuth Callback Handler
 * Handles OAuth 2.0 callback from Google
 */

import { Router, Request, Response } from "express";
import GoogleAuthManager from "../google/auth";
import { SessionManager } from "../llm/session";

const router = Router();
const sessionManager = new SessionManager();

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
    await googleAuthManager.exchangeCodeForTokens(code as string, userId);

    // Redirect to success page or return success response
    res.json({
      ok: true,
      message: "Successfully authenticated with Google",
      userId,
    });
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
