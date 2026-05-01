import { executeMorningBriefing } from "../../intelligence/briefing.ts";
import type { HandlerMap, IntentHandler } from "../types.ts";

const morningBriefing: IntentHandler = async (intent) => {
  const briefing = await executeMorningBriefing({ trigger: "manual", deliver: true });
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: "모닝 브리핑을 발송했습니다.",
    data: {
      briefing: briefing.text,
      archivePath: briefing.archivePath,
    },
  };
};

export const intelligenceHandlers: HandlerMap = {
  intelligence_morning_briefing: morningBriefing,
};
