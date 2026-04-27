import {
  ATR,
  BollingerBands,
  EMA,
  MACD,
  RSI,
  SMA,
  StochasticRSI,
} from "technicalindicators";

export type OhlcvData = {
  timestamp?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}[];

export type OhlcvArray = [number, number, number, number, number, number];

export type OhlcvObject = {
  timestamp?: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type OhlcvCandle = OhlcvArray | OhlcvObject;

export type Signal = "과매수" | "과매도" | "중립" | "상승세" | "하락세" | "골든크로스" | "상단돌파" | "하단돌파" | "밴드내" | "상방" | "하방" | "데이터부족";

export type TechnicalAnalysis = {
  close: number;
  rsi: {
    value: number | null;
    signal: Signal;
  };
  macd: {
    macd: number | null;
    signalLine: number | null;
    histogram: number | null;
    signal: Signal;
    goldenCross: boolean;
  };
  bollingerBands: {
    upper: number | null;
    middle: number | null;
    lower: number | null;
    signal: Signal;
  };
  sma200: {
    value: number | null;
    signal: Signal;
  };
  ema50: {
    value: number | null;
    signal: Signal;
  };
  atr: {
    value: number | null;
  };
  stochasticRsi: {
    stochRSI: number | null;
    k: number | null;
    d: number | null;
  };
};

export class TechnicalAnalysisEngine {
  analyzeSymbol(candles: OhlcvCandle[], close?: number): TechnicalAnalysis {
    if (candles.length === 0 && close === undefined) {
      throw new Error("analyzeSymbol requires at least one candle or close price");
    }

    const normalized = candles.map((candle) => this.normalizeCandle(candle));
    const closes = normalized.map((candle) => candle.close);
    const highs = normalized.map((candle) => candle.high);
    const lows = normalized.map((candle) => candle.low);
    const currentClose = close ?? this.last(closes);

    const rsiValue = this.last(RSI.calculate({ values: closes, period: 14 }));
    const macdValues = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    const macdCurrent = this.last(macdValues);
    const macdPrevious = macdValues.length > 1 ? macdValues[macdValues.length - 2] : undefined;

    const bands = this.last(BollingerBands.calculate({
      values: closes,
      period: 20,
      stdDev: 2,
    }));
    const sma200 = this.last(SMA.calculate({ values: closes, period: 200 }));
    const ema50 = this.last(EMA.calculate({ values: closes, period: 50 }));
    const atr = this.last(ATR.calculate({ high: highs, low: lows, close: closes, period: 14 }));
    const stochasticRsi = this.last(StochasticRSI.calculate({
      values: closes,
      rsiPeriod: 14,
      stochasticPeriod: 14,
      kPeriod: 3,
      dPeriod: 3,
    }));

    const histogram = this.nullableNumber(macdCurrent?.histogram);
    const previousHistogram = this.nullableNumber(macdPrevious?.histogram);
    const goldenCross = previousHistogram !== null && histogram !== null && previousHistogram <= 0 && histogram > 0;

    return {
      close: currentClose,
      rsi: {
        value: this.nullableNumber(rsiValue),
        signal: this.rsiSignal(rsiValue),
      },
      macd: {
        macd: this.nullableNumber(macdCurrent?.MACD),
        signalLine: this.nullableNumber(macdCurrent?.signal),
        histogram,
        signal: goldenCross ? "골든크로스" : this.macdSignal(histogram),
        goldenCross,
      },
      bollingerBands: {
        upper: this.nullableNumber(bands?.upper),
        middle: this.nullableNumber(bands?.middle),
        lower: this.nullableNumber(bands?.lower),
        signal: this.bollingerSignal(currentClose, bands),
      },
      sma200: {
        value: this.nullableNumber(sma200),
        signal: this.priceVsAverageSignal(currentClose, sma200),
      },
      ema50: {
        value: this.nullableNumber(ema50),
        signal: this.priceVsAverageSignal(currentClose, ema50),
      },
      atr: {
        value: this.nullableNumber(atr),
      },
      stochasticRsi: {
        stochRSI: this.nullableNumber(stochasticRsi?.stochRSI),
        k: this.nullableNumber(stochasticRsi?.k),
        d: this.nullableNumber(stochasticRsi?.d),
      },
    };
  }

  generateBriefing(symbol: string, analysis: TechnicalAnalysis): string {
    const lines = [
      `📊 ${symbol} 기술적 분석 요약`,
      `현재가: ${this.formatNumber(analysis.close)}`,
      "",
      `• RSI(14): ${this.formatNullable(analysis.rsi.value)} → ${analysis.rsi.signal}`,
      `• MACD(12,26,9): 히스토그램 ${this.formatNullable(analysis.macd.histogram)} → ${analysis.macd.signal}${analysis.macd.goldenCross ? " ✅" : ""}`,
      `• 볼린저밴드(20,2): ${analysis.bollingerBands.signal}`,
      `  - 상단 ${this.formatNullable(analysis.bollingerBands.upper)} / 중단 ${this.formatNullable(analysis.bollingerBands.middle)} / 하단 ${this.formatNullable(analysis.bollingerBands.lower)}`,
      `• SMA(200): ${this.formatNullable(analysis.sma200.value)} → 현재가 ${analysis.sma200.signal}`,
      `• EMA(50): ${this.formatNullable(analysis.ema50.value)} → 현재가 ${analysis.ema50.signal}`,
      `• ATR(14): ${this.formatNullable(analysis.atr.value)} 변동성`,
      `• StochRSI(14,14,3,3): StochRSI ${this.formatNullable(analysis.stochasticRsi.stochRSI)}, K ${this.formatNullable(analysis.stochasticRsi.k)}, D ${this.formatNullable(analysis.stochasticRsi.d)}`,
      "",
      `🧭 종합: ${this.summarySignal(analysis)}`,
    ];

    return lines.join("\n");
  }

  private normalizeCandle(candle: OhlcvCandle): OhlcvObject {
    if (Array.isArray(candle)) {
      const [, open, high, low, close, volume] = candle;
      return { open, high, low, close, volume };
    }
    return candle;
  }

  private rsiSignal(value: number | undefined): Signal {
    if (typeof value !== "number" || !Number.isFinite(value)) return "데이터부족";
    if (value >= 70) return "과매수";
    if (value <= 30) return "과매도";
    return "중립";
  }

  private macdSignal(histogram: number | null): Signal {
    if (histogram === null) return "데이터부족";
    return histogram >= 0 ? "상승세" : "하락세";
  }

  private bollingerSignal(
    close: number,
    bands: { upper: number; middle: number; lower: number } | undefined
  ): Signal {
    if (!bands) return "데이터부족";
    if (close > bands.upper) return "상단돌파";
    if (close < bands.lower) return "하단돌파";
    return "밴드내";
  }

  private priceVsAverageSignal(close: number, average: number | undefined): Signal {
    if (typeof average !== "number" || !Number.isFinite(average)) return "데이터부족";
    return close >= average ? "상방" : "하방";
  }

  private summarySignal(analysis: TechnicalAnalysis): string {
    const bullish = [
      analysis.macd.signal === "상승세" || analysis.macd.goldenCross,
      analysis.sma200.signal === "상방",
      analysis.ema50.signal === "상방",
      analysis.rsi.signal === "과매도",
    ].filter(Boolean).length;
    const bearish = [
      analysis.macd.signal === "하락세",
      analysis.sma200.signal === "하방",
      analysis.ema50.signal === "하방",
      analysis.rsi.signal === "과매수",
    ].filter(Boolean).length;

    if (bullish > bearish) return "상승 우위 신호가 더 많습니다. 단, 진입 전 거래량과 주요 지지/저항을 함께 확인하세요.";
    if (bearish > bullish) return "하락 또는 과열 신호가 더 많습니다. 추격 진입보다 리스크 관리가 우선입니다.";
    return "상승/하락 신호가 혼재되어 있습니다. 추가 확인 전까지 중립 관점이 적절합니다.";
  }

  private last<T>(values: T[]): T {
    return values[values.length - 1];
  }

  private nullableNumber(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private formatNullable(value: number | null): string {
    return value === null ? "N/A" : this.formatNumber(value);
  }

  private formatNumber(value: number): string {
    if (Math.abs(value) >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (Math.abs(value) >= 1) return value.toFixed(2);
    return value.toFixed(6);
  }
}

export const taEngine = new TechnicalAnalysisEngine();

// New functions as requested
export function calcRSI(data: OhlcvData, period: number = 14): { values: number[]; latest: number | null } {
  if (data.length < period) {
    return { values: [], latest: null };
  }
  const closes = data.map((candle) => candle.close);
  try {
    const values = RSI.calculate({ values: closes, period });
    const latest = values.length > 0 ? values[values.length - 1] : null;
    return { values, latest: typeof latest === "number" ? latest : null };
  } catch {
    return { values: [], latest: null };
  }
}

export function calcMACD(
  data: OhlcvData,
  fast: number = 12,
  slow: number = 26,
  signal: number = 9
): {
  macd: number[];
  signal: number[];
  histogram: number[];
  latest: { macd: number | null; signal: number | null; histogram: number | null };
} {
  if (data.length < slow) {
    return {
      macd: [],
      signal: [],
      histogram: [],
      latest: { macd: null, signal: null, histogram: null },
    };
  }
  const closes = data.map((candle) => candle.close);
  try {
    const macdValues = MACD.calculate({
      values: closes,
      fastPeriod: fast,
      slowPeriod: slow,
      signalPeriod: signal,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    const macdArray = macdValues.map((v) => (typeof v.MACD === "number" ? v.MACD : 0));
    const signalArray = macdValues.map((v) => (typeof v.signal === "number" ? v.signal : 0));
    const histogramArray = macdValues.map((v) => (typeof v.histogram === "number" ? v.histogram : 0));

    const latest = macdValues.length > 0 ? macdValues[macdValues.length - 1] : null;
    return {
      macd: macdArray,
      signal: signalArray,
      histogram: histogramArray,
      latest: {
        macd: latest && typeof latest.MACD === "number" ? latest.MACD : null,
        signal: latest && typeof latest.signal === "number" ? latest.signal : null,
        histogram: latest && typeof latest.histogram === "number" ? latest.histogram : null,
      },
    };
  } catch {
    return {
      macd: [],
      signal: [],
      histogram: [],
      latest: { macd: null, signal: null, histogram: null },
    };
  }
}

export function calcBollingerBands(
  data: OhlcvData,
  period: number = 20,
  stdDev: number = 2
): {
  upper: number[];
  middle: number[];
  lower: number[];
  latest: { upper: number | null; middle: number | null; lower: number | null };
} {
  if (data.length < period) {
    return {
      upper: [],
      middle: [],
      lower: [],
      latest: { upper: null, middle: null, lower: null },
    };
  }
  const closes = data.map((candle) => candle.close);
  try {
    const bandsValues = BollingerBands.calculate({
      values: closes,
      period,
      stdDev,
    });
    const upperArray = bandsValues.map((v) => (typeof v.upper === "number" ? v.upper : 0));
    const middleArray = bandsValues.map((v) => (typeof v.middle === "number" ? v.middle : 0));
    const lowerArray = bandsValues.map((v) => (typeof v.lower === "number" ? v.lower : 0));

    const latest = bandsValues.length > 0 ? bandsValues[bandsValues.length - 1] : null;
    return {
      upper: upperArray,
      middle: middleArray,
      lower: lowerArray,
      latest: {
        upper: latest && typeof latest.upper === "number" ? latest.upper : null,
        middle: latest && typeof latest.middle === "number" ? latest.middle : null,
        lower: latest && typeof latest.lower === "number" ? latest.lower : null,
      },
    };
  } catch {
    return {
      upper: [],
      middle: [],
      lower: [],
      latest: { upper: null, middle: null, lower: null },
    };
  }
}

export function calcEMA(
  data: OhlcvData,
  period: number
): { values: number[]; latest: number | null } {
  if (data.length < period) {
    return { values: [], latest: null };
  }
  const closes = data.map((candle) => candle.close);
  try {
    const values = EMA.calculate({ values: closes, period });
    const latest = values.length > 0 ? values[values.length - 1] : null;
    return { values, latest: typeof latest === "number" ? latest : null };
  } catch {
    return { values: [], latest: null };
  }
}

export function calcATR(
  data: OhlcvData,
  period: number = 14
): { values: number[]; latest: number | null } {
  if (data.length < period) {
    return { values: [], latest: null };
  }
  const highs = data.map((candle) => candle.high);
  const lows = data.map((candle) => candle.low);
  const closes = data.map((candle) => candle.close);
  try {
    const values = ATR.calculate({
      high: highs,
      low: lows,
      close: closes,
      period,
    });
    const latest = values.length > 0 ? values[values.length - 1] : null;
    return { values, latest: typeof latest === "number" ? latest : null };
  } catch {
    return { values: [], latest: null };
  }
}

export function getFullAnalysis(data: OhlcvData) {
  return {
    rsi: calcRSI(data),
    macd: calcMACD(data),
    bollingerBands: calcBollingerBands(data),
    ema: calcEMA(data, 50),
    atr: calcATR(data),
  };
}
