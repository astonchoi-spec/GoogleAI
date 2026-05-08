import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "prompts",
);

const cache = new Map<string, string>();

/**
 * Default classifier prompt — kept inline as a runtime safety net.
 * Used when `prompts/classifier.md` is unreadable (e.g. esbuild bundle in
 * production where assets are not copied next to the bundled JS).
 *
 * MUST stay in sync with `server/intent/prompts/classifier.md`. The {{NOW}}
 * placeholder is substituted by `renderPrompt()` at call time.
 */
export const FALLBACK_CLASSIFIER_PROMPT = `사용자 메시지를 분석해서 JSON으로 응답하세요.

현재 날짜: {{NOW}}
도메인: trading, realestate, finance, google, deals, chat
타입: query 또는 execute
액션:
- trading_balance
- trading_positions
- trading_technical_analysis
- trading_risk_calculation
- trading_add_alert
- realestate_portfolio_summary
- realestate_feasibility
- realestate_add_deal
- realestate_update_deal_stage
- finance_dart_disclosures
- google_create_event: 캘린더 일정 생성
- google_write_sheet: 시트 데이터 쓰기
- google_drive_search: 구글드라이브 파일 검색 → params: {query: "검색어", maxResults: 10}
- google_get_emails: 이메일 목록 조회 → params: {maxResults: 5, searchQuery?: "검색어"}
- google_send_email: 이메일 전송 → params: {to, subject, body}
- google_list_events: 캘린더 일정 목록 조회 → params: {maxResults: 5}
- deals_command: "딜 ..."로 시작하는 자료 창고 명령
- execute_placeholder
- chat

반드시 JSON만 응답:
{"domain":"...","action":"...","type":"query|execute","confidence":0.0,"params":{}}

규칙:
- "드라이브", "구글드라이브", "Drive", "파일 검색", "파일 찾아" → google_drive_search, params.query에 검색 키워드 추출
- "메일 확인", "받은 메일", "이메일 목록", "Gmail" → google_get_emails
- "메일 보내", "이메일 전송", "send email" → google_send_email
- "일정 확인", "오늘 일정", "캘린더 목록", "다음 일정" → google_list_events
- "일정 추가", "일정 잡아", "미팅 생성" → google_create_event
- "딜 "로 시작하는 모든 메시지 → deals_command
- 조회성 작업은 type=query, 변경성 작업(생성/삭제/수정/등록)은 type=execute
- 파라미터를 최대한 추출
- JSON 외 텍스트 금지`;

/**
 * Built-in fallback registry. When `loadIntentPrompt` cannot read a file from
 * disk it consults this map; if the requested prompt is not registered the
 * loader throws.
 */
const FALLBACKS: Record<string, string> = {
  "classifier.md": FALLBACK_CLASSIFIER_PROMPT,
};

/**
 * Load a prompt template from `server/intent/prompts/<name>`.
 *
 * Resolution order:
 *   1. In-memory cache (filled on first successful load).
 *   2. File at PROMPTS_DIR/<name>.
 *   3. Built-in FALLBACKS entry.
 *
 * Throws if none of the sources yields a value.
 */
export function loadIntentPrompt(name: string): string {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;

  const filePath = path.join(PROMPTS_DIR, name);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      cache.set(name, content);
      return content;
    }
  } catch (err) {
    console.warn(
      `[promptLoader] failed to read ${filePath}:`,
      (err as Error).message,
    );
  }

  const fallback = FALLBACKS[name];
  if (fallback !== undefined) {
    console.warn(
      `[promptLoader] using built-in fallback for ${name} (file not found at ${filePath})`,
    );
    cache.set(name, fallback);
    return fallback;
  }

  throw new Error(
    `[promptLoader] prompt not found: ${name} (looked at ${filePath} and FALLBACKS)`,
  );
}

/**
 * Same as `loadIntentPrompt` but returns null on failure instead of throwing.
 * Use when the caller wants to substitute its own emergency fallback.
 */
export function loadIntentPromptSafe(name: string): string | null {
  try {
    return loadIntentPrompt(name);
  } catch (err) {
    console.warn(
      `[promptLoader] loadIntentPromptSafe failed for ${name}:`,
      (err as Error).message,
    );
    return null;
  }
}

/**
 * Replace `{{KEY}}` placeholders inside `template` with values from `vars`.
 * Unknown placeholders are left untouched so missing variables are easy to
 * spot in logs.
 */
export function renderPrompt(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key)
      ? vars[key]
      : match;
  });
}

/** Test helper. Resets the in-memory cache so tests can swap prompt files. */
export function _resetPromptCache(): void {
  cache.clear();
}
