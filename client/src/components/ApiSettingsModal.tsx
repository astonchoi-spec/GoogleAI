/**
 * API Settings Modal
 * User-friendly interface for managing LLM provider API keys
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Loader2, Check, AlertCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

interface ApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Provider = "gemini" | "openai" | "anthropic" | "ollama";

const PROVIDERS = [
  {
    id: "gemini" as Provider,
    name: "Google Gemini",
    description: "Google의 최신 AI 모델",
    placeholder: "AIza...",
    docsUrl: "https://ai.google.dev/",
  },
  {
    id: "openai" as Provider,
    name: "OpenAI (GPT)",
    description: "OpenAI의 GPT 모델",
    placeholder: "sk-...",
    docsUrl: "https://platform.openai.com/",
  },
  {
    id: "anthropic" as Provider,
    name: "Anthropic Claude",
    description: "Anthropic의 Claude 모델",
    placeholder: "sk-ant-...",
    docsUrl: "https://console.anthropic.com/",
  },
  {
    id: "ollama" as Provider,
    name: "Ollama (로컬)",
    description: "로컬 LLM 모델",
    placeholder: "http://localhost:11434",
    docsUrl: "https://ollama.ai/",
  },
];

export default function ApiSettingsModal({ isOpen, onClose }: ApiSettingsModalProps) {
  const { isAuthenticated } = useAuth();
  const [apiKeys, setApiKeys] = useState<Record<Provider, string>>({
    gemini: "",
    openai: "",
    anthropic: "",
    ollama: "",
  });
  const [showKeys, setShowKeys] = useState<Record<Provider, boolean>>({
    gemini: false,
    openai: false,
    anthropic: false,
    ollama: false,
  });
  const [validating, setValidating] = useState<Record<Provider, boolean>>({
    gemini: false,
    openai: false,
    anthropic: false,
    ollama: false,
  });
  const [validationStatus, setValidationStatus] = useState<Record<Provider, "valid" | "invalid" | null>>({
    gemini: null,
    openai: null,
    anthropic: null,
    ollama: null,
  });

  // tRPC queries and mutations
  const { data: settings, isLoading: isLoadingSettings } = trpc.apiSettings.getAll.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const saveMutation = trpc.apiSettings.save.useMutation();
  const deleteMutation = trpc.apiSettings.delete.useMutation();
  const validateMutation = trpc.apiSettings.validate.useMutation();

  const handleSaveKey = async (provider: Provider) => {
    if (!apiKeys[provider].trim()) return;
    try {
      await saveMutation.mutateAsync({ provider, apiKey: apiKeys[provider] });
      setApiKeys((prev) => ({ ...prev, [provider]: "" }));
      toast.success(`${provider} API 키가 저장되었습니다.`);
    } catch (error) {
      toast.error(`저장 실패: ${error instanceof Error ? error.message : "오류가 발생했습니다"}`);
    }
  };

  const handleDeleteKey = async (provider: Provider) => {
    try {
      await deleteMutation.mutateAsync({ provider });
      toast.success(`${provider} API 키가 삭제되었습니다.`);
    } catch (error) {
      toast.error(`삭제 실패: ${error instanceof Error ? error.message : "오류가 발생했습니다"}`);
    }
  };

  const handleValidateKey = async (provider: Provider) => {
    if (!apiKeys[provider].trim()) return;

    setValidating((prev) => ({ ...prev, [provider]: true }));
    try {
      const result = await validateMutation.mutateAsync({
        provider,
        apiKey: apiKeys[provider],
      });
      setValidationStatus((prev) => ({
        ...prev,
        [provider]: result.valid ? "valid" : "invalid",
      }));
    } catch (error) {
      setValidationStatus((prev) => ({ ...prev, [provider]: "invalid" }));
    } finally {
      setValidating((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const toggleShowKey = (provider: Provider) => {
    setShowKeys((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  const getSetting = (provider: Provider) => {
    return settings?.find((s) => s.provider === provider);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-white">API 설정</DialogTitle>
          <DialogDescription className="text-slate-400">
            각 LLM 제공자의 API 키를 입력하고 관리하세요
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoadingSettings ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
            </div>
          ) : (
            <div className="space-y-4">
              {PROVIDERS.map((provider) => {
                const setting = getSetting(provider.id);
                const hasKey = !!setting?.hasKey;

                return (
                  <motion.div
                    key={provider.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Card className="bg-slate-800 border-slate-700 p-4">
                      <div className="space-y-3">
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-white">{provider.name}</h3>
                            <p className="text-sm text-slate-400">{provider.description}</p>
                          </div>
                          {hasKey && (
                            <div className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-green-400" />
                              <span className="text-xs text-green-400">설정됨</span>
                            </div>
                          )}
                        </div>

                        {/* Input */}
                        <div className="flex gap-2">
                          <div className="flex-1 relative">
                            <Input
                              type={showKeys[provider.id] ? "text" : "password"}
                              value={apiKeys[provider.id]}
                              onChange={(e) =>
                                setApiKeys((prev) => ({
                                  ...prev,
                                  [provider.id]: e.target.value,
                                }))
                              }
                              placeholder={provider.placeholder}
                              className="bg-slate-700 border-slate-600 text-white placeholder-slate-500 pr-10"
                            />
                            <button
                              onClick={() => toggleShowKey(provider.id)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                            >
                              {showKeys[provider.id] ? (
                                <EyeOff className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </button>
                          </div>

                          {/* Validation Status */}
                          {validationStatus[provider.id] && (
                            <div
                              className={`flex items-center px-3 rounded ${
                                validationStatus[provider.id] === "valid"
                                  ? "bg-green-900/30 text-green-400"
                                  : "bg-red-900/30 text-red-400"
                              }`}
                            >
                              {validationStatus[provider.id] === "valid" ? (
                                <Check className="w-4 h-4" />
                              ) : (
                                <AlertCircle className="w-4 h-4" />
                              )}
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleValidateKey(provider.id)}
                            disabled={
                              !apiKeys[provider.id].trim() ||
                              validating[provider.id] ||
                              saveMutation.isPending
                            }
                            variant="outline"
                            size="sm"
                            className="flex-1 bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
                          >
                            {validating[provider.id] ? (
                              <>
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                검증 중...
                              </>
                            ) : (
                              "검증"
                            )}
                          </Button>

                          <Button
                            onClick={() => handleSaveKey(provider.id)}
                            disabled={
                              !apiKeys[provider.id].trim() ||
                              saveMutation.isPending ||
                              validating[provider.id]
                            }
                            size="sm"
                            className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white"
                          >
                            {saveMutation.isPending ? (
                              <>
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                저장 중...
                              </>
                            ) : (
                              "저장"
                            )}
                          </Button>

                          {hasKey && (
                            <Button
                              onClick={() => handleDeleteKey(provider.id)}
                              disabled={deleteMutation.isPending}
                              variant="destructive"
                              size="sm"
                              className="bg-red-900/50 hover:bg-red-900 text-red-300"
                            >
                              {deleteMutation.isPending ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Trash2 className="w-3 h-3" />
                              )}
                            </Button>
                          )}
                        </div>

                        {/* Help Link */}
                        <a
                          href={provider.docsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-cyan-400 hover:text-cyan-300 underline"
                        >
                          API 키 얻기 →
                        </a>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

      </DialogContent>
    </Dialog>
  );
}
