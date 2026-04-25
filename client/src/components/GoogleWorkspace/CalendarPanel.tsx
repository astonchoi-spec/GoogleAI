import { useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Plus, Loader2, Trash2, X, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

const EVENT_COLORS = [
  "bg-blue-500/80",
  "bg-emerald-500/80",
  "bg-violet-500/80",
  "bg-amber-500/80",
  "bg-rose-500/80",
  "bg-cyan-500/80",
];

export default function CalendarPanel() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState<number | null>(now.getDate());
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [description, setDescription] = useState("");

  const { data, isLoading, refetch } = trpc.googleWorkspace.calendar.getMonthEvents.useQuery(
    { year, month },
    { retry: false }
  );

  const createMutation = trpc.googleWorkspace.calendar.createEvent.useMutation({
    onSuccess: () => {
      toast.success("일정이 추가되었습니다.");
      setShowCreate(false);
      setTitle("");
      setStartTime("");
      setEndTime("");
      setDescription("");
      refetch();
    },
    onError: (err) => toast.error(`일정 추가 실패: ${err.message}`),
  });

  const deleteMutation = trpc.googleWorkspace.calendar.deleteEvent.useMutation({
    onSuccess: () => {
      toast.success("일정이 삭제되었습니다.");
      refetch();
    },
    onError: (err) => toast.error(`삭제 실패: ${err.message}`),
  });

  const prevMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
    setSelectedDay(null);
  };

  const nextMonth = () => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
    setSelectedDay(null);
  };

  const goToday = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    setSelectedDay(now.getDate());
  };

  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const events = (data?.events ?? []) as any[];
  const holidays = events.filter((e: any) => e.isHoliday);
  const personalEvents = events.filter((e: any) => !e.isHoliday);

  const eventsByDay = new Map<number, any[]>();
  const holidaysByDay = new Map<number, string[]>();

  for (const ev of personalEvents) {
    const d = new Date(ev.startTime).getDate();
    if (!eventsByDay.has(d)) eventsByDay.set(d, []);
    eventsByDay.get(d)!.push(ev);
  }
  for (const h of holidays) {
    const d = new Date(h.startTime).getDate();
    if (!holidaysByDay.has(d)) holidaysByDay.set(d, []);
    holidaysByDay.get(d)!.push(h.title);
  }

  const today = now.getFullYear() === year && now.getMonth() + 1 === month ? now.getDate() : null;
  const selectedEvents = selectedDay ? (eventsByDay.get(selectedDay) ?? []) : [];
  const selectedHolidays = selectedDay ? (holidaysByDay.get(selectedDay) ?? []) : [];

  const isHolidayDay = (day: number, dow: number) => dow === 0 || holidaysByDay.has(day);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--aston-text)]">
          <Calendar className="h-4 w-4 text-cyan-400" />
          {year}년 {month}월
        </h3>
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="rounded p-1.5 text-[var(--aston-muted)] transition-colors hover:bg-white/5 hover:text-[var(--aston-text)]">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={goToday} className="rounded px-2 py-1 text-xs text-[var(--aston-muted)] transition-colors hover:bg-white/5 hover:text-[var(--aston-text)]">
            오늘
          </button>
          <button onClick={nextMonth} className="rounded p-1.5 text-[var(--aston-muted)] transition-colors hover:bg-white/5 hover:text-[var(--aston-text)]">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button onClick={() => refetch()} className="ml-1 rounded p-1.5 text-[var(--aston-muted)] transition-colors hover:bg-white/5 hover:text-[var(--aston-text)]">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <Button onClick={() => setShowCreate((v) => !v)} size="sm" className="ml-1 h-7 bg-cyan-500 text-slate-950 hover:bg-cyan-400">
            <Plus className="mr-1 h-3 w-3" /> 일정 추가
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="space-y-3 rounded-2xl border border-white/10 bg-black/15 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--aston-text)]">일정 생성</span>
                <button onClick={() => setShowCreate(false)}><X className="h-4 w-4 text-[var(--aston-muted)]" /></button>
              </div>
              <Input placeholder="일정 제목" value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 border-white/10 bg-black/20 text-[var(--aston-text)] placeholder:text-[var(--aston-muted)]" />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-[var(--aston-muted)]">시작</label>
                  <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-8 border-white/10 bg-black/20 text-[var(--aston-text)] text-xs" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--aston-muted)]">종료</label>
                  <Input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-8 border-white/10 bg-black/20 text-[var(--aston-text)] text-xs" />
                </div>
              </div>
              <Input placeholder="설명(선택)" value={description} onChange={(e) => setDescription(e.target.value)} className="h-8 border-white/10 bg-black/20 text-[var(--aston-text)] placeholder:text-[var(--aston-muted)]" />
              <Button onClick={() => { if (!title || !startTime || !endTime) { toast.error("필수 항목을 입력하세요."); return; } createMutation.mutate({ title, startTime, endTime, description }); }} disabled={createMutation.isPending} className="h-8 w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400">
                {createMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}추가
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-cyan-400" /></div>
      ) : (
        <div className="select-none">
          <div className="mb-1 grid grid-cols-7">
            {DAYS.map((d, i) => (
              <div key={d} className={`py-1.5 text-center text-xs font-medium ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-[var(--aston-muted)]"}`}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              if (day === null) return <div key={i} className="min-h-[64px]" />;

              const dow = i % 7;
              const isToday = day === today;
              const isSelected = day === selectedDay;
              const isRed = isHolidayDay(day, dow);
              const dayEvents = eventsByDay.get(day) ?? [];
              const dayHolidays = holidaysByDay.get(day) ?? [];

              return (
                <div
                  key={i}
                  onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                  className={`min-h-[64px] cursor-pointer rounded-lg border border-transparent p-1 transition-all ${isSelected ? "border-cyan-500/40 bg-cyan-500/10" : "hover:bg-white/5"}`}
                >
                  <div className="mb-1 flex items-center justify-center">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${isToday ? "bg-cyan-500 text-slate-950" : isRed ? "text-red-400" : dow === 6 ? "text-blue-400" : "text-[var(--aston-text)]"}`}>
                      {day}
                    </span>
                  </div>

                  {dayHolidays.slice(0, 1).map((h, j) => (
                    <div key={j} className="mb-0.5 truncate px-0.5 text-[9px] leading-tight text-red-400">{h}</div>
                  ))}

                  {dayEvents.slice(0, 2).map((ev, j) => (
                    <div key={j} className={`mb-0.5 truncate rounded px-1 py-0.5 text-[9px] leading-tight text-white ${EVENT_COLORS[j % EVENT_COLORS.length]}`}>
                      {ev.isAllDay ? ev.title : `${new Date(ev.startTime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })} ${ev.title}`}
                    </div>
                  ))}
                  {dayEvents.length > 2 && <div className="px-1 text-[9px] text-[var(--aston-muted)]">+{dayEvents.length - 2}개</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AnimatePresence>
        {selectedDay && (selectedEvents.length > 0 || selectedHolidays.length > 0) && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
            <div className="space-y-2 border-t border-white/10 pt-3">
              <p className="text-xs font-medium text-[var(--aston-muted)]">
                {month}월 {selectedDay}일
                {selectedHolidays.length > 0 && <span className="ml-2 text-red-400">{selectedHolidays.join(", ")}</span>}
              </p>
              {selectedEvents.length === 0 ? (
                <p className="text-xs text-[var(--aston-muted)]">일정 없음</p>
              ) : (
                selectedEvents.map((ev: any, i) => (
                  <div key={ev.id} className={`flex items-start gap-2 rounded-lg border border-white/5 p-2.5 ${EVENT_COLORS[i % EVENT_COLORS.length].replace("/80", "/20")}`}>
                    <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${EVENT_COLORS[i % EVENT_COLORS.length]}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--aston-text)]">{ev.title}</p>
                      <p className="mt-0.5 text-xs text-[var(--aston-muted)]">
                        {ev.isAllDay ? "종일" : `${new Date(ev.startTime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} ~ ${new Date(ev.endTime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`}
                      </p>
                      {ev.location && <p className="mt-0.5 truncate text-xs text-[var(--aston-muted)]">{ev.location}</p>}
                    </div>
                    <button onClick={() => deleteMutation.mutate({ eventId: ev.id })} disabled={deleteMutation.isPending} className="shrink-0 p-1 text-[var(--aston-muted)] transition-colors hover:text-red-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
