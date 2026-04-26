/**
 * TelegramStatusBadge — compact Telegram bot status indicator for the chat header.
 * Shows no_token (amber), token_set/initializing (amber), or active webhook/polling (green).
 */

import { trpc } from "@/lib/trpc";

export default function TelegramStatusBadge() {
  const { data } = trpc.telegram.getStatus.useQuery(undefined, {
    staleTime: 120_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (!data) return null;

  const isActive = data.status === "active";
  const isWarning = data.status === "no_token" || data.status === "token_set";

  let label: string;
  if (data.status === "no_token") {
    label = "Telegram: 토큰 없음";
  } else if (data.status === "token_set") {
    label = "Telegram: 초기화 중";
  } else if (data.mode === "webhook") {
    label = "Telegram: webhook 연결";
  } else {
    label = "Telegram: polling 연결";
  }

  const colorClass = isActive
    ? "border-green-500/20 bg-green-500/10 text-green-300"
    : "border-amber-500/20 bg-amber-500/10 text-amber-300";

  const badge = (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium leading-none ${colorClass}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-green-400" : isWarning ? "bg-amber-400" : "bg-gray-400"}`}
      />
      {label}
    </span>
  );

  if (data.chatLink) {
    return (
      <a href={data.chatLink} target="_blank" rel="noopener noreferrer" title={`봇 채팅 열기: ${data.botUsername}`}>
        {badge}
      </a>
    );
  }

  return badge;
}
