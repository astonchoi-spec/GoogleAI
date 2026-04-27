import { useEffect, useState } from "react";

type PremiumData = {
  upbitPrice: number;
  binancePrice: number;
  fxRate: number;
  premiumPercent: number;
};

function usePremium(symbol: string) {
  const [data, setData] = useState<PremiumData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [upbitRes, binanceRes, fxRes] = await Promise.all([
          fetch(`https://api.upbit.com/v1/ticker?markets=KRW-${symbol}`),
          fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`),
          fetch("https://api.exchangerate-api.com/v4/latest/USD"),
        ]);
        const upbitData = await upbitRes.json() as Array<{ trade_price: number }>;
        const binanceData = await binanceRes.json() as { price: string };
        const fxData = await fxRes.json() as { rates: { KRW: number } };

        const upbitPrice = upbitData[0]?.trade_price;
        const binanceUsdt = parseFloat(binanceData.price);
        const fxRate = fxData.rates.KRW;
        const binanceKrw = binanceUsdt * fxRate;
        const premiumPercent = ((upbitPrice - binanceKrw) / binanceKrw) * 100;

        if (!cancelled) {
          setData({ upbitPrice, binancePrice: binanceUsdt, fxRate, premiumPercent });
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("fetch failed");
          setLoading(false);
        }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [symbol]);

  return { data, loading, error };
}

function PremiumRow({ symbol }: { symbol: string }) {
  const { data, loading, error } = usePremium(symbol);

  if (loading) {
    return (
      <div className="flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2">
        <span className="text-sm text-slate-300">{symbol}</span>
        <span className="text-sm font-semibold text-slate-400">Loading...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2">
        <span className="text-sm text-slate-300">{symbol}</span>
        <span className="text-xs font-semibold text-yellow-400">공개 데이터만 사용 중 (API 키 미설정)</span>
      </div>
    );
  }

  const tone = data.premiumPercent >= 0 ? "text-[#00c853]" : "text-[#ff1744]";
  const sign = data.premiumPercent >= 0 ? "+" : "";

  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2">
      <div>
        <span className="text-sm text-slate-300">{symbol}</span>
        <span className="ml-2 text-xs text-slate-500">
          ₩{data.upbitPrice.toLocaleString("ko-KR")} · FX {data.fxRate.toFixed(0)}
        </span>
      </div>
      <span className={`text-sm font-semibold ${tone}`}>{sign}{data.premiumPercent.toFixed(2)}%</span>
    </div>
  );
}

export default function KimchiPremium() {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
      <h2 className="text-sm font-semibold text-white">Kimchi Premium</h2>
      <p className="mt-1 text-xs text-slate-500">Upbit vs Binance 공개 API · 실시간 환율 반영</p>
      <div className="mt-3 space-y-2">
        <PremiumRow symbol="BTC" />
        <PremiumRow symbol="ETH" />
      </div>
    </div>
  );
}
