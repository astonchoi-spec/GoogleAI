import { useEffect, useState } from "react";
import { LineChart } from "lucide-react";

type TechResult = {
  rsi: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  bb: { upper: number; middle: number; lower: number } | null;
  price: number | null;
  change24h: number | null;
};

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function calcRsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcMacd(closes: number[]): TechResult["macd"] {
  if (closes.length < 35) return null;
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const macdLine = e12.map((v, i) => v - e26[i]);
  const signalLine = ema(macdLine.slice(25), 9);
  const lastMacd = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  return { macd: lastMacd, signal: lastSignal, histogram: lastMacd - lastSignal };
}

function calcBB(closes: number[], period = 20): TechResult["bb"] {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / period);
  return { upper: mean + 2 * std, middle: mean, lower: mean - 2 * std };
}

export default function ChartArea() {
  const [data, setData] = useState<TechResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [klinesRes, priceRes, statsRes] = await Promise.all([
          fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=100"),
          fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"),
          fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT"),
        ]);
        const klines = await klinesRes.json() as Array<Array<string | number>>;
        const priceData = await priceRes.json() as { price: string };
        const statsData = await statsRes.json() as { priceChangePercent: string };
        const closes = klines.map((k) => parseFloat(String(k[4])));
        if (!cancelled) {
          setData({
            rsi: calcRsi(closes),
            macd: calcMacd(closes),
            bb: calcBB(closes),
            price: parseFloat(priceData.price),
            change24h: parseFloat(statsData.priceChangePercent),
          });
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Binance 공개 API 호출 실패");
          setLoading(false);
        }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  function rsiColor(rsi: number) {
    if (rsi >= 70) return "text-red-400";
    if (rsi <= 30) return "text-green-400";
    return "text-cyan-300";
  }

  function rsiLabel(rsi: number) {
    if (rsi >= 70) return "과매수";
    if (rsi <= 30) return "과매도";
    return "중립";
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--aston-text)]">Technical Snapshot</h2>
        <span className="text-xs text-[var(--aston-muted)]">BTC/USDT · 1h · 공개 API</span>
      </div>
      <div className="rounded-lg border border-dashed border-white/10 bg-black/15 p-4">
        {loading && (
          <div className="flex h-40 items-center justify-center text-slate-400">Loading analysis...</div>
        )}
        {error && (
          <div className="flex h-40 items-center justify-center text-red-300">{error}</div>
        )}
        {data && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-cyan-300">
              <LineChart className="h-4 w-4" />
              <span className="text-xs">Binance 공개 데이터 기반 기술 지표</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-white/5 p-3">
                <p className="text-[var(--aston-muted)]">현재가 (BTC/USDT)</p>
                <p className="mt-1 text-lg font-bold text-white">
                  ${data.price?.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </p>
                <p className={`mt-0.5 ${(data.change24h ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {(data.change24h ?? 0) >= 0 ? "+" : ""}{data.change24h?.toFixed(2)}% (24h)
                </p>
              </div>
              <div className="rounded-lg bg-white/5 p-3">
                <p className="text-[var(--aston-muted)]">RSI (14)</p>
                <p className={`mt-1 text-lg font-bold ${data.rsi !== null ? rsiColor(data.rsi) : "text-slate-400"}`}>
                  {data.rsi !== null ? data.rsi.toFixed(1) : "-"}
                </p>
                <p className="mt-0.5 text-[var(--aston-muted)]">
                  {data.rsi !== null ? rsiLabel(data.rsi) : "-"}
                </p>
              </div>
              <div className="rounded-lg bg-white/5 p-3">
                <p className="text-[var(--aston-muted)]">MACD (12/26/9)</p>
                {data.macd ? (
                  <>
                    <p className={`mt-1 font-semibold ${data.macd.histogram >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {data.macd.macd.toFixed(1)}
                    </p>
                    <p className="mt-0.5 text-[var(--aston-muted)]">
                      Signal: {data.macd.signal.toFixed(1)} · Hist: {data.macd.histogram.toFixed(1)}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-slate-400">-</p>
                )}
              </div>
              <div className="rounded-lg bg-white/5 p-3">
                <p className="text-[var(--aston-muted)]">Bollinger (20, 2σ)</p>
                {data.bb ? (
                  <>
                    <p className="mt-1 font-semibold text-white">
                      ${data.bb.middle.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </p>
                    <p className="mt-0.5 text-[var(--aston-muted)]">
                      ↑ ${data.bb.upper.toLocaleString("en-US", { maximumFractionDigits: 0 })} · ↓ ${data.bb.lower.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-slate-400">-</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
