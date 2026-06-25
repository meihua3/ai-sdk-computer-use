# Seamless VNC Session Switch — Design Spec

**Date:** 2026-06-25
**Status:** Approved

## Problem

Switching sessions causes `streamUrl` to be set to `null` first, making the VNC iframe disappear and showing a loading spinner. Users experience a visible interruption even when returning to a session whose sandbox is still running.

## Goal

Sessions that have been visited before switch instantly — no black screen, no spinner. First visit to a new session still shows the normal loading flow, but any subsequent return is instant.

## Non-Goals

- Pre-initializing sandboxes before the user clicks (avoids unnecessary connections)
- Persisting VNC URLs across page refreshes (URLs can expire; re-connect on reload is acceptable)

---

## Architecture

### 1. New Runtime Store — `useSandboxUrlStore`

A Zustand store **without** `persist` middleware (runtime-only, lives in memory).

```ts
type SandboxUrlStore = {
  urls: Record<string, string | null>; // sessionId → url | null (null = initializing)
  setUrl: (sessionId: string, url: string) => void;
  setInitializing: (sessionId: string) => void; // sets to null (marks as loading)
  clearUrl: (sessionId: string) => void;         // removes entry entirely
};
```

- `string` value → sandbox is ready, iframe can render
- `null` value → sandbox is being initialized, show spinner inside iframe slot
- key absent → session has never been visited, no iframe rendered at all

**File:** `lib/store/sandbox-url-store.ts`

---

### 2. Refactored `useSessionSandbox`

Manages the visited set and drives initialization.

**State:**
- `visitedIds: Set<string>` — internal `useRef`, not reactive; tracks which sessions have been activated this page lifetime
- No longer holds `streamUrl` or `isInitializing` as local React state

**Behavior on `activeSessionId` change:**
1. Add `activeSessionId` to `visitedIds`
2. Check if `sandboxUrlStore` already has a URL for this session → if yes, done (iframe is already in DOM, becomes visible)
3. If no entry → call `setInitializing(activeSessionId)` → call `getDesktopURL(existingSandboxId)` → on success call `setUrl(activeSessionId, url)`

**Keepalive:** Pings all sessions currently in `visitedIds` that have a sandboxId (not just the active one), so background sessions don't time out while the user is in another session.

**Exposed API:**
```ts
// useSessionSandbox returns:
{
  initSandbox: () => Promise<void>;  // "New Desktop" button — force-creates new sandbox for active session
  killSandboxForSession: (sessionId, sandboxId) => Promise<void>;
}
// streamUrl and isInitializing are gone — VncPanel reads from store directly
```

**File:** `lib/hooks/use-session-sandbox.ts`

---

### 3. Refactored `VncPanel`

Reads its own data from stores; receives no URL/loading props from parent.

**Props (new):**
```ts
type VncPanelProps = {
  onRefresh: () => void; // "New Desktop" button callback
};
```

**Rendering logic:**
1. Subscribe to `sessions` from `useSessionStore` (to know which session IDs exist)
2. Subscribe to `urls` from `useSandboxUrlStore` (to know which are visited and ready)
3. Subscribe to `activeSessionId` from `useSessionStore`
4. Render one container per session that has an entry in `urls` (visited):
   - `null` entry → show spinner (initializing)
   - `string` entry → render `<iframe src={url} />`
   - Active session container: `display: block`
   - Others: `display: none` (iframe stays mounted, WebSocket stays alive)

**Key prop stability:** `onRefresh` is still a `useCallback` from `page.tsx` with stable deps; `React.memo` wrapper stays.

**File:** `components/vnc-panel/vnc-panel.tsx`

---

### 4. `page.tsx` Changes

- Remove `streamUrl` and `isInitializing` from destructure of `useSessionSandbox`
- Remove those props from `<VncPanel>` call
- `VncPanel` only receives `onRefresh={initSandbox}`
- Keep `activeSandboxId` subscription — still needed for `<ChatPanel sandboxId={activeSandboxId} />`

---

## Data Flow

```
User clicks session B
  → handleSwitchSession(B)
    → setActiveSession(B)           [Zustand]
      → activeSessionId changes
        → useSessionSandbox effect fires
          → B not in visitedIds?
            → visitedIds.add(B)
            → setInitializing(B)    [sandboxUrlStore]
            → getDesktopURL(existingSandboxId)
            → setUrl(B, url)        [sandboxUrlStore]
          → B already in visitedIds + has URL?
            → nothing (iframe already in DOM)

VncPanel (memo, subscribed to sandboxUrlStore + sessionStore):
  → re-renders only when urls map changes
  → shows session B's iframe (display: block)
  → hides session A's iframe (display: none)
```

---

## Connection Count

- **Page load:** 1 connection (active session only)
- **After visiting N sessions:** N connections (one per visited session)
- **Page refresh:** reset to 1

In practice users visit 2–4 sessions max per page lifetime, well within acceptable limits.

---

## Error Handling

- If `getDesktopURL` fails for session B: call `clearUrl(B)` (removes entry, reverts to unvisited state), show an error toast. User can click the session again to retry.
- If a background sandbox times out: noVNC's `reconnect=true` + `heartbeat=10` handles reconnection automatically; no app-level intervention needed.

---

## Files Changed

| File | Change |
|------|--------|
| `lib/store/sandbox-url-store.ts` | **New** — runtime URL map store |
| `lib/hooks/use-session-sandbox.ts` | **Refactor** — visited set, drive from store |
| `components/vnc-panel/vnc-panel.tsx` | **Refactor** — multi-iframe, reads from store |
| `app/page.tsx` | **Minor** — remove streamUrl/isInitializing pass-through |
