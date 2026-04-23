/**
 * Chat Page
 * Interactive chat interface with LLM
 */

import { motion } from "framer-motion";
import UnifiedChatInterface from "@/components/UnifiedChatInterface";

export default function Chat() {
  return (
    <div className="flex flex-col bg-gradient-to-b from-slate-900 via-slate-950 to-black min-h-[calc(100dvh-48px)]">
      <motion.div
        className="flex-1 overflow-hidden px-2 sm:px-4 md:px-8 py-2 sm:py-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="h-full max-w-4xl mx-auto rounded-none sm:rounded-lg border border-slate-700 overflow-hidden">
          <UnifiedChatInterface />
        </div>
      </motion.div>
    </div>
  );
}
