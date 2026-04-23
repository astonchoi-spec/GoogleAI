import { useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Plus, Loader2, Trash2, X, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

// Event color palette (cycles through)
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
      setTitle(""); setStartTime(""); setEndTime(""); setDescription("");
      refetch();
    },
    onError: (err) => toast.error(`일정 추가 실패: ${err.message}`),
  });

  const deleteMutation = trpc.googleWorkspace.calendar.deleteEvent.useMutation({
    onSuccess: () => { toast.success("일정이 삭제되었습니다."); refetch(); },
    onError: (err) => toast.error(`삭제 실패: ${err.message}`),
  });

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  };
  const goToday = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    setSelectedDay(now.getDate());
  };

  // Build grid
  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const events = (data?.events ?? []) as any[];
  const holidays = events.filter((e: any) => e.isHoliday);
  const personalEvents = events.filter((e: any) => !e.isHoliday);

  // Group by day
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

  const isHolidayDay = (day: number, dow: number) =>
    dow === 0 || holidaysByDay.has(day);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="text-white font-semibold flex items-center gap-2 text-base">
          <Calendar className="w-4 h-4 text-cyan-400" />
          {year}년 {month}월
        </h3>
        <div className="flex flex-wrap items-center gap-1">
          <button onClick={prevMonth} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={goToday} className="px-2 py-1 text-xs rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
            오늘
          </button>
          <button onClick={nextMonth} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => refetch()} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors ml-1">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <Button onClick={() => setShowCreate(v => !v)} size="sm" className="w-full sm:w-auto bg-cyan-600 hover:bg-cyan-700 text-white ml-0 sm:ml-1 h-7 text-xs">
            <Plus className="w-3 h-3 mr-1" />일정 추가
          </Button>
        </div>
      </div>

      {/* Create form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">새 일정</span>
                <button onClick={() => setShowCreate(false)}><X className="w-4 h-4 text-slate-400 hover:text-slate-300" /></button>
              </div>
              <Input placeholder="일정 제목" value={title} onChange={(e) => setTitle(e.target.value)} className="bg-slate-700 border-slate-600 text-white placeholder-slate-500 h-8" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">시작</label>
                  <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="bg-slate-700 border-slate-600 text-white h-8 text-xs" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">종료</label>
                  <Input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="bg-slate-700 border-slate-600 text-white h-8 text-xs" />
                </div>
              </div>
              <Input placeholder="설명 (선택)" value={description} onChange={(e) => setDescription(e.target.value)} className="bg-slate-700 border-slate-600 text-white placeholder-slate-500 h-8" />
              <Button onClick={() => { if (!title || !startTime || !endTime) { toast.error("필수 항목을 입력하세요."); return; } createMutation.mutate({ title, startTime, endTime, description }); }}
                disabled={createMutation.isPending} className="w-full bg-cyan-600 hover:bg-cyan-700 text-white h-8 text-sm">
                {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}추가
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Calendar */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>
      ) : (
        <div className="select-none">
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map((d, i) => (
              <div key={d} className={`text-center text-xs font-medium py-1.5 ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-slate-500"}`}>{d}</div>
            ))}
          </div>

          {/* Cells */}
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
                  className={`min-h-[64px] p-1 cursor-pointer border border-transparent transition-all rounded-lg ${
                    isSelected
                      ? "bg-cyan-900/30 border-cyan-600/50"
                      : "hover:bg-slate-800/60"
                  }`}
                >
                  {/* Date number */}
                  <div className="flex items-center justify-center mb-1">
                    <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium transition-colors ${
                      isToday
                        ? "bg-cyan-500 text-white"
                        : isRed
                        ? "text-red-400"
                        : dow === 6
                        ? "text-blue-400"
                        : "text-slate-300"
                    }`}>
                      {day}
                    </span>
                  </div>

                  {/* Holiday name */}
                  {dayHolidays.slice(0, 1).map((h, j) => (
                    <div key={j} className="text-[9px] leading-tight text-red-400 truncate px-0.5 mb-0.5">{h}</div>
                  ))}

                  {/* Events */}
                  {dayEvents.slice(0, 2).map((ev, j) => (
                    <div key={j} className={`text-[9px] leading-tight text-white truncate px-1 py-0.5 rounded mb-0.5 ${EVENT_COLORS[j % EVENT_COLORS.length]}`}>
                      {ev.isAllDay ? ev.title : `${new Date(ev.startTime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })} ${ev.title}`}
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <div className="text-[9px] text-slate-500 px-1">+{dayEvents.length - 2}개</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected day detail */}
      <AnimatePresence>
        {selectedDay && (selectedEvents.length > 0 || selectedHolidays.length > 0) && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
            <div className="border-t border-slate-700/60 pt-3 space-y-2">
              <p className="text-xs text-slate-400 font-medium">
                {month}월 {selectedDay}일
                {selectedHolidays.length > 0 && (
                  <span className="ml-2 text-red-400">{selectedHolidays.join(", ")}</span>
                )}
              </p>
              {selectedEvents.length === 0 ? (
                <p className="text-xs text-slate-600">일정 없음</p>
              ) : (
                selectedEvents.map((ev: any, i) => (
                  <div key={ev.id} className={`flex items-start gap-2 p-2.5 rounded-lg ${EVENT_COLORS[i % EVENT_COLORS.length].replace("/80", "/20")} border border-white/5`}>
                    <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${EVENT_COLORS[i % EVENT_COLORS.length]}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white font-medium truncate">{ev.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {ev.isAllDay ? "하루 종일" : `${new Date(ev.startTime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} ~ ${new Date(ev.endTime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`}
                      </p>
                      {ev.location && <p className="text-xs text-slate-500 truncate mt-0.5">📍 {ev.location}</p>}
                    </div>
                    <button
                      onClick={() => deleteMutation.mutate({ eventId: ev.id })}
                      disabled={deleteMutation.isPending}
                      className="text-slate-600 hover:text-red-400 transition-colors shrink-0 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
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
