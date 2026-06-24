# AI Agent Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the ai-sdk-computer-use demo into a production-grade AI Agent Dashboard with multi-session management, event pipeline, debug panel, and strict TypeScript.

**Architecture:** Zustand for state (session store + event store), React.memo to isolate VNC from chat re-renders, zustand/persist for localStorage, useEventSync hook bridging AI SDK messages to event pipeline.

**Tech Stack:** Next.js 15, AI SDK, Zustand, shadcn/ui, Tailwind CSS 4, TypeScript strict, react-resizable-panels

**Design System (from ui-ux-pro-max):**
- Style: Dark Mode OLED + Data-Dense Dashboard
- Background: `#0F172A`, Surface: `#1E293B`, Border: `rgba(255,255,255,0.08)`
- Accent: `#22C55E` (running/success), Error: `#EF4444`, Muted: `#272F42`
- Font: Inter (heading + body), transitions: 150-300ms ease-out
- Glassmorphism cards: `backdrop-filter: blur(20px)`, subtle top-edge highlight

---

## Task 1: Install Dependencies & TypeScript Config

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`

- [ ] **Step 1: Install zustand**

```bash
cd ai-sdk-computer-use
pnpm add zustand
```

- [ ] **Step 2: Enable strict TypeScript**

In `tsconfig.json`, ensure:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json
git commit -m "chore: add zustand, enable strict TypeScript"
```

---

## Task 2: Type System

**Files:**
- Create: `lib/types/index.ts`

- [ ] **Step 1: Create type definitions**

Create `lib/types/index.ts`:

```typescript
import type { UIMessage } from "ai";

export type EventStatus = "pending" | "success" | "error" | "aborted";

export type AgentStatus =
  | { type: "idle" }
  | { type: "running"; startedAt: number }
  | { type: "error"; message: string };

export type ComputerToolPayload = {
  action: string;
  coordinate?: [number, number];
  text?: string;
  duration?: number;
  scroll_direction?: string;
  scroll_amount?: number;
  result?: unknown;
};

export type BashToolPayload = {
  command: string;
  result?: string;
};

export type AgentEvent =
  | {
      id: string;
      timestamp: number;
      duration: number | null;
      status: EventStatus;
      tool: "computer";
      payload: ComputerToolPayload;
    }
  | {
      id: string;
      timestamp: number;
      duration: number | null;
      status: EventStatus;
      tool: "bash";
      payload: BashToolPayload;
    };

export type Session = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: UIMessage[];
  events: AgentEvent[];
  sandboxId: string | null;
};
```

- [ ] **Step 2: Commit**

```bash
git add lib/types/index.ts
git commit -m "feat: add core type definitions with discriminated unions"
```

---

## Task 3: Session Store

**Files:**
- Create: `lib/store/session-store.ts`

- [ ] **Step 1: Create session store**

Create `lib/store/session-store.ts`:

```typescript
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
      // Toast is fired from the component layer using this signal
      window.dispatchEvent(new CustomEvent("storage-warning"));
    }
  } catch {
    // ignore
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/store/session-store.ts
git commit -m "feat: add session store with zustand persist and 20-session cap"
```

---

## Task 4: Event Store

**Files:**
- Create: `lib/store/event-store.ts`

- [ ] **Step 1: Create event store**

Create `lib/store/event-store.ts`:

```typescript
import { create } from "zustand";
import type { AgentEvent, AgentStatus } from "@/lib/types";

type EventStore = {
  events: AgentEvent[];
  agentStatus: AgentStatus;

  addEvent: (event: AgentEvent) => void;
  updateEvent: (id: string, patch: Partial<AgentEvent>) => void;
  setAgentStatus: (status: AgentStatus) => void;
  reset: () => void;
};

export const useEventStore = create<EventStore>()((set) => ({
  events: [],
  agentStatus: { type: "idle" },

  addEvent: (event) =>
    set((state) => ({ events: [...state.events, event] })),

  updateEvent: (id, patch) =>
    set((state) => ({
      events: state.events.map((e) =>
        e.id === id ? ({ ...e, ...patch } as AgentEvent) : e
      ),
    })),

  setAgentStatus: (agentStatus) => set({ agentStatus }),

  reset: () => set({ events: [], agentStatus: { type: "idle" } }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add lib/store/event-store.ts
git commit -m "feat: add runtime event store"
```

---

## Task 5: useEventSync Hook

**Files:**
- Create: `lib/hooks/use-event-sync.ts`

- [ ] **Step 1: Create the hook**

Create `lib/hooks/use-event-sync.ts`:

```typescript
import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { useEventStore } from "@/lib/store/event-store";
import { useSessionStore } from "@/lib/store/session-store";
import type { AgentEvent, ComputerToolPayload, BashToolPayload } from "@/lib/types";

type ChatStatus = "error" | "submitted" | "streaming" | "ready";

function generateEventId(toolCallId: string): string {
  return `evt_${toolCallId}`;
}

export function useEventSync(
  messages: UIMessage[],
  status: ChatStatus,
  sessionId: string | null
) {
  const { addEvent, updateEvent, setAgentStatus } = useEventStore();
  const { appendEvent, updateEvent: persistEvent } = useSessionStore();
  const trackedIds = useRef<Set<string>>(new Set());
  const startTimes = useRef<Map<string, number>>(new Map());

  // Sync agent status from chat status
  useEffect(() => {
    if (status === "streaming") {
      setAgentStatus({ type: "running", startedAt: Date.now() });
    } else if (status === "ready") {
      setAgentStatus({ type: "idle" });
    } else if (status === "error") {
      setAgentStatus({ type: "error", message: "Chat error occurred" });
    }
  }, [status, setAgentStatus]);

  // Sync tool call events from messages
  useEffect(() => {
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts ?? []) {
        if (part.type !== "tool-invocation") continue;
        const { toolCallId, toolName, state, args, result } =
          part.toolInvocation as {
            toolCallId: string;
            toolName: string;
            state: "call" | "result" | "partial-call";
            args: Record<string, unknown>;
            result?: unknown;
          };

        const eventId = generateEventId(toolCallId);

        if (state === "call" && !trackedIds.current.has(eventId)) {
          trackedIds.current.add(eventId);
          startTimes.current.set(eventId, Date.now());

          const event: AgentEvent =
            toolName === "computer"
              ? {
                  id: eventId,
                  timestamp: Date.now(),
                  duration: null,
                  status: "pending",
                  tool: "computer",
                  payload: args as ComputerToolPayload,
                }
              : {
                  id: eventId,
                  timestamp: Date.now(),
                  duration: null,
                  status: "pending",
                  tool: "bash",
                  payload: args as BashToolPayload,
                };

          addEvent(event);
          if (sessionId) appendEvent(sessionId, event);
        }

        if (state === "result" && trackedIds.current.has(eventId)) {
          const startTime = startTimes.current.get(eventId) ?? Date.now();
          const duration = Date.now() - startTime;
          const resultStr = typeof result === "string" ? result : JSON.stringify(result);
          const isAborted = resultStr === "User aborted";
          const newStatus = isAborted ? "aborted" : "success";

          const patch: Partial<AgentEvent> = { status: newStatus, duration };
          updateEvent(eventId, patch);
          if (sessionId) persistEvent(sessionId, eventId, patch);
        }
      }
    }
  }, [messages, sessionId, addEvent, updateEvent, appendEvent, persistEvent]);
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/hooks/use-event-sync.ts
git commit -m "feat: add useEventSync hook bridging AI SDK messages to event pipeline"
```

---

## Task 6: useSessionSandbox Hook

**Files:**
- Create: `lib/hooks/use-session-sandbox.ts`

- [ ] **Step 1: Create the hook**

Create `lib/hooks/use-session-sandbox.ts`:

```typescript
import { useState, useEffect, useCallback } from "react";
import { getDesktopURL, killDesktop } from "@/lib/sandbox/utils";
import { useSessionStore } from "@/lib/store/session-store";
import { useEventStore } from "@/lib/store/event-store";

export function useSessionSandbox() {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  const activeSession = useSessionStore((s) => s.activeSession());
  const setSandboxId = useSessionStore((s) => s.setSandboxId);
  const resetEvents = useEventStore((s) => s.reset);

  const initSandbox = useCallback(async () => {
    if (!activeSession) return;
    setIsInitializing(true);
    try {
      const { streamUrl, id } = await getDesktopURL(
        activeSession.sandboxId ?? undefined
      );
      setStreamUrl(streamUrl);
      setSandboxId(activeSession.id, id);
    } catch (err) {
      console.error("Failed to init sandbox:", err);
    } finally {
      setIsInitializing(false);
    }
  }, [activeSession, setSandboxId]);

  const killCurrentSandbox = useCallback(async () => {
    if (!activeSession?.sandboxId) return;
    try {
      await killDesktop(activeSession.sandboxId);
    } catch {
      // ignore
    }
    if (activeSession) {
      setSandboxId(activeSession.id, null);
    }
    setStreamUrl(null);
    resetEvents();
  }, [activeSession, setSandboxId, resetEvents]);

  useEffect(() => {
    initSandbox();
    return () => {
      // Kill on unmount (page close handled by sendBeacon in page.tsx)
    };
  }, [activeSession?.id]); // Re-run only when active session changes

  return { streamUrl, isInitializing, initSandbox, killCurrentSandbox };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/hooks/use-session-sandbox.ts
git commit -m "feat: add useSessionSandbox hook for lazy sandbox lifecycle"
```

---

## Task 7: VNC Panel Component

**Files:**
- Create: `components/vnc-panel/vnc-panel.tsx`
- Create: `components/vnc-panel/debug-panel.tsx`
- Create: `components/vnc-panel/index.ts`

- [ ] **Step 1: Create VncPanel (memo-isolated)**

Create `components/vnc-panel/vnc-panel.tsx`:

```tsx
"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

type VncPanelProps = {
  streamUrl: string | null;
  isInitializing: boolean;
  onRefresh: () => void;
};

export const VncPanel = memo(function VncPanel({
  streamUrl,
  isInitializing,
  onRefresh,
}: VncPanelProps) {
  return (
    <div className="relative w-full h-full bg-[#0a0a0f] flex items-center justify-center">
      {streamUrl ? (
        <>
          <iframe
            src={streamUrl}
            className="w-full h-full border-0"
            allow="autoplay"
          />
          <Button
            onClick={onRefresh}
            disabled={isInitializing}
            size="sm"
            className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white border border-white/10 backdrop-blur-sm text-xs gap-1.5"
          >
            <RefreshCw className="w-3 h-3" />
            {isInitializing ? "Creating..." : "New Desktop"}
          </Button>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 text-[#94a3b8]">
          <div className="w-8 h-8 border-2 border-[#22c55e]/40 border-t-[#22c55e] rounded-full animate-spin" />
          <span className="text-sm">
            {isInitializing ? "Initializing desktop..." : "Loading stream..."}
          </span>
        </div>
      )}
    </div>
  );
});
```

- [ ] **Step 2: Create DebugPanel**

Create `components/vnc-panel/debug-panel.tsx`:

```tsx
"use client";

import { useEventStore } from "@/lib/store/event-store";
import { cn } from "@/lib/utils";
import {
  Camera,
  Terminal,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  CircleSlash,
} from "lucide-react";
import type { AgentEvent, AgentStatus } from "@/lib/types";

function StatusIcon({ status }: { status: AgentEvent["status"] }) {
  switch (status) {
    case "pending":
      return <Loader2 className="w-3 h-3 animate-spin text-[#94a3b8]" />;
    case "success":
      return <CheckCircle2 className="w-3 h-3 text-[#22c55e]" />;
    case "error":
      return <XCircle className="w-3 h-3 text-[#ef4444]" />;
    case "aborted":
      return <CircleSlash className="w-3 h-3 text-[#f59e0b]" />;
  }
}

function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const label =
    status.type === "idle"
      ? "Idle"
      : status.type === "running"
        ? "Running"
        : "Error";
  const color =
    status.type === "idle"
      ? "text-[#94a3b8] bg-white/5"
      : status.type === "running"
        ? "text-[#22c55e] bg-[#22c55e]/10"
        : "text-[#ef4444] bg-[#ef4444]/10";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full",
        color
      )}
    >
      {status.type === "running" && (
        <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
      )}
      {label}
    </span>
  );
}

function EventRow({ event }: { event: AgentEvent }) {
  const label =
    event.tool === "computer"
      ? event.payload.action
      : event.payload.command.slice(0, 30);
  const durationLabel =
    event.duration != null ? `${event.duration}ms` : null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 rounded group">
      <StatusIcon status={event.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {event.tool === "computer" ? (
            <Camera className="w-3 h-3 text-[#94a3b8] shrink-0" />
          ) : (
            <Terminal className="w-3 h-3 text-[#94a3b8] shrink-0" />
          )}
          <span className="text-xs text-[#e2e8f0] font-mono truncate">
            {label}
          </span>
        </div>
      </div>
      {durationLabel && (
        <span className="text-[10px] text-[#475569] flex items-center gap-0.5">
          <Clock className="w-2.5 h-2.5" />
          {durationLabel}
        </span>
      )}
    </div>
  );
}

type DebugPanelProps = {
  isCollapsed: boolean;
  onToggle: () => void;
};

export function DebugPanel({ isCollapsed, onToggle }: DebugPanelProps) {
  const events = useEventStore((s) => s.events);
  const agentStatus = useEventStore((s) => s.agentStatus);

  return (
    <div className="flex flex-col border-t border-white/[0.06] bg-[#0F172A]">
      {/* Header */}
      <button
        onClick={onToggle}
        className="flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-[#94a3b8]" />
          <span className="text-xs font-medium text-[#94a3b8]">Debug</span>
          <AgentStatusBadge status={agentStatus} />
          {events.length > 0 && (
            <span className="text-[10px] text-[#475569]">
              {events.length} events
            </span>
          )}
        </div>
        <span className="text-[#475569] text-xs">
          {isCollapsed ? "▲" : "▼"}
        </span>
      </button>

      {/* Event list */}
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto max-h-48 py-1">
          {events.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-[#475569]">
              No tool calls yet
            </div>
          ) : (
            [...events].reverse().map((event) => (
              <EventRow key={event.id} event={event} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create index barrel**

Create `components/vnc-panel/index.ts`:

```typescript
export { VncPanel } from "./vnc-panel";
export { DebugPanel } from "./debug-panel";
```

- [ ] **Step 4: Commit**

```bash
git add components/vnc-panel/
git commit -m "feat: add VncPanel (memo-isolated) and DebugPanel with event timeline"
```

---

## Task 8: Session Sidebar Component

**Files:**
- Create: `components/chat-panel/session-sidebar.tsx`

- [ ] **Step 1: Create SessionSidebar**

Create `components/chat-panel/session-sidebar.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useSessionStore } from "@/lib/store/session-store";
import { cn } from "@/lib/utils";
import { Plus, Trash2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";

type SessionItemProps = {
  id: string;
  title: string;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
};

function SessionItem({
  id,
  title,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: SessionItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const commitRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== title) onRename(trimmed);
    setIsEditing(false);
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm",
        isActive
          ? "bg-white/10 text-[#f8fafc]"
          : "text-[#94a3b8] hover:bg-white/5 hover:text-[#f8fafc]"
      )}
      onClick={!isEditing ? onSelect : undefined}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setIsEditing(false);
          }}
          className="flex-1 bg-transparent outline-none border-b border-[#22c55e] text-[#f8fafc] text-sm"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="flex-1 truncate">{title}</span>
      )}

      {!isEditing && (
        <div className="hidden group-hover:flex items-center gap-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditValue(title);
              setIsEditing(true);
            }}
            className="p-1 rounded hover:text-[#f8fafc] text-[#475569]"
            aria-label="Rename session"
          >
            <PenLine className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 rounded hover:text-[#ef4444] text-[#475569]"
            aria-label="Delete session"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

type SessionSidebarProps = {
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
};

export function SessionSidebar({
  onSwitchSession,
  onDeleteSession,
}: SessionSidebarProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const createSession = useSessionStore((s) => s.createSession);
  const renameSession = useSessionStore((s) => s.renameSession);

  return (
    <div className="flex flex-col w-[200px] shrink-0 bg-[#0a0e1a] border-r border-white/[0.06] h-full">
      <div className="p-3 border-b border-white/[0.06]">
        <Button
          onClick={() => {
            const id = createSession();
            onSwitchSession(id);
          }}
          className="w-full gap-2 bg-white/5 hover:bg-white/10 text-[#f8fafc] border border-white/10 text-xs h-8"
          variant="ghost"
          size="sm"
        >
          <Plus className="w-3.5 h-3.5" />
          New Session
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {sessions.length === 0 && (
          <p className="text-xs text-[#475569] text-center py-4">
            No sessions yet
          </p>
        )}
        {sessions.map((session) => (
          <SessionItem
            key={session.id}
            id={session.id}
            title={session.title}
            isActive={session.id === activeSessionId}
            onSelect={() => onSwitchSession(session.id)}
            onDelete={() => onDeleteSession(session.id)}
            onRename={(title) => renameSession(session.id, title)}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/chat-panel/session-sidebar.tsx
git commit -m "feat: add SessionSidebar with inline rename and delete"
```

---

## Task 9: Tool Call Card Component

**Files:**
- Create: `components/chat-panel/tool-call-card.tsx`

- [ ] **Step 1: Create collapsible ToolCallCard**

Create `components/chat-panel/tool-call-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Camera,
  Terminal,
  CheckCircle2,
  XCircle,
  Loader2,
  CircleSlash,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { ABORTED } from "@/lib/utils";

type ToolCallState = "call" | "result" | "partial-call";

type ToolCallCardProps = {
  toolName: string;
  state: ToolCallState;
  args: Record<string, unknown>;
  result?: unknown;
  isLatest: boolean;
  chatStatus: "error" | "submitted" | "streaming" | "ready";
};

export function ToolCallCard({
  toolName,
  state,
  args,
  result,
  isLatest,
  chatStatus,
}: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isRunning = state === "call" && isLatest && chatStatus !== "ready";
  const isAborted = result === ABORTED;

  const label =
    toolName === "computer"
      ? String(args.action ?? "action")
      : toolName === "bash"
        ? `bash: ${String(args.command ?? "").slice(0, 30)}`
        : toolName;

  const StatusIcon = () => {
    if (state === "call") {
      if (isRunning) return <Loader2 className="w-3.5 h-3.5 animate-spin text-[#94a3b8]" />;
      return <XCircle className="w-3.5 h-3.5 text-[#ef4444]" />;
    }
    if (isAborted) return <CircleSlash className="w-3.5 h-3.5 text-[#f59e0b]" />;
    return <CheckCircle2 className="w-3.5 h-3.5 text-[#22c55e]" />;
  };

  const ToolIcon =
    toolName === "computer"
      ? Camera
      : Terminal;

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] overflow-hidden mb-2">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors text-left"
        onClick={() => setIsExpanded((v) => !v)}
      >
        <ToolIcon className="w-3.5 h-3.5 text-[#94a3b8] shrink-0" />
        <span className="flex-1 text-xs font-mono text-[#e2e8f0] truncate">
          {label}
        </span>
        <StatusIcon />
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-[#475569]" />
        ) : (
          <ChevronRight className="w-3 h-3 text-[#475569]" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-white/[0.06] px-3 py-2 space-y-2">
          <div>
            <p className="text-[10px] text-[#475569] mb-1 uppercase tracking-wider">Args</p>
            <pre className="text-[11px] text-[#94a3b8] font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>
          {state === "result" && result !== undefined && (
            <div>
              <p className="text-[10px] text-[#475569] mb-1 uppercase tracking-wider">Result</p>
              {typeof result === "object" &&
              result !== null &&
              "type" in result &&
              (result as { type: string }).type === "image" &&
              "data" in result ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/png;base64,${(result as { data: string }).data}`}
                  alt="Screenshot"
                  className="w-full rounded"
                />
              ) : (
                <pre className="text-[11px] text-[#94a3b8] font-mono whitespace-pre-wrap break-all">
                  {typeof result === "string"
                    ? result.slice(0, 500)
                    : JSON.stringify(result, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/chat-panel/tool-call-card.tsx
git commit -m "feat: add collapsible ToolCallCard component"
```

---

## Task 10: Chat Panel Component

**Files:**
- Create: `components/chat-panel/chat-panel.tsx`
- Create: `components/chat-panel/index.ts`
- Modify: `components/message.tsx` (remove old tool call rendering — now handled by ToolCallCard)

- [ ] **Step 1: Create ChatPanel**

Create `components/chat-panel/chat-panel.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { toast } from "sonner";
import { Input } from "@/components/input";
import { useScrollToBottom } from "@/lib/use-scroll-to-bottom";
import { useSessionStore } from "@/lib/store/session-store";
import { useEventStore } from "@/lib/store/event-store";
import { useEventSync } from "@/lib/hooks/use-event-sync";
import { ToolCallCard } from "./tool-call-card";
import { ABORTED } from "@/lib/utils";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";
import type { UIMessage } from "ai";

type ChatPanelProps = {
  sandboxId: string | null;
};

export function ChatPanel({ sandboxId }: ChatPanelProps) {
  const [containerRef, endRef] = useScrollToBottom();
  const activeSession = useSessionStore((s) => s.activeSession());
  const updateMessages = useSessionStore((s) => s.updateMessages);
  const updateSessionTitle = useSessionStore((s) => s.updateSessionTitle);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    status,
    stop: stopGeneration,
    setMessages,
  } = useChat({
    api: "/api/chat",
    id: activeSession?.id ?? undefined,
    body: { sandboxId },
    maxSteps: 30,
    initialMessages: activeSession?.messages ?? [],
    onError: (error) => {
      console.error(error);
      toast.error("There was an error", {
        description: "Please try again later.",
        richColors: true,
        position: "top-center",
      });
    },
  });

  // Sync messages back to session store for persistence
  useEffect(() => {
    if (activeSession?.id) {
      updateMessages(activeSession.id, messages);
      // Auto-title from first user message
      const firstUser = messages.find((m) => m.role === "user");
      if (firstUser && activeSession.title === "New Session") {
        const content =
          typeof firstUser.content === "string"
            ? firstUser.content
            : "";
        if (content) updateSessionTitle(activeSession.id, content);
      }
    }
  }, [messages, activeSession?.id, updateMessages, updateSessionTitle, activeSession?.title]);

  // Sync tool call events to event pipeline
  useEventSync(messages, status, activeSession?.id ?? null);

  const stop = () => {
    stopGeneration();
    const lastMessage = messages.at(-1);
    const lastPart = lastMessage?.parts.at(-1);
    if (
      lastMessage?.role === "assistant" &&
      lastPart?.type === "tool-invocation"
    ) {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          ...lastMessage,
          parts: [
            ...lastMessage.parts.slice(0, -1),
            {
              ...lastPart,
              toolInvocation: {
                ...lastPart.toolInvocation,
                state: "result",
                result: ABORTED,
              },
            },
          ],
        },
      ]);
    }
  };

  const isLoading = status !== "ready";

  return (
    <div className="flex flex-col h-full bg-[#0F172A]">
      {/* Messages */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <p className="text-[#94a3b8] text-sm">
              Ask the agent to do something on the desktop
            </p>
            <p className="text-[#475569] text-xs">
              e.g. "What's the weather in Dubai?"
            </p>
          </div>
        )}
        {messages.map((message, i) => (
          <MessageItem
            key={message.id}
            message={message}
            isLatest={i === messages.length - 1}
            chatStatus={status}
          />
        ))}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/[0.06] p-3">
        <form onSubmit={handleSubmit}>
          <Input
            handleInputChange={handleInputChange}
            input={input}
            isInitializing={false}
            isLoading={isLoading}
            status={status}
            stop={stop}
          />
        </form>
      </div>
    </div>
  );
}

function MessageItem({
  message,
  isLatest,
  chatStatus,
}: {
  message: UIMessage;
  isLatest: boolean;
  chatStatus: "error" | "submitted" | "streaming" | "ready";
}) {
  return (
    <div
      className={cn("flex flex-col gap-1", {
        "items-end": message.role === "user",
        "items-start": message.role !== "user",
      })}
    >
      {message.parts?.map((part, i) => {
        if (part.type === "text") {
          return (
            <div
              key={i}
              className={cn("max-w-[85%] text-sm", {
                "bg-white/10 text-[#f8fafc] px-3 py-2 rounded-2xl rounded-br-sm":
                  message.role === "user",
                "text-[#e2e8f0]": message.role !== "user",
              })}
            >
              <Streamdown>{part.text}</Streamdown>
            </div>
          );
        }
        if (part.type === "tool-invocation") {
          const { toolName, state, args } = part.toolInvocation;
          const result =
            state === "result"
              ? (part.toolInvocation as { result: unknown }).result
              : undefined;
          return (
            <div key={i} className="w-full max-w-full">
              <ToolCallCard
                toolName={toolName}
                state={state as "call" | "result" | "partial-call"}
                args={args as Record<string, unknown>}
                result={result}
                isLatest={isLatest}
                chatStatus={chatStatus}
              />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create index barrel**

Create `components/chat-panel/index.ts`:

```typescript
export { ChatPanel } from "./chat-panel";
export { SessionSidebar } from "./session-sidebar";
export { ToolCallCard } from "./tool-call-card";
```

- [ ] **Step 3: Commit**

```bash
git add components/chat-panel/
git commit -m "feat: add ChatPanel with session-aware useChat and message rendering"
```

---

## Task 11: Rewire page.tsx

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Rewrite page.tsx**

Replace entire contents of `app/page.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { toast } from "sonner";
import { useSessionStore } from "@/lib/store/session-store";
import { useEventStore } from "@/lib/store/event-store";
import { useSessionSandbox } from "@/lib/hooks/use-session-sandbox";
import { SessionSidebar } from "@/components/chat-panel/session-sidebar";
import { ChatPanel } from "@/components/chat-panel/chat-panel";
import { VncPanel } from "@/components/vnc-panel/vnc-panel";
import { DebugPanel } from "@/components/vnc-panel/debug-panel";

export default function Page() {
  const [debugCollapsed, setDebugCollapsed] = useState(false);
  const [switchPending, setSwitchPending] = useState<string | null>(null);

  const { sessions, activeSessionId, setActiveSession, createSession, deleteSession } =
    useSessionStore();
  const agentStatus = useEventStore((s) => s.agentStatus);
  const resetEvents = useEventStore((s) => s.reset);

  const { streamUrl, isInitializing, initSandbox, killCurrentSandbox } =
    useSessionSandbox();

  // Initialize with a session if none exists
  useEffect(() => {
    if (sessions.length === 0) {
      createSession();
    }
  }, []);

  // Listen for storage warning
  useEffect(() => {
    const handler = () => {
      toast.warning("Storage almost full", {
        description: "Consider deleting old sessions to free up space.",
        richColors: true,
      });
    };
    window.addEventListener("storage-warning", handler);
    return () => window.removeEventListener("storage-warning", handler);
  }, []);

  // Kill desktop on page close
  useEffect(() => {
    const active = useSessionStore.getState().activeSession();
    if (!active?.sandboxId) return;
    const kill = () => {
      navigator.sendBeacon(
        `/api/kill-desktop?sandboxId=${encodeURIComponent(active.sandboxId!)}`
      );
    };
    window.addEventListener("beforeunload", kill);
    return () => window.removeEventListener("beforeunload", kill);
  }, [activeSessionId]);

  const handleSwitchSession = useCallback(
    async (id: string) => {
      if (id === activeSessionId) return;
      if (agentStatus.type === "running") {
        setSwitchPending(id);
        const confirmed = window.confirm(
          "Agent is running. Stop it and switch session?"
        );
        if (!confirmed) {
          setSwitchPending(null);
          return;
        }
      }
      await killCurrentSandbox();
      resetEvents();
      setActiveSession(id);
      setSwitchPending(null);
    },
    [activeSessionId, agentStatus, killCurrentSandbox, resetEvents, setActiveSession]
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      const isActive = id === activeSessionId;
      if (isActive) {
        const confirmed = window.confirm(
          "Delete this session? The desktop will be closed."
        );
        if (!confirmed) return;
        await killCurrentSandbox();
        resetEvents();
      }
      deleteSession(id);
    },
    [activeSessionId, killCurrentSandbox, resetEvents, deleteSession]
  );

  const activeSandboxId = useSessionStore((s) => s.activeSandboxId());

  return (
    <div className="flex h-dvh bg-[#0F172A] text-[#f8fafc]">
      {/* Session Sidebar — desktop only */}
      <div className="hidden xl:flex">
        <SessionSidebar
          onSwitchSession={handleSwitchSession}
          onDeleteSession={handleDeleteSession}
        />
      </div>

      {/* Main panels */}
      <div className="flex-1 hidden xl:block">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Left: Chat */}
          <ResizablePanel defaultSize={35} minSize={25}>
            <ChatPanel sandboxId={activeSandboxId} />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right: VNC + Debug */}
          <ResizablePanel defaultSize={65} minSize={35}>
            <div className="flex flex-col h-full">
              <div className="flex-1 min-h-0">
                <VncPanel
                  streamUrl={streamUrl}
                  isInitializing={isInitializing}
                  onRefresh={initSandbox}
                />
              </div>
              <DebugPanel
                isCollapsed={debugCollapsed}
                onToggle={() => setDebugCollapsed((v) => !v)}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Mobile: Chat only */}
      <div className="flex-1 xl:hidden">
        <div className="flex items-center justify-center fixed left-1/2 -translate-x-1/2 top-5 shadow-md text-xs mx-auto rounded-lg h-8 w-fit bg-blue-600 text-white px-3 py-2 z-50">
          Headless mode
        </div>
        <ChatPanel sandboxId={activeSandboxId} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "feat: rewire page.tsx with session sidebar, split panels, VNC isolation"
```

---

## Task 12: Dark Mode Globals & Design System Tokens

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add CSS variables for design system**

In `app/globals.css`, add inside `:root` / at top level (keep existing Tailwind directives):

```css
@layer base {
  :root {
    --color-bg: #0F172A;
    --color-surface: #1E293B;
    --color-surface-2: #272F42;
    --color-border: rgba(255, 255, 255, 0.06);
    --color-accent: #22C55E;
    --color-accent-muted: rgba(34, 197, 94, 0.1);
    --color-destructive: #EF4444;
    --color-text-primary: #F8FAFC;
    --color-text-secondary: #94A3B8;
    --color-text-muted: #475569;
  }

  body {
    background-color: var(--color-bg);
    color: var(--color-text-primary);
    font-family: 'Inter', sans-serif;
  }

  * {
    scrollbar-width: thin;
    scrollbar-color: #1E293B transparent;
  }
}
```

- [ ] **Step 2: Add Inter font to layout**

In `app/layout.tsx`, the `Geist` fonts are already loaded. Add Inter via the existing font setup or via `@import` in globals.css:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
```

- [ ] **Step 3: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: add design system CSS tokens (dark OLED + glassmorphism palette)"
```

---

## Task 13: Smoke Test & Fix

**Files:** All modified files

- [ ] **Step 1: Start dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Manual checklist**

- [ ] Page loads without TypeScript errors in terminal
- [ ] Session sidebar shows "New Session" on first load and auto-creates one session
- [ ] Can create new sessions via "+ New Session" button
- [ ] Can rename session by double-clicking its title
- [ ] Can delete a non-active session without confirmation
- [ ] Deleting the active session shows confirm dialog
- [ ] Chat panel shows empty state message
- [ ] VNC panel shows loading indicator while sandbox initializes
- [ ] Send a message ("What's the weather in Dubai?") — VNC shows agent working
- [ ] Tool calls appear in chat as collapsible cards (collapsed by default)
- [ ] Debug panel shows events in real time
- [ ] Debug panel collapses/expands via toggle
- [ ] Switching sessions while agent is idle works instantly
- [ ] Switching sessions while agent is running shows confirmation
- [ ] localStorage is populated (`ai-agent-sessions` key in DevTools > Application > Storage)

- [ ] **Step 3: Fix any issues found, then commit**

```bash
git add -A
git commit -m "fix: smoke test corrections"
```

---

## Self-Review Against Spec

| Spec Requirement | Task |
|-----------------|------|
| Left Chat, Right VNC layout | Task 11 |
| Session sidebar | Task 8, 11 |
| Resizable panels | Task 11 |
| Tool call collapsible cards | Task 9 |
| Debug panel (collapsible, right side) | Task 7 |
| VNC memo isolation | Task 7 (React.memo) |
| Event pipeline (id/timestamp/type/payload/status/duration) | Task 5 |
| Agent status (idle/running/error) | Task 4, 5 |
| Multi-session create/switch/delete | Task 3, 8 |
| localStorage persistence | Task 3 (persist middleware) |
| 20-session cap, evict oldest | Task 3 |
| Storage 80% warning toast | Task 3, 11 |
| Delete active session → confirm → auto-create | Task 3 |
| Switch while running → confirm | Task 11 |
| Session auto-title from first message | Task 10 |
| Double-click to rename | Task 8 |
| Sandbox lazy-load per session | Task 6 |
| Discriminated unions, no any | Task 2 |
| Mobile: chat only, VNC hidden | Task 11 |
| Dark OLED design system | Task 12 |
