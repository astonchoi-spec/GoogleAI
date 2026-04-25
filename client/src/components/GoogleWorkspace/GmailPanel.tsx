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
      toast.success("?¥Î©î?ºÏù¥ ?ÑÏÜ°?òÏóà?µÎãà??");
      setShowCompose(false);
      setTo(""); setSubject(""); setBody("");
    },
    onError: (err) => toast.error(`?ÑÏÜ° ?§Ìå®: ${err.message}`),
  });

  const handleSend = () => {
    if (!to || !subject || !body) {
      toast.error("Î∞õÎäî ?¨Îûå, ?úÎ™©, ?¥Ïö©??Î™®Îëê ?ÖÎ†•?òÏÑ∏??");
      return;
    }
    sendMutation.mutate({ to, subject, body });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[var(--aston-text)] font-semibold flex items-center gap-2">
          <Mail className="w-4 h-4 text-cyan-400" />
          Î∞õÏ? ?∏Ï???        </h3>
        <div className="flex gap-2">
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
            className="bg-cyan-600 hover:bg-cyan-700 text-[var(--aston-text)]"
          >
            <PenSquare className="w-3 h-3 mr-1" />
            ?∏Ï? ?∞Í∏∞
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
            <Card className="bg-[var(--aston-panel)] border-white/10 p-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-[var(--aston-text)]">??Î©îÏùº ?ëÏÑ±</span>
                <button onClick={() => setShowCompose(false)}>
                  <X className="w-4 h-4 text-[var(--aston-muted)] hover:text-slate-300" />
                </button>
              </div>
              <Input
                placeholder="Î∞õÎäî ?¨Îûå (?¥Î©î??"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="bg-black/15 border-white/10 text-[var(--aston-text)] placeholder-slate-500"
              />
              <Input
                placeholder="?úÎ™©"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="bg-black/15 border-white/10 text-[var(--aston-text)] placeholder-slate-500"
              />
              <textarea
                placeholder="?¥Ïö©???ÖÎ†•?òÏÑ∏??.."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                className="w-full rounded-md bg-slate-700 border border-white/10 text-[var(--aston-text)] placeholder-slate-500 p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
              <Button
                onClick={handleSend}
                disabled={sendMutation.isPending}
                className="w-full bg-cyan-600 hover:bg-cyan-700 text-[var(--aston-text)]"
              >
                {sendMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                ?ÑÏÜ°
              </Button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        </div>
      ) : !data?.emails?.length ? (
        <p className="text-[var(--aston-muted)] text-sm text-center py-8">
          ?¥Î©î?ºÏù¥ ?ÜÍ±∞??Google Í≥ÑÏ†ï???∞Í≤∞?òÏ? ?äÏïò?µÎãà??
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
                className={`p-3 border-white/10 cursor-default ${
                  email.isRead ? "bg-black/10" : "bg-black/15"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm truncate ${email.isRead ? "text-[var(--aston-muted)]" : "text-[var(--aston-text)] font-medium"}`}>
                      {email.from}
                    </p>
                    <p className={`text-sm truncate ${email.isRead ? "text-[var(--aston-muted)]" : "text-slate-300"}`}>
                      {email.subject}
                    </p>
                    <p className="text-xs text-slate-600 truncate mt-0.5">{email.body}</p>
                  </div>
                  <p className="text-xs text-[var(--aston-muted)] shrink-0">
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









