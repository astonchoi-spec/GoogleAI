// Aston session sanity check — runs on Claude Code SessionStart.
// Output: single JSON line with `systemMessage` field for Claude UI.
import fs from "node:fs";
import { execSync } from "node:child_process";

const REQUIRED_ENV = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "WORKSPACE_SPREADSHEET_ID",
  "GEMINI_API_KEY",
  "TELEGRAM_BOT_TOKEN",
];

const parts = [];

try {
  const env = fs.readFileSync("D:/구글연동AI/.env", "utf8");
  const missing = REQUIRED_ENV.filter((k) => !new RegExp("^" + k + "=", "m").test(env));
  parts.push(missing.length ? `.env 누락: ${missing.join(", ")}` : ".env OK");
} catch {
  parts.push(".env 읽기실패");
}

try {
  const raw = execSync("pm2 jlist", { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] });
  const apps = JSON.parse(raw);
  const aston = apps.find((a) => a.name === "aston");
  parts.push(aston ? `PM2 aston: ${aston.pm2_env.status}` : "PM2 aston: 미등록");
} catch {
  parts.push("PM2: 미실행");
}

const port4000 = (() => {
  try {
    const out = execSync('netstat -ano | findstr ":4000 " | findstr LISTENING', {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
      shell: "cmd.exe",
    });
    return out.trim() ? "4000 점유" : "4000 빈상태";
  } catch {
    return "4000 빈상태";
  }
})();
parts.push(port4000);

process.stdout.write(JSON.stringify({ systemMessage: "🔍 " + parts.join(" | ") }) + "\n");
