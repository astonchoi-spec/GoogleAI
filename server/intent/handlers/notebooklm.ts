import { handleNbCommand } from "../../notebooklm/notebookQuery.ts";
import type { HandlerMap, IntentHandler } from "../types.ts";

const nbCommand: IntentHandler = async (intent) => {
  const raw = String(intent.params.raw ?? "");
  const text = handleNbCommand(raw);
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: text,
  };
};

export const notebooklmHandlers: HandlerMap = {
  nb_command: nbCommand,
};
