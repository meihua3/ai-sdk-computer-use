# Background Session Execution + Tool Stats — Design Spec

**Date:** 2026-06-25
**Status:** Approved

---

## Problem

1. Switching sessions kills the running agent mid-execution via `resetEvents()` + ChatPanel remount (`key={activeSessionId}`).
2. No per-session running indicator — users can't see which background sessions are still working.
3. No guard against running unlimited simultaneous agent loops.
4. Debug panel stats are global and ephemeral — lost on session switch, not broken down by tool type.

---

## Goals

- Agent continues the full loop (up to maxSteps) in background when user switches sessions.
- Sidebar shows a pulsing indicator for running sessions and a green dot when an agent finishes while the user is elsewhere.
- User-configurable max concurrent running sessions (default 2); enforced at submit time.
- Debug panel gains a Stats tab: per-tool call count, total duration, average duration.

## Non-Goals

- Pre-warming sessions before user visits them.
- Persisting agent state across page refreshes (in-progress loops are lost on reload — expected).
- Showing background session output in real-time (user sees result when they switch back).

---

## Architecture

### Sub-project A: Background Execution

#### Core Change: AgentWorker Pattern

`ChatPanel` currently holds `useChat` and is remounted on every session switch (`key={activeSessionId}`). This destroys the `useChat` instance and aborts the agent.

**New architecture:** Introduce an `AgentWorker` component — no UI, one per session, always mounted in `page.tsx`. It owns `useChat` and writes into `useMultiChatStore`. `ChatPanel` becomes purely presentational, reading from the store.

```
page.tsx
├── AgentWorker key="session-1"   ← useChat lives here, never unmounts
├── AgentWorker key="session-2"   ← useChat lives here, never unmounts
└── ChatPanel (active session)    ← reads useMultiChatStore, pure UI
```

#### New Stores

**`useMultiChatStore`** — runtime, no persist

```ts
type SessionChatEntry = {
  messages: UIMessage[];
  status: "idle" | "submitted" | "streaming" | "error";
  input: string;
  submit: (input: string) => void;
  stop: () => void;
  setInput: (v: string) => void;
};

type MultiChatStore = {
  sessions: Record<string, SessionChatEntry>;
  set: (sessionId: string, patch: Partial<SessionChatEntry>) => void;
};
```

AgentWorker writes `messages`, `status`, `submit`, `stop`, `setInput` into this store on every render. ChatPanel reads the active session's entry.

**`useNotificationStore`** — runtime, no persist

```ts
type NotificationStore = {
  unread: Set<string>;       // sessionIds where agent finished while user was away
  markUnread: (id: string) => void;
  markRead: (id: string) => void;
};
```

**`useSettingsStore`** — persisted to localStorage

```ts
type SettingsStore = {
  maxConcurrentSessions: number;   // default 2, range 1–5
  setMaxConcurrentSessions: (n: number) => void;
};
```

#### AgentWorker Component

```tsx
// components/agent-worker.tsx
export function AgentWorker({ sessionId }: { sessionId: string }) {
  const session = useSessionStore(s => s.sessions.find(s => s.id === sessionId));
  const activeSessionId = useSessionStore(s => s.activeSessionId);

  const { messages, status, handleSubmit, input, setInput, stop } = useChat({
    api: "/api/chat",
    id: sessionId,                        // unique per session
    initialMessages: session?.messages ?? [],
    body: { sandboxId: session?.sandboxId },
    onFinish: () => {
      // If user has switched away, mark as unread (green dot)
      if (useSessionStore.getState().activeSessionId !== sessionId) {
        useNotificationStore.getState().markUnread(sessionId);
      }
    },
    onError: (err) => {
      if (useSessionStore.getState().activeSessionId !== sessionId) {
        useNotificationStore.getState().markUnread(sessionId);
      }
    },
  });

  // Sync messages to session-store
  useEffect(() => {
    useSessionStore.getState().updateMessages(sessionId, messages);
  }, [messages, sessionId]);

  // Register controls in multi-chat store
  useEffect(() => {
    const submit = (userInput: string) => {
      // Concurrent limit check
      const running = Object.values(useMultiChatStore.getState().sessions)
        .filter(s => s.status === "submitted" || s.status === "streaming").length;
      const max = useSettingsStore.getState().maxConcurrentSessions;
      if (running >= max) {
        toast.error(`Max ${max} sessions can run simultaneously`, {
          description: "Stop a running session before starting a new one.",
        });
        return;
      }
      handleSubmit(new Event("submit") as unknown as React.FormEvent, {
        data: { userInput },
      });
    };
    useMultiChatStore.getState().set(sessionId, {
      messages, status, input, submit, stop, setInput,
    });
  }, [messages, status, input, handleSubmit, stop, setInput, sessionId]);

  // Event sync (tool calls → session-store events)
  useEventSync(messages, sessionId);

  return null;
}
```

#### ChatPanel Changes

Remove `useChat` from `ChatPanel`. Read from `useMultiChatStore`:

```tsx
// components/chat-panel/chat-panel.tsx
export function ChatPanel({ sessionId }: { sessionId: string }) {
  const chatState = useMultiChatStore(s => s.sessions[sessionId]);
  const { messages, status, input, submit, stop, setInput } = chatState ?? {};
  // ... rest is same UI rendering
}
```

Remove `key={activeSessionId}` from the `ChatPanel` mount in `page.tsx` — no longer needed since ChatPanel doesn't hold any session-specific React state.

#### Session Switch Changes in `page.tsx`

Remove `resetEvents()` from `handleSwitchSession`. Remove the "Agent is running" confirm dialog — switching is now always instant and safe. Mark notification as read on switch:

```ts
const handleSwitchSession = useCallback((id: string) => {
  if (id === activeSessionId) return;
  setActiveSession(id);
  useNotificationStore.getState().markRead(id);
}, [activeSessionId, setActiveSession]);
```

The "Agent is running" confirm dialog on `handleCreateSession` is kept — creating a new session while one is running is still a meaningful decision point.

#### Event Store Migration

`useEventStore` currently holds live events for the active session. With multiple AgentWorkers:
- `useEventSync` is moved into `AgentWorker` and called per-session.
- Debug panel reads events from `useSessionStore` (persistent `session.events`) instead of `useEventStore`.
- `agentStatus` in `useEventStore` is replaced by `useMultiChatStore[activeSessionId].status` for the status badge.
- `useEventStore` can be kept temporarily for backwards compatibility but the debug panel no longer reads from it.

#### `useEventSync` Hook Signature Change

Currently `useEventSync(messages)` — change to `useEventSync(messages, sessionId)` so it can write events to the correct session in `useSessionStore`.

---

### Sub-project B: Debug Panel Stats Tab

#### Data Source

Change from `useEventStore.events` (ephemeral) to `useSessionStore` active session's `events` (persistent). This means stats survive session switches.

#### Stats Computation

```ts
// Computed from session.events
const byTool = events.reduce((acc, e) => {
  if (!acc[e.tool]) acc[e.tool] = [];
  acc[e.tool].push(e);
  return acc;
}, {} as Record<string, AgentEvent[]>);

function toolStats(events: AgentEvent[]) {
  const completed = events.filter(e => e.duration != null);
  const total = completed.reduce((s, e) => s + (e.duration ?? 0), 0);
  return {
    count: events.length,
    totalMs: total,
    avgMs: completed.length > 0 ? Math.round(total / completed.length) : null,
  };
}
```

#### UI: Two Tabs

Debug panel header area gets a tab toggle ("Events" | "Stats"). Default: "Events" (existing view).

**Stats tab layout:**

| Tool | Calls | Total | Avg |
|------|-------|-------|-----|
| All  | 12    | 4823ms | 402ms |
| computer | 9 | 3200ms | 356ms |
| bash | 3 | 1623ms | 541ms |

Tool names use the same icons already in the event list (`Monitor` for computer, `Terminal` for bash).

---

## UI Changes

### Session Sidebar

Each `SessionItem` receives two new props:
- `isRunning: boolean` — `status === "submitted" || status === "streaming"` for that session
- `hasUnread: boolean` — `unread.has(sessionId)` from notification store

Indicators:
- **isRunning**: small pulsing amber dot (⬤) to the right of the session title
- **hasUnread**: small solid green dot (⬤) — overrides isRunning if both true

Settings gear icon (`Settings` from lucide-react) at the bottom of the sidebar, opens `SettingsDialog`.

### Settings Dialog

```tsx
// components/settings-dialog.tsx
<Dialog>
  <DialogTrigger asChild>
    <Button variant="ghost" size="icon"><Settings /></Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader><DialogTitle>Settings</DialogTitle></DialogHeader>
    <div>
      <Label>Max concurrent running sessions</Label>
      <Input
        type="number" min={1} max={5}
        value={maxConcurrentSessions}
        onChange={e => setMaxConcurrentSessions(Number(e.target.value))}
      />
      <p className="text-xs text-muted-foreground">
        When limit is reached, new runs are blocked until one finishes or is stopped.
      </p>
    </div>
  </DialogContent>
</Dialog>
```

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `components/agent-worker.tsx` | **Create** | useChat per session, event sync, store writes |
| `lib/store/multi-chat-store.ts` | **Create** | Per-session chat state + controls |
| `lib/store/notification-store.ts` | **Create** | Unread finished-run tracking |
| `lib/store/settings-store.ts` | **Create** | Persisted user settings |
| `components/settings-dialog.tsx` | **Create** | Concurrent limit config UI |
| `components/chat-panel/chat-panel.tsx` | **Modify** | Remove useChat, read from multi-chat-store |
| `components/chat-panel/session-sidebar.tsx` | **Modify** | Running + unread indicators, settings gear |
| `lib/hooks/use-event-sync.ts` | **Modify** | Accept sessionId param, write to correct session |
| `components/vnc-panel/debug-panel.tsx` | **Modify** | Stats tab, read from session.events |
| `app/page.tsx` | **Modify** | Mount AgentWorkers, update switch handler |

---

## Error Handling

- **Concurrent limit exceeded**: Toast `"Max N sessions can run simultaneously"` with description to stop one first. No run is started.
- **Background agent error**: `onError` in AgentWorker marks session as unread (green dot). User sees error state when they switch back.
- **Session deleted while running**: AgentWorker unmounts, `useChat` aborts the request. Acceptable — user explicitly deleted the session.

---

## Data Flow Summary

```
User submits message in ChatPanel
  → calls useMultiChatStore.sessions[id].submit(input)
    → AgentWorker checks concurrent limit
    → calls useChat.handleSubmit
      → streams from /api/chat
      → messages update in useMultiChatStore
      → ChatPanel re-renders (reads store)
      → useEventSync writes events to session.events (useSessionStore)
    → onFinish:
        if activeSessionId !== sessionId → markUnread(sessionId)

User switches session
  → setActiveSession(newId)
  → markRead(newId)
  → ChatPanel reads useMultiChatStore[newId] — instant, no network call
  → Previous session's AgentWorker continues running undisturbed
```
