import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { toast } from "sonner";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { useAppPreferences } from "@/hooks/useAppPreferences";

function extractErrorMessage(error: unknown): string {
  if (error instanceof TRPCClientError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export default function GlobalToastBridge() {
  const queryClient = useQueryClient();
  const { preferences } = useAppPreferences();
  const lastErrorRef = useRef<string>("");
  const lastShownAtRef = useRef<number>(0);

  useEffect(() => {
    const maybeShowErrorToast = (error: unknown) => {
      const message = extractErrorMessage(error).trim();
      if (!message || message === UNAUTHED_ERR_MSG) return; // MODIFIED: keep existing auth redirect flow without duplicate toast noise.
      if (!preferences.notifyErrors) return; // MODIFIED: honor user notification preference for error toasts.

      const now = Date.now();
      const isDuplicate = lastErrorRef.current === message && now - lastShownAtRef.current < 3000;
      if (isDuplicate) return; // MODIFIED: suppress rapid duplicate error notifications from query retries/polling.

      lastErrorRef.current = message;
      lastShownAtRef.current = now;
      toast.error(message);
    };

    const unSubQuery = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") {
        maybeShowErrorToast(event.query.state.error);
      }
    });

    const unSubMutation = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") {
        maybeShowErrorToast(event.mutation.state.error);
      }
    });

    return () => {
      unSubQuery();
      unSubMutation();
    };
  }, [preferences.notifyErrors, queryClient]);

  return null;
}
