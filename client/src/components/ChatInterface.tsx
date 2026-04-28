/**
 * Chat Interface Component
 * Interactive chat UI for LLM communication
 */

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Settings2, MessageCircle, Sliders, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import ApiSettingsModal from "./ApiSettingsModal";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  source?: "web" | "telegram";
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEngine, setSelectedEngine] = useState("gemini");
  const [selectedModel, setSelectedModel] = useState("flash");
  const [showSettings, setShowSettings] = useState(false);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [conversationId, setConversationId] = useState<number | null>(null);
  // Track DB message IDs we've already displayed (to avoid duplicates)
  const shownDbIds = useRef(new Set<number>());
  const dbInitialized = useRef(false);

  // tRPC queries and mutations
  const { data: engines } = trpc.llm.getEngines.useQuery();
  const { data: models } = trpc.llm.getModels.useQuery(
    { engine: selectedEngine },
    { enabled: !!selectedEngine }
  );
  const { data: status } = trpc.llm.getStatus.useQuery();
  const chatMutation = trpc.llm.chat.useMutation();
  const switchEngineMutation = trpc.llm.switchEngineAndModel.useMutation();

  // Get DB conversation (requires auth — silent fail for anonymous users)
  const { data: conversation } = trpc.chatSync.getConversation.useQuery(undefined, {
    retry: false,
  });

  useEffect(() => {
    if (conversation) setConversationId(conversation.id);
  }, [conversation]);

  // Poll DB messages every 5 seconds (for Telegram sync)
  const { data: dbMessages, refetch: refetchDb } = trpc.chatSync.getMessages.useQuery(
    { conversationId: conversationId ?? 0, limit: 50 },
    { enabled: !!conversationId, refetchInterval: 5000 }
  );

  // Initialize messages from DB on first load
  useEffect(() => {
    if (!dbMessages || dbInitialized.current) return;
    dbInitialized.current = true;
    shownDbIds.current.clear();
    const loaded: Message[] = dbMessages.map((m: any) => {
      shownDbIds.current.add(m.id as number);
      return {
        id: `db-${m.id}`,
        role: m.role as "user" | "assistant",
        content: m.content,
        timestamp: new Date(m.createdAt),
        source: m.source as "web" | "telegram",
      };
    });
    setMessages(loaded);
  }, [dbMessages]);

  // Merge new messages from DB polling (only unseen ones — catches Telegram messages)
  useEffect(() => {
    if (!dbMessages || !dbInitialized.current) return;
    const unseen = (dbMessages as any[]).filter((m: any) => !shownDbIds.current.has(m.id as number));
    if (unseen.length === 0) return;
    unseen.forEach((m: any) => shownDbIds.current.add(m.id as number));
    const toAdd: Message[] = unseen.map((m: any) => ({
      id: `db-${m.id}`,
      role: m.role as "user" | "assistant",
      content: m.content,
      timestamp: new Date(m.createdAt),
      source: m.source as "web" | "telegram",
    }));
    setMessages((prev) =>
      [...prev, ...toAdd].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    );
  }, [dbMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || isLoading) return;
    const trimmedInput = input.trim();

    // Add user message to local state immediately (optimistic)
    const userMessage: Message = {
      id: `local-u-${Date.now()}`,
      role: "user",
      content: trimmedInput,
      timestamp: new Date(),
      source: "web",
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await chatMutation.mutateAsync({ message: trimmedInput });

      const assistantMessage: Message = {
        id: `local-a-${Date.now()}`,
        role: "assistant",
        content: response.response,
        timestamp: new Date(),
        source: "web",
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Immediately sync DB (messages were saved server-side in llm.chat)
      if (conversationId) {
        refetchDb();
      }
    } catch (error) {
      const errorMessage: Message = {
        id: `local-e-${Date.now()}`,
        role: "assistant",
        content: `오류가 발생했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
        timestamp: new Date(),
        source: "web",
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchEngine = async () => {
    try {
      await switchEngineMutation.mutateAsync({
        engine: selectedEngine,
        modelKey: selectedModel,
      });
    } catch (error) {
      console.error("Failed to switch engine:", error);
    }
  };

  const currentModels = models?.map((m) => ({
    key: m.key,
    name: m.name,
  })) || [];

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-b from-slate-900 to-slate-950 rounded-lg border border-slate-700">
      {/* Header */}
      <motion.div
        className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-900/50 backdrop-blur-sm"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-cyan-400" />
          <div>
            <h3 className="font-semibold text-white">AI 어시스턴트</h3>
            <p className="text-xs text-slate-400">
              {status?.modelName || "로딩 중..."}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowApiSettings(true)}
            className="text-slate-400 hover:text-cyan-400"
            title="API 설정"
          >
            <Sliders className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(!showSettings)}
            className="text-slate-400 hover:text-cyan-400"
            title="엔진/모델 선택"
          >
            <Settings2 className="w-4 h-4" />
          </Button>
        </div>
      </motion.div>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            className="p-4 border-b border-slate-700 bg-slate-900/30 space-y-3"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">엔진 선택</label>
              <Select value={selectedEngine} onValueChange={setSelectedEngine}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {engines?.map((engine: any) => (
                    <SelectItem key={engine.name} value={engine.name}>
                      {engine.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">모델 선택</label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {currentModels.map((model) => (
                    <SelectItem key={model.key} value={model.key}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleSwitchEngine}
              disabled={switchEngineMutation.isPending}
              className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {switchEngineMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  전환 중...
                </>
              ) : (
                "엔진 전환"
              )}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <motion.div
            className="h-full flex items-center justify-center text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="space-y-3">
              <MessageCircle className="w-12 h-12 text-slate-600 mx-auto" />
              <p className="text-slate-400">대화를 시작해보세요!</p>
              <p className="text-xs text-slate-500">
                메시지를 입력하면 AI가 응답합니다.
              </p>
            </div>
          </motion.div>
        ) : (
          <>
            {messages.map((message, index) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <Card
                  className={`max-w-xs lg:max-w-md px-4 py-2 ${
                    message.role === "user"
                      ? "bg-cyan-600 text-white border-cyan-500"
                      : "bg-slate-800 text-slate-100 border-slate-700"
                  }`}
                >
                  <p className="text-sm break-words">{message.content}</p>
                  <div className="flex items-center gap-1 mt-1 opacity-70">
                    {message.source === "telegram" && (
                      <Bot className="w-3 h-3 text-blue-400" />
                    )}
                    <p className="text-xs">
                      {message.timestamp.toLocaleTimeString("ko-KR")}
                      {message.source === "telegram" && " · Telegram"}
                    </p>
                  </div>
                </Card>
              </motion.div>
            ))}

            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <Card className="bg-slate-800 text-slate-100 border-slate-700 px-4 py-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                    <span className="text-sm">응답 생성 중...</span>
                  </div>
                </Card>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Form */}
      <motion.form
        onSubmit={handleSendMessage}
        className="p-4 border-t border-slate-700 bg-slate-900/50 backdrop-blur-sm flex gap-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="메시지를 입력하세요..."
          disabled={isLoading}
          className="flex-1 bg-slate-800 border-slate-700 text-white placeholder-slate-500"
        />
        <Button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="bg-cyan-600 hover:bg-cyan-700 text-white"
          size="icon"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </motion.form>

      {/* API Settings Modal */}
      <ApiSettingsModal isOpen={showApiSettings} onClose={() => setShowApiSettings(false)} />
    </div>
  );
}
