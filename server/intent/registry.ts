import { tradingHandlers } from "./handlers/trading.ts";
import { realestateHandlers } from "./handlers/realestate.ts";
import { financeHandlers } from "./handlers/finance.ts";
import { googleHandlers } from "./handlers/google.ts";
import { intelligenceHandlers } from "./handlers/intelligence.ts";
import { wikiHandlers } from "./handlers/wiki.ts";
import { approvalHandlers } from "./handlers/approval.ts";
import { dealHandlers } from "./handlers/deals.ts";
import { agentHandlers } from "./handlers/agents.ts";
import { chatHandlers } from "./handlers/chat.ts";
import { knowledgeHandlers } from "./handlers/knowledgePipeline.ts";
import { notebooklmHandlers } from "./handlers/notebooklm.ts";
import { researchHandlers } from "./handlers/researchRun.ts";
import type { IntentAction, IntentHandler } from "./types.ts";

export const handlerRegistry: Partial<Record<IntentAction, IntentHandler>> = {
  ...tradingHandlers,
  ...realestateHandlers,
  ...financeHandlers,
  ...googleHandlers,
  ...intelligenceHandlers,
  ...wikiHandlers,
  ...approvalHandlers,
  ...dealHandlers,
  ...agentHandlers,
  ...chatHandlers,
  ...knowledgeHandlers,
  ...notebooklmHandlers,
  ...researchHandlers,
};
