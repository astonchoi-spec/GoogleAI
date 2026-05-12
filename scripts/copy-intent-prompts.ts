import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const srcDir = path.join(rootDir, "server", "intent", "prompts");
const distDir = path.join(rootDir, "dist", "prompts");

function copyPrompts(): void {
  if (!fs.existsSync(srcDir)) {
    console.error(`[copy-intent-prompts] source not found: ${srcDir}`);
    process.exit(1);
  }

  fs.mkdirSync(distDir, { recursive: true });

  const entries = fs
    .readdirSync(srcDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"));

  if (entries.length === 0) {
    console.error(`[copy-intent-prompts] no .md files in ${srcDir}`);
    process.exit(1);
  }

  for (const entry of entries) {
    const from = path.join(srcDir, entry.name);
    const to = path.join(distDir, entry.name);
    fs.copyFileSync(from, to);
    const bytes = fs.statSync(to).size;
    console.log(`[copy-intent-prompts] ${entry.name} (${bytes}B) → dist/prompts/`);
  }

  console.log(
    `[copy-intent-prompts] copied ${entries.length} prompt file(s) to ${distDir}`,
  );
}

copyPrompts();
