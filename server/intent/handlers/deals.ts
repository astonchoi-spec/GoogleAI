import { dealTextHandler } from "../../deals/telegramDealFileHandler.ts";
import { parseDealCommand } from "../../deals/dealFileRouter.ts";
import type { HandlerMap, HandlerResponseKind, IntentHandler } from "../types.ts";

/**
 * Phase 6-C — Map a parsed deal sub-command to a `HandlerResponseKind`.
 *
 * `list` is the only sub-command whose response body is naturally a list
 * of items. Everything else (create / detail / notebook / status /
 * deadline / milestone / sheet / unknown) is a single block of text.
 * Error responses (`unknown`, validation failures inside individual
 * sub-commands) stay under `kind: "text"` for Phase 6-C — the `error`
 * branch is reserved for Phase 6-D after deeper review.
 */
function dealActionToKind(action: string): HandlerResponseKind {
  // Phase 7-A — `unknown` action 은 의미상 error 분기. list/text 외 unknown 만
  // error 로 재분류. 응답 문자열은 byte-for-byte 동일 (kind 마커만 변경).
  if (action === "list") return "list";
  if (action === "unknown") return "error";
  return "text";
}

const handleDealCommand: IntentHandler = async (intent, options) => {
  const synthetic = intent.params.syntheticCommand;
  const message = typeof synthetic === "string" && synthetic.trim() ? synthetic : options.message;
  const response = await dealTextHandler.execute(message);

  // Phase 6-C — Re-parse the command to attach a kind marker. The full
  // response body lives inside `response`; `handlerResponse.text` stays
  // empty so `formatReply` does not duplicate the body. This is a purely
  // additive metadata signal — output is byte-for-byte unchanged.
  const command = parseDealCommand(message);
  const kind = dealActionToKind(command.action);

  // `meta` is diagnostics-only — formatReply never reads this. Even so we
  // keep it limited to plain user-controlled strings (action name and the
  // already-trimmed deal name) so accidental future surfacing does not leak
  // tokens, secrets, or internal objects.
  const meta: Record<string, unknown> = { action: command.action };
  if ("dealName" in command && typeof command.dealName === "string" && command.dealName) {
    meta.dealName = command.dealName;
  }
  if (command.action === "unknown") {
    meta.reason = command.reason;
  }

  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response,
    handlerResponse: {
      kind,
      text: "",
      meta,
    },
  };
};

export const dealHandlers: HandlerMap = {
  deals_command: handleDealCommand,
};
