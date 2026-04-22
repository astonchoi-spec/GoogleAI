/**
 * Chat Page
 * Interactive chat interface with LLM
 */

import { motion } from "framer-motion";
import UnifiedChatInterface from "@/components/UnifiedChatInterface";

export default function Chat() {
  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black">
      {/* Page Header */}
      <motion.div
        className="px-4 md:px-8 pt-4 pb-3 flex-shrink-0"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent leading-tight">
          AI 채팅
        </h1>
        <p className="text-slate-400 text-sm">
          구글 생태계 + 텔레그램 통합 플랫폼의 멀티 모델 AI 어시스턴트
        </p>
      </motion.div>

      {/* Chat Interface - fills remaining space */}
      <motion.div
        className="flex-1 overflow-hidden px-4 md:px-8 pb-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <div className="h-full max-w-4xl mx-auto rounded-lg border border-slate-700 overflow-hidden">
          <UnifiedChatInterface />
        </div>
      </motion.div>
    </div>
  );
}
