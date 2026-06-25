Author: Hongjian Cai

# AI Agent Dashboard

A production-grade AI Agent Dashboard built on top of the [Vercel AI SDK Computer Use](https://github.com/vercel-labs/ai-sdk-computer-use) demo.

The agent uses **Claude Sonnet** to control a real browser inside a **Vercel Sandbox** — you can watch it work in real time through a live VNC stream. The dashboard supports multiple independent sessions, a full event debug panel, and a responsive layout that works on both desktop and mobile.

## Features

- **Dual-column layout** — resizable chat panel on the left, VNC desktop stream + debug panel on the right
- **Live VNC stream** — real browser controlled by Claude via xdotool and ImageMagick, streamed via noVNC
- **Event debug panel** — every tool call (screenshot, click, type, scroll, bash) captured with id, timestamp, status, duration, and payload; Stats tab shows per-action breakdowns
- **Multi-session support** — create, switch, and delete sessions; each session has its own chat history, event log, and sandbox; agents keep running in the background when you switch
- **Persistent chat history** — sessions saved to localStorage; base64 screenshot data stripped before storage
- **TypeScript strict** — discriminated unions for all event types, no `any`
- **Mobile responsive** — vertical stack layout with VNC at top, hamburger menu triggers a left-slide session drawer

## Architecture

```
User ↔ Next.js Chat UI ↔ AI SDK ↔ Claude Sonnet
                                       ↓
                                 Vercel Sandbox
                             ┌─────────────────────┐
                             │  Xvnc (:99)         │
                             │  openbox             │
                             │  Chrome              │
                             │  websockify → noVNC  │
                             └─────────────────────┘
                                       ↓
                             noVNC iframe in browser
```

**Key design decisions:**

- **AgentWorker pattern** — a headless React component (one per session) owns a `useChat` instance and never unmounts. Switching sessions is a UI-only concern; agents continue running in the background.
- **Dual Zustand stores** — `session-store` persists chat history and events to localStorage; `multi-chat-store` holds runtime-only state (status, submit fn). The VNC panel subscribes only to the sandbox URL, so it never re-renders on message updates.
- **Discriminated union event types** — `AgentEvent` is a union of `computer` (screenshot / click / type / scroll / wait) and `bash` actions. TypeScript narrows the type automatically; no casting needed.

## Tech Stack

- [Next.js 15](https://nextjs.org) App Router
- [AI SDK](https://sdk.vercel.ai) by Vercel
- [Anthropic Claude Sonnet](https://www.anthropic.com) with computer use + bash tools
- [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox)
- [Zustand](https://zustand-demo.pmnd.rs) for state management
- [shadcn/ui](https://ui.shadcn.com) + [Tailwind CSS](https://tailwindcss.com)

## Running Locally

### Prerequisites

- Node.js 18+
- A [Vercel](https://vercel.com) account (for Sandbox access)
- An [Anthropic API key](https://console.anthropic.com/)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up Vercel credentials

```bash
pnpm install -g vercel
vercel link
vercel env pull
```

### 3. Create a sandbox snapshot

```bash
npx tsx lib/sandbox/create-snapshot.ts
```

Takes ~10 minutes. Add the output snapshot ID to `.env.local`:

```
SANDBOX_SNAPSHOT_ID=snap_xxxxxxxxxxxxx
```

### 4. Add your Anthropic API key

```
ANTHROPIC_API_KEY=sk-ant-...
```

### 5. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude |
| `SANDBOX_SNAPSHOT_ID` | Yes | Vercel Sandbox snapshot with desktop environment |
| `VERCEL_OIDC_TOKEN` | Yes* | Auto-set by `vercel env pull` |
| `VERCEL_TOKEN` | Alt* | Alternative to OIDC — a Vercel personal access token |
| `VERCEL_TEAM_ID` | Alt* | Required with `VERCEL_TOKEN` |
| `VERCEL_PROJECT_ID` | Alt* | Required with `VERCEL_TOKEN` |
