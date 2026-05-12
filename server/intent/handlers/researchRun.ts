// Step 2 (2026-05-12) — nlm-research 자동 실행 인텐트 핸들러.
//
// 텔레그램 `/리서치 <주제>` 또는 `리서치 <주제>` 메시지 → research_run 인텐트 → 이 핸들러.
//
// 동작 분기 (NLM_RESEARCH_ENABLED 환경변수 기준):
//   - enabled=true + NLM_RESEARCH_ROOT 존재 → child_process spawn (fire-and-forget) →
//     `claude -p "/research run \"<주제>\" --auto" --add-dir <root> --output-format text`
//     결과 .md 파일은 `~/research-output/<topic>/` 에 떨어지고, mklink 로
//     `${ASTON_WIKI_ROOT}/notebooklm-exports/research-inbox/` 에 자동 회수.
//   - enabled=false 또는 ROOT 미존재 → 회장님이 워크스테이션 콘솔에서 직접 실행하도록 안내.
//
// 환경변수 (회장님 PC `.env`):
//   NLM_RESEARCH_ENABLED=true
//   NLM_RESEARCH_ROOT=D:\nlm-research      (claude 진입 디렉토리)
//   NLM_RESEARCH_OUTPUT=~/research-output  (선택, 안내용)
//   NLM_RESEARCH_MAX_USD=5                 (선택, claude -p 비용 상한)
//
// 보안: child_process 외부 명령 실행이므로 env 가드(NLM_RESEARCH_ENABLED) 가 곧 권한 게이트.
//       회사컴 / CI / 회장님 PC 외 환경에서는 차단되어 안내 메시지만 출력.

import { spawn } from "node:child_process";
import fs from "node:fs";
import { asString, type HandlerMap, type IntentHandler } from "../types.ts";

const MAX_TOPIC_LENGTH = 200;

interface RuntimeConfig {
  enabled: boolean;
  root: string;
  outputDir: string;
  maxUsd: string;
}

function loadRuntimeConfig(): RuntimeConfig {
  return {
    enabled: process.env.NLM_RESEARCH_ENABLED === "true",
    root: (process.env.NLM_RESEARCH_ROOT ?? "").trim(),
    outputDir: (process.env.NLM_RESEARCH_OUTPUT ?? "~/research-output").trim(),
    maxUsd: (process.env.NLM_RESEARCH_MAX_USD ?? "5").trim(),
  };
}

// 회장님 워크스테이션 동선 안내 — 자동 실행 비활성 시 출력.
function buildManualGuide(topic: string, config: RuntimeConfig): string {
  const rootHint = config.root || "D:\\nlm-research";
  return [
    "⚠️ 리서치 자동 실행 비활성 — 회장님 워크스테이션에서 직접 실행 필요",
    "",
    `📋 주제: ${topic}`,
    "",
    "🖥 워크스테이션 콘솔에서:",
    `  cd ${rootHint}`,
    "  claude",
    `  /research run "${topic}" --auto`,
    "",
    `📁 출력: ${config.outputDir}/${topic}/*.md`,
    "→ mklink 로 G드라이브 research-inbox 자동 회수 → Aston Wiki 적재 → RAG 인용 가능",
    "",
    "활성화: 회장님 PC `.env` 에 NLM_RESEARCH_ENABLED=true + NLM_RESEARCH_ROOT 설정",
  ].join("\n");
}

// 자동 실행 — fire-and-forget. spawn 실패해도 텔레그램 즉시 응답.
function triggerResearchSpawn(topic: string, config: RuntimeConfig): { spawned: boolean; error?: string } {
  try {
    const args = [
      "-p",
      `/research run "${topic.replace(/"/g, '\\"')}" --auto`,
      "--add-dir",
      config.root,
      "--output-format",
      "text",
      "--max-budget-usd",
      config.maxUsd,
      "--dangerously-skip-permissions",
    ];
    const child = spawn("claude", args, {
      cwd: config.root,
      detached: true,
      stdio: "ignore",
      shell: process.platform === "win32",
    });
    child.unref();
    child.on("error", (err) => {
      console.error("[research_run] spawn error:", err);
    });
    return { spawned: true };
  } catch (err) {
    return { spawned: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function buildSuccessMessage(topic: string, config: RuntimeConfig): string {
  return [
    "🔍 리서치 시작 — fire-and-forget 으로 워크스테이션에서 실행 중",
    "",
    `📋 주제: ${topic}`,
    `📁 출력 경로: ${config.outputDir}/${topic}/`,
    `💰 비용 상한: $${config.maxUsd}`,
    "",
    "⏱ 5~10분 소요 — 완료되면 자동으로:",
    "  1. ~/research-output/<topic>/*.md 에 저장",
    "  2. mklink 로 G드라이브 research-inbox 회수",
    "  3. Drive Watcher 가 Aston Wiki 적재",
    "  4. 텔레그램·웹 채팅에서 RAG 인용 가능",
    "",
    "결과는 별도 알림 없이 회수 자료에 등장합니다.",
  ].join("\n");
}

const researchRun: IntentHandler = async (intent) => {
  const topic = asString(intent.params.topic, "").trim();

  // 1. 입력 검증.
  if (!topic) {
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: "🔍 리서치 주제를 입력해 주세요. 예: `리서치 몽골 광산 채굴권 동향`",
      handlerResponse: {
        kind: "error",
        text: "",
        meta: { action: "research_run", status: "missing_topic" },
      },
    };
  }
  if (topic.length > MAX_TOPIC_LENGTH) {
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: `🔍 주제가 너무 깁니다 (최대 ${MAX_TOPIC_LENGTH}자). 핵심 키워드로 줄여주세요.`,
      handlerResponse: {
        kind: "error",
        text: "",
        meta: { action: "research_run", status: "topic_too_long", length: topic.length },
      },
    };
  }

  const config = loadRuntimeConfig();

  // 2. 자동 실행 비활성 → 수동 안내.
  if (!config.enabled || !config.root) {
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: buildManualGuide(topic, config),
      handlerResponse: {
        kind: "text",
        text: "",
        meta: {
          action: "research_run",
          status: "manual_mode",
          enabled: config.enabled,
          rootSet: !!config.root,
        },
      },
    };
  }

  // 3. NLM_RESEARCH_ROOT 디렉토리 존재 확인.
  if (!fs.existsSync(config.root)) {
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: `⚠️ NLM_RESEARCH_ROOT 디렉토리가 없습니다: ${config.root}\n\n회장님 PC 에 \`git clone\` 으로 nlm-research 를 설치해주세요.`,
      handlerResponse: {
        kind: "error",
        text: "",
        meta: { action: "research_run", status: "root_not_found", root: config.root },
      },
    };
  }

  // 4. spawn — fire-and-forget. 실패해도 안내 메시지로 fallback.
  const result = triggerResearchSpawn(topic, config);
  if (!result.spawned) {
    return {
      intent,
      handled: true,
      requiresConfirmation: false,
      response: `⚠️ claude CLI 실행 실패: ${result.error ?? "알 수 없음"}\n\n${buildManualGuide(topic, config)}`,
      handlerResponse: {
        kind: "error",
        text: "",
        meta: { action: "research_run", status: "spawn_failed", error: result.error },
      },
    };
  }

  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: buildSuccessMessage(topic, config),
    handlerResponse: {
      kind: "text",
      text: "",
      meta: {
        action: "research_run",
        status: "spawned",
        topic,
        root: config.root,
        maxUsd: config.maxUsd,
      },
    },
  };
};

export const researchHandlers: HandlerMap = {
  research_run: researchRun,
};
