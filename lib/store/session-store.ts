import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UIMessage } from "ai";
import type { Session, AgentEvent } from "@/lib/types";

const MAX_SESSIONS = 20;

function generateId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function createEmptySession(): Session {
  const now = Date.now();
  return {
    id: generateId(),
    title: "New Session",
    createdAt: now,
    updatedAt: now,
    messages: [],
    events: [],
    sandboxId: null,
  };
}

type SessionStore = {
  sessions: Session[];
  activeSessionId: string | null;

  // Derived
  activeSession: () => Session | null;
  activeSandboxId: () => string | null;

  // CRUD
  createSession: () => string;
  deleteSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  setActiveSession: (id: string) => void;

  // Data updates
  updateMessages: (id: string, messages: UIMessage[]) => void;
  updateSessionTitle: (id: string, firstMessage: string) => void;
  appendEvent: (id: string, event: AgentEvent) => void;
  updateEvent: (id: string, eventId: string, patch: Partial<AgentEvent>) => void;
  setSandboxId: (id: string, sandboxId: string | null) => void;
};

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,

      activeSession: () => {
        const { sessions, activeSessionId } = get();
        return sessions.find((s) => s.id === activeSessionId) ?? null;
      },

      activeSandboxId: () => {
        return get().activeSession()?.sandboxId ?? null;
      },

      createSession: () => {
        const newSession = createEmptySession();
        set((state) => {
          let sessions = [newSession, ...state.sessions];
          if (sessions.length > MAX_SESSIONS) {
            sessions = sessions.slice(0, MAX_SESSIONS);
          }
          return { sessions, activeSessionId: newSession.id };
        });
        checkStorageUsage();
        return newSession.id;
      },

      deleteSession: (id) => {
        set((state) => {
          const sessions = state.sessions.filter((s) => s.id !== id);
          let activeSessionId = state.activeSessionId;
          if (activeSessionId === id) {
            const newSession = createEmptySession();
            sessions.unshift(newSession);
            activeSessionId = newSession.id;
          }
          return { sessions, activeSessionId };
        });
      },

      renameSession: (id, title) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, title, updatedAt: Date.now() } : s
          ),
        }));
      },

      setActiveSession: (id) => {
        set({ activeSessionId: id });
      },

      updateMessages: (id, messages) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, messages, updatedAt: Date.now() } : s
          ),
        }));
        checkStorageUsage();
      },

      updateSessionTitle: (id, firstMessage) => {
        const title = firstMessage.slice(0, 20).trim() || "New Session";
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id && s.title === "New Session"
              ? { ...s, title, updatedAt: Date.now() }
              : s
          ),
        }));
      },

      appendEvent: (id, event) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id
              ? { ...s, events: [...s.events, event], updatedAt: Date.now() }
              : s
          ),
        }));
      },

      updateEvent: (id, eventId, patch) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id
              ? {
                  ...s,
                  events: s.events.map((e) =>
                    e.id === eventId ? ({ ...e, ...patch } as AgentEvent) : e
                  ),
                }
              : s
          ),
        }));
      },

      setSandboxId: (id, sandboxId) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, sandboxId } : s
          ),
        }));
      },
    }),
    {
      name: "ai-agent-sessions",
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
      }),
    }
  )
);

async function checkStorageUsage() {
  if (typeof navigator === "undefined" || !navigator.storage) return;
  try {
    const estimate = await navigator.storage.estimate();
    const used = estimate.usage ?? 0;
    const quota = estimate.quota ?? 1;
    if (used / quota > 0.8) {
      console.warn("[Storage] localStorage usage > 80%. Consider clearing old sessions.");
      window.dispatchEvent(new CustomEvent("storage-warning"));
    }
  } catch {
    // ignore
  }
}
