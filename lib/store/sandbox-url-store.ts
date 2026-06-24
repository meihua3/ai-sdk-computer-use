import { create } from "zustand";

type SandboxUrlStore = {
  urls: Record<string, string | null>; // sessionId → url | null (null = initializing)
  setUrl: (sessionId: string, url: string) => void;
  setInitializing: (sessionId: string) => void;
  clearUrl: (sessionId: string) => void;
};

export const useSandboxUrlStore = create<SandboxUrlStore>()((set) => ({
  urls: {},

  setUrl: (sessionId, url) =>
    set((state) => ({ urls: { ...state.urls, [sessionId]: url } })),

  setInitializing: (sessionId) =>
    set((state) => ({ urls: { ...state.urls, [sessionId]: null } })),

  clearUrl: (sessionId) =>
    set((state) => {
      const urls = { ...state.urls };
      delete urls[sessionId];
      return { urls };
    }),
}));
