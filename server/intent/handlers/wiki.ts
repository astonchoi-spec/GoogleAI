import { executeWikiSave, executeWikiSearch } from "../wiki.ts";
import type { HandlerMap, IntentHandler } from "../types.ts";

const wikiSave: IntentHandler = async (intent) => {
  const response = await executeWikiSave(intent.params, "telegram");
  return { intent, handled: true, requiresConfirmation: false, response };
};

const wikiSearch: IntentHandler = async (intent) => {
  const response = await executeWikiSearch(intent.params);
  return { intent, handled: true, requiresConfirmation: false, response };
};

export const wikiHandlers: HandlerMap = {
  wiki_save: wikiSave,
  wiki_search: wikiSearch,
};
