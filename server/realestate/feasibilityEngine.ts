export type FeasibilityInput = {
  projectName: string;
  landCost: number;
  landArea: number;
  buildingCoverageRate: number;
  floorAreaRate: number;
  floors: number;
  constructionCostPerPyeong: number;
  sellingPricePerPyeong: number;
  sellingRate?: number;
  loanRate?: number;
  loanLTV?: number;
  projectDurationMonths?: number;
  equityRatio?: number;
};

export type FeasibilityResult = {
  grossFloorAreaSqm: number;
  grossFloorAreaPyeong: number;
  saleableAreaPyeong: number;
  salesRevenue: number;
  constructionCost: number;
  indirectCost: number;
  loanAmount: number;
  financingCost: number;
  taxesAndFees: number;
  totalProjectCost: number;
  projectProfit: number;
  projectProfitRate: number;
  equityAmount: number;
  equityReturnRate: number;
  annualizedIrr: number;
  dscr: number;
  breakEvenSellingRate: number;
  verdict: "사업성 양호" | "보통" | "미흡";
};

const SQM_PER_PYEONG = 3.3058;
const SALEABLE_RATIO = 0.75;
const DEFAULT_SELLING_RATE = 95;
const DEFAULT_LOAN_RATE = 6.5;
const DEFAULT_LOAN_LTV = 70;
const DEFAULT_DURATION_MONTHS = 30;
const DEFAULT_EQUITY_RATIO = 30;
const INDIRECT_COST_RATE = 0.15;
const LAND_TAX_RATE = 0.046;
const CONSTRUCTION_FEE_RATE = 0.01;

export function runFeasibility(input: FeasibilityInput): FeasibilityResult {
  validateInput(input);

  const sellingRate = percentage(input.sellingRate ?? DEFAULT_SELLING_RATE);
  const loanRate = percentage(input.loanRate ?? DEFAULT_LOAN_RATE);
  const loanLTV = percentage(input.loanLTV ?? DEFAULT_LOAN_LTV);
  const durationMonths = input.projectDurationMonths ?? DEFAULT_DURATION_MONTHS;
  const equityRatio = percentage(input.equityRatio ?? DEFAULT_EQUITY_RATIO);
  const durationYears = durationMonths / 12;

  const grossFloorAreaSqm = input.landArea * percentage(input.floorAreaRate);
  const grossFloorAreaPyeong = grossFloorAreaSqm / SQM_PER_PYEONG;
  const saleableAreaPyeong = grossFloorAreaPyeong * SALEABLE_RATIO;
  const salesRevenue = toEok(saleableAreaPyeong * input.sellingPricePerPyeong * sellingRate);
  const constructionCost = toEok(grossFloorAreaPyeong * input.constructionCostPerPyeong);
  const indirectCost = constructionCost * INDIRECT_COST_RATE;
  const loanBase = input.landCost + constructionCost + indirectCost;
  const loanAmount = loanBase * loanLTV;
  const financingCost = loanAmount * loanRate * durationYears;
  const taxesAndFees = input.landCost * LAND_TAX_RATE + constructionCost * CONSTRUCTION_FEE_RATE;
  const totalProjectCost = input.landCost + constructionCost + indirectCost + financingCost + taxesAndFees;
  const projectProfit = salesRevenue - totalProjectCost;
  const projectProfitRate = salesRevenue > 0 ? (projectProfit / salesRevenue) * 100 : 0;
  const equityAmount = totalProjectCost * equityRatio;
  const equityReturnRate = equityAmount > 0 ? (projectProfit / equityAmount) * 100 : 0;
  const annualizedIrr =
    equityAmount > 0 && equityAmount + projectProfit > 0
      ? (Math.pow((equityAmount + projectProfit) / equityAmount, 1 / durationYears) - 1) * 100
      : -100;
  const annualNetIncome = projectProfit / durationYears;
  const annualDebtService = durationYears > 0 ? (loanAmount + financingCost) / durationYears : 0;
  const dscr = annualDebtService > 0 ? annualNetIncome / annualDebtService : 0;
  const breakEvenSellingRate = saleableAreaPyeong * input.sellingPricePerPyeong > 0
    ? (totalProjectCost / toEok(saleableAreaPyeong * input.sellingPricePerPyeong)) * 100
    : 0;

  return {
    grossFloorAreaSqm,
    grossFloorAreaPyeong,
    saleableAreaPyeong,
    salesRevenue,
    constructionCost,
    indirectCost,
    loanAmount,
    financingCost,
    taxesAndFees,
    totalProjectCost,
    projectProfit,
    projectProfitRate,
    equityAmount,
    equityReturnRate,
    annualizedIrr,
    dscr,
    breakEvenSellingRate,
    verdict: getVerdict(projectProfitRate),
  };
}

export function formatFeasibilityReport(input: FeasibilityInput, result: FeasibilityResult): string {
  return [
    `🏗️ PF 사업성 분석 보고서`,
    ``,
    `프로젝트: ${input.projectName}`,
    `판정: ${verdictIcon(result.verdict)} ${result.verdict}`,
    ``,
    `📐 면적 요약`,
    `대지면적: ${formatSqm(input.landArea)}㎡`,
    `연면적: ${formatSqm(result.grossFloorAreaSqm)}㎡ / ${formatPyeong(result.grossFloorAreaPyeong)}평`,
    `분양면적: ${formatPyeong(result.saleableAreaPyeong)}평`,
    `건폐율/용적률: ${formatPercent(input.buildingCoverageRate)} / ${formatPercent(input.floorAreaRate)}`,
    `층수: ${input.floors}층`,
    ``,
    `💰 수입`,
    `분양수입: ${formatEok(result.salesRevenue)}`,
    `분양가: 평당 ${formatManwon(input.sellingPricePerPyeong)}`,
    `분양률: ${formatPercent(input.sellingRate ?? DEFAULT_SELLING_RATE)}`,
    ``,
    `🏦 비용 구조`,
    `토지비: ${formatEok(input.landCost)}`,
    `공사비: ${formatEok(result.constructionCost)}`,
    `간접비: ${formatEok(result.indirectCost)}`,
    `금융비용: ${formatEok(result.financingCost)}`,
    `세금/부대비: ${formatEok(result.taxesAndFees)}`,
    `총사업비: ${formatEok(result.totalProjectCost)}`,
    ``,
    `📊 수익성`,
    `사업이익: ${formatEok(result.projectProfit)}`,
    `사업이익률: ${formatPercent(result.projectProfitRate)}`,
    `에쿼티: ${formatEok(result.equityAmount)}`,
    `에쿼티 수익률: ${formatPercent(result.equityReturnRate)}`,
    `IRR(연환산): ${formatPercent(result.annualizedIrr)}`,
    `DSCR: ${formatRatio(result.dscr)}`,
    `손익분기 분양률: ${formatPercent(result.breakEvenSellingRate)}`,
  ].join("\n");
}

function validateInput(input: FeasibilityInput): void {
  if (!input.projectName.trim()) {
    throw new Error("projectName is required");
  }

  assertPositive(input.landCost, "landCost");
  assertPositive(input.landArea, "landArea");
  assertPositive(input.buildingCoverageRate, "buildingCoverageRate");
  assertPositive(input.floorAreaRate, "floorAreaRate");
  assertPositive(input.floors, "floors");
  assertPositive(input.constructionCostPerPyeong, "constructionCostPerPyeong");
  assertPositive(input.sellingPricePerPyeong, "sellingPricePerPyeong");
  assertPositive(input.sellingRate ?? DEFAULT_SELLING_RATE, "sellingRate");
  assertPositive(input.loanRate ?? DEFAULT_LOAN_RATE, "loanRate");
  assertPositive(input.loanLTV ?? DEFAULT_LOAN_LTV, "loanLTV");
  assertPositive(input.projectDurationMonths ?? DEFAULT_DURATION_MONTHS, "projectDurationMonths");
  assertPositive(input.equityRatio ?? DEFAULT_EQUITY_RATIO, "equityRatio");
}

function assertPositive(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number`);
  }
}

function percentage(value: number): number {
  return value / 100;
}

function toEok(manwon: number): number {
  return manwon / 10_000;
}

function getVerdict(projectProfitRate: number): FeasibilityResult["verdict"] {
  if (projectProfitRate >= 15) return "사업성 양호";
  if (projectProfitRate >= 8) return "보통";
  return "미흡";
}

function verdictIcon(verdict: FeasibilityResult["verdict"]): string {
  if (verdict === "사업성 양호") return "🟢";
  if (verdict === "보통") return "🟡";
  return "🔴";
}

function formatEok(value: number): string {
  return `${formatNumber(value)}억원`;
}

function formatManwon(value: number): string {
  return `${formatNumber(value)}만원`;
}

function formatSqm(value: number): string {
  return formatNumber(value);
}

function formatPyeong(value: number): string {
  return formatNumber(value);
}

function formatPercent(value: number): string {
  return `${formatNumber(value)}%`;
}

function formatRatio(value: number): string {
  return `${value.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("ko-KR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
