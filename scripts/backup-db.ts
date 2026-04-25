import fs from "fs/promises";
import path from "path";

const dbPath = path.resolve("data/chat.db");
const backupDir = path.resolve("backups");

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `chat-${stamp}.db`);

  await fs.mkdir(backupDir, { recursive: true });
  await fs.copyFile(dbPath, backupPath);
  console.log(`Backed up ${dbPath} -> ${backupPath}`);
}

main().catch((error) => {
  console.error("Database backup failed:", error);
  process.exit(1);
});
