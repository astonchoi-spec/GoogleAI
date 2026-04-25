export type AppPreferences = {
  themeMode: "system" | "light" | "dark";
  notifyNewMessages: boolean;
  notifyErrors: boolean;
  notifySounds: boolean;
  compactChat: boolean;
  privacyMode: boolean;
};

const DEFAULT_PREFERENCES: AppPreferences = {
  themeMode: "dark",
  notifyNewMessages: true,
  notifyErrors: true,
  notifySounds: false,
  compactChat: false,
  privacyMode: false,
};

const STORAGE_KEY = "googletg.app-preferences";

export function readPreferences(): AppPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<AppPreferences>) };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function writePreferences(next: Partial<AppPreferences>): AppPreferences {
  const merged = { ...readPreferences(), ...next };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

export function resetPreferences(): AppPreferences {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  return DEFAULT_PREFERENCES;
}
