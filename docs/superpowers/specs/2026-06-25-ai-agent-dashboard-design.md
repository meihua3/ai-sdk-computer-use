# AI Agent Dashboard — Design Spec

**Date:** 2026-06-25
**Project:** ai-sdk-computer-use
**Scope:** Upgrade the existing computer-use demo into a production-grade AI Agent Dashboard

---

## 1. Overview

Extend the existing Next.js + AI SDK computer-use demo into a dashboard with:
- Split-panel layout (Chat left, VNC right)
- Multi-session management with localStorage persistence
- Event pipeline tracking every tool call
- Collapsible debug panel (right side, below VNC)
- Strict TypeScript (no `any`, discriminated unions)
- VNC isolated from chat re-renders

---

## 2. Layout

```
┌──────────────────────────────────────────────────────────┐
│ [Session Sidebar] │  [Chat Panel]    │  [VNC Panel]       │
│                   │                  │                     │
│  + New Session    │  Message stream  │  VNC iframe         │
│  ─────────────    │  (tool call      │                     │
│  Session 1 ●     │   collapsible    │  ───────────────    │
│  Session 2        │   cards)         │  [Debug Panel]      │
│  Session 3        │                  │  event list         │
│                   │  ─────────────   │  agent status       │
│                   │  Input box       │  [collapse toggle]  │
└──────────────────────────────────────────────────────────┘
```

- **Session sidebar**: fixed ~200px, collapsible; session items support double-click rename, right-click delete
- **Chat panel**: `ResizablePanel`, min 300px; tool call cards collapsed by default, expandable on click
- **VNC panel**: VNC iframe on top; Debug panel below with drag handle between them; debug panel collapse makes VNC fill full right side
- **Mobile**: session sidebar hidden, chat only, VNC hidden (matches current behavior)
- Left and right main panels are horizontally resizable via drag handle

---

## 3. Type System

All types live in `lib/types/`. No `any`. Discriminated unions throughout.

```typescript
// Session
type Session = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: UIMessage[]
  events: AgentEvent[]
  sandboxId: string | null
}

// Agent status (discriminated union)
type AgentStatus =
  | { type: 'idle' }
  | { type: 'running'; startedAt: number }
  | { type: 'error'; message: string }

// Event status
type EventStatus = 'pending' | 'success' | 'error' | 'aborted'

// Tool call event (discriminated union by tool)
type AgentEvent =
  | {
      id: string
      timestamp: number
      duration: number | null
      status: EventStatus
      tool: 'computer'
      payload: ComputerToolPayload
    }
  | {
      id: string
      timestamp: number
      duration: number | null
      status: EventStatus
      tool: 'bash'
      payload: BashToolPayload
    }

type ComputerToolPayload = {
  action: string
  coordinate?: [number, number]
  text?: string
  result?: unknown
}

type BashToolPayload = {
  command: string
  result?: string
}
```

---

## 4. State Management

Two Zustand stores. New dependency: `zustand` (with `persist` middleware).

### `useSessionStore`

Manages session list, active session, CRUD, and localStorage persistence.

```typescript
type SessionStore = {
  sessions: Session[]
  activeSessionId: string | null
  activeSandboxId: string | null        // derived, used by VncPanel selector

  createSession: () => string            // returns new session id
  switchSession: (id: string) => void    // guarded: confirms if agent running
  deleteSession: (id: string) => void    // guarded: confirms if deleting active
  renameSession: (id: string, title: string) => void
  updateSessionTitle: (id: string, title: string) => void  // auto-title from first message
  updateMessages: (id: string, messages: UIMessage[]) => void
  appendEvent: (id: string, event: AgentEvent) => void
  updateEvent: (id: string, eventId: string, patch: Partial<AgentEvent>) => void
  setSandboxId: (id: string, sandboxId: string | null) => void
}
```

**Persistence rules:**
- `zustand/persist` serializes the full session list (messages + events)
- On every write: if `sessions.length > 20`, evict the oldest
- After write: check `navigator.storage.estimate()`; if usage > 80%, show toast warning

### `useEventStore`

Runtime-only event pipeline for the active session. Resets on session switch. Not persisted.

```typescript
type EventStore = {
  events: AgentEvent[]
  agentStatus: AgentStatus

  addEvent: (event: AgentEvent) => void
  updateEvent: (id: string, patch: Partial<AgentEvent>) => void
  setAgentStatus: (status: AgentStatus) => void
  reset: () => void
}
```

---

## 5. Event Pipeline

### Data Flow

```
useChat (AI SDK)
  ↓ messages change
useEventSync (custom hook)
  ↓ diffs tool-invocation parts, new or state-changed
useEventStore
  ├── new tool call   → addEvent({ status: 'pending' })
  ├── tool completes  → updateEvent({ status: 'success', duration })
  ├── tool errors     → updateEvent({ status: 'error' })
  └── stop() called   → updateEvent({ status: 'aborted' })
  ↓
Debug Panel ← subscribes to events
Agent Status indicator ← subscribes to agentStatus
```

### `useEventSync` Hook

Runs inside ChatPanel. Watches `messages` from `useChat`. On each change, it diffs the previous tool-invocation state and dispatches to **both** `useEventStore` (fast runtime access for the debug panel) and `useSessionStore.appendEvent()` (persists events into `session.events[]` for localStorage). Also drives `agentStatus` from `useChat`'s `status` field:

- `status === 'streaming'` → `agentStatus: { type: 'running', startedAt }`
- `status === 'ready'` → `agentStatus: { type: 'idle' }`
- `status === 'error'` → `agentStatus: { type: 'error', message }`

---

## 6. Session Management

| Action | Behavior |
|--------|----------|
| Create | Generate new session (empty title), switch to it immediately |
| Switch (agent idle) | Kill old sandbox, init new sandbox for target session |
| Switch (agent running) | Confirmation dialog → confirm → stop agent → kill sandbox → switch |
| Delete (non-active) | Remove from store, no confirmation |
| Delete (active) | Confirmation dialog → confirm → kill sandbox → delete → auto-create new session |
| Rename | Double-click title → inline input → Enter/blur saves |
| Auto-title | After first user message, set title to first 20 chars of message content |

### Sandbox Lazy-Loading

- Each session stores `sandboxId: string | null`
- On switch to a session: if `sandboxId` is null or sandbox is no longer running, call `getDesktopURL()` to create new sandbox
- On leave: call `killDesktop(sandboxId)`, set session's `sandboxId` to `null`

---

## 7. Performance — VNC Isolation

VncPanel must not re-render when chat or events update.

```
SessionStore
  └── activeSandboxId (selector)

VncPanel (React.memo)
  └── only subscribes to activeSandboxId
      chat updates → sandboxId unchanged → VncPanel skips render ✓

ChatPanel
  └── subscribes to messages, events, agentStatus
      updates freely, isolated from VncPanel ✓
```

- `VncPanel` wrapped in `React.memo`; props: `sandboxId: string | null`, `isInitializing: boolean` only
- `streamUrl` recomputed only when `sandboxId` changes
- Debug panel is a sibling component, subscribes to event store independently — does not pass through VncPanel

---

## 8. New File Structure

```
app/
  page.tsx                          ← rework: session sidebar + resizable panels
  api/chat/route.ts                 ← unchanged
components/
  chat-panel/
    chat-panel.tsx                  ← messages, input, useEventSync
    tool-call-card.tsx              ← collapsible tool call display
    session-sidebar.tsx             ← session list, create, rename, delete
  vnc-panel/
    vnc-panel.tsx                   ← React.memo, iframe only
    debug-panel.tsx                 ← event list, agent status, collapse toggle
lib/
  types/
    index.ts                        ← Session, AgentEvent, AgentStatus, EventStatus
  store/
    session-store.ts                ← Zustand + persist
    event-store.ts                  ← Zustand, runtime only
  hooks/
    use-event-sync.ts               ← bridges useChat → event store
    use-session-sandbox.ts          ← sandbox lazy-load/kill on session switch
  sandbox/                          ← unchanged
```

---

## 9. Boundary Conditions Summary

| # | Condition | Decision |
|---|-----------|----------|
| 1 | Session/Sandbox relationship | Lazy-load: switch destroys old sandbox |
| 2 | Event store scope | Per-session |
| 3 | Delete active session | Confirm dialog → kill → auto-create new |
| 4 | localStorage full | Max 20 sessions, evict oldest; warn at 80% usage |
| 5 | No active tool call in debug panel | Show placeholder |
| 6 | Switch session while agent running | Confirm dialog → stop → switch |
| 7 | Event count per session | Unlimited; warn user when storage near full |
| 8 | Session naming | Auto from first message (20 chars); double-click to rename |
| 9 | Debug panel = tool call detail area | Same component, collapsible, collapses below VNC |
| 10 | Panel layout direction | Chat LEFT, VNC RIGHT |
