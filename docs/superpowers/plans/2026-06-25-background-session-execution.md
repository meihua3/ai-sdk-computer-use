# Background Session Execution + Tool Stats — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agent loops continue running in the background when the user switches sessions; sessions show per-session running/unread indicators; max concurrent sessions is user-configurable; debug panel gains a Stats tab broken down by tool type.

**Architecture:** Introduce an `AgentWorker` component (one per session, no UI) that owns `useChat` and registers controls in a new `useMultiChatStore`. `ChatPanel` becomes a pure display layer reading from that store. A new `useNotificationStore` tracks which sessions have unread finished runs. `useSettingsStore` (persisted) stores the concurrent limit. Debug panel reads events from the persistent `session.events` rather than the ephemeral `useEventStore`, and gains a Stats tab.

**Tech Stack:** Next.js 15 App Router, TypeScript, `@ai-sdk/react` `useChat`, Zustand (`zustand/middleware` persist), shadcn/ui Dialog, Lucide icons.

---

## File Map

| File | Action |
|------|--------|
| `lib/store/multi-chat-store.ts` | **Create** — per-session messages + status + controls |
| `lib/store/notification-store.ts` | **Create** — unread finished-run tracking |
| `lib/store/settings-store.ts` | **Create** — persisted user settings |
| `components/agent-worker.tsx` | **Create** — useChat per session, event sync, store writes |
| `components/settings-dialog.tsx` | **Create** — concurrent limit config UI |
| `components/chat-panel/chat-panel.tsx` | **Modify** — remove useChat, read from multi-chat-store |
| `components/chat-panel/session-sidebar.tsx` | **Modify** — running + unread dots, settings gear |
| `components/vnc-panel/debug-panel.tsx` | **Modify** — Stats tab, read from session.events |
| `lib/hooks/use-event-sync.ts` | **Modify** — pre-populate trackedIds, remove useEventStore writes |
| `lib/store/session-store.ts` | **Modify** — deduplicate appendEvent |
| `app/page.tsx` | **Modify** — mount AgentWorkers, remove useEventStore, update handlers |
| `lib/store/event-store.ts` | **Delete** — fully replaced by useMultiChatStore + session.events |

---

## Task 1: Create `useMultiChatStore`

**Files:**
- Create: `lib/store/multi-chat-store.ts`

- [ ] **Step 1: Write the store**

```ts
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
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors related to `multi-chat-store.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/store/multi-chat-store.ts
git commit -m "feat: add useMultiChatStore for per-session chat state"
```

---

## Task 2: Create `useNotificationStore`

**Files:**
- Create: `lib/store/notification-store.ts`

- [ ] **Step 1: Write the store**

```ts
// lib/store/notification-store.ts
import { create } from "zustand";

type NotificationStore = {
  unread: Set<string>;
  markUnread: (sessionId: string) => void;
  markRead: (sessionId: string) => void;
};

export const useNotificationStore = create<NotificationStore>()((set) => ({
  unread: new Set(),

  markUnread: (sessionId) =>
    set((state) => ({ unread: new Set([...state.unread, sessionId]) })),

  markRead: (sessionId) =>
    set((state) => {
      const unread = new Set(state.unread);
      unread.delete(sessionId);
      return { unread };
    }),
}));
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/store/notification-store.ts
git commit -m "feat: add useNotificationStore for per-session unread tracking"
```

---

## Task 3: Create `useSettingsStore`

**Files:**
- Create: `lib/store/settings-store.ts`

- [ ] **Step 1: Write the store**

```ts
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
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/store/settings-store.ts
git commit -m "feat: add useSettingsStore for persisted user settings"
```

---

## Task 4: Create `AgentWorker`

**Files:**
- Create: `components/agent-worker.tsx`

`AgentWorker` is a render-less React component — it mounts once per session, owns `useChat`, enforces the concurrent limit, and registers `submit`/`stop` in `useMultiChatStore`.

- [ ] **Step 1: Write the component**

```tsx
// components/agent-worker.tsx
"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { toast } from "sonner";
import { useSessionStore } from "@/lib/store/session-store";
import { useMultiChatStore } from "@/lib/store/multi-chat-store";
import { useNotificationStore } from "@/lib/store/notification-store";
import { useSettingsStore } from "@/lib/store/settings-store";
import { useEventSync } from "@/lib/hooks/use-event-sync";
import { ABORTED } from "@/lib/utils";

export function AgentWorker({ sessionId }: { sessionId: string }) {
  const session = useSessionStore((s) =>
    s.sessions.find((sess) => sess.id === sessionId)
  );
  const updateMessages = useSessionStore((s) => s.updateMessages);
  const updateSessionTitle = useSessionStore((s) => s.updateSessionTitle);
  const setInStore = useMultiChatStore((s) => s.set);
  const removeFromStore = useMultiChatStore((s) => s.remove);

  const {
    messages,
    status,
    append,
    stop: stopGeneration,
    setMessages,
  } = useChat({
    api: "/api/chat",
    id: sessionId,
    body: { sandboxId: session?.sandboxId ?? null },
    maxSteps: 30,
    initialMessages: session?.messages ?? [],
    onFinish: () => {
      if (useSessionStore.getState().activeSessionId !== sessionId) {
        useNotificationStore.getState().markUnread(sessionId);
      }
    },
    onError: (error) => {
      console.error("[AgentWorker]", error);
      if (useSessionStore.getState().activeSessionId !== sessionId) {
        useNotificationStore.getState().markUnread(sessionId);
      } else {
        toast.error("There was an error", {
          description: "Please try again later.",
          richColors: true,
          position: "top-center",
        });
      }
    },
  });

  // Sync messages to session store for persistence + auto-title
  useEffect(() => {
    updateMessages(sessionId, messages);
    const firstUser = messages.find((m) => m.role === "user");
    if (firstUser) {
      const content =
        typeof firstUser.content === "string" ? firstUser.content : "";
      if (content) updateSessionTitle(sessionId, content);
    }
  }, [messages, sessionId, updateMessages, updateSessionTitle]);

  // Use refs so registered functions don't capture stale closures
  const appendRef = useRef(append);
  appendRef.current = append;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const stopRef = useRef(stopGeneration);
  stopRef.current = stopGeneration;
  const setMessagesRef = useRef(setMessages);
  setMessagesRef.current = setMessages;

  // Register controls in multi-chat store
  useEffect(() => {
    const submit = (content: string) => {
      const running = Object.values(
        useMultiChatStore.getState().sessions
      ).filter(
        (s) => s.status === "submitted" || s.status === "streaming"
      ).length;
      const max = useSettingsStore.getState().maxConcurrentSessions;
      if (running >= max) {
        toast.error(`Max ${max} sessions can run simultaneously`, {
          description: "Stop a running session before starting a new one.",
        });
        return;
      }
      appendRef.current({ role: "user", content });
    };

    const stop = () => {
      stopRef.current();
      const msgs = messagesRef.current;
      const lastMessage = msgs.at(-1);
      const lastPart = lastMessage?.parts.at(-1);
      if (
        lastMessage?.role === "assistant" &&
        lastPart?.type === "tool-invocation"
      ) {
        setMessagesRef.current((prev) => [
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

    setInStore(sessionId, { messages, status, submit, stop });
  }, [messages, status, sessionId, setInStore]);

  // Cleanup when session is deleted (AgentWorker unmounts)
  useEffect(() => {
    return () => {
      removeFromStore(sessionId);
      useNotificationStore.getState().markRead(sessionId);
    };
  }, [sessionId, removeFromStore]);

  // Bridge tool call messages → session event pipeline
  useEventSync(messages, status, sessionId);

  return null;
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors from `agent-worker.tsx` (there will be a type error in `use-event-sync.ts` if it still imports `useEventStore` — that is fixed in Task 10, ignore for now).

- [ ] **Step 3: Commit**

```bash
git add components/agent-worker.tsx
git commit -m "feat: add AgentWorker for per-session background agent execution"
```

---

## Task 5: Modify `ChatPanel`

**Files:**
- Modify: `components/chat-panel/chat-panel.tsx`

Remove `useChat` from `ChatPanel`. It now reads messages and controls from `useMultiChatStore`. The component manages its own `input` state locally (resets cleanly on remount when `key` changes in parent).

- [ ] **Step 1: Replace the full file**

```tsx
// components/chat-panel/chat-panel.tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/input";
import { useScrollToBottom } from "@/lib/use-scroll-to-bottom";
import { useMultiChatStore } from "@/lib/store/multi-chat-store";
import { ToolCallCard } from "./tool-call-card";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";
import type { UIMessage } from "ai";

type ChatPanelProps = {
  sessionId: string;
  testMessage?: string;
};

export function ChatPanel({ sessionId, testMessage }: ChatPanelProps) {
  const [containerRef, endRef] = useScrollToBottom();
  const [input, setInput] = useState("");

  const chatEntry = useMultiChatStore((s) => s.sessions[sessionId]);
  const messages = chatEntry?.messages ?? [];
  const status = chatEntry?.status ?? "ready";

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !chatEntry) return;
    chatEntry.submit(trimmed);
    setInput("");
  };

  const isLoading = status !== "ready" && status !== "error";

  return (
    <div className="flex flex-col h-full bg-[#0F172A]">
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
              e.g. &ldquo;What&apos;s the weather in Dubai?&rdquo;
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

      {testMessage && (
        <div className="px-3 pt-2">
          <button
            onClick={() =>
              !isLoading && chatEntry?.submit(testMessage)
            }
            disabled={isLoading}
            className="w-full py-2 rounded-lg bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
          >
            {isLoading ? "Running..." : `▶ Send: "${testMessage}"`}
          </button>
        </div>
      )}

      <div className="border-t border-white/[0.06] p-3">
        <form onSubmit={handleSubmit}>
          <Input
            handleInputChange={handleInputChange}
            input={input}
            isInitializing={false}
            isLoading={isLoading}
            status={status}
            stop={chatEntry?.stop ?? (() => {})}
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

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: errors only in `app/page.tsx` (still passes old props to `ChatPanel`). Those are fixed in Task 6.

- [ ] **Step 3: Commit**

```bash
git add components/chat-panel/chat-panel.tsx
git commit -m "refactor: ChatPanel reads from useMultiChatStore, removes useChat"
```

---

## Task 6: Modify `page.tsx`

**Files:**
- Modify: `app/page.tsx`

Mount one `AgentWorker` per session. Remove `useEventStore`. Update `handleSwitchSession` (no confirm, no reset), update `handleCreateSession` and `handleDeleteSession` to check `useMultiChatStore`. Update `ChatPanel` props.

- [ ] **Step 1: Replace the full file**

```tsx
// app/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { toast } from "sonner";
import { useSessionStore } from "@/lib/store/session-store";
import { useMultiChatStore } from "@/lib/store/multi-chat-store";
import { useNotificationStore } from "@/lib/store/notification-store";
import { useSessionSandbox } from "@/lib/hooks/use-session-sandbox";
import { useSandboxUrlStore } from "@/lib/store/sandbox-url-store";
import { killDesktop } from "@/lib/sandbox/utils";
import { AgentWorker } from "@/components/agent-worker";
import { SessionSidebar } from "@/components/chat-panel/session-sidebar";
import { ChatPanel } from "@/components/chat-panel/chat-panel";
import { VncPanel } from "@/components/vnc-panel/vnc-panel";
import { DebugPanel } from "@/components/vnc-panel/debug-panel";

export default function Page() {
  const [debugCollapsed, setDebugCollapsed] = useState(false);

  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const createSession = useSessionStore((s) => s.createSession);
  const deleteSession = useSessionStore((s) => s.deleteSession);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);

  const { initSandbox } = useSessionSandbox();

  // Initialize with a session if none exists
  useEffect(() => {
    if (useSessionStore.getState().sessions.length === 0) {
      createSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for storage warning events
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

  // Kill active sandbox on page close
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

  // Create new session — confirm only if active session is running
  const handleCreateSession = useCallback(() => {
    const activeId = useSessionStore.getState().activeSessionId;
    const activeStatus = activeId
      ? useMultiChatStore.getState().sessions[activeId]?.status
      : "ready";
    if (activeStatus === "submitted" || activeStatus === "streaming") {
      const confirmed = window.confirm(
        "Agent is running. Create new session anyway?"
      );
      if (!confirmed) return;
    }
    createSession();
  }, [createSession]);

  // Switch session — instant, agent keeps running in background
  const handleSwitchSession = useCallback(
    (id: string) => {
      if (id === activeSessionId) return;
      setActiveSession(id);
      useNotificationStore.getState().markRead(id);
    },
    [activeSessionId, setActiveSession]
  );

  // Delete session — kill sandbox, clear stores, remove
  const handleDeleteSession = useCallback(
    async (id: string) => {
      const session = useSessionStore.getState().sessions.find((s) => s.id === id);
      const isActive = id === activeSessionId;
      if (isActive) {
        const confirmed = window.confirm(
          "Delete this session? The desktop will be closed."
        );
        if (!confirmed) return;
      }
      if (session?.sandboxId) {
        killDesktop(session.sandboxId).catch(() => {});
      }
      useSandboxUrlStore.getState().clearUrl(id);
      useNotificationStore.getState().markRead(id);
      deleteSession(id);
    },
    [activeSessionId, deleteSession]
  );

  return (
    <div className="flex h-dvh bg-[#0F172A] text-[#f8fafc]">
      {/* AgentWorker for every session — no UI, keeps useChat alive */}
      {sessions.map((session) => (
        <AgentWorker key={session.id} sessionId={session.id} />
      ))}

      {/* Session Sidebar — desktop only */}
      <div className="hidden xl:flex">
        <SessionSidebar
          onCreateSession={handleCreateSession}
          onSwitchSession={handleSwitchSession}
          onDeleteSession={handleDeleteSession}
        />
      </div>

      {/* Main panels — desktop */}
      <div className="flex-1 hidden xl:block">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Left: Chat */}
          <ResizablePanel defaultSize={35} minSize={25}>
            <ChatPanel
              key={activeSessionId ?? "none"}
              sessionId={activeSessionId ?? ""}
            />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right: VNC + Debug */}
          <ResizablePanel defaultSize={65} minSize={35}>
            <div className="flex flex-col h-full">
              <div className="flex-1 min-h-0">
                <VncPanel onRefresh={initSandbox} />
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
        <ChatPanel
          key={activeSessionId ?? "none"}
          sessionId={activeSessionId ?? ""}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: errors only from `use-event-sync.ts` still importing `useEventStore` — fixed in Task 10. No errors in `page.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "refactor: page.tsx mounts AgentWorkers, removes useEventStore, instant session switch"
```

---

## Task 7: Create `SettingsDialog`

**Files:**
- Create: `components/settings-dialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/settings-dialog.tsx
"use client";

import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useSettingsStore } from "@/lib/store/settings-store";

export function SettingsDialog() {
  const maxConcurrentSessions = useSettingsStore(
    (s) => s.maxConcurrentSessions
  );
  const setMaxConcurrentSessions = useSettingsStore(
    (s) => s.setMaxConcurrentSessions
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 text-[#475569] hover:text-[#94a3b8] hover:bg-white/5"
          aria-label="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[#0a0e1a] border-white/[0.06] text-[#f8fafc] max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[#f8fafc]">Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 pt-2">
          <Label className="text-[#94a3b8] text-sm">
            Max concurrent running sessions
          </Label>
          <Input
            type="number"
            min={1}
            max={5}
            value={maxConcurrentSessions}
            onChange={(e) =>
              setMaxConcurrentSessions(Number(e.target.value))
            }
            className="bg-white/5 border-white/10 text-[#f8fafc] w-24"
          />
          <p className="text-xs text-[#475569]">
            New runs are blocked when this limit is reached. Range: 1–5.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/settings-dialog.tsx
git commit -m "feat: add SettingsDialog for configuring max concurrent sessions"
```

---

## Task 8: Modify `session-sidebar.tsx`

**Files:**
- Modify: `components/chat-panel/session-sidebar.tsx`

Add `isRunning` (amber pulse) and `hasUnread` (green dot) props to `SessionItem`. Read from `useMultiChatStore` and `useNotificationStore` in `SessionSidebar`. Add `SettingsDialog` at the bottom.

- [ ] **Step 1: Replace the full file**

```tsx
// components/chat-panel/session-sidebar.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useSessionStore } from "@/lib/store/session-store";
import { useMultiChatStore } from "@/lib/store/multi-chat-store";
import { useNotificationStore } from "@/lib/store/notification-store";
import { cn } from "@/lib/utils";
import { Plus, Trash2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsDialog } from "@/components/settings-dialog";

type SessionItemProps = {
  id: string;
  title: string;
  isActive: boolean;
  isRunning: boolean;
  hasUnread: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
};

function SessionItem({
  title,
  isActive,
  isRunning,
  hasUnread,
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

      {/* Status indicators */}
      {!isEditing && (
        <div className="flex items-center gap-1 shrink-0">
          {hasUnread && (
            <span
              className="w-2 h-2 rounded-full bg-[#22c55e]"
              aria-label="New activity"
            />
          )}
          {isRunning && !hasUnread && (
            <span
              className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"
              aria-label="Running"
            />
          )}
        </div>
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
  onCreateSession: () => void;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
};

export function SessionSidebar({
  onCreateSession,
  onSwitchSession,
  onDeleteSession,
}: SessionSidebarProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const renameSession = useSessionStore((s) => s.renameSession);
  const chatSessions = useMultiChatStore((s) => s.sessions);
  const unread = useNotificationStore((s) => s.unread);

  return (
    <div className="flex flex-col w-[200px] shrink-0 bg-[#0a0e1a] border-r border-white/[0.06] h-full">
      <div className="p-3 border-b border-white/[0.06]">
        <Button
          onClick={onCreateSession}
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
        {sessions.map((session) => {
          const chatEntry = chatSessions[session.id];
          const isRunning =
            chatEntry?.status === "submitted" ||
            chatEntry?.status === "streaming";
          const hasUnread = unread.has(session.id);
          return (
            <SessionItem
              key={session.id}
              id={session.id}
              title={session.title}
              isActive={session.id === activeSessionId}
              isRunning={isRunning}
              hasUnread={hasUnread}
              onSelect={() => onSwitchSession(session.id)}
              onDelete={() => onDeleteSession(session.id)}
              onRename={(title) => renameSession(session.id, title)}
            />
          );
        })}
      </div>

      {/* Settings gear at bottom */}
      <div className="p-2 border-t border-white/[0.06] flex justify-end">
        <SettingsDialog />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/chat-panel/session-sidebar.tsx
git commit -m "feat: session-sidebar shows running/unread indicators and settings gear"
```

---

## Task 9: Modify `debug-panel.tsx` — Stats Tab

**Files:**
- Modify: `components/vnc-panel/debug-panel.tsx`

Change event data source from `useEventStore` (ephemeral) to `useSessionStore.session.events` (persistent). Derive `AgentStatus` from `useMultiChatStore`. Add an "Events | Stats" tab toggle. Stats tab shows per-tool breakdown.

- [ ] **Step 1: Replace the full file**

```tsx
// components/vnc-panel/debug-panel.tsx
"use client";

import { useState } from "react";
import { useSessionStore } from "@/lib/store/session-store";
import { useMultiChatStore } from "@/lib/store/multi-chat-store";
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

function StatCell({ label, value }: { label: string; value: string }) {
  const hasData = value !== "—";
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0">
      <span
        className={cn(
          "text-[11px] font-mono tabular-nums font-medium leading-none",
          hasData ? "text-[#22c55e]" : "text-[#334155]"
        )}
      >
        {value}
      </span>
      <span className="text-[9px] text-[#475569] uppercase tracking-wide leading-none">
        {label}
      </span>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function toolStats(events: AgentEvent[]) {
  const completed = events.filter((e) => e.duration != null);
  const total = completed.reduce((s, e) => s + (e.duration ?? 0), 0);
  return {
    count: events.length,
    totalMs: total,
    avgMs:
      completed.length > 0 ? Math.round(total / completed.length) : null,
  };
}

const TOOL_ICONS: Record<string, React.ReactNode> = {
  computer: <Camera className="w-3 h-3 text-[#94a3b8]" />,
  bash: <Terminal className="w-3 h-3 text-[#94a3b8]" />,
};

export function DebugPanel({ isCollapsed, onToggle }: DebugPanelProps) {
  const [activeTab, setActiveTab] = useState<"events" | "stats">("events");

  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const events = useSessionStore(
    (s) => s.sessions.find((sess) => sess.id === activeSessionId)?.events ?? []
  );
  const chatStatus = useMultiChatStore(
    (s) =>
      activeSessionId
        ? s.sessions[activeSessionId]?.status ?? "ready"
        : "ready"
  );

  const agentStatus: AgentStatus =
    chatStatus === "streaming" || chatStatus === "submitted"
      ? { type: "running", startedAt: 0 }
      : chatStatus === "error"
        ? { type: "error", message: "Chat error occurred" }
        : { type: "idle" };

  const completedEvents = events.filter((e) => e.duration != null);
  const totalCalls = events.length;
  const totalDuration = completedEvents.reduce(
    (sum, e) => sum + (e.duration ?? 0),
    0
  );
  const avgDuration =
    completedEvents.length > 0
      ? Math.round(totalDuration / completedEvents.length)
      : null;

  // Group events by tool for stats tab
  const byTool = events.reduce<Record<string, AgentEvent[]>>((acc, e) => {
    if (!acc[e.tool]) acc[e.tool] = [];
    acc[e.tool].push(e);
    return acc;
  }, {});
  const toolBreakdown = Object.entries(byTool).map(([tool, toolEvents]) => ({
    tool,
    ...toolStats(toolEvents),
  }));

  return (
    <div className="flex flex-col border-t border-white/[0.06] bg-[#0F172A]">
      <button
        onClick={onToggle}
        className="flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-[#94a3b8]" />
          <span className="text-xs font-medium text-[#94a3b8]">Debug</span>
          <AgentStatusBadge status={agentStatus} />
        </div>

        {/* Summary stats always visible */}
        <div className="flex items-center gap-3 mr-2">
          <StatCell
            label="calls"
            value={totalCalls > 0 ? String(totalCalls) : "—"}
          />
          <div className="w-px h-4 bg-white/[0.06]" />
          <StatCell
            label="total"
            value={totalDuration > 0 ? formatDuration(totalDuration) : "—"}
          />
          <div className="w-px h-4 bg-white/[0.06]" />
          <StatCell
            label="avg"
            value={avgDuration != null ? formatDuration(avgDuration) : "—"}
          />
        </div>

        <span className="text-[#475569] text-xs shrink-0">
          {isCollapsed ? "▲" : "▼"}
        </span>
      </button>

      {!isCollapsed && (
        <div className="flex flex-col flex-1">
          {/* Tab toggle */}
          <div className="flex border-b border-white/[0.06]">
            {(["events", "stats"] as const).map((tab) => (
              <button
                key={tab}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab(tab);
                }}
                className={cn(
                  "flex-1 py-1.5 text-[10px] uppercase tracking-wide font-medium transition-colors",
                  activeTab === tab
                    ? "text-[#22c55e] border-b border-[#22c55e]"
                    : "text-[#475569] hover:text-[#94a3b8]"
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Events tab */}
          {activeTab === "events" && (
            <div className="overflow-y-auto max-h-40 py-1">
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

          {/* Stats tab */}
          {activeTab === "stats" && (
            <div className="overflow-y-auto max-h-40 py-2 px-3">
              {events.length === 0 ? (
                <div className="py-4 text-center text-xs text-[#475569]">
                  No tool calls yet
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[#475569] text-[10px] uppercase tracking-wide">
                      <th className="text-left pb-2 font-normal">Tool</th>
                      <th className="text-right pb-2 font-normal">Calls</th>
                      <th className="text-right pb-2 font-normal">Total</th>
                      <th className="text-right pb-2 font-normal">Avg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Overall row */}
                    <tr className="text-[#94a3b8] border-b border-white/[0.04]">
                      <td className="py-1.5 font-medium">All</td>
                      <td className="text-right tabular-nums">{totalCalls}</td>
                      <td className="text-right tabular-nums font-mono">
                        {totalDuration > 0
                          ? formatDuration(totalDuration)
                          : "—"}
                      </td>
                      <td className="text-right tabular-nums font-mono">
                        {avgDuration != null
                          ? formatDuration(avgDuration)
                          : "—"}
                      </td>
                    </tr>
                    {toolBreakdown.map(({ tool, count, totalMs, avgMs }) => (
                      <tr key={tool} className="text-[#64748b]">
                        <td className="py-1.5 flex items-center gap-1.5">
                          {TOOL_ICONS[tool] ?? null}
                          {tool}
                        </td>
                        <td className="text-right tabular-nums">{count}</td>
                        <td className="text-right tabular-nums font-mono">
                          {totalMs > 0 ? formatDuration(totalMs) : "—"}
                        </td>
                        <td className="text-right tabular-nums font-mono">
                          {avgMs != null ? formatDuration(avgMs) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors from `debug-panel.tsx`. Remaining errors from `use-event-sync.ts` still importing `useEventStore` — fixed in Task 10.

- [ ] **Step 3: Commit**

```bash
git add components/vnc-panel/debug-panel.tsx
git commit -m "feat: debug-panel reads from session.events, adds Stats tab per tool"
```

---

## Task 10: Modify `use-event-sync.ts` + `session-store.ts`

**Files:**
- Modify: `lib/hooks/use-event-sync.ts`
- Modify: `lib/store/session-store.ts`

Remove all `useEventStore` writes from `useEventSync`. Pre-populate `trackedIds` from existing session events on mount/session-change to prevent duplicate event entries when `AgentWorker` mounts with historical messages. Add deduplication to `session-store.appendEvent`.

- [ ] **Step 1: Update `session-store.ts` — add deduplication to `appendEvent`**

In `lib/store/session-store.ts`, replace the `appendEvent` implementation:

```ts
// Old:
appendEvent: (id, event) => {
  set((state) => ({
    sessions: state.sessions.map((s) =>
      s.id === id
        ? { ...s, events: [...s.events, event], updatedAt: Date.now() }
        : s
    ),
  }));
},

// New — skip if event ID already exists:
appendEvent: (id, event) => {
  set((state) => ({
    sessions: state.sessions.map((s) =>
      s.id === id
        ? s.events.some((e) => e.id === event.id)
          ? s
          : { ...s, events: [...s.events, event], updatedAt: Date.now() }
        : s
    ),
  }));
},
```

- [ ] **Step 2: Replace `use-event-sync.ts` — remove useEventStore, pre-populate trackedIds**

```ts
// lib/hooks/use-event-sync.ts
import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
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
  const { appendEvent, updateEvent: persistEvent } = useSessionStore();
  const trackedIds = useRef<Set<string>>(new Set());
  const startTimes = useRef<Map<string, number>>(new Map());
  const prevSessionId = useRef<string | null>(null);

  // Reset tracking state when session changes, pre-populate from existing events
  // to avoid re-adding historical tool calls as duplicates on mount
  useEffect(() => {
    if (sessionId !== prevSessionId.current) {
      const existingEvents =
        useSessionStore
          .getState()
          .sessions.find((s) => s.id === sessionId)?.events ?? [];
      trackedIds.current = new Set(existingEvents.map((e) => e.id));
      startTimes.current.clear();
      prevSessionId.current = sessionId;
    }
  }, [sessionId]);

  // Sync tool call events from messages into session store
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

          if (sessionId) appendEvent(sessionId, event);
        }

        if (state === "result" && trackedIds.current.has(eventId)) {
          const startTime = startTimes.current.get(eventId) ?? Date.now();
          const duration = Date.now() - startTime;
          const resultStr =
            typeof result === "string" ? result : JSON.stringify(result);
          const isAborted = resultStr === "User aborted";
          const newStatus = isAborted ? "aborted" : "success";

          const patch: Partial<AgentEvent> = { status: newStatus, duration };
          if (sessionId) persistEvent(sessionId, eventId, patch);
        }
      }
    }
  }, [messages, sessionId, appendEvent, persistEvent]);

  // status parameter kept for API compatibility — AgentWorker uses it
  void status;
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add lib/hooks/use-event-sync.ts lib/store/session-store.ts
git commit -m "refactor: use-event-sync removes useEventStore, pre-populates trackedIds from session history"
```

---

## Task 11: Delete `event-store.ts`

**Files:**
- Delete: `lib/store/event-store.ts`

`useEventStore` is no longer imported anywhere after the previous tasks.

- [ ] **Step 1: Verify no imports remain**

```bash
npx tsc --noEmit
```

If there are any remaining import errors referring to `event-store`, fix them first. There should be none.

- [ ] **Step 2: Delete the file**

```bash
git rm lib/store/event-store.ts
```

- [ ] **Step 3: TypeScript check after deletion**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: delete event-store.ts — replaced by useMultiChatStore + session.events"
```

---

## Task 12: Manual Verification

- [ ] **Step 1: Start the dev server**

```bash
pnpm dev
```

Open `http://localhost:3000`.

- [ ] **Step 2: Verify background execution**

1. Send a long-running message to Session A (e.g., "Open Chrome and search for the current weather").
2. While the agent is running (amber pulse visible in sidebar), click "New Session" in the sidebar.
3. Confirm the dialog if shown.
4. Session B appears and shows an empty chat. Session A still shows amber pulse.
5. Switch back to Session A — chat messages appear, agent may still be running or have finished.

- [ ] **Step 3: Verify green dot notification**

1. Start an agent task in Session A.
2. Switch to Session B before the agent finishes.
3. Wait for Session A's agent to complete.
4. A **green dot** appears next to Session A in the sidebar.
5. Click Session A — green dot disappears.

- [ ] **Step 4: Verify concurrent limit**

1. Ensure "Max concurrent running sessions" is set to 2 (Settings gear → dialog).
2. Start a task in Session A, quickly switch to Session B and start a task there.
3. Switch to Session C (create if needed) and try to send a message.
4. A toast appears: "Max 2 sessions can run simultaneously."
5. The message is NOT sent.

- [ ] **Step 5: Verify settings persistence**

1. Open Settings, change max concurrent to 3. Reload the page.
2. Open Settings — the value is still 3.

- [ ] **Step 6: Verify Stats tab**

1. Send a message that causes multiple tool calls (computer + bash).
2. Open the debug panel (click the Debug header).
3. Click "Stats" tab.
4. Table shows totals for "All", "computer", and "bash" rows.
5. Switch to another session — stats clear (new session has no events).
6. Switch back — stats persist (read from session.events).

- [ ] **Step 7: Verify no regressions**

- New session creates correctly.
- Delete session with running agent: agent stops (AgentWorker unmounts), session removed.
- Rename session: still works.
- VNC iframe switching: still instant (unaffected by this feature).
- Debug Events tab: still shows tool calls in reverse order.
- Agent status badge in debug panel: shows Running / Idle / Error correctly.

- [ ] **Step 8: Final commit**

```bash
git commit --allow-empty -m "chore: background session execution + tool stats verified complete"
```
