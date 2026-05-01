const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAY: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

function kstNow(now: Date): Date {
  return new Date(now.getTime() + KST_OFFSET_MS);
}

function toIsoFromKst(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const utcMs = Date.UTC(year, month - 1, day) - KST_OFFSET_MS;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return new Date(utcMs).toISOString();
}

function addDaysKst(now: Date, days: number): string {
  const k = kstNow(now);
  return toIsoFromKst(k.getUTCFullYear(), k.getUTCMonth() + 1, k.getUTCDate() + days) ?? now.toISOString();
}

function pickFutureMonthDay(now: Date, month: number, day: number): string | null {
  const k = kstNow(now);
  const year = k.getUTCFullYear();
  const candidate = toIsoFromKst(year, month, day);
  if (!candidate) return null;
  const todayKey = `${year}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`;
  return candidate.slice(0, 10) >= todayKey ? candidate : toIsoFromKst(year + 1, month, day);
}

export function parseDealDate(input: string, now: Date = new Date()): string | null {
  const text = input.trim();
  if (!text) return null;
  const abs = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (abs) return toIsoFromKst(Number(abs[1]), Number(abs[2]), Number(abs[3]));
  const md = text.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (md) return pickFutureMonthDay(now, Number(md[1]), Number(md[2]));
  if (text === "오늘") return addDaysKst(now, 0);
  if (text === "내일") return addDaysKst(now, 1);
  if (text === "모레") return addDaysKst(now, 2);
  if (text === "글피") return addDaysKst(now, 3);
  const relDay = text.match(/^(\d+)\s*일\s*(?:후|뒤)$/);
  if (relDay) return addDaysKst(now, Number(relDay[1]));
  const relWeek = text.match(/^(\d+)\s*주\s*(?:후|뒤)$/);
  if (relWeek) return addDaysKst(now, Number(relWeek[1]) * 7);
  const relMonth = text.match(/^(\d+)\s*(?:개월|달)\s*(?:후|뒤)$/);
  if (relMonth) {
    const k = kstNow(now);
    return toIsoFromKst(k.getUTCFullYear(), k.getUTCMonth() + 1 + Number(relMonth[1]), k.getUTCDate());
  }
  const wd = text.match(/^(이번주|다음주|담주)\s*([일월화수목금토])(?:요일)?$/);
  if (wd) {
    const target = WEEKDAY[wd[2]];
    const todayDow = kstNow(now).getUTCDay();
    let diff = target - todayDow;
    if (wd[1] === "이번주") { if (diff < 0) diff += 7; } else { diff += 7; }
    return addDaysKst(now, diff);
  }
  return null;
}

export function calcDday(targetIso: string, now: Date = new Date()): number {
  const target = new Date(targetIso);
  if (Number.isNaN(target.getTime())) return Number.NaN;
  const tk = kstNow(target);
  const nk = kstNow(now);
  const t = Date.UTC(tk.getUTCFullYear(), tk.getUTCMonth(), tk.getUTCDate());
  const n = Date.UTC(nk.getUTCFullYear(), nk.getUTCMonth(), nk.getUTCDate());
  return Math.round((t - n) / (24 * 60 * 60 * 1000));
}

export function formatKstShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const k = kstNow(d);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`;
}
