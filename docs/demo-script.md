# Demo Script — AI Agent Dashboard (5 minutes)

> **CambioML Frontend Engineer Coding Challenge 2026.1**
> 5-minute demo video (with audio)

---

## Overview

| Time | Section | Required Content |
|------|---------|-----------------|
| 0:00–0:30 | Intro | Project overview |
| 0:30–1:30 | UI Structure | Dual-column layout + resizable panels |
| 1:30–2:30 | Debug Panel | Events tab, Stats tab, EventRow expand |
| 2:30–4:00 | Live Demo | "What's the weather in Dubai?" |
| 4:00–4:30 | Chat Sessions | Create / switch / delete |
| 4:30–5:00 | Code Structure | Key design decisions |

---

## Section 1 — Intro (0:00–0:30)

### Action
Open the app at `localhost:3000` (or deployed URL). The full desktop layout is visible.

### Script
> "Hi, this is my submission for the CambioML frontend engineering challenge.
> I built a production-grade AI Agent Dashboard on top of the Vercel AI SDK Computer Use demo.
> The agent uses Claude Sonnet to control a real browser inside a Vercel Sandbox —
> you can watch it work in real time through the VNC stream on the right."

---

## Section 2 — UI Structure (0:30–1:30)

### Action — Dual-column layout
Point to the left chat panel and right VNC + debug panel.

### Script
> "The layout has two columns: the left side is the chat interface where you talk to the agent,
> and the right side shows the live VNC desktop stream plus a debug panel below it."

### Action — Drag the resize handle
Drag the `ResizableHandle` between the two panels left and right.

### Script
> "The panels are horizontally resizable — you can give more space to the VNC when you want
> to watch the agent work, or expand the chat when reading a long response."

### Action — Point to the session sidebar
Show the left sidebar with session list, new session button, settings.

### Script
> "On the far left there's a session sidebar for managing multiple agent sessions.
> Each session has its own chat history, event log, and sandbox — they're fully isolated."

---

## Section 3 — Debug Panel (1:30–2:30)

### Action — Expand the debug panel
Click the debug bar at the bottom of the right column to expand it.

### Script
> "The debug panel is at the bottom of the right side. Let me open it."

### Action — Show Events tab
The Events tab is active by default. Show a list of `EventRow` items (tool call events).

### Script
> "This is the Events tab. Every tool call the agent makes is captured here —
> screenshot, click, type, scroll, bash commands. Each event shows the tool name,
> status, and duration."

### Action — Click an EventRow to expand it
Click one event to expand it, revealing id, timestamp, tool, status, duration, and payload.

### Script
> "If I click an event I can drill into the details: the event ID, when it happened,
> what the payload was — the exact coordinates it clicked, or the bash command it ran."

### Action — Switch to Stats tab
Click the "Stats" tab in the debug panel.

### Script
> "The Stats tab gives me an action-level breakdown — how many screenshots were taken,
> how many clicks, how many wait cycles, bash calls. This lets you understand
> where the agent spends most of its time."

---

## Section 4 — Live Demo: "What's the weather in Dubai?" (2:30–4:00)

### Action — Type the prompt
In the chat input, type: `What's the weather in Dubai?` and press Send.

### Script
> "Now let's run the actual demo. I'll ask it: What's the weather in Dubai?"

### Action — Watch the VNC stream update
Show the VNC iframe as the agent takes a screenshot, opens Chrome, navigates to a weather site.

### Script
> "The agent starts by taking a screenshot to see the current state of the desktop.
> Then it opens Chrome and navigates to find the weather."

### Action — Watch the events populate in real time
The debug panel Events tab fills with new events as the agent works.

### Script
> "You can see events appearing in the debug panel in real time as the agent acts —
> screenshot, then a bash command to open the browser, then more screenshots
> as it reads the page."

### Action — Show the agent typing in Chrome
The VNC stream shows Chrome with a weather page or Google search.

### Script
> "The agent uses xdotool to control the mouse and keyboard — it types into the browser,
> clicks search results, reads the page. All of this runs inside a Vercel Sandbox,
> so it's completely isolated from your machine."

### Action — Agent returns the answer in chat
The chat panel shows Claude's response with the weather information.

### Script
> "And there's the answer — the agent read the page and reported back.
> The entire flow — from my question to the answer — went through Claude's computer use tools,
> a real browser, and a live VNC stream. No mocking, no simulation."

---

## Section 5 — Chat Sessions (4:00–4:30)

### Action — Create a new session
Click the "New Session" button in the sidebar.

### Script
> "The app supports multiple sessions. Let me create a second one."

### Action — Show two sessions in sidebar, switch between them
Click Session 1, then Session 2. Show that each has its own chat history.

### Script
> "Each session is independent — its own conversation, its own event log,
> its own sandbox. Switching is instant; the agent in Session 1 keeps running
> in the background if it was active."

### Action — Delete a session
Click the delete button on a session. Show the confirmation dialog. Confirm.

### Script
> "Deleting a session closes the sandbox and clears the data.
> If there are no more sessions, the app shows an empty state instead of
> auto-creating one — which keeps the UX clean."

### Action — Show mobile layout (if screen recording allows DevTools)
Toggle DevTools device emulation to iPhone 14 Pro. Show the hamburger menu and session drawer.

### Script
> "As a bonus, I added mobile support. The layout stacks vertically —
> VNC at the top, chat below. The session list slides in from the left
> via a hamburger menu."

---

## Section 6 — Code Structure (4:30–5:00)

### Action — Show the key files in editor or file tree

### Script
> "Let me quickly walk through the key design decisions."

---

### AgentWorker Pattern — headless background execution

**File:** `components/agent-worker.tsx`

```tsx
// Headless component — one per session, never unmounts
export function AgentWorker({ sessionId }: { sessionId: string }) {
  const { messages, handleSubmit, stop } = useChat({ ... });
  // Syncs chat state into multi-chat-store for cross-session access
  return null;
}
```

> "The key architectural insight is the AgentWorker — a headless React component
> that owns one `useChat` instance per session. It never unmounts when you switch sessions,
> so agents keep running in the background. Session switching is just a UI concern."

---

### Zustand Stores — state isolation

**Files:** `lib/store/session-store.ts`, `lib/store/multi-chat-store.ts`

```ts
// session-store: persisted to localStorage
// - sessions[], activeSessionId, events[], messages[]

// multi-chat-store: runtime only, NOT persisted
// - per-session chat state: status, submit fn, stop fn
```

> "State is split across two Zustand stores: `session-store` persists everything
> to localStorage — chat history, events, sandbox IDs.
> `multi-chat-store` holds runtime-only state like the current chat status
> and the submit function. This separation means the VNC panel never re-renders
> when a message streams in — it's subscribed only to the sandbox URL."

---

### Event System — discriminated unions, no `any`

**File:** `lib/types.ts`

```ts
type AgentEvent =
  | { type: "computer"; action: "screenshot" | "left_click" | "type" | "scroll" | "wait"; ... }
  | { type: "bash"; command: string; ... };
```

> "The event system uses TypeScript discriminated unions — no `any` anywhere.
> Every tool call is captured with id, timestamp, type, payload, status, and duration.
> TypeScript narrows the type automatically depending on whether it's a computer action
> or a bash command."

---

### Scoring Alignment

| Criterion | Implementation |
|-----------|---------------|
| Architecture (40%) | AgentWorker pattern, dual-store separation, selector-based VNC isolation |
| Integration & Problem Solving (30%) | Real AI SDK streaming, Vercel Sandbox, noVNC iframe, event pipeline |
| Code Quality (20%) | TypeScript strict, discriminated unions, no `any`, Zustand selectors |
| Docs (10%) | README, this demo script, inline code clarity |

---

## Recording Checklist

- [ ] Audio is on and clear
- [ ] Drag the resize handle visibly (Section 2)
- [ ] Expand debug panel and click an EventRow (Section 3)
- [ ] Actually run "What's the weather in Dubai?" live (Section 4)
- [ ] Create, switch, and delete a session (Section 5)
- [ ] Show at least 2 code files in Section 6
- [ ] Total runtime: ~5 minutes
