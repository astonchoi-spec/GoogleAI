import { dealTextHandler } from "../../deals/telegramDealFileHandler.ts";
import type { HandlerMap, IntentHandler } from "../types.ts";

const handleDealCommand: IntentHandler = async (intent, options) => {
  const synthetic = intent.params.syntheticCommand;
  const message = typeof synthetic === "string" && synthetic.trim() ? synthetic : options.message;
  const response = await dealTextHandler.execute(message);
  return { intent, handled: true, requiresConfirmation: false, response };
};

export const dealHandlers: HandlerMap = {
  deals_command: handleDealCommand,
};
