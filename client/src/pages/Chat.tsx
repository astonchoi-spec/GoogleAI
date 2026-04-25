/**
 * Chat Page
 * Interactive chat interface with LLM
 */

import { motion } from "framer-motion";
import { Sparkles, MessageCircle } from "lucide-react";
import UnifiedChatInterface from "@/components/UnifiedChatInterface";
import { Badge } from "@/components/ui/badge";

export default function Chat() {
  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-5"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <Badge variant="outline" className="border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                Unified command console
              </Badge>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-[var(--aston-text)]">
                  AI 채팅
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-[var(--aston-muted)]">
                  웹과 Telegram 메시지를 하나의 지휘 화면에서 확인하고, 회장님 업무 지시를 바로 실행합니다.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--aston-text)]">
                <MessageCircle className="h-4 w-4 text-cyan-300" />
                실시간 동기화
              </div>
              <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--aston-text)]">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Telegram + Web
              </div>
            </div>
          </div>
        </motion.section>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="overflow-hidden rounded-2xl border border-white/10 bg-black/15 shadow-[0_24px_60px_rgba(0,0,0,0.2)]"
        >
          <UnifiedChatInterface />
        </motion.div>
      </div>
    </div>
  );
}
