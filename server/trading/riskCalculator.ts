// MODIFIED: New RiskInput/RiskResult for standalone risk calculator
export type RiskInput = {
  entryPrice: number;
  accountBalance: number;
  riskPercent: number;
  leverage: number;
  stopLossPrice: number;
  side: "long" | "short";
};

export type RiskResult = {
  positionSize: number;
  positionValue: number;
  stopLossPrice: number;
  liquidationPrice: number;
  riskAmount: number;
  riskRewardTargets: { r1: number; r2: number; r3: number };
  maxLoss: number;
  feeEstimate: number;
};

export type FuturesRiskInput = {
  entryPrice: number;
  leverage: number;
  side: "long" | "short";
  marginBalance: number;
  riskPercent?: number;
};

export type FuturesRiskResult = {
  positionSize: number;
  liquidationPrice: number;
  stopLossPrice: number;
  stopLossAmount: number;
  takeProfitPrice_1R: number;
  takeProfitPrice_2R: number;
  takeProfitPrice_3R: number;
  maxLoss: number;
};

const MAINTENANCE_MARGIN_RATE = 0.005;
const DEFAULT_RISK_PERCENT = 2;

// MODIFIED: New risk calculator with explicit input parameters
export function calculateRisk(input: RiskInput): RiskResult {
  validateRiskInput(input);

  const lossDist = Math.abs(input.entryPrice - input.stopLossPrice);
  const riskAmount = input.accountBalance * (input.riskPercent / 100);
  const positionSize = riskAmount / lossDist;
  const positionValue = positionSize * input.entryPrice;

  const liquidationPrice =
    input.side === "long"
      ? input.entryPrice * (1 - 1 / input.leverage)
      : input.entryPrice * (1 + 1 / input.leverage);

  const direction = input.side === "long" ? 1 : -1;
  const riskRewardTargets = {
    r1: input.entryPrice + direction * lossDist,
    r2: input.entryPrice + direction * lossDist * 2,
    r3: input.entryPrice + direction * lossDist * 3,
  };

  const maxLoss = positionSize * lossDist;
  const feeEstimate = positionValue * 0.001;

  return {
    positionSize,
    positionValue,
    stopLossPrice: input.stopLossPrice,
    liquidationPrice,
    riskAmount,
    riskRewardTargets,
    maxLoss,
    feeEstimate,
  };
}

// MODIFIED: Separate formatRiskReport implementations for clarity
export function formatRiskReportFromResult(result: RiskResult, input: RiskInput): string {
  const sideLabel = input.side === "long" ? "롱" : "숏";

  return [
    `📊 리스크 분석`,
    ``,
    `방향: ${sideLabel}`,
    `진입가: ${formatPrice(input.entryPrice)} USDT`,
    `포지션 크기: ${formatMoney(result.positionSize)} ${input.side === "long" ? "BTC" : "계약"}`,
    `포지션 가치: ${formatMoney(result.positionValue)} USDT`,
    `손절가: ${formatPrice(result.stopLossPrice)} USDT`,
    `청산가: ${formatPrice(result.liquidationPrice)} USDT`,
    ``,
    `💰 리스크 관리`,
    `리스크 금액: ${formatMoney(result.riskAmount)} USDT`,
    `최대 손실: ${formatMoney(result.maxLoss)} USDT`,
    `예상 수수료: ${formatMoney(result.feeEstimate)} USDT`,
    ``,
    `🎯 목표가 (R 배수)`,
    `R1 (1:1): ${formatPrice(result.riskRewardTargets.r1)} USDT`,
    `R2 (1:2): ${formatPrice(result.riskRewardTargets.r2)} USDT`,
    `R3 (1:3): ${formatPrice(result.riskRewardTargets.r3)} USDT`,
  ].join("\n");
}

export function formatRiskReport(input: FuturesRiskInput, result: FuturesRiskResult): string {
  const riskPercent = input.riskPercent ?? DEFAULT_RISK_PERCENT;
  const sideLabel = input.side === "long" ? "롱" : "숏";

  return [
    `📊 선물 리스크 계산 결과`,
    ``,
    `방향: ${sideLabel}`,
    `진입가: ${formatPrice(input.entryPrice)} USDT`,
    `레버리지: ${input.leverage}x`,
    `증거금 잔고: ${formatMoney(input.marginBalance)} USDT`,
    `리스크 비율: ${formatPercent(riskPercent)}`,
    ``,
    `💼 포지션 크기: ${formatMoney(result.positionSize)} USDT`,
    `⚠️ 예상 청산가: ${formatPrice(result.liquidationPrice)} USDT`,
    `🛑 1R 손절가: ${formatPrice(result.stopLossPrice)} USDT`,
    `손절 시 손실액: ${formatMoney(result.stopLossAmount)} USDT`,
    ``,
    `🎯 목표가`,
    `1R: ${formatPrice(result.takeProfitPrice_1R)} USDT`,
    `2R: ${formatPrice(result.takeProfitPrice_2R)} USDT`,
    `3R: ${formatPrice(result.takeProfitPrice_3R)} USDT`,
    ``,
    `최대 손실액: ${formatMoney(result.maxLoss)} USDT`,
  ].join("\n");
}

export function calculateFuturesRisk(input: FuturesRiskInput): FuturesRiskResult {
  validateInput(input);

  const riskPercent = input.riskPercent ?? DEFAULT_RISK_PERCENT;
  const maxLoss = input.marginBalance * (riskPercent / 100);
  const positionSize = input.marginBalance * input.leverage;
  const stopLossMoveRatio = maxLoss / positionSize;
  const direction = input.side === "long" ? 1 : -1;

  const liquidationPrice =
    input.side === "long"
      ? input.entryPrice * (1 - 1 / input.leverage + MAINTENANCE_MARGIN_RATE)
      : input.entryPrice * (1 + 1 / input.leverage - MAINTENANCE_MARGIN_RATE);

  const stopLossPrice = input.entryPrice * (1 - direction * stopLossMoveRatio);
  const takeProfitPrice_1R = input.entryPrice * (1 + direction * stopLossMoveRatio);
  const takeProfitPrice_2R = input.entryPrice * (1 + direction * stopLossMoveRatio * 2);
  const takeProfitPrice_3R = input.entryPrice * (1 + direction * stopLossMoveRatio * 3);

  return {
    positionSize,
    liquidationPrice,
    stopLossPrice,
    stopLossAmount: maxLoss,
    takeProfitPrice_1R,
    takeProfitPrice_2R,
    takeProfitPrice_3R,
    maxLoss,
  };
}

// MODIFIED: Validation for new RiskInput type
function validateRiskInput(input: RiskInput): void {
  assertPositive(input.entryPrice, "entryPrice");
  assertPositive(input.accountBalance, "accountBalance");
  assertPositive(input.riskPercent, "riskPercent");
  assertPositive(input.leverage, "leverage");
  assertPositive(Math.abs(input.entryPrice - input.stopLossPrice), "stopLossPrice (must differ from entryPrice)");

  if (input.riskPercent > 100) {
    throw new Error("riskPercent must be less than or equal to 100");
  }

  if (input.leverage < 1) {
    throw new Error("leverage must be at least 1");
  }
}

function validateInput(input: FuturesRiskInput): void {
  assertPositive(input.entryPrice, "entryPrice");
  assertPositive(input.leverage, "leverage");
  assertPositive(input.marginBalance, "marginBalance");

  const riskPercent = input.riskPercent ?? DEFAULT_RISK_PERCENT;
  assertPositive(riskPercent, "riskPercent");

  if (riskPercent > 100) {
    throw new Error("riskPercent must be less than or equal to 100");
  }
}

function assertPositive(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number`);
  }
}

function formatMoney(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPrice(value: number): string {
  if (Math.abs(value) >= 1) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
}

function formatPercent(value: number): string {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}
