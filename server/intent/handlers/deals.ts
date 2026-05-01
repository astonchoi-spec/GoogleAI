import { dealTextHandler } from "../../deals/telegramDealFileHandler.ts";
import type { HandlerMap, IntentHandler } from "../types.ts";

const handleDealCommand: IntentHandler = async (intent, options) => {
  const response = await dealTextHandler.execute(options.message);
  return { intent, handled: true, requiresConfirmation: false, response };
};

export const dealHandlers: HandlerMap = {
  deals_command: handleDealCommand,
};
