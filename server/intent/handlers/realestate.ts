import { DealPipeline } from "../../realestate/dealPipeline.ts";
import {
  calculateFeasibility,
  formatFeasibilityReport,
  formatSimpleFeasibilityReport,
  runFeasibility,
  type SimpleFeasibilityInput,
} from "../../realestate/feasibilityEngine.ts";
import { googleAuthManager } from "../../routers/google-workspace.ts";
import {
  asString,
  asNumber,
  spreadsheetIdFromEnv,
  type HandlerMap,
  type IntentHandler,
} from "../types.ts";

const portfolioSummary: IntentHandler = async (intent, options) => {
  const auth = await googleAuthManager.getAuthenticatedClient(options.userId);
  const pipeline = new DealPipeline(auth, spreadsheetIdFromEnv());
  const summary = await pipeline.getPortfolioSummary();
  // Phase 6-D-1 — `data.summary` 는 구조화된 객체이고 formatReply 의 legacy
  // 경로는 `safeDisplayBody` 로 빈 문자열을 반환한다. 본문이 따로 없으므로
  // text="" 마커만 추가하여 출력은 response 한 줄 유지.
  return {
    intent, handled: true, requiresConfirmation: false,
    response: "PF 포트폴리오 요약을 조회했습니다.",
    data: { summary },
    handlerResponse: {
      kind: "text",
      text: "",
      meta: { action: "portfolio_summary" },
    },
  };
};

const simpleFeasibility: IntentHandler = async (intent) => {
  const feasibilityInput = {
    projectName: asString(intent.params.projectName, "신규 프로젝트"),
    landCost: asNumber(intent.params.landCost, 5000000000),
    constructionCost: asNumber(intent.params.constructionCost, 10000000000),
    designFee: asNumber(intent.params.designFee, 1000000000),
    financeCost: asNumber(intent.params.financeCost, 2000000000),
    taxAndFee: asNumber(intent.params.taxAndFee, 500000000),
    otherCost: asNumber(intent.params.otherCost, 1500000000),
    totalUnits: asNumber(intent.params.totalUnits, 100),
    avgSalePrice: asNumber(intent.params.avgSalePrice, 200000000),
    projectMonths: asNumber(intent.params.projectMonths, 30),
  } as SimpleFeasibilityInput;

  const result = calculateFeasibility(feasibilityInput);
  const report = formatSimpleFeasibilityReport(result, feasibilityInput);
  // Phase 6-D-1 — 분리형 패턴: response 는 짧은 헤더, data.report 가 본문.
  // handlerResponse.text 는 data.report 와 동일 변수 (`report`) 에서 파생되어
  // formatReply 의 list/report 우선 경로와 legacy `data.report` 경로가 같은
  // 문자열을 반환 → byte-for-byte 동일 출력.
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: "간단한 사업성 분석을 완료했습니다.",
    data: { result, report },
    handlerResponse: {
      kind: "report",
      text: report,
      meta: {
        action: "simple_feasibility",
        projectName: feasibilityInput.projectName,
        totalUnits: feasibilityInput.totalUnits,
        projectMonths: feasibilityInput.projectMonths,
      },
    },
  };
};

const landUse: IntentHandler = async (intent) => {
  const pnu = asString(intent.params.pnu, "");
  if (!pnu) {
    return { intent, handled: false, requiresConfirmation: false, response: "PNU(필지고유번호)를 입력해주세요." };
  }
  // Phase 6-D-1 — `data.method` 형태는 formatReply 의 raw object 차단 분기를
  // 트리거하여 "내부 데이터..." 안내로 대체된다 (dealRouting.test.ts:91 회귀
  // 테스트 대상). text="" 로 마커만 추가해 차단 동작을 그대로 유지한다.
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: "토지이용규제 정보를 조회했습니다.",
    data: { method: "realestate.landUse", params: { pnu } },
    handlerResponse: {
      kind: "text",
      text: "",
      meta: { action: "land_use", pnu },
    },
  };
};

const landPrice: IntentHandler = async (intent) => {
  const pnu = asString(intent.params.pnu, "");
  if (!pnu) {
    return { intent, handled: false, requiresConfirmation: false, response: "PNU(필지고유번호)를 입력해주세요." };
  }
  const year = asString(intent.params.year, new Date().getFullYear().toString());
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: "공시지가 정보를 조회했습니다.",
    data: {
      method: "realestate.landPrice",
      params: { pnu, year },
    },
    handlerResponse: {
      kind: "text",
      text: "",
      meta: { action: "land_price", pnu, year },
    },
  };
};

const realTransaction: IntentHandler = async (intent) => {
  const regionCode = asString(intent.params.regionCode, "");
  const yearMonth = asString(intent.params.yearMonth, "");
  if (!regionCode || !yearMonth) {
    return { intent, handled: false, requiresConfirmation: false, response: "지역코드와 연월을 입력해주세요." };
  }
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: "실거래가 정보를 조회했습니다.",
    data: { method: "realestate.realTransaction", params: { regionCode, yearMonth } },
    handlerResponse: {
      kind: "text",
      text: "",
      meta: { action: "real_transaction", regionCode, yearMonth },
    },
  };
};

const feasibility: IntentHandler = async (intent) => {
  const feasibilityInput = {
    projectName: asString(intent.params.projectName, "?섑뵆 ?꾨줈?앺듃"),
    landCost: asNumber(intent.params.landCost, 150),
    landArea: asNumber(intent.params.landArea, 1000),
    buildingCoverageRate: asNumber(intent.params.buildingCoverageRate, 60),
    floorAreaRate: asNumber(intent.params.floorAreaRate, 300),
    floors: asNumber(intent.params.floors, 20),
    constructionCostPerPyeong: asNumber(intent.params.constructionCostPerPyeong, 900),
    sellingPricePerPyeong: asNumber(intent.params.sellingPricePerPyeong, 1800),
    sellingRate: asNumber(intent.params.sellingRate, 95),
    loanRate: asNumber(intent.params.loanRate, 6.5),
    loanLTV: asNumber(intent.params.loanLTV, 70),
    projectDurationMonths: asNumber(intent.params.projectDurationMonths, 30),
    equityRatio: asNumber(intent.params.equityRatio, 30),
  };
  const result = runFeasibility(feasibilityInput);
  const report = formatFeasibilityReport(feasibilityInput, result);
  // Phase 6-D-1 — 분리형. response 헤더는 인코딩 깨짐이 있으나 byte-for-byte
  // 보존을 위해 손대지 않는다 (별도 작업 영역). handlerResponse.text 는
  // data.report 와 동일 본문을 미러링하므로 출력은 변동 없음.
  return {
    intent, handled: true, requiresConfirmation: false,
    response: "?ъ뾽??遺꾩꽍???꾨즺?덉뒿?덈떎.",
    data: { result, report },
    handlerResponse: {
      kind: "report",
      text: report,
      meta: {
        action: "feasibility",
        projectName: feasibilityInput.projectName,
        floors: feasibilityInput.floors,
        loanLTV: feasibilityInput.loanLTV,
      },
    },
  };
};

const addDeal: IntentHandler = async (intent, options) => {
  const auth = await googleAuthManager.getAuthenticatedClient(options.userId);
  const pipeline = new DealPipeline(auth, spreadsheetIdFromEnv());
  const created = await pipeline.addDeal({
    projectName: asString(intent.params.projectName, "신규 프로젝트"),
    location: asString(intent.params.location, ""),
    stage: asString(intent.params.stage, "검토") as any,
    totalProjectCost: asNumber(intent.params.totalProjectCost, 0),
    loanAmount: asNumber(intent.params.loanAmount, 0),
    ltv: asNumber(intent.params.ltv, 0),
    equityAmount: asNumber(intent.params.equityAmount, 0),
    lenders: asString(intent.params.lenders, ""),
    nextMilestone: asString(intent.params.nextMilestone, ""),
    nextMilestoneDate: asString(intent.params.nextMilestoneDate, ""),
    notes: asString(intent.params.notes, ""),
  });

  // Phase 6-D-1 — `data.deal` 은 구조화된 객체이고 formatReply 의 legacy
  // 경로에서 `safeDisplayBody` 가 빈 문자열을 반환한다. text="" 마커만 추가해
  // 출력은 response 한 줄 유지.
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: "PF 딜이 추가되었습니다.",
    data: { deal: created },
    handlerResponse: {
      kind: "text",
      text: "",
      meta: {
        action: "add_deal",
        projectName: asString(intent.params.projectName, ""),
        stage: asString(intent.params.stage, ""),
      },
    },
  };
};

const updateDealStage: IntentHandler = async (intent, options) => {
  const auth = await googleAuthManager.getAuthenticatedClient(options.userId);
  const pipeline = new DealPipeline(auth, spreadsheetIdFromEnv());
  const id = asString(intent.params.id, "");
  if (!id) {
    throw new Error("PF deal id is required");
  }

  const updated = await pipeline.updateDealStage(
    id,
    asString(intent.params.stage, "심사") as any
  );

  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: "PF 딜 단계가 변경되었습니다.",
    data: { deal: updated },
    handlerResponse: {
      kind: "text",
      text: "",
      meta: {
        action: "update_deal_stage",
        id,
        stage: asString(intent.params.stage, ""),
      },
    },
  };
};

export const realestateHandlers: HandlerMap = {
  realestate_portfolio_summary: portfolioSummary,
  realestate_simple_feasibility: simpleFeasibility,
  realestate_land_use: landUse,
  realestate_land_price: landPrice,
  realestate_real_transaction: realTransaction,
  realestate_feasibility: feasibility,
  realestate_add_deal: addDeal,
  realestate_update_deal_stage: updateDealStage,
};
