/**
 * Unified Chat Interface Component
 * Displays messages from both web and Telegram in real-time
 */

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Settings2, MessageCircle, Sliders, Smartphone, Globe, Check, LogIn, Search, Clock3, MessageSquareText, Filter, Download, Pencil, Trash2, Star } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import ApiSettingsModal from "./ApiSettingsModal";

interface UnifiedMessage {
  id: string;
  dbId?: number;
  role: "user" | "assistant";
  content: string;
  source: "web" | "telegram";
  timestamp: Date;
}

interface SearchResult {
  conversationId: number;
  conversationTitle: string | null;
  messageId: number;
  role: "user" | "assistant";
  content: string;
  source: "web" | "telegram";
  telegramMessageId: number | null;
  metadata: unknown;
  createdAt: Date;
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
  const [showSearch, setShowSearch] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [olderCursor, setOlderCursor] = useState<Date | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchSource, setSearchSource] = useState<"all" | "web" | "telegram">("all");
  const [searchFrom, setSearchFrom] = useState("");
  const [searchTo, setSearchTo] = useState("");
  const [editingMessage, setEditingMessage] = useState<UnifiedMessage | null>(null);
  const [editContent, setEditContent] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState<{
    keyword: string;
    source: "all" | "web" | "telegram";
    from?: Date;
    to?: Date;
  } | null>(null);
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
  const initialMessagesQuery = trpc.chatSync.getMessages.useQuery(
    { conversationId: conversationId || 0, limit: 30 },
    { enabled: isAuthenticated && !!conversationId }
  );
  const olderMessagesQuery = trpc.chatSync.getMessages.useQuery(
    { conversationId: conversationId || 0, limit: 30, before: olderCursor || undefined },
    { enabled: isAuthenticated && !!conversationId && !!olderCursor }
  );
  const recentMessagesQuery = trpc.chatSync.getRecentMessages.useQuery(
    { conversationId: conversationId || 0, since: lastSyncTime },
    { enabled: isAuthenticated && !!conversationId, refetchInterval: 2000 }
  );

  // Mutations
  const chatMutation = trpc.llm.chat.useMutation();
  const saveWebMessageMutation = trpc.chatSync.saveWebMessage.useMutation();
  const forwardToTelegramMutation = trpc.chatSync.forwardToTelegram.useMutation();
  const editMessageMutation = trpc.chatSync.editMessage.useMutation();
  const deleteMessageMutation = trpc.chatSync.deleteMessage.useMutation();
  const togglePinMutation = trpc.chatSync.togglePin.useMutation();
  const switchEngineMutation = trpc.llm.switchEngineAndModel.useMutation();
  const searchMessagesQuery = trpc.chatSync.searchMessages.useQuery(
    submittedSearch
      ? {
          keyword: submittedSearch.keyword,
          source: submittedSearch.source,
          from: submittedSearch.from,
          to: submittedSearch.to,
          limit: 25,
        }
      : {
          keyword: "placeholder",
          source: "all",
          limit: 25,
        },
    {
      enabled: !!submittedSearch && showSearch,
    }
  );
  const [switchSuccess, setSwitchSuccess] = useState(false);

  const normalizeMessages = (items: any[]): UnifiedMessage[] =>
    items.map((msg: any) => ({
      id: `${msg.id}`,
      role: msg.role as "user" | "assistant",
      content: msg.content,
      source: msg.source as "web" | "telegram",
      timestamp: new Date(msg.createdAt),
    }));

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
      setIsPinned(Boolean((conversationQuery.data as any).pinned));
    }
  }, [conversationQuery.data]);

  // Load initial messages
  useEffect(() => {
    if (initialMessagesQuery.data) {
      const page = initialMessagesQuery.data;
      const loadedMessages = normalizeMessages(page.messages).reverse();
      setMessages(loadedMessages);
      setHasMoreMessages(page.hasMore);
      setOlderCursor(null);
      setLoadingOlderMessages(false);
    }
  }, [initialMessagesQuery.data]);

  // Load older messages
  useEffect(() => {
    if (!olderMessagesQuery.data || !olderCursor) return;

    const page = olderMessagesQuery.data;
    const olderMessages = normalizeMessages(page.messages).reverse();

    setMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      const uniqueOlderMessages = olderMessages.filter((m) => !existingIds.has(m.id));
      return [...uniqueOlderMessages, ...prev];
    });
    setHasMoreMessages(page.hasMore);
    setOlderCursor(null);
    setLoadingOlderMessages(false);
  }, [olderMessagesQuery.data, olderCursor]);

  // Sync recent messages
  useEffect(() => {
    if (recentMessagesQuery.data && recentMessagesQuery.data.length > 0) {
      const newMessages: UnifiedMessage[] = recentMessagesQuery.data
        .map((msg: any) => ({
          id: `${msg.id}`,
          dbId: Number(msg.id),
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

  useEffect(() => {
    if (!submittedSearch || searchMessagesQuery.isFetching) return;
    toast.info(`검색 결과 ${searchMessagesQuery.data?.length ?? 0}개`);
  }, [searchMessagesQuery.data, searchMessagesQuery.isFetching, submittedSearch]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input;
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
      toast.success("메시지가 전송되었습니다.");
    } catch (error) {
      toast.error("메시지 전송에 실패했습니다.");
      console.error("Error sending message:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const parseSearchDate = (value: string, endOfDay = false) => {
    if (!value) return undefined;
    const suffix = endOfDay ? "T23:59:59.999" : "T00:00:00.000";
    const date = new Date(`${value}${suffix}`);
    return Number.isNaN(date.getTime()) ? undefined : date;
  };

  const handleSearchMessages = async (e: React.FormEvent) => {
    e.preventDefault();

    const keyword = searchKeyword.trim();
    if (!keyword) {
      toast.error("검색어를 입력하세요.");
      return;
    }

    setSubmittedSearch({
      keyword,
      source: searchSource,
      from: parseSearchDate(searchFrom, false),
      to: parseSearchDate(searchTo, true),
    });
  };

  const handleLoadOlderMessages = () => {
    if (loadingOlderMessages || !hasMoreMessages || messages.length === 0) return;
    const oldestMessage = messages[0];
    if (!oldestMessage) return;

    setLoadingOlderMessages(true);
    setOlderCursor(new Date(oldestMessage.timestamp.getTime() - 1));
  };

  const handleExportConversation = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      conversationId,
      messages: messages.map((msg) => ({
        id: msg.dbId ?? msg.id,
        role: msg.role,
        content: msg.content,
        source: msg.source,
        timestamp: msg.timestamp.toISOString(),
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `conversation-${conversationId ?? "draft"}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("대화가 JSON으로 내보내졌습니다.");
  };

  const handleEditMessage = async (message: UnifiedMessage) => {
    if (!conversationId || !message.dbId) return;
    const nextContent = window.prompt("메시지 내용을 수정하세요.", message.content);
    if (nextContent === null) return;

    const content = nextContent.trim();
    if (!content) {
      toast.error("수정할 내용을 입력해주세요.");
      return;
    }

    try {
      const updated = await editMessageMutation.mutateAsync({
        conversationId,
        messageId: message.dbId,
        content,
      });

      setMessages((prev) =>
        prev.map((item) => (item.dbId === message.dbId ? { ...item, content: updated.content } : item))
      );
      toast.success("메시지를 수정했습니다.");
    } catch (error) {
      toast.error("메시지 수정에 실패했습니다.");
    }
  };

  const handleDeleteMessage = async (message: UnifiedMessage) => {
    if (!conversationId || !message.dbId) return;
    if (!window.confirm("이 메시지를 삭제할까요?")) return;

    try {
      await deleteMessageMutation.mutateAsync({
        conversationId,
        messageId: message.dbId,
      });

      setMessages((prev) => prev.filter((item) => item.dbId !== message.dbId));
      toast.success("메시지를 삭제했습니다.");
    } catch (error) {
      toast.error("메시지 삭제에 실패했습니다.");
    }
  };

  const handleTogglePin = async () => {
    if (!conversationId) return;

    try {
      const updated = await togglePinMutation.mutateAsync({
        conversationId,
        pinned: !isPinned,
      });
      setIsPinned(Boolean(updated.pinned));
      toast.success(updated.pinned ? "대화를 즐겨찾기에 추가했습니다." : "대화를 즐겨찾기에서 해제했습니다.");
    } catch (error) {
      toast.error("대화 즐겨찾기 처리에 실패했습니다.");
    }
  };

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
            onClick={() => setShowSettings(!showSettings)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Sliders className="w-4 h-4 mr-1.5" />
            설정
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSearch(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Search className="w-4 h-4 mr-1.5" />
            검색
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportConversation}
            className="text-muted-foreground hover:text-foreground"
          >
            <Download className="w-4 h-4 mr-1.5" />
            내보내기
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTogglePin}
            disabled={togglePinMutation.isPending}
            className={isPinned ? "text-amber-400 hover:text-amber-300" : "text-muted-foreground hover:text-foreground"}
          >
            <Star className={`w-4 h-4 mr-1.5 ${isPinned ? "fill-current" : ""}`} />
            {isPinned ? "핀 해제" : "핀"}
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
        <div className="flex justify-center">
          {hasMoreMessages ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingOlderMessages}
              onClick={handleLoadOlderMessages}
              className="border-slate-700 bg-slate-900/70 text-slate-300 hover:bg-slate-800"
            >
              {loadingOlderMessages ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                  이전 메시지 불러오는 중
                </>
              ) : (
                "이전 메시지 불러오기"
              )}
            </Button>
          ) : (
            <p className="text-xs text-slate-500">최신 메시지를 보고 있습니다.</p>
          )}
        </div>

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
                      <div className="flex items-center gap-2">
                        <span>{getSourceIcon(msg.source)}</span>
                        {conversationId && msg.dbId && (
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-inherit hover:bg-white/10"
                              onClick={() => handleEditMessage(msg)}
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-inherit hover:bg-white/10"
                              onClick={() => handleDeleteMessage(msg)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
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

      {/* Search Dialog */}
      <Dialog open={showSearch} onOpenChange={setShowSearch}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden bg-slate-950 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <MessageSquareText className="w-5 h-5 text-cyan-400" />
              메시지 검색
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              대화 제목, 메시지 내용, 출처, 날짜 범위로 검색합니다.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSearchMessages} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1.5fr_0.8fr]">
              <Input
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="키워드 입력"
                className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={searchFrom}
                  onChange={(e) => setSearchFrom(e.target.value)}
                  className="bg-slate-900 border-slate-700 text-white"
                />
                <Input
                  type="date"
                  value={searchTo}
                  onChange={(e) => setSearchTo(e.target.value)}
                  className="bg-slate-900 border-slate-700 text-white"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[0.9fr_1fr_auto] items-end">
              <div className="space-y-2">
                <label className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Filter className="w-3 h-3" />
                  출처
                </label>
                <Select value={searchSource} onValueChange={(value) => setSearchSource(value as "all" | "web" | "telegram")}>
                  <SelectTrigger className="w-full bg-slate-900 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="web">웹</SelectItem>
                    <SelectItem value="telegram">Telegram</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Clock3 className="w-3 h-3" />
                최근 검색 조건으로 필터링
              </div>

              <Button type="submit" className="bg-cyan-600 hover:bg-cyan-700 text-white">
                <Search className="w-4 h-4 mr-2" />
                검색
              </Button>
            </div>
          </form>

          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{searchMessagesQuery.isFetching ? "검색 중..." : submittedSearch ? `검색 결과: ${searchMessagesQuery.data?.length ?? 0}개` : "검색어를 입력하고 검색하세요."}</span>
            {submittedSearch && (
              <button
                type="button"
                onClick={() => setSubmittedSearch(null)}
                className="text-cyan-400 hover:text-cyan-300"
              >
                검색 초기화
              </button>
            )}
          </div>

          <div className="max-h-[48vh] overflow-y-auto pr-1 space-y-3">
            {submittedSearch && (searchMessagesQuery.data?.length ?? 0) === 0 && !searchMessagesQuery.isFetching ? (
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6 text-center text-sm text-slate-400">
                일치하는 메시지가 없습니다.
              </div>
            ) : (
              (searchMessagesQuery.data as SearchResult[] | undefined)?.map((item) => (
                <Card key={`${item.conversationId}-${item.messageId}`} className="bg-slate-900 border-slate-800 p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="font-medium text-white">{item.conversationTitle || `Conversation ${item.conversationId}`}</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">{item.source}</span>
                    <span>{new Date(item.createdAt).toLocaleString("ko-KR")}</span>
                    <span>{item.role === "user" ? "사용자" : "AI"}</span>
                  </div>
                  <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {item.content}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">
                      메시지 ID #{item.messageId}
                    </p>
                    {conversationId === item.conversationId && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                        onClick={() => {
                          setInput(item.content);
                          setShowSearch(false);
                        }}
                      >
                        채팅에 넣기
                      </Button>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* API Settings Modal */}
      <ApiSettingsModal isOpen={showApiSettings} onClose={() => setShowApiSettings(false)} />
    </div>
  );
}
