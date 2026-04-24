import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth.ts";
import { registerStorageProxy } from "./storageProxy.ts";
import { appRouter } from "../routers.ts";
import { createContext } from "./context.ts";
import { serveStatic, setupVite } from "./vite.ts";
import telegramRouter, { initializeTelegramBot } from "../webhooks/telegram.ts";
import googleCallbackRouter, { initializeGoogleAuth } from "../webhooks/google-callback.ts";
import tradingViewWebhookRouter from "../webhooks/tradingview.ts";
import { googleAuthManager } from "../routers/google-workspace.ts";
import { kiwoomRealtimeFeed } from "../exchanges/kiwoomWebSocket.ts";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const startedAt = Date.now();
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.use((req, res, next) => {
    const requestStartedAt = Date.now();
    res.on("finish", () => {
      const elapsedMs = Date.now() - requestStartedAt;
      console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${elapsedMs}ms)`);
    });
    next();
  });

  app.get("/healthz", (_req, res) => {
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    });
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    });
  });

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  
  // Telegram webhook routes
  app.use("/api/webhooks", telegramRouter);

  // Google OAuth callback route
  initializeGoogleAuth(googleAuthManager);
  app.use("/api/webhooks", googleCallbackRouter);
  app.use("/api/webhooks", tradingViewWebhookRouter);
  
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const isDevelopment = process.env.NODE_ENV === "development";
  const port = isDevelopment
    ? await findAvailablePort(preferredPort)
    : preferredPort;

  if (isDevelopment && port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    console.log(`[Google] CLIENT_ID set: ${!!process.env.GOOGLE_CLIENT_ID}, SECRET set: ${!!process.env.GOOGLE_CLIENT_SECRET}`);
  });
  
  // Initialize Telegram bot
  await initializeTelegramBot();

  if (kiwoomRealtimeFeed.isConfigured()) {
    void kiwoomRealtimeFeed.connectFromEnv().catch((error) => {
      console.warn("[KiwoomWebSocket] Initial connect failed:", error instanceof Error ? error.message : String(error));
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[Server Error]", err);
    res.status(500).json({
      ok: false,
      error: message,
    });
  });

  // Graceful shutdown
  process.once("SIGINT", () => server.close());
  process.once("SIGTERM", () => server.close());
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
