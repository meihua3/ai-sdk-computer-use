// lib/store/settings-store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

type SettingsStore = {
  maxConcurrentSessions: number;
  setMaxConcurrentSessions: (n: number) => void;
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      maxConcurrentSessions: 2,
      setMaxConcurrentSessions: (n) =>
        set({ maxConcurrentSessions: Math.max(1, Math.min(5, n)) }),
    }),
    { name: "ai-agent-settings" }
  )
);
