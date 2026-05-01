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
  return { intent, handled: true, requiresConfirmation: false, response: "PF 포트폴리오 요약을 조회했습니다.", data: { summary } };
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
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: "간단한 사업성 분석을 완료했습니다.",
    data: { result, report },
  };
};

const landUse: IntentHandler = async (intent) => {
  const pnu = asString(intent.params.pnu, "");
  if (!pnu) {
    return { intent, handled: false, requiresConfirmation: false, response: "PNU(필지고유번호)를 입력해주세요." };
  }
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: "토지이용규제 정보를 조회했습니다.",
    data: { method: "realestate.landUse", params: { pnu } },
  };
};

const landPrice: IntentHandler = async (intent) => {
  const pnu = asString(intent.params.pnu, "");
  if (!pnu) {
    return { intent, handled: false, requiresConfirmation: false, response: "PNU(필지고유번호)를 입력해주세요." };
  }
  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: "공시지가 정보를 조회했습니다.",
    data: {
      method: "realestate.landPrice",
      params: { pnu, year: asString(intent.params.year, new Date().getFullYear().toString()) },
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
  return { intent, handled: true, requiresConfirmation: false, response: "?ъ뾽??遺꾩꽍???꾨즺?덉뒿?덈떎.", data: { result, report } };
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

  return {
    intent,
    handled: true,
    requiresConfirmation: false,
    response: "PF 딜이 추가되었습니다.",
    data: { deal: created },
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
  };
};

const dealsList: IntentHandler = async (intent) => ({
  intent,
  handled: true,
  requiresConfirmation: false,
  response: "PF 딜 목록을 조회합니다.",
  data: { method: "realestate.deals.list" },
});

const dealsCreate: IntentHandler = async (intent) => ({
  intent,
  handled: false,
  requiresConfirmation: true,
  response: "새 PF 딜을 등록합니다. 프로젝트명, 위치, 금액, 담당자를 입력해주세요.",
  confirmation: { action: "realestate_deals_create", domain: "realestate", params: intent.params },
});

const dealsUpdate: IntentHandler = async (intent) => ({
  intent,
  handled: false,
  requiresConfirmation: true,
  response: "PF 딜을 수정합니다. 딜 ID와 변경 내용을 입력해주세요.",
  confirmation: { action: "realestate_deals_update", domain: "realestate", params: intent.params },
});

export const realestateHandlers: HandlerMap = {
  realestate_portfolio_summary: portfolioSummary,
  realestate_simple_feasibility: simpleFeasibility,
  realestate_land_use: landUse,
  realestate_land_price: landPrice,
  realestate_real_transaction: realTransaction,
  realestate_feasibility: feasibility,
  realestate_add_deal: addDeal,
  realestate_update_deal_stage: updateDealStage,
  realestate_deals_list: dealsList,
  realestate_deals_create: dealsCreate,
  realestate_deals_update: dealsUpdate,
};
