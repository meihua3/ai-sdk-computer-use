# Seamless VNC Session Switch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep one VNC iframe per visited session mounted in the DOM so switching sessions is instant — no black screen, no reload.

**Architecture:** A new runtime-only Zustand store (`useSandboxUrlStore`) holds `sessionId → streamUrl | null` for every visited session. `useSessionSandbox` drives initialization lazily (first click only) and writes into this store. `VncPanel` reads the store directly, renders N iframes, toggles visibility with `display: none/block`. `page.tsx` no longer passes stream props to `VncPanel`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Zustand (no persist), React.memo, noVNC iframe

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/store/sandbox-url-store.ts` | **Create** | Runtime URL map: sessionId → url\|null\|absent |
| `lib/hooks/use-session-sandbox.ts` | **Rewrite** | Lazy init per session, keepalive all visited |
| `components/vnc-panel/vnc-panel.tsx` | **Rewrite** | Multi-iframe, reads store, no URL props |
| `app/page.tsx` | **Modify** | Remove streamUrl/isInitializing passthrough |

---

## Task 1: Create `sandbox-url-store.ts`

**Files:**
- Create: `lib/store/sandbox-url-store.ts`

- [ ] **Step 1: Write the store**

```ts
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
```

**Semantics:**
- key absent → session never visited, no iframe rendered
- `null` → initializing (show spinner)
- `string` → URL ready, render iframe

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors related to `sandbox-url-store.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/store/sandbox-url-store.ts
git commit -m "feat: add sandbox-url-store for per-session VNC URL tracking"
```

---

## Task 2: Rewrite `use-session-sandbox.ts`

**Files:**
- Modify: `lib/hooks/use-session-sandbox.ts`

Replace the entire file. Key changes:
- `visitedIds` ref tracks which sessions have been activated this page lifetime
- On `activeSessionId` change: if no URL entry exists → mark initializing → fetch URL → write to store
- If URL entry already exists → do nothing (iframe already mounted and visible)
- Keepalive now pings **all** visited sessions (not just the active one)
- No longer returns `streamUrl` or `isInitializing` — consumers read store directly

- [ ] **Step 1: Rewrite the hook**

Replace the full content of `lib/hooks/use-session-sandbox.ts`:

```ts
import { useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { getDesktopURL, killDesktop } from "@/lib/sandbox/utils";
import { useSessionStore } from "@/lib/store/session-store";
import { useSandboxUrlStore } from "@/lib/store/sandbox-url-store";

export function useSessionSandbox() {
  const visitedIds = useRef<Set<string>>(new Set());

  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  // Lazy-initialize sandbox on first visit to each session
  useEffect(() => {
    if (!activeSessionId) return;

    visitedIds.current.add(activeSessionId);

    // Already has an entry (initializing or ready) — iframe is in DOM, just becomes visible
    if (useSandboxUrlStore.getState().urls[activeSessionId] !== undefined) return;

    // First visit: start initialization
    const existingSandboxId = useSessionStore.getState().activeSandboxId();
    useSandboxUrlStore.getState().setInitializing(activeSessionId);

    let cancelled = false;
    getDesktopURL(existingSandboxId ?? undefined)
      .then(({ streamUrl, id }) => {
        if (cancelled) return;
        useSandboxUrlStore.getState().setUrl(activeSessionId, streamUrl);
        useSessionStore.getState().setSandboxId(activeSessionId, id);
      })
      .catch(() => {
        if (cancelled) return;
        useSandboxUrlStore.getState().clearUrl(activeSessionId);
        toast.error("Failed to connect desktop", {
          description: "Click the session again to retry.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);

  // Keepalive — ping ALL visited sessions every 25s to prevent idle timeout
  useEffect(() => {
    const ping = () => {
      const { sessions } = useSessionStore.getState();
      for (const sessionId of visitedIds.current) {
        const session = sessions.find((s) => s.id === sessionId);
        if (!session?.sandboxId) continue;
        fetch("/api/sandbox-keepalive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sandboxId: session.sandboxId }),
        }).catch(() => {});
      }
    };
    const id = setInterval(ping, 25_000);
    return () => clearInterval(id);
  }, []);

  // Force-create a brand new sandbox for the active session (New Desktop button)
  const initSandbox = useCallback(async () => {
    if (!activeSessionId) return;
    useSandboxUrlStore.getState().setInitializing(activeSessionId);
    try {
      const { streamUrl, id } = await getDesktopURL(undefined);
      useSandboxUrlStore.getState().setUrl(activeSessionId, streamUrl);
      useSessionStore.getState().setSandboxId(activeSessionId, id);
    } catch {
      useSandboxUrlStore.getState().clearUrl(activeSessionId);
      toast.error("Failed to create desktop");
    }
  }, [activeSessionId]);

  // Kill a specific session's sandbox (used on session delete)
  const killSandboxForSession = useCallback(
    async (sessionId: string, sandboxId: string) => {
      try {
        await killDesktop(sandboxId);
      } catch {}
      useSandboxUrlStore.getState().clearUrl(sessionId);
      useSessionStore.getState().setSandboxId(sessionId, null);
    },
    []
  );

  return { initSandbox, killSandboxForSession };
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: errors only in `vnc-panel.tsx` and `page.tsx` (they still reference old API). Those are fixed in Tasks 3 and 4.

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/use-session-sandbox.ts
git commit -m "refactor: use-session-sandbox drives lazy init via sandbox-url-store"
```

---

## Task 3: Rewrite `vnc-panel.tsx`

**Files:**
- Modify: `components/vnc-panel/vnc-panel.tsx`

Key changes:
- Props reduced to `{ onRefresh: () => void }` — no more `streamUrl` / `isInitializing`
- Subscribes to `useSandboxUrlStore` and `activeSessionId` from session store
- Renders one absolutely-positioned container per visited session; active = `display: block`, others = `display: none`
- "New Desktop" button is positioned `z-10` above all iframes, shown only when active session has a URL

Note: `React.memo` is retained — it blocks re-renders from parent props (e.g. `page.tsx` re-rendering on `debugCollapsed` toggle, where `onRefresh` prop stays the same reference). Internal store subscriptions cause re-renders only when URLs change or session switches — both expected.

- [ ] **Step 1: Rewrite the component**

Replace the full content of `components/vnc-panel/vnc-panel.tsx`:

```tsx
"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useSessionStore } from "@/lib/store/session-store";
import { useSandboxUrlStore } from "@/lib/store/sandbox-url-store";

type VncPanelProps = {
  onRefresh: () => void;
};

export const VncPanel = memo(function VncPanel({ onRefresh }: VncPanelProps) {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const urls = useSandboxUrlStore((s) => s.urls);

  // Sessions that have been visited (have any entry in urls map, null or string)
  const visitedSessionIds = Object.keys(urls);

  const activeUrl = activeSessionId !== null ? urls[activeSessionId] : undefined;
  // activeUrl === undefined → not visited / no iframe yet
  // activeUrl === null     → initializing
  // activeUrl === string   → ready
  const isInitializing = activeSessionId !== null && activeUrl === null;

  return (
    <div className="relative w-full h-full bg-[#0a0a0f]">
      {/* One container per visited session */}
      {visitedSessionIds.map((sessionId) => {
        const url = urls[sessionId];
        const isActive = sessionId === activeSessionId;
        return (
          <div
            key={sessionId}
            className="absolute inset-0"
            style={{ display: isActive ? "block" : "none" }}
          >
            {url ? (
              <iframe
                src={url}
                className="w-full h-full border-0"
                allow="autoplay"
              />
            ) : (
              /* null = initializing */
              <div className="w-full h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-[#94a3b8]">
                  <div className="w-8 h-8 border-2 border-[#22c55e]/40 border-t-[#22c55e] rounded-full animate-spin" />
                  <span className="text-sm">Initializing desktop...</span>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Fallback: active session not yet in visited set (should be brief) */}
      {activeSessionId !== null && !(activeSessionId in urls) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-[#94a3b8]">
            <div className="w-8 h-8 border-2 border-[#22c55e]/40 border-t-[#22c55e] rounded-full animate-spin" />
            <span className="text-sm">Loading stream...</span>
          </div>
        </div>
      )}

      {/* New Desktop button — shown only when active session has a URL (ready or initializing) */}
      {activeSessionId !== null && activeSessionId in urls && (
        <Button
          onClick={onRefresh}
          disabled={isInitializing}
          size="sm"
          className="absolute top-2 right-2 z-10 bg-black/60 hover:bg-black/80 text-white border border-white/10 backdrop-blur-sm text-xs gap-1.5"
        >
          <RefreshCw className="w-3 h-3" />
          {isInitializing ? "Creating..." : "New Desktop"}
        </Button>
      )}
    </div>
  );
});
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: errors only in `page.tsx` (still passes old props to VncPanel). Fixed in Task 4.

- [ ] **Step 3: Commit**

```bash
git add components/vnc-panel/vnc-panel.tsx
git commit -m "refactor: vnc-panel renders per-session iframes, reads from sandbox-url-store"
```

---

## Task 4: Update `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`

Changes:
1. Remove `streamUrl` and `isInitializing` from `useSessionSandbox` destructure
2. Remove those props from `<VncPanel>` in both desktop and mobile (mobile already has no VncPanel, just verify)
3. Import `useSandboxUrlStore` and call `clearUrl` in `handleDeleteSession` to clean up URL map when a session is deleted

- [ ] **Step 1: Update imports and hook destructure**

In `app/page.tsx`, change:

```ts
// Old
import { useSessionSandbox } from "@/lib/hooks/use-session-sandbox";
// ...
const { streamUrl, isInitializing, initSandbox } = useSessionSandbox();
```

To:

```ts
// New — add useSandboxUrlStore import
import { useSessionSandbox } from "@/lib/hooks/use-session-sandbox";
import { useSandboxUrlStore } from "@/lib/store/sandbox-url-store";
// ...
const { initSandbox } = useSessionSandbox();
```

- [ ] **Step 2: Update `handleDeleteSession` to clear URL map**

Change:

```ts
const handleDeleteSession = useCallback(
  async (id: string) => {
    const session = useSessionStore.getState().sessions.find((s) => s.id === id);
    const isActive = id === activeSessionId;
    if (isActive) {
      const confirmed = window.confirm(
        "Delete this session? The desktop will be closed."
      );
      if (!confirmed) return;
      resetEvents();
    }
    if (session?.sandboxId) {
      killDesktop(session.sandboxId).catch(() => {});
    }
    deleteSession(id);
  },
  [activeSessionId, resetEvents, deleteSession]
);
```

To:

```ts
const handleDeleteSession = useCallback(
  async (id: string) => {
    const session = useSessionStore.getState().sessions.find((s) => s.id === id);
    const isActive = id === activeSessionId;
    if (isActive) {
      const confirmed = window.confirm(
        "Delete this session? The desktop will be closed."
      );
      if (!confirmed) return;
      resetEvents();
    }
    if (session?.sandboxId) {
      killDesktop(session.sandboxId).catch(() => {});
    }
    useSandboxUrlStore.getState().clearUrl(id);
    deleteSession(id);
  },
  [activeSessionId, resetEvents, deleteSession]
);
```

- [ ] **Step 3: Update `<VncPanel>` JSX**

Change both desktop `<VncPanel>` instances from:

```tsx
<VncPanel
  streamUrl={streamUrl}
  isInitializing={isInitializing}
  onRefresh={initSandbox}
/>
```

To:

```tsx
<VncPanel onRefresh={initSandbox} />
```

There is only one `VncPanel` in the desktop layout (mobile uses `ChatPanel` only). Confirm it's the only one.

- [ ] **Step 4: TypeScript check — expect clean**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "refactor: page.tsx removes streamUrl/isInitializing passthrough to VncPanel"
```

---

## Task 5: Manual Verification

- [ ] **Step 1: Start dev server**

```bash
pnpm dev
```

Open `http://localhost:3000`.

- [ ] **Step 2: Verify initial load**

- VNC panel shows spinner immediately on page load
- After ~5-30s (depending on whether sandbox already exists), iframe appears with desktop
- "New Desktop" button appears in top-right of VNC panel
- No TypeScript/console errors

- [ ] **Step 3: Verify instant session switch**

1. Wait for Session A's desktop to be fully loaded (iframe showing desktop)
2. Click "New Session" in sidebar — Session B is created, VNC shows spinner (first visit)
3. Wait for Session B's desktop to load
4. Click back to Session A — **desktop appears instantly, no spinner, no black flash**
5. Click back to Session B — **same, instant**

- [ ] **Step 4: Verify "New Desktop" button**

1. In any session with a loaded desktop, click "New Desktop"
2. Button shows "Creating..." and is disabled
3. After sandbox creation, new desktop appears in iframe
4. Button returns to "New Desktop"

- [ ] **Step 5: Verify session delete cleans up**

1. Create 2 sessions, load both
2. Delete Session A
3. Confirm dialog appears, click OK
4. Session A's iframe is removed (URL store entry cleared)
5. Remaining session B still works

- [ ] **Step 6: Verify chat updates don't affect VNC**

1. Load a session with a visible desktop
2. Type a message and send it to the agent
3. Observe: VNC iframe does NOT flicker, reload, or lose the desktop during streaming
4. Expected: only the chat panel updates; VNC is completely stable

- [ ] **Step 7: Commit final verification note**

```bash
git commit --allow-empty -m "chore: seamless VNC session switch verified and complete"
```
