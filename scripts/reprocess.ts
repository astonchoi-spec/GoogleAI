#!/usr/bin/env node
// scripts/reprocess.ts — pending 큐 일괄 재처리 CLI.
//
// 사용법:
//   npx tsx scripts/reprocess.ts            # 전체 pending 재처리
//   npx tsx scripts/reprocess.ts --dry-run  # 목록만 출력 (저장 안 함)
//   npx tsx scripts/reprocess.ts --list     # pending 목록 출력
//   npx tsx scripts/reprocess.ts --max 5    # 최대 5건만 처리

import path from "node:path";
import { fileURLToPath } from "node:url";

// 레포 루트에서 실행되도록 cwd 보장
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, ".."));

// 환경변수 로드 (.env)
const { config } = await import("dotenv");
config();

import { listPending, removePending } from "../server/knowledge/storage/pendingQueue.ts";
import { saveWikiEntry } from "../server/knowledge/storage/wikiWriter.ts";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isList = args.includes("--list");
const maxIdx = args.indexOf("--max");
const maxCount = maxIdx !== -1 ? parseInt(args[maxIdx + 1] ?? "0", 10) || Infinity : Infinity;

async function main() {
  const items = await listPending();

  if (items.length === 0) {
    console.log("✅ pending 큐 비어있음. 재처리할 항목 없음.");
    return;
  }

  console.log(`📋 pending 큐: ${items.length}건`);

  if (isList) {
    for (const item of items) {
      console.log([
        `  source_ref: ${item.source_ref}`,
        `  attempts: ${item.attempts}`,
        `  last_error: ${item.last_error}`,
        `  first_failed_at: ${item.first_failed_at}`,
        `  target: ${item.route.target_folder}`,
      ].join("\n"), "\n");
    }
    return;
  }

  if (isDryRun) {
    console.log("-- dry-run 모드: 저장하지 않음 --");
    for (const item of items) {
      console.log(`  [SKIP] ${item.source_ref} → ${item.route.target_folder}`);
    }
    return;
  }

  const toProcess = items.slice(0, maxCount === Infinity ? undefined : maxCount);
  let succeeded = 0;
  let failed = 0;

  for (const item of toProcess) {
    console.log(`⏳ 재시도: ${item.source_ref}`);
    try {
      const entry = await saveWikiEntry(item.doc, item.route);
      if (entry.was_skipped) {
        console.log(`  ⏭️  skip (이미 저장됨): ${entry.saved_path}`);
      } else {
        console.log(`  ✅ 저장 완료: ${entry.saved_path}`);
      }
      await removePending(item.source_ref);
      succeeded++;
    } catch (err) {
      console.error(`  ❌ 실패 (재시도 큐 유지): ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\n완료 — 성공: ${succeeded}건, 실패: ${failed}건, 잔여: ${items.length - toProcess.length + failed}건`);
}

main().catch((err) => {
  console.error("reprocess 오류:", err);
  process.exit(1);
});
