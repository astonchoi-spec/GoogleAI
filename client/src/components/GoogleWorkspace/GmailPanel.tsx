import { useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Send, Loader2, RefreshCw, PenSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export default function GmailPanel() {
  const [showCompose, setShowCompose] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const { data, isLoading, refetch } = trpc.googleWorkspace.gmail.getEmails.useQuery({
    maxResults: 15,
  });

  const sendMutation = trpc.googleWorkspace.gmail.sendEmail.useMutation({
    onSuccess: () => {
      toast.success("메일이 전송되었습니다.");
      setShowCompose(false);
      setTo("");
      setSubject("");
      setBody("");
    },
    onError: (err) => toast.error(`전송 실패: ${err.message}`),
  });

  const handleSend = () => {
    if (!to || !subject || !body) {
      toast.error("받는 사람, 제목, 내용을 모두 입력하세요.");
      return;
    }
    sendMutation.mutate({ to, subject, body });
  };

  return (
    <div className="space-y-4">
      {/* MODIFIED: stack the Gmail header on narrow screens so action buttons do not clip. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="flex items-center gap-2 font-semibold text-[var(--aston-text)]">
          <Mail className="w-4 h-4 text-cyan-400" />
          받은 편지함
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => refetch()}
            variant="ghost"
            size="sm"
            className="text-[var(--aston-muted)] hover:text-slate-300"
          >
            <RefreshCw className="w-3 h-3" />
          </Button>
          <Button
            onClick={() => setShowCompose((v) => !v)}
            size="sm"
            className="bg-cyan-600 text-[var(--aston-text)] hover:bg-cyan-700"
          >
            <PenSquare className="w-3 h-3 mr-1" />
            편지 쓰기
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {showCompose && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="space-y-3 border-white/10 bg-[var(--aston-panel)] p-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--aston-text)]">새 메일 작성</span>
                <button type="button" onClick={() => setShowCompose(false)}>
                  <X className="w-4 h-4 text-[var(--aston-muted)] hover:text-slate-300" />
                </button>
              </div>
              <Input
                placeholder="받는 사람 (이메일)"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="border-white/10 bg-black/15 text-[var(--aston-text)] placeholder-slate-500"
              />
              <Input
                placeholder="제목"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="border-white/10 bg-black/15 text-[var(--aston-text)] placeholder-slate-500"
              />
              <textarea
                placeholder="내용을 입력하세요..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-md border border-white/10 bg-slate-700 p-3 text-sm text-[var(--aston-text)] placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
              <Button
                onClick={handleSend}
                disabled={sendMutation.isPending}
                className="w-full bg-cyan-600 text-[var(--aston-text)] hover:bg-cyan-700"
              >
                {sendMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                전송
              </Button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
        </div>
      ) : !data?.emails?.length ? (
        <p className="py-8 text-center text-sm text-[var(--aston-muted)]">
          메일함이 비었습니다. Google 계정이 연결되면 메일을 표시합니다.
        </p>
      ) : (
        <div className="space-y-2">
          {data.emails.map((email) => (
            <motion.div
              key={email.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <Card
                className={`cursor-default border-white/10 p-3 ${
                  email.isRead ? "bg-black/10" : "bg-black/15"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${email.isRead ? "text-[var(--aston-muted)]" : "font-medium text-[var(--aston-text)]"}`}>
                      {email.from}
                    </p>
                    <p className={`truncate text-sm ${email.isRead ? "text-[var(--aston-muted)]" : "text-slate-300"}`}>
                      {email.subject}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-600">{email.body}</p>
                  </div>
                  <p className="shrink-0 text-xs text-[var(--aston-muted)]">
                    {new Date(email.date).toLocaleDateString("ko-KR")}
                  </p>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
