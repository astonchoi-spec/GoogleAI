/**
 * Smoke test for frontend routes.
 *
 * 검증 항목:
 * 1. dist/public/index.html 가 존재
 * 2. main bundle 파일이 존재 + 비어있지 않음
 * 3. App.tsx의 expected routes가 모두 정의됨 (회귀 방지)
 *
 * 실행: `npm run smoke:routes` (build 후 실행)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST_PUBLIC = path.join(ROOT, "dist", "public");
const APP_TSX = path.join(ROOT, "client", "src", "App.tsx");

// 운영상 반드시 존재해야 하는 핵심 라우트 — 사고로 누락되면 CI에서 차단
const REQUIRED_ROUTES = [
  "/",
  "/chat",
  "/trading",
  "/real-estate-pf",
  "/google",
  "/settings",
  "/monitoring",
  "/login",
];

const errors: string[] = [];
const warnings: string[] = [];

function checkBuildArtifacts(): void {
  const indexHtml = path.join(DIST_PUBLIC, "index.html");
  if (!fs.existsSync(indexHtml)) {
    errors.push(`dist/public/index.html 누락 — 'npm run build' 먼저 실행하세요.`);
    return;
  }

  const html = fs.readFileSync(indexHtml, "utf-8");
  if (!html.includes("<div id=\"root\"")) {
    errors.push(`dist/public/index.html에 <div id="root"> 마운트 포인트 누락.`);
  }

  const assetsDir = path.join(DIST_PUBLIC, "assets");
  if (!fs.existsSync(assetsDir)) {
    errors.push(`dist/public/assets 디렉토리 누락.`);
    return;
  }

  const jsFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith(".js"));
  if (jsFiles.length === 0) {
    errors.push(`dist/public/assets에 JS bundle 누락.`);
    return;
  }

  let totalSize = 0;
  for (const f of jsFiles) {
    const stat = fs.statSync(path.join(assetsDir, f));
    totalSize += stat.size;
    if (stat.size === 0) {
      errors.push(`빈 JS 번들: assets/${f}`);
    }
  }

  if (totalSize < 100_000) {
    warnings.push(`JS 번들 총 크기가 100KB 미만 (${totalSize} bytes) — 빌드 누락 의심.`);
  }
}

function checkRequiredRoutes(): void {
  if (!fs.existsSync(APP_TSX)) {
    errors.push(`App.tsx 누락: ${APP_TSX}`);
    return;
  }

  const source = fs.readFileSync(APP_TSX, "utf-8");
  const definedRoutes = new Set<string>();
  const routeRe = /<Route\s+path=\{?["']([^"']+)["']\}?/g;
  let m;
  while ((m = routeRe.exec(source)) !== null) {
    definedRoutes.add(m[1]);
  }

  for (const required of REQUIRED_ROUTES) {
    if (!definedRoutes.has(required)) {
      errors.push(`핵심 라우트 누락: ${required}`);
    }
  }
}

checkBuildArtifacts();
checkRequiredRoutes();

if (warnings.length > 0) {
  console.warn("⚠️  경고:");
  for (const w of warnings) console.warn(`  - ${w}`);
}

if (errors.length > 0) {
  console.error("🚫 빌드 스모크 검사 실패:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("✅ 빌드 스모크 검사 통과: 핵심 라우트 + 빌드 산출물 정상");
