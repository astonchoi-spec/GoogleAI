import { getDisclosures } from "../../finance/dartAPI.ts";
import { asString, yyyymmdd, type HandlerMap, type IntentHandler } from "../types.ts";

const dartDisclosures: IntentHandler = async (intent) => {
  const endDate = asString(intent.params.endDate, yyyymmdd(new Date()));
  const startDate = asString(intent.params.startDate, yyyymmdd(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const corpCode = asString(intent.params.corpCode, "00126380");
  const disclosures = await getDisclosures(corpCode, startDate, endDate);
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: "DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.",
    data: { corpCode, startDate, endDate, disclosures },
  };
};

export const financeHandlers: HandlerMap = {
  finance_dart_disclosures: dartDisclosures,
};
