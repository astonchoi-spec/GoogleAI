import { getDisclosures } from "../../finance/dartAPI.ts";
import { asString, yyyymmdd, type HandlerMap, type IntentHandler } from "../types.ts";

const dartDisclosures: IntentHandler = async (intent) => {
  const endDate = asString(intent.params.endDate, yyyymmdd(new Date()));
  const startDate = asString(intent.params.startDate, yyyymmdd(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const corpCode = asString(intent.params.corpCode, "00126380");
  const disclosures = await getDisclosures(corpCode, startDate, endDate);
  // Phase 6-D-2 — `data.disclosures` 는 DART API 원본 객체 배열로 raw object
  // 노출 위험 영역이다. formatReply 의 legacy 경로는 `safeDisplayBody` 로
  // 빈 문자열을 반환해 사용자에겐 response 헤더 한 줄만 노출됨 (기존 동작).
  // 본문이 따로 없어 `text=""` 전략으로 kind 마커만 추가 — 출력은 변동 없음.
  // response 헤더 문자열은 인코딩 깨짐이 있으나 byte-for-byte 보존을 위해
  // 손대지 않는다 (별도 인코딩 정상화 작업 필요).
  const disclosureCount = Array.isArray(disclosures) ? disclosures.length : 0;
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: "DART 怨듭떆 議고쉶瑜??꾨즺?덉뒿?덈떎.",
    data: { corpCode, startDate, endDate, disclosures },
    handlerResponse: {
      kind: "list",
      text: "",
      meta: {
        action: "dart_disclosures",
        corpCode,
        startDate,
        endDate,
        disclosureCount,
      },
    },
  };
};

export const financeHandlers: HandlerMap = {
  finance_dart_disclosures: dartDisclosures,
};
