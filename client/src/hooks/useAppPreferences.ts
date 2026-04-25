import { useEffect, useState } from "react";
import type { AppPreferences } from "@/lib/preferences";
import { readPreferences, resetPreferences, writePreferences } from "@/lib/preferences";

export function useAppPreferences() {
  const [preferences, setPreferences] = useState<AppPreferences>(() => readPreferences());

  useEffect(() => {
    const onStorage = () => setPreferences(readPreferences());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const updatePreferences = (next: Partial<AppPreferences>) => {
    const updated = writePreferences(next);
    setPreferences(updated);
    window.dispatchEvent(new Event("storage"));
  };

  const reset = () => {
    const updated = resetPreferences();
    setPreferences(updated);
    window.dispatchEvent(new Event("storage"));
  };

  return {
    preferences,
    updatePreferences,
    resetPreferences: reset,
  };
}
