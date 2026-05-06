/**
 * Unified Chat Interface Component
 * Displays messages from both web and Telegram in real-time
 */

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Settings2, MessageCircle, Sliders, Smartphone, Globe, Check, LogIn, Mic, Volume2, Download, Trash2, Pencil } from "lucide-react"; // ADDED: voice input and TTS toggle icons.
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useLocation } from "wouter"; // MODIFIED: handle chat deep links from dashboard/status-bar buttons.
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  readChatCommandParams,
  resolveAssistantResponse,
} from "@/chat/quickCommand";
import { useAuth } from "@/_core/hooks/useAuth";
import ApiSettingsModal from "./ApiSettingsModal";
import ConversationPinToggle from "./ConversationPinToggle"; // MODIFIED: add favorite toggle for the active conversation.
import MessageEditBar from "./MessageEditBar";
import QuickActions from "./QuickActions"; // ADDED: quick command row above the input area.
import { useSpeechRecognition, useTextToSpeech } from "@/hooks/useSpeech"; // ADDED: browser speech recognition and TTS logic.
import MessageSearchControls from "./MessageSearchControls"; // MODIFIED: add dedicated search UI component for message search filters.
import { useAppPreferences } from "@/hooks/useAppPreferences";

interface GroundingSource {
  title: string;
  uri: string;
}

interface UnifiedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  source: "web" | "telegram";
  timestamp: Date;
  sources?: GroundingSource[];
}

interface MessageSearchFilters { // MODIFIED: keep search state typed and aligned with backend filters.
  query: string;
  source: "all" | "web" | "telegram";
  dateFrom: string;
  dateTo: string;
}

function normalizeSyncedMessage(msg: any): UnifiedMessage {
  return {
    id: `${msg.id}`,
    role: msg.role as "user" | "assistant",
    content: msg.content,
    source: msg.source as "web" | "telegram",
    timestamp: new Date(msg.createdAt),
  };
}

function isDuplicateMessage(candidate: UnifiedMessage, existing: UnifiedMessage) {
  if (candidate.id === existing.id) return true;
  if (candidate.role !== existing.role) return false;
  if (candidate.source !== existing.source) return false;
  if (candidate.content !== existing.content) return false;

  return Math.abs(candidate.timestamp.getTime() - existing.timestamp.getTime()) < 15_000;
}

export default function UnifiedChatInterface() {
  const [location] = useLocation(); // MODIFIED: react to /chat query changes without remounting the chat component.
  const { isAuthenticated } = useAuth();
  const { preferences } = useAppPreferences();
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEngine, setSelectedEngine] = useState("gemini");
  const [selectedModel, setSelectedModel] = useState("flash");
  const [showSettings, setShowSettings] = useState(false);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [searchFilters, setSearchFilters] = useState<MessageSearchFilters>({ // MODIFIED: track keyword/date/source filters for server-side message search.
    query: "",
    source: "all",
    dateFrom: "",
    dateTo: "",
  });
  const [searchParams, setSearchParams] = useState<MessageSearchFilters | null>(null); // MODIFIED: separate applied filters from in-progress input values.
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null); // MODIFIED: give per-message delete feedback in the unified timeline.
  const [isExporting, setIsExporting] = useState(false); // MODIFIED: show loading state while exporting conversation JSON.
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null); // MODIFIED: keep one inline edit target at a time.
  const [editingContent, setEditingContent] = useState(""); // MODIFIED: store edited message content before saving.
  const [isEditing, setIsEditing] = useState(false); // MODIFIED: show edit-in-flight state in the edit bar.
  const [isClearingConversation, setIsClearingConversation] = useState(false); // MODIFIED: show progress while clearing the current chat history.
  const [isPinned, setIsPinned] = useState(false); // MODIFIED: track favorite state for the active conversation.
  const [isTogglingPin, setIsTogglingPin] = useState(false); // MODIFIED: show favorite toggle progress.
  const [messageLimit, setMessageLimit] = useState(50); // MODIFIED: paginate older messages in fixed-size batches for better chat performance.
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sendInFlightRef = useRef(false); // MODIFIED: block duplicate sends from overlapping form/button/keyboard events.
  const lastAutoSubmitRef = useRef<string | null>(null); // MODIFIED: prevent duplicate query-driven auto submits for the same quick-command request.
  const utils = trpc.useUtils(); // MODIFIED: reuse tRPC cache helpers after mutation-driven timeline changes.

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
    { conversationId: conversationId || 0, limit: messageLimit },
    { enabled: isAuthenticated && !!conversationId }
  );
  const recentMessagesQuery = trpc.chatSync.getRecentMessages.useQuery(
    { conversationId: conversationId || 0, since: lastSyncTime },
    { enabled: isAuthenticated && !!conversationId, refetchInterval: 2000 }
  );
  const searchMessagesQuery = trpc.chatSync.searchMessages.useQuery( // MODIFIED: fetch filtered messages only when user explicitly activates search mode.
    {
      conversationId: conversationId || 0,
      query: searchParams?.query || undefined,
      source: searchParams?.source ?? "all",
      dateFrom: searchParams?.dateFrom ? new Date(`${searchParams.dateFrom}T00:00:00`) : undefined,
      dateTo: searchParams?.dateTo ? new Date(`${searchParams.dateTo}T23:59:59`) : undefined,
      limit: 100,
    },
    { enabled: isAuthenticated && !!conversationId && !!searchParams }
  );

  // Mutations
  const chatMutation = trpc.llm.chat.useMutation();
  const intentRouteMutation = trpc.intent.route.useMutation(); // MODIFIED: run intent-based domain routing before generic chat fallback.
  const saveWebMessageMutation = trpc.chatSync.saveWebMessage.useMutation();
  const forwardToTelegramMutation = trpc.chatSync.forwardToTelegram.useMutation();
  const editMessageMutation = trpc.chatSync.editMessage.useMutation();
  const deleteMessageMutation = trpc.chatSync.deleteMessage.useMutation();
  const clearConversationMutation = trpc.chatSync.clearConversation.useMutation();
  const togglePinnedMutation = trpc.chatSync.togglePinned.useMutation();
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
      setIsPinned(!!conversationQuery.data.pinned); // MODIFIED: hydrate pin state from the current conversation record.
    }
  }, [conversationQuery.data]);

  // Load initial messages
  useEffect(() => {
    if (messagesQuery.data && !searchParams) { // MODIFIED: keep live message list intact while search mode is active.
      const loadedMessages: UnifiedMessage[] = messagesQuery.data
        .map(normalizeSyncedMessage)
        .reverse();
      setMessages(loadedMessages);
    }
  }, [messagesQuery.data]);

  // Sync recent messages
  useEffect(() => {
    if (!searchParams && recentMessagesQuery.data && recentMessagesQuery.data.length > 0) { // MODIFIED: pause polling merge while showing fixed search results.
      const newMessages: UnifiedMessage[] = recentMessagesQuery.data
        .map(normalizeSyncedMessage)
        .reverse();

      setMessages((prev) => {
        const uniqueNewMessages = newMessages.filter((message) =>
          !prev.some((existing) => isDuplicateMessage(message, existing))
        );
        const telegramIncoming = uniqueNewMessages.filter((m) => m.source === "telegram" && m.role === "user"); // MODIFIED: detect newly synced Telegram user messages for toast alerting.
        if (preferences.notifyNewMessages && telegramIncoming.length > 0) {
          const latest = telegramIncoming[telegramIncoming.length - 1];
          const preview = latest.content.length > 40 ? `${latest.content.slice(0, 40)}...` : latest.content;
          toast.info(`텔레그램 새 메시지: ${preview}`); // MODIFIED: provide real-time new-message toast notification requested in todo.
        }
        return [...prev, ...uniqueNewMessages];
      });

      setLastSyncTime(new Date());
    }
  }, [preferences.notifyNewMessages, recentMessagesQuery.data, searchParams]);

  const searchedMessages: UnifiedMessage[] = (searchMessagesQuery.data ?? []) // MODIFIED: normalize tRPC search results into unified render shape.
    .map(normalizeSyncedMessage)
    .reverse();

  const renderedMessages = searchParams ? searchedMessages : messages; // MODIFIED: toggle between live timeline and search result list.
  const canLoadOlderMessages = !!conversationId && !searchParams && messagesQuery.data?.length === messageLimit; // MODIFIED: show pagination only when there may be older history.

  const executeSearch = () => { // MODIFIED: apply current filters and trigger server-side query.
    setSearchParams({ ...searchFilters });
  };

  const clearSearch = () => { // MODIFIED: reset search mode and resume real-time timeline.
    setSearchFilters({ query: "", source: "all", dateFrom: "", dateTo: "" });
    setSearchParams(null);
  };

  const loadOlderMessages = () => { // MODIFIED: expand the history window instead of rendering an unbounded message list.
    setMessageLimit((current) => current + 50);
  };

  const toggleConversationPin = async () => { // MODIFIED: persist favorite state for the current conversation.
    if (!conversationId) return;
    const nextPinned = !isPinned;
    setIsTogglingPin(true);
    try {
      await togglePinnedMutation.mutateAsync({
        conversationId,
        pinned: nextPinned,
      });
      setIsPinned(nextPinned);
      toast.success(nextPinned ? "대화를 즐겨찾기에 추가했습니다." : "즐겨찾기를 해제했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "즐겨찾기 변경에 실패했습니다.");
    } finally {
      setIsTogglingPin(false);
    }
  };

  useEffect(() => {
    if (!status) return;
    setSelectedEngine(status.engine);
    setSelectedModel(status.modelKey);
  }, [status]);

  const startEditingMessage = (message: UnifiedMessage) => { // MODIFIED: preload selected message into the edit bar.
    setEditingMessageId(message.id);
    setEditingContent(message.content);
  };

  const cancelEditing = () => { // MODIFIED: clear edit state without mutating the message list.
    setEditingMessageId(null);
    setEditingContent("");
    setIsEditing(false);
  };

  const saveEditedMessage = async () => { // MODIFIED: persist edited content and refresh all relevant caches.
    if (!conversationId || !editingMessageId) return;
    const trimmed = editingContent.trim();
    if (!trimmed) return;

    setIsEditing(true);
    try {
      await editMessageMutation.mutateAsync({
        conversationId,
        messageId: Number(editingMessageId),
        content: trimmed,
      });
      setMessages((prev) =>
        prev.map((msg) => (msg.id === editingMessageId ? { ...msg, content: trimmed } : msg))
      );
      await Promise.all([
        utils.chatSync.getMessages.invalidate({ conversationId, limit: 50 }),
        utils.chatSync.getRecentMessages.invalidate({ conversationId, since: lastSyncTime }),
        utils.chatSync.searchMessages.invalidate(),
        utils.chatSync.exportConversation.invalidate({ conversationId }),
      ]);
      toast.success("메시지를 수정했습니다.");
      cancelEditing();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "메시지 수정에 실패했습니다.");
    } finally {
      setIsEditing(false);
    }
  };

  const exportConversation = async () => { // MODIFIED: export full conversation history as JSON download.
    if (!conversationId) return;
    setIsExporting(true);
    try {
      const payload = await utils.chatSync.exportConversation.fetch({ conversationId });
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `conversation-${conversationId}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("대화 기록을 JSON으로 내보냈습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "대화 내보내기에 실패했습니다.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => { // MODIFIED: remove a single message from the unified timeline.
    if (!conversationId) return;
    setDeletingMessageId(messageId);
    try {
      await deleteMessageMutation.mutateAsync({
        conversationId,
        messageId: Number(messageId),
      });
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      await Promise.all([
        utils.chatSync.getMessages.invalidate({ conversationId, limit: 50 }),
        utils.chatSync.getRecentMessages.invalidate({ conversationId, since: lastSyncTime }),
        utils.chatSync.searchMessages.invalidate(),
      ]);
      toast.success("메시지를 삭제했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "메시지 삭제에 실패했습니다.");
    } finally {
      setDeletingMessageId(null);
    }
  };

  const clearConversation = async () => {
    if (renderedMessages.length === 0 || isClearingConversation) return;

    const confirmed = window.confirm("현재 대화 기록을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.");
    if (!confirmed) return;

    setIsClearingConversation(true);
    try {
      if (conversationId) {
        await clearConversationMutation.mutateAsync({ conversationId });
        await Promise.all([
          utils.chatSync.getMessages.invalidate({ conversationId, limit: messageLimit }),
          utils.chatSync.getRecentMessages.invalidate(),
          utils.chatSync.searchMessages.invalidate(),
          utils.chatSync.exportConversation.invalidate({ conversationId }),
        ]);
      }
      setMessages([]);
      setSearchParams(null);
      setSearchFilters({ query: "", source: "all", dateFrom: "", dateTo: "" });
      setLastSyncTime(new Date());
      toast.success("대화 기록을 초기화했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "대화 초기화에 실패했습니다.");
    } finally {
      setIsClearingConversation(false);
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessageText = async (text: string) => { // ADDED: shared sender for typed, voice, and quick action messages.
    if (!text.trim() || isLoading || sendInFlightRef.current) return;
    sendInFlightRef.current = true;

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
        const savedUserMessage = await saveWebMessageMutation.mutateAsync({
          conversationId,
          role: "user",
          content: userMessage,
        });
        const normalizedUserMessage = normalizeSyncedMessage(savedUserMessage);
        setMessages((prev) =>
          prev.map((message) => (message.id === userMsg.id ? normalizedUserMessage : message))
        );
      }

      const assistantResult = await resolveAssistantResponse({
        userMessage,
        isAuthenticated,
        intentRoute: (payload) => intentRouteMutation.mutateAsync(payload),
        llmChat: (payload) => chatMutation.mutateAsync(payload),
      });
      const aiResponseText = assistantResult.text;
      const aiSources = assistantResult.sources;

      // Save AI response to DB only if logged in
      const aiMsg: UnifiedMessage = {
        id: `temp-assistant-${Date.now()}`,
        role: "assistant",
        content: aiResponseText,
        source: "web",
        timestamp: new Date(),
        sources: aiSources,
      };

      if (conversationId) {
        setMessages((prev) => [...prev, aiMsg]);
        const savedAssistantMessage = await saveWebMessageMutation.mutateAsync({
          conversationId,
          role: "assistant",
          content: aiResponseText, // MODIFIED: persist routed or fallback response uniformly.
        });
        const normalizedAssistantMessage = normalizeSyncedMessage(savedAssistantMessage);
        setMessages((prev) =>
          prev.map((message) => (message.id === aiMsg.id ? normalizedAssistantMessage : message))
        );
        // Forward both messages to Telegram (양방향 sync)
        forwardToTelegramMutation.mutate({
          conversationId,
          userMessage,
          aiResponse: aiResponseText, // MODIFIED: forward unified response payload.
        });
      } else {
        setMessages((prev) => [...prev, aiMsg]);
      }

      setLastSyncTime(new Date());
      if (assistantResult.failed) {
        toast.error(aiResponseText);
      }
      tts.speak(aiResponseText); // MODIFIED: speak intent-routed response or LLM fallback response.
    } catch (error) {
      const errorText = "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
      const errorMsg: UnifiedMessage = {
        id: `temp-error-${Date.now()}`,
        role: "assistant",
        content: errorText,
        source: "web",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      toast.error(errorText);
      console.error("Error sending message:", error);
    } finally {
      sendInFlightRef.current = false;
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

  useEffect(() => { // ADDED: accept quick commands and status-bar actions via /chat query params.
    const {
      command,
      source,
      openApiSettings,
      autoSubmit,
      requestId,
    } = readChatCommandParams(window.location.search);

    if (command) {
      setInput(command);
    }

    if (!autoSubmit) {
      lastAutoSubmitRef.current = null;
    }

    const autoSubmitCommand = autoSubmit ? command : null;
    const autoSubmitKey = autoSubmitCommand ? requestId || autoSubmitCommand : null;
    if (autoSubmitCommand && autoSubmitKey && lastAutoSubmitRef.current !== autoSubmitKey) {
      lastAutoSubmitRef.current = autoSubmitKey;
      void sendMessageText(autoSubmitCommand);
    }

    if (source === "telegram") {
      setSearchFilters((current) => ({ ...current, source: "telegram" })); // MODIFIED: Telegram shortcuts prime the source filter instead of doing nothing.
    }

    if (openApiSettings) {
      setShowApiSettings(true); // MODIFIED: API shortcuts open the existing API settings modal directly.
    }

    if (command || source || openApiSettings || autoSubmit) {
      window.history.replaceState({}, "", "/chat");
    }
  }, [location]);

  const getSourceIcon = (source: "web" | "telegram") => {
    return source === "telegram" ? (
      <Smartphone className="w-3 h-3" />
    ) : (
      <Globe className="w-3 h-3" />
    );
  };

  return (
    // MODIFIED: align the chat surface with the Aston command-center shell tokens.
    <div className={`flex h-[calc(100vh-48px)] min-h-0 flex-col overflow-hidden bg-[var(--aston-bg)] text-[var(--aston-text)] ${preferences.compactChat ? "text-[0.95rem]" : ""}`}> {/* MODIFIED: keep the messenger surface fixed inside the app viewport. */}
      {/* Login notice banner - shown when not authenticated */}
      {!isAuthenticated && (
        <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-[var(--aston-border)] bg-[var(--aston-panel)] px-4 py-2">
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
      {/* MODIFIED: use the Aston panel style for the chat header and action row. */}
      <div className={`flex flex-shrink-0 items-center justify-between border-b border-[var(--aston-border)] bg-[var(--aston-panel)] ${preferences.compactChat ? "px-3 py-2" : "px-4 py-3"}`}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircle className="w-4 h-4 text-primary" />
          <span>통합 채팅</span>
          <span className="text-xs text-muted-foreground font-normal">(웹 + Telegram)</span>
        </div>
        <div className="flex items-center gap-2">
          <ConversationPinToggle
            pinned={isPinned}
            onToggle={toggleConversationPin}
            isSaving={isTogglingPin || togglePinnedMutation.isPending}
          />
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
            API 키
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearConversation}
            disabled={isClearingConversation || renderedMessages.length === 0}
            className="text-muted-foreground hover:text-red-300"
          >
            {isClearingConversation ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4 mr-1.5" />
            )}
            클리어
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={exportConversation}
            disabled={isExporting || !conversationId}
            className="text-muted-foreground hover:text-foreground"
          >
            <Download className="w-4 h-4 mr-1.5" />
            {isExporting ? "내보내는 중" : "Export"}
          </Button>
        </div>
      </div>

      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-[var(--aston-border)] bg-[var(--aston-panel-soft)] px-4 py-2">
        <span className="text-xs font-medium text-[var(--aston-muted)]">AI 모델</span>
        <Select value={selectedEngine} onValueChange={handleEngineChange}>
          <SelectTrigger className="h-8 w-[150px] border-white/10 bg-black/20 text-xs">
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
        <Select value={selectedModel} onValueChange={setSelectedModel}>
          <SelectTrigger className="h-8 w-[220px] border-white/10 bg-black/20 text-xs">
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
        <Button
          onClick={handleApplyEngine}
          disabled={switchEngineMutation.isPending}
          size="sm"
          className="h-8 bg-cyan-600 px-3 text-xs text-white hover:bg-cyan-700"
        >
          {switchEngineMutation.isPending ? (
            <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" />전환 중</>
          ) : switchSuccess ? (
            <><Check className="mr-1.5 h-3 w-3" />적용됨</>
          ) : (
            "모델 적용"
          )}
        </Button>
        {status?.modelName ? (
          <span className="text-xs text-[var(--aston-muted)]">
            현재: {status.modelName}
          </span>
        ) : null}
      </div>

      {/* Settings Panel (collapsible) */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex-shrink-0 overflow-hidden border-b border-[var(--aston-border)] bg-[var(--aston-panel-soft)]"
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

      <MessageSearchControls // MODIFIED: expose message search controls directly in unified chat screen.
        filters={searchFilters}
        onChange={setSearchFilters}
        onSearch={executeSearch}
        onClear={clearSearch}
        isSearching={searchMessagesQuery.isFetching}
        isActive={!!searchParams}
        resultCount={searchedMessages.length}
      />

      {editingMessageId && (
        <div className="px-4 pt-4">
          <MessageEditBar
            content={editingContent}
            onChange={setEditingContent}
            onSave={saveEditedMessage}
            onCancel={cancelEditing}
            isSaving={isEditing}
          />
        </div>
      )}

      {/* Messages Area - Middle (Scrollable) */}
      {/* MODIFIED: make the timeline area read as a framed executive panel. */}
      <div className={`min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-[var(--aston-bg)] ${preferences.compactChat ? "p-3" : "p-4"}`}> {/* MODIFIED: message history owns the scrollbar; header and composer stay fixed. */}
        {canLoadOlderMessages && (
          <div className="flex justify-center pb-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadOlderMessages}
              disabled={messagesQuery.isFetching}
              className="border-border bg-card text-muted-foreground hover:text-white"
            >
              {messagesQuery.isFetching ? "Loading older messages..." : "Load older messages"}
            </Button>
          </div>
        )}
        <AnimatePresence>
          {renderedMessages.length === 0 ? ( // MODIFIED: respect either live messages or search results.
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
            renderedMessages.map((msg) => ( // MODIFIED: render filtered result set while search is active.
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <Card
                className={`group relative max-w-[75%] rounded-xl border border-[var(--aston-border)] px-4 py-2 ${
                    msg.role === "user"
                      ? "bg-[var(--aston-accent)] text-white"
                      : "bg-[var(--aston-panel)] text-[var(--aston-text)]"
                  }`}
                >
                  {conversationId && (
                    <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => startEditingMessage(msg)}
                        className="rounded-full border border-[var(--aston-border)] bg-[var(--aston-panel)] p-1 text-muted-foreground shadow-md transition hover:text-cyan-300"
                        aria-label="메시지 편집"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteMessage(msg.id)}
                        disabled={deletingMessageId === msg.id}
                        className="rounded-full border border-[var(--aston-border)] bg-[var(--aston-panel)] p-1 text-muted-foreground shadow-md transition hover:text-red-400"
                        aria-label="메시지 삭제"
                      >
                        {deletingMessageId === msg.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  )}
                  <div className="space-y-1">
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {msg.sources.map((src, i) => (
                          <a
                            key={i}
                            href={src.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-300 hover:bg-cyan-500/20 transition-colors"
                          >
                            <span className="opacity-60">🔗</span>
                            <span className="max-w-[160px] truncate">{src.title}</span>
                          </a>
                        ))}
                      </div>
                    )}
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
            <Card className="border border-[var(--aston-border)] bg-[var(--aston-panel)] px-4 py-2">
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
      {/* MODIFIED: align the composer with the same premium panel treatment. */}
      <div className={`flex-shrink-0 border-t border-[var(--aston-border)] bg-[var(--aston-panel)] ${preferences.compactChat ? "p-3" : "p-4"}`}>
        <QuickActions onSelect={(text) => void sendMessageText(text)} disabled={isLoading} /> {/* ADDED: quick command buttons. */}
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="메시지를 입력하세요..."
            disabled={isLoading}
            className="flex-1"
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
