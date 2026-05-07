// 명령 토큰 파서. 정규식 한 줄 고정 구조 금지.
// 향후 +person, @company, !urgent, due:, tag:, perm: 확장이 가능하도록 prefix별 핸들러 등록 구조.

import type { CommandHints } from "../types.ts";

export type TokenHandler = {
  prefix: string;
  // hints를 함께 받아 상태 기반으로 매치 거부 가능 (예: 첫 #project만 매치하고 이후는 unknown_tokens로 fallthrough)
  matches: (token: string, hints: CommandHints) => boolean;
  apply: (token: string, hints: CommandHints) => void;
};

export type ParsedCommand = {
  command: string | null; // 'tg', 'nb', 'meeting', ... null이면 명령 prefix 없음
  hints: CommandHints;
  body: string;
  unknown_tokens: string[];
};

const COMMAND_PREFIX = "/";
const KNOWN_COMMANDS = new Set(["tg", "nb", "meeting"]);

function tokenize(text: string): string[] {
  // 공백·줄바꿈으로 분리. 빈 토큰 제거.
  return text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function isCommandToken(token: string): { command: string } | null {
  if (!token.startsWith(COMMAND_PREFIX)) return null;
  const cmd = token.slice(1).toLowerCase();
  if (!cmd) return null;
  if (!KNOWN_COMMANDS.has(cmd)) return null;
  return { command: cmd };
}

function findHandler(token: string, handlers: TokenHandler[], hints: CommandHints): TokenHandler | null {
  for (const handler of handlers) {
    if (handler.matches(token, hints)) return handler;
  }
  return null;
}

export function parseCommand(rawText: string, handlers: TokenHandler[]): ParsedCommand {
  const trimmed = rawText.trimStart();
  if (!trimmed) {
    return { command: null, hints: {}, body: "", unknown_tokens: [] };
  }

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) {
    return { command: null, hints: {}, body: rawText.trim(), unknown_tokens: [] };
  }

  const firstTokenInfo = isCommandToken(tokens[0]);
  if (!firstTokenInfo) {
    // 명령 prefix 없음. 전체가 본문.
    return { command: null, hints: {}, body: rawText.trim(), unknown_tokens: [] };
  }

  const command = firstTokenInfo.command;
  const hints: CommandHints = { explicit_command: command };
  const unknown_tokens: string[] = [];
  const bodyTokens: string[] = [];

  // 두 번째 토큰부터 처리. 위치 무관 — 모든 토큰을 검사:
  // - 등록된 핸들러 매치 → apply, body 제외
  // - 명백한 prefix 토큰이지만 핸들러 없음 → unknown_tokens에 보존, body 제외
  // - 그 외 → body
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    const handler = findHandler(token, handlers, hints);
    if (handler) {
      handler.apply(token, hints);
      continue;
    }
    if (looksLikeCommandToken(token)) {
      unknown_tokens.push(token);
      continue;
    }
    bodyTokens.push(token);
  }

  if (unknown_tokens.length > 0) {
    hints.unknown_tokens = unknown_tokens;
  }

  return {
    command,
    hints,
    body: bodyTokens.join(" ").trim(),
    unknown_tokens,
  };
}

function looksLikeCommandToken(token: string): boolean {
  if (!token) return false;
  if (token.startsWith("#")) return true;
  if (token.startsWith("+")) return true;
  if (token.startsWith("@")) return true;
  if (token.startsWith("!")) return true;
  if (/^[a-z]+:/i.test(token)) return true; // due:, tag: 같은 prefix
  if (token === "perm") return true;
  if (token === "private" || token === "public" || token === "sensitive") return true;
  return false;
}
