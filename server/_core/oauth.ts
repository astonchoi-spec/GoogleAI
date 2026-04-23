import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.ts";
import type { Express, Request, Response } from "express";
import * as db from "../db.ts";
import { getSessionCookieOptions } from "./cookies.ts";
import { sdk } from "./sdk.ts";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

export function registerOAuthRoutes(app: Express) {
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { username, password } = req.body ?? {};

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    try {
      await db.upsertUser({
        openId: "admin",
        name: "Admin",
        email: null,
        loginMethod: "password",
        lastSignedIn: new Date(),
        role: "admin",
      });

      const token = await sdk.createSessionToken("admin", { name: "Admin" });

      res.cookie(COOKIE_NAME, token, {
        ...getSessionCookieOptions(req),
        maxAge: ONE_YEAR_MS,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("[Auth] Login failed:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });
}
