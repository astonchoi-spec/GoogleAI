import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth.ts";
import { registerStorageProxy } from "./storageProxy.ts";
import { registerProxyRoutes } from "../routers/proxy.ts";
import { registerTradingRiskRoutes } from "../routers/tradingRisk.ts"; // MODIFIED: Trading Risk Guard endpoints.
import { registerAgentRoutes } from "../routers/agents.ts"; // MODIFIED: Agent Control endpoints.
import { probeOpenClaw, setAgentNotifier } from "../agents/index.ts"; // MODIFIED: wire telegram notifier and OpenClaw probe for agent tasks.
import { agentTelegramNotifier } from "./agentNotifier.ts"; // MODIFIED: telegram notifier for agent tasks.
import { appRouter } from "../routers.ts";
import { createContext } from "./context.ts";
import { serveStatic, setupVite } from "./vite.ts";
import telegramRouter, { initializeTelegramBot } from "../webhooks/telegram.ts";
import googleCallbackRouter, { initializeGoogleAuth } from "../webhooks/google-callback.ts";
import { googleAuthManager } from "../routers/google-workspace.ts";
import { installDeploymentGuards, logStartupSummary } from "./deployment.ts"; // MODIFIED: add production bootstrap checks and persistent error logging.
import { registerTvWebhookRoutes } from "../alerts/tvWebhookServer.ts"; // MODIFIED: register TradingView webhook endpoint.
import { registerMorningBriefingScheduler } from "../intelligence/briefing.ts";
import { startCollector } from "../intelligence/collector.ts";
import { registerDealSheetSyncScheduler } from "../deals/dealSheetSync.ts";
import { registerDealDeadlineNotifier } from "../deals/dealDeadlineNotifier.ts";
import { startKakaoFolderWatcher, stopKakaoFolderWatcher } from "../deals/folderWatcher.ts"; // MODIFIED: watch KakaoTalk downloads for deal file classification.
import { startGmailWatcher, stopGmailWatcher } from "../deals/gmailWatcher.ts"; // MODIFIED: poll Gmail deal attachments.
import { startDownloadWatcher, stopDownloadWatcher } from "../deals/downloadWatcher.ts"; // MODIFIED: watch browser downloads for deal file classification.
import { startDriveSync, stopDriveSync, setAllowedProjects as setRagAllowedProjects } from "../knowledge/driveSync.ts"; // MODIFIED: NotebookLM exports 폴더 자동 회수 (Phase W-2).
import { loadRagMapping } from "../rag/mappingLoader.ts"; // MODIFIED: rag 매핑을 부팅 시 driveSync 에 주입.
import {
  handleExtensionIngest,
  setExtensionUrlMappings,
} from "../knowledge/extensionIngest.ts"; // MODIFIED: Chrome Extension 수신 엔드포인트.
import {
  handleWikiUpload,
  setUploadAllowedProjects,
} from "../knowledge/wikiUpload.ts"; // MODIFIED: /wiki 페이지 업로드 UI 수신 엔드포인트 (Step 1.5).

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

  registerMorningBriefingScheduler();
  registerDealSheetSyncScheduler();
  registerDealDeadlineNotifier();
  void startCollector().catch((e) => console.error("[collector] 시작 실패:", e));

  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerProxyRoutes(app);
  registerTradingRiskRoutes(app); // MODIFIED: register Trading Risk Guard /api/trading/risk/* routes.
  setAgentNotifier(agentTelegramNotifier); // MODIFIED: hook telegram notifications into agent queue.
  void probeOpenClaw(); // MODIFIED: startup OpenClaw auto-detection keeps simulation fallback on failure.
  registerAgentRoutes(app); // MODIFIED: register Agent Control /api/agents/* routes.

  // Aston NotebookLM Bridge (Chrome Extension) 수신 엔드포인트 — Phase W-2 보완
  app.options("/api/rag/extension-ingest", handleExtensionIngest);
  app.post("/api/rag/extension-ingest", handleExtensionIngest);
  app.get("/api/rag/extension-ingest", handleExtensionIngest); // 헬스체크 — 브라우저로 직접 접속 가능

  // Aston Wiki 페이지 업로드 UI 수신 엔드포인트 (Step 1.5, 2026-05-12)
  app.options("/api/wiki/upload", handleWikiUpload);
  app.post("/api/wiki/upload", handleWikiUpload);
  app.get("/api/wiki/upload", handleWikiUpload); // 헬스체크 — 허용 project 목록 + 확장자 노출

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
  startKakaoFolderWatcher();
  startGmailWatcher();
  startDownloadWatcher();
  // RAG 매핑 yaml 의 28개 project 목록을 driveSync 화이트리스트로 주입 후 watcher 시작.
  // 한글 경로 인코딩 진단: ASTON_WIKI_ROOT 값이 mojibake 인지 부팅 시 즉시 감지.
  const wikiRootRaw = process.env.ASTON_WIKI_ROOT ?? process.env.WIKI_ROOT ?? "";
  if (wikiRootRaw.includes("???") || /[�]/.test(wikiRootRaw)) {
    console.error(
      "\n[rag] ⚠️ ASTON_WIKI_ROOT 값에 mojibake 감지: " + JSON.stringify(wikiRootRaw),
    );
    console.error(
      "[rag] ⚠️ .env 파일이 UTF-8 (BOM 없음) 인코딩으로 저장되어 있는지 확인하세요.",
    );
    console.error(
      "[rag] ⚠️ 권장: VS Code 우하단 인코딩 클릭 → 'Save with Encoding' → UTF-8 선택 → .env 다시 저장.\n",
    );
  } else if (wikiRootRaw) {
    console.log("[rag] ASTON_WIKI_ROOT = " + wikiRootRaw);
  }
  try {
    const ragMapping = loadRagMapping();
    const projectList = ragMapping.notebooks.map((n) => n.project);
    setRagAllowedProjects(projectList);
    // Wiki 업로드 UI 화이트리스트도 같은 출처에서 채움 (Step 1.5).
    setUploadAllowedProjects(projectList);
    // Chrome Extension 의 URL→project 매핑도 함께 주입.
    const urlMappings = ragMapping.notebooks
      .filter((n) => n.notebook_url && n.notebook_url.trim().length > 0)
      .map((n) => ({ url: n.notebook_url as string, project: n.project }));
    setExtensionUrlMappings(urlMappings);
    console.log(
      `[rag/extension] URL→project 매핑 ${urlMappings.length}건 등록됨 (yaml 의 notebook_url 채워진 노트북)`,
    );
    console.log(
      `[wiki/upload] 허용 project ${projectList.length + 2}개 등록 (yaml ${projectList.length} + research-inbox + _unmapped)`,
    );
  } catch (e) {
    console.error("[rag/driveSync] 매핑 로드 실패:", e);
  }
  void startDriveSync().catch((e) => console.error("[rag/driveSync] 시작 실패:", e));

  // Merge ghost Telegram conversations (userId=1) into real web user on startup
  try {
    const { autoMergeTelegramConversations } = await import("../db-chat.ts");
    await autoMergeTelegramConversations();
  } catch (mergeErr) {
    console.warn("[STARTUP] autoMergeTelegramConversations failed:", mergeErr);
  }

  // Graceful shutdown
  const shutdown = () => {
    stopGmailWatcher();
    void Promise.all([stopKakaoFolderWatcher(), stopDownloadWatcher()]).finally(() => server.close());
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
