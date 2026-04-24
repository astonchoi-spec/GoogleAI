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

  const authQuery = trpc.googleWorkspace.isAuthenticated.useQuery();
  const isAuthenticated = authQuery.data?.authenticated === true;
  const { data, isLoading, error, refetch } = trpc.googleWorkspace.gmail.getEmails.useQuery(
    { maxResults: 15 },
    {
      enabled: isAuthenticated,
      retry: false,
    }
  );

  const sendMutation = trpc.googleWorkspace.gmail.sendEmail.useMutation({
    onSuccess: () => {
      toast.success("이메일이 전송되었습니다.");
      setShowCompose(false);
      setTo(""); setSubject(""); setBody("");
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Mail className="w-4 h-4 text-cyan-400" />
          받은 편지함
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => refetch()}
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-slate-300"
          >
            <RefreshCw className="w-3 h-3" />
          </Button>
          <Button
            onClick={() => setShowCompose((v) => !v)}
            size="sm"
            className="flex-1 sm:flex-none bg-cyan-600 hover:bg-cyan-700 text-white"
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
            <Card className="bg-slate-800 border-slate-700 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-medium text-white">새 메일 작성</span>
                <button onClick={() => setShowCompose(false)}>
                  <X className="w-4 h-4 text-slate-400 hover:text-slate-300" />
                </button>
              </div>
              <Input
                placeholder="받는 사람 (이메일)"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white placeholder-slate-500"
              />
              <Input
                placeholder="제목"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white placeholder-slate-500"
              />
              <textarea
                placeholder="내용을 입력하세요..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                className="w-full rounded-md bg-slate-700 border border-slate-600 text-white placeholder-slate-500 p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
              <Button
                onClick={handleSend}
                disabled={sendMutation.isPending}
                className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
              >
                {sendMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                전송
              </Button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {authQuery.isLoading || isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        </div>
      ) : !isAuthenticated ? (
        <Card className="bg-slate-800/70 border-slate-700 p-4">
          <p className="text-slate-300 text-sm font-medium">Google 계정 연결이 필요합니다.</p>
          <p className="text-slate-500 text-xs mt-1">
            위의 Google 연결 버튼으로 다시 인증하면 Gmail을 불러올 수 있습니다.
          </p>
        </Card>
      ) : error ? (
        <Card className="bg-red-950/30 border-red-700/50 p-4">
          <p className="text-red-300 text-sm font-medium">Gmail을 불러오지 못했습니다.</p>
          <p className="text-red-400/80 text-xs mt-1">{error.message}</p>
        </Card>
      ) : !data?.emails?.length ? (
        <p className="text-slate-500 text-sm text-center py-8">
          이메일이 없거나 Google 계정이 연결되지 않았습니다.
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
                className={`p-3 border-slate-700 cursor-default ${
                  email.isRead ? "bg-slate-800/50" : "bg-slate-800"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm truncate ${email.isRead ? "text-slate-400" : "text-white font-medium"}`}>
                      {email.from}
                    </p>
                    <p className={`text-sm truncate ${email.isRead ? "text-slate-500" : "text-slate-300"}`}>
                      {email.subject}
                    </p>
                    <p className="text-xs text-slate-600 truncate mt-0.5">{email.body}</p>
                  </div>
                  <p className="text-xs text-slate-500 shrink-0">
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
