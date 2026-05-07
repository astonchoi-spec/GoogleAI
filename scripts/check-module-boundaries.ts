import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// MODIFIED: Modular Monolith 도메인 간 직접 import를 검증한다.
const DOMAIN_MODULES = ["wiki", "deals", "trading", "intelligence", "google", "finance", "realestate", "agents", "knowledge"] as const;
const PROHIBITED_TARGETS = [...DOMAIN_MODULES, "intent"] as const;

type DomainModule = (typeof DOMAIN_MODULES)[number];

interface Violation {
  file: string;
  line: number;
  sourceModule: DomainModule;
  targetModule: string;
  specifier: string;
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(rootDir, "server");

function walkTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkTsFiles(fullPath);
    if (!entry.isFile()) return [];
    if (!entry.name.endsWith(".ts")) return [];
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".d.ts")) return [];
    return [fullPath];
  });
}

function normalizeRelative(filePath: string): string {
  return path.relative(rootDir, filePath).replaceAll(path.sep, "/");
}

function lineNumberAt(source: string, index: number): number {
  return source.slice(0, index).split(/\r?\n/).length;
}

function resolveRelativeImport(filePath: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const resolved = path.resolve(path.dirname(filePath), specifier);
  return normalizeRelative(resolved).replace(/\.(ts|tsx|js|jsx)$/, "");
}

function moduleFromResolvedPath(resolvedPath: string): string | null {
  const parts = resolvedPath.split("/");
  if (parts[0] !== "server") return null;
  return parts[1] ?? null;
}

function findImportSpecifiers(source: string): Array<{ specifier: string; index: number }> {
  const specs: Array<{ specifier: string; index: number }> = [];
  const importExportRe =
    /\b(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s*)?["']([^"']+)["']/g;

  let match: RegExpExecArray | null;
  while ((match = importExportRe.exec(source)) !== null) {
    specs.push({ specifier: match[1], index: match.index });
  }

  return specs;
}

function checkFile(filePath: string, sourceModule: DomainModule): Violation[] {
  const source = fs.readFileSync(filePath, "utf8");
  const specs = findImportSpecifiers(source);

  return specs.flatMap(({ specifier, index }) => {
    const resolvedPath = resolveRelativeImport(filePath, specifier);
    if (!resolvedPath) return [];

    const targetModule = moduleFromResolvedPath(resolvedPath);
    if (!targetModule) return [];
    if (!PROHIBITED_TARGETS.includes(targetModule as (typeof PROHIBITED_TARGETS)[number])) return [];
    if (targetModule === sourceModule) return [];

    return [
      {
        file: normalizeRelative(filePath),
        line: lineNumberAt(source, index),
        sourceModule,
        targetModule,
        specifier,
      },
    ];
  });
}

function main(): void {
  const violations = DOMAIN_MODULES.flatMap((sourceModule) => {
    const moduleDir = path.join(serverDir, sourceModule);
    return walkTsFiles(moduleDir).flatMap((filePath) => checkFile(filePath, sourceModule));
  });

  if (violations.length === 0) {
    console.log("✅ 모듈 경계 검사 통과: 도메인 간 직접 import 위반 0건");
    return;
  }

  console.error(`🚫 모듈 경계 위반 ${violations.length}건 발견`);
  for (const violation of violations) {
    console.error(
      [
        `- ${violation.file}:${violation.line}`,
        `  ${violation.sourceModule} → ${violation.targetModule} 직접 import: ${violation.specifier}`,
        "  해결: 공유 타입/유틸은 server/_core/로 이동하거나, 데이터는 WIKI_ROOT/DEALS_ROOT 같은 파일 시스템 경로로 공유하세요.",
      ].join("\n"),
    );
  }
  process.exitCode = 1;
}

main();
