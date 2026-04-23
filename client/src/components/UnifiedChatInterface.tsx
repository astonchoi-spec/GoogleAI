/**
 * Unified Chat Interface Component
 * Displays messages from both web and Telegram in real-time
 */

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Settings2, MessageCircle, Sliders, Smartphone, Globe, Check, LogIn, Mic, Volume2 } from "lucide-react"; // ADDED: voice input and TTS toggle icons.
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
import { useAuth } from "@/_core/hooks/useAuth";
import ApiSettingsModal from "./ApiSettingsModal";
import QuickActions from "./QuickActions"; // ADDED: quick command row above the input area.
import { useSpeechRecognition, useTextToSpeech } from "@/hooks/useSpeech"; // ADDED: browser speech recognition and TTS logic.

interface UnifiedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  source: "web" | "telegram";
  timestamp: Date;
}

export default function UnifiedChatInterface() {
  const { isAuthenticated } = useAuth();
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEngine, setSelectedEngine] = useState("gemini");
  const [selectedModel, setSelectedModel] = useState("flash");
  const [showSettings, setShowSettings] = useState(false);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // tRPC queries and mutations
  const { data: engines } = trpc.llm.getEngines.useQuery();
  const { data: models } = trpc.llm.getModels.useQuery(
    { engine: selectedEngine },
    { enabled: !!selectedEngine }
  );
  const { data: status } = trpc.llm.getStatus.useQuery();

  // Chat sync queries — 로그인 상태일 때만 실행
  const conversationQuery = trpc.chatSync.getConversation.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const messagesQuery = trpc.chatSync.getMessages.useQuery(
    { conversationId: conversationId || 0, limit: 50 },
    { enabled: isAuthenticated && !!conversationId }
  );
  const recentMessagesQuery = trpc.chatSync.getRecentMessages.useQuery(
    { conversationId: conversationId || 0, since: lastSyncTime },
    { enabled: isAuthenticated && !!conversationId, refetchInterval: 2000 }
  );

  // Mutations
  const chatMutation = trpc.llm.chat.useMutation();
  const saveWebMessageMutation = trpc.chatSync.saveWebMessage.useMutation();
  const forwardToTelegramMutation = trpc.chatSync.forwardToTelegram.useMutation();
  const switchEngineMutation = trpc.llm.switchEngineAndModel.useMutation();
  const [switchSuccess, setSwitchSuccess] = useState(false);
  const tts = useTextToSpeech(); // ADDED: TTS state and playback helpers.

  const handleEngineChange = (engine: string) => {
    setSelectedEngine(engine);
    // 엔진 변경 시 해당 엔진의 첫 번째 모델로 초기화
    const engineData = engines?.find((e: any) => e.name === engine);
    if (engineData?.models?.length > 0) {
      setSelectedModel(engineData.models[0].key);
    }
  };

  const handleApplyEngine = async () => {
    try {
      await switchEngineMutation.mutateAsync({ engine: selectedEngine, modelKey: selectedModel });
      setSwitchSuccess(true);
      toast.success("엔진이 변경되었습니다.");
      setTimeout(() => setSwitchSuccess(false), 2000);
    } catch (error) {
      toast.error("엔진 변경에 실패했습니다.");
    }
  };

  // Initialize conversation
  useEffect(() => {
    if (conversationQuery.data) {
      setConversationId(conversationQuery.data.id);
    }
  }, [conversationQuery.data]);

  // Load initial messages
  useEffect(() => {
    if (messagesQuery.data) {
      const loadedMessages: UnifiedMessage[] = messagesQuery.data
        .map((msg: any) => ({
          id: `${msg.id}`,
          role: msg.role as "user" | "assistant",
          content: msg.content,
          source: msg.source as "web" | "telegram",
          timestamp: new Date(msg.createdAt),
        }))
        .reverse();
      setMessages(loadedMessages);
    }
  }, [messagesQuery.data]);

  // Sync recent messages
  useEffect(() => {
    if (recentMessagesQuery.data && recentMessagesQuery.data.length > 0) {
      const newMessages: UnifiedMessage[] = recentMessagesQuery.data
        .map((msg: any) => ({
          id: `${msg.id}`,
          role: msg.role as "user" | "assistant",
          content: msg.content,
          source: msg.source as "web" | "telegram",
          timestamp: new Date(msg.createdAt),
        }))
        .reverse();

      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const uniqueNewMessages = newMessages.filter((m) => !existingIds.has(m.id));
        return [...prev, ...uniqueNewMessages];
      });

      setLastSyncTime(new Date());
    }
  }, [recentMessagesQuery.data]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessageText = async (text: string) => { // ADDED: shared sender for typed, voice, and quick action messages.
    if (!text.trim() || isLoading) return;

    const userMessage = text.trim();
    setInput("");
    setIsLoading(true);

    // Optimistically add user message to UI
    const userMsg: UnifiedMessage = {
      id: Date.now().toString(),
      role: "user",
      content: userMessage,
      source: "web",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      // Save user message to DB only if logged in (conversationId exists)
      if (conversationId) {
        await saveWebMessageMutation.mutateAsync({
          conversationId,
          role: "user",
          content: userMessage,
        });
      }

      // Get AI response
      const result = await chatMutation.mutateAsync({ message: userMessage });

      // Save AI response to DB only if logged in
      if (conversationId) {
        await saveWebMessageMutation.mutateAsync({
          conversationId,
          role: "assistant",
          content: result.response,
        });
        // Forward both messages to Telegram (양방향 sync)
        forwardToTelegramMutation.mutate({
          conversationId,
          userMessage,
          aiResponse: result.response,
        });
      }

      const aiMsg: UnifiedMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: result.response,
        source: "web",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      tts.speak(result.response); // ADDED: read AI responses aloud when TTS is enabled.
    } catch (error) {
      toast.error("메시지 전송에 실패했습니다.");
      console.error("Error sending message:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => { // ADDED: keep existing form submit behavior through shared sender.
    e.preventDefault();
    await sendMessageText(input);
  };

  const speech = useSpeechRecognition((text) => { // ADDED: voice result feeds the existing chat send flow.
    setInput(text);
    void sendMessageText(text);
  });

  useEffect(() => { // ADDED: accept quick commands from home widgets via /chat?command=...
    const params = new URLSearchParams(window.location.search);
    const command = params.get("command");
    if (!command) return;
    setInput(command);
    window.history.replaceState({}, "", "/chat");
  }, []);

  const getSourceIcon = (source: "web" | "telegram") => {
    return source === "telegram" ? (
      <Smartphone className="w-3 h-3" />
    ) : (
      <Globe className="w-3 h-3" />
    );
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Login notice banner - shown when not authenticated */}
      {!isAuthenticated && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex-shrink-0">
          <p className="text-xs text-amber-400">
            텔레그램 동기화는 로그인 후 사용 가능합니다
          </p>
          <a
            href="/login?from=/chat"
            className="flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200 font-medium underline underline-offset-2"
          >
            <LogIn className="w-3 h-3" />
            로그인
          </a>
        </div>
      )}

      {/* Header - Top (Fixed) */}
      <div className="border-b border-border bg-card px-4 py-3 flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircle className="w-4 h-4 text-primary" />
          <span>통합 채팅</span>
          <span className="text-xs text-muted-foreground font-normal">(웹 + Telegram)</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={tts.toggle}
            className={`text-muted-foreground hover:text-foreground ${tts.enabled ? "text-cyan-400" : ""}`}
            title={tts.enabled ? "TTS 끄기" : "TTS 켜기"}
          >
            <Volume2 className={`w-4 h-4 mr-1.5 ${tts.isSpeaking ? "text-cyan-300" : ""}`} />
            TTS
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Sliders className="w-4 h-4 mr-1.5" />
            설정
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowApiSettings(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Settings2 className="w-4 h-4 mr-1.5" />
            API
          </Button>
        </div>
      </div>

      {/* Settings Panel (collapsible) */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-border bg-card/50 flex-shrink-0"
          >
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">엔진</label>
                  <Select value={selectedEngine} onValueChange={handleEngineChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {engines?.map((engine: any) => (
                        <SelectItem key={engine.name} value={engine.name}>
                          {engine.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">모델</label>
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {models?.map((model: any) => (
                        <SelectItem key={model.key} value={model.key}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                onClick={handleApplyEngine}
                disabled={switchEngineMutation.isPending}
                size="sm"
                className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
              >
                {switchEngineMutation.isPending ? (
                  <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />전환 중...</>
                ) : switchSuccess ? (
                  <><Check className="w-3 h-3 mr-1.5" />적용 완료</>
                ) : (
                  "적용"
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages Area - Middle (Scrollable) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <AnimatePresence>
          {messages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full gap-6 text-muted-foreground pt-8"
            >
              <div className="text-center">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">메시지를 입력하여 시작하세요</p>
              </div>

              {/* Info cards - empty state only */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-xl">
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                  <h3 className="font-semibold text-cyan-400 text-xs mb-2">지원 엔진</h3>
                  <ul className="text-xs text-slate-400 space-y-1">
                    <li>• Gemma4 (로컬)</li>
                    <li>• Gemini (구글)</li>
                    <li>• Claude (Anthropic)</li>
                    <li>• GPT (OpenAI)</li>
                  </ul>
                </div>
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                  <h3 className="font-semibold text-cyan-400 text-xs mb-2">Google 서비스</h3>
                  <ul className="text-xs text-slate-400 space-y-1">
                    <li>• Gmail</li>
                    <li>• Calendar</li>
                    <li>• Drive</li>
                    <li>• Sheets</li>
                  </ul>
                </div>
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                  <h3 className="font-semibold text-cyan-400 text-xs mb-2">명령어</h3>
                  <ul className="text-xs text-slate-400 space-y-1">
                    <li>• /engine - 엔진 전환</li>
                    <li>• /model - 모델 전환</li>
                    <li>• /status - 상태 확인</li>
                    <li>• /clear - 기록 초기화</li>
                  </ul>
                </div>
              </div>
            </motion.div>
          ) : (
            messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <Card
                  className={`max-w-[75%] px-4 py-2 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-white"
                  }`}
                >
                  <div className="space-y-1">
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <div className="flex items-center justify-between gap-2 text-xs opacity-70">
                      <span>
                        {msg.timestamp.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span>{getSourceIcon(msg.source)}</span>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))
          )}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <Card className="bg-muted px-4 py-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">응답 중...</span>
              </div>
            </Card>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - Bottom (Fixed) */}
      <div className="border-t border-border bg-card p-4 flex-shrink-0">
        <QuickActions onSelect={(text) => void sendMessageText(text)} disabled={isLoading} /> {/* ADDED: quick command buttons. */}
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="메시지를 입력하세요..."
            disabled={isLoading}
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(e as any);
              }
            }}
          />
          {speech.isSupported && (
            <Button
              type="button"
              onClick={speech.isListening ? speech.stopListening : speech.startListening}
              disabled={isLoading}
              size="icon"
              className={speech.isListening ? "animate-pulse bg-red-600 text-white hover:bg-red-700" : ""}
              title={speech.isListening ? "음성 입력 중지" : "음성 입력"}
            >
              <Mic className="w-4 h-4" />
            </Button>
          )}
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            size="icon"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>
      </div>

      {/* API Settings Modal */}
      <ApiSettingsModal isOpen={showApiSettings} onClose={() => setShowApiSettings(false)} />
    </div>
  );
}
