import { useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Plus, Loader2, Trash2, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export default function CalendarPanel() {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [description, setDescription] = useState("");

  const { data, isLoading, refetch } = trpc.googleWorkspace.calendar.getUpcomingEvents.useQuery({
    maxResults: 10,
  });

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
    onSuccess: () => {
      toast.success("일정이 삭제되었습니다.");
      refetch();
    },
    onError: (err) => toast.error(`삭제 실패: ${err.message}`),
  });

  const handleCreate = () => {
    if (!title || !startTime || !endTime) {
      toast.error("제목, 시작 시간, 종료 시간을 입력하세요.");
      return;
    }
    createMutation.mutate({ title, startTime, endTime, description });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Calendar className="w-4 h-4 text-cyan-400" />
          다가오는 일정
        </h3>
        <div className="flex gap-2">
          <Button onClick={() => refetch()} variant="ghost" size="sm" className="text-slate-400 hover:text-slate-300">
            <RefreshCw className="w-3 h-3" />
          </Button>
          <Button
            onClick={() => setShowCreate((v) => !v)}
            size="sm"
            className="bg-cyan-600 hover:bg-cyan-700 text-white"
          >
            <Plus className="w-3 h-3 mr-1" />
            일정 추가
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Card className="bg-slate-800 border-slate-700 p-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-white">새 일정</span>
                <button onClick={() => setShowCreate(false)}>
                  <X className="w-4 h-4 text-slate-400 hover:text-slate-300" />
                </button>
              </div>
              <Input
                placeholder="일정 제목"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white placeholder-slate-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">시작</label>
                  <Input
                    type="datetime-local"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">종료</label>
                  <Input
                    type="datetime-local"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white"
                  />
                </div>
              </div>
              <Input
                placeholder="설명 (선택)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white placeholder-slate-500"
              />
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                추가
              </Button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        </div>
      ) : !data?.events?.length ? (
        <p className="text-slate-500 text-sm text-center py-8">다가오는 일정이 없거나 Google 계정이 연결되지 않았습니다.</p>
      ) : (
        <div className="space-y-2">
          {data.events.map((event) => (
            <motion.div key={event.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
              <Card className="bg-slate-800 border-slate-700 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white font-medium truncate">{event.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(event.startTime).toLocaleString("ko-KR")}
                    </p>
                    {event.location && (
                      <p className="text-xs text-slate-500 truncate mt-0.5">{event.location}</p>
                    )}
                  </div>
                  <Button
                    onClick={() => deleteMutation.mutate({ eventId: event.id })}
                    disabled={deleteMutation.isPending}
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-300 hover:bg-red-950/30 shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
