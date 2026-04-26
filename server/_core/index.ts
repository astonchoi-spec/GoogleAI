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
import { googleAuthManager } from "../routers/google-workspace.ts";
import { installDeploymentGuards, logStartupSummary } from "./deployment.ts"; // MODIFIED: add production bootstrap checks and persistent error logging.
import { registerTvWebhookRoutes } from "../alerts/tvWebhookServer.ts"; // MODIFIED: register TradingView webhook endpoint.

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
  installDeploymentGuards(); // MODIFIED: capture fatal runtime errors before the app starts handling requests.
  if (process.env.NODE_ENV === "production") {
    await logStartupSummary(); // MODIFIED: surface production readiness warnings only in production boot logs.
  }

  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  
  // TradingView webhook route
  registerTvWebhookRoutes(app); // MODIFIED: POST /api/tv-webhook handler.

  // Telegram webhook routes
  app.use("/api/webhooks", telegramRouter);

  // Google OAuth callback route
  initializeGoogleAuth(googleAuthManager);
  app.use("/api/webhooks", googleCallbackRouter);
  
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
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    console.log(`[Google] CLIENT_ID set: ${!!process.env.GOOGLE_CLIENT_ID}, SECRET set: ${!!process.env.GOOGLE_CLIENT_SECRET}`);
  });
  
  // Initialize Telegram bot
  await initializeTelegramBot();

  // Graceful shutdown
  process.once("SIGINT", () => server.close());
  process.once("SIGTERM", () => server.close());
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
