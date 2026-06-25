// lib/store/multi-chat-store.ts
import { create } from "zustand";
import type { UIMessage } from "ai";

export type SessionChatStatus = "ready" | "submitted" | "streaming" | "error";

export type SessionChatEntry = {
  messages: UIMessage[];
  status: SessionChatStatus;
  submit: (content: string) => void;
  stop: () => void;
};

type MultiChatStore = {
  sessions: Record<string, SessionChatEntry>;
  set: (sessionId: string, patch: Partial<SessionChatEntry>) => void;
  remove: (sessionId: string) => void;
};

const defaultEntry = (): SessionChatEntry => ({
  messages: [],
  status: "ready",
  submit: () => {},
  stop: () => {},
});

export const useMultiChatStore = create<MultiChatStore>()((set) => ({
  sessions: {},

  set: (sessionId, patch) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: { ...(state.sessions[sessionId] ?? defaultEntry()), ...patch },
      },
    })),

  remove: (sessionId) =>
    set((state) => {
      const sessions = { ...state.sessions };
      delete sessions[sessionId];
      return { sessions };
    }),
}));
