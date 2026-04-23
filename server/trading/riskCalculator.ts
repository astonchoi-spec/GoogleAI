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
