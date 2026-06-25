# Mobile VNC + Session Drawer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add VNC panel at the top of the mobile layout and a left-slide session drawer triggered by a hamburger button in the top nav bar.

**Architecture:** Two isolated changes — (1) new `MobileSessionDrawer` component handles the overlay + session list with no external dependencies beyond existing stores; (2) `app/page.tsx` mobile block is restructured to a `flex-col` stack: top nav bar → VNC (280px fixed) → ChatPanel (flex-1) → DebugPanel, plus the drawer rendered as a portal-style overlay.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, React `useState`, Tailwind CSS, Lucide icons, Zustand (`useSessionStore`, `useMultiChatStore`, `useNotificationStore`), existing `SettingsDialog` component.

---

## File Map

| File | Change |
|------|--------|
| `components/chat-panel/mobile-session-drawer.tsx` | **New** — left-slide drawer: backdrop + panel with session list, new-session button, settings |
| `app/page.tsx` | **Modify** — add `drawerOpen` state, top nav bar, VncPanel, restructure mobile block |

---

## Task 1: MobileSessionDrawer Component

**Files:**
- Create: `components/chat-panel/mobile-session-drawer.tsx`

- [ ] **Step 1: Create the file with full implementation**

Create `components/chat-panel/mobile-session-drawer.tsx` with this exact content:

```tsx
// components/chat-panel/mobile-session-drawer.tsx
"use client";

import { useSessionStore } from "@/lib/store/session-store";
import { useMultiChatStore } from "@/lib/store/multi-chat-store";
import { useNotificationStore } from "@/lib/store/notification-store";
import { cn } from "@/lib/utils";
import { Plus, Trash2, X } from "lucide-react";
import { SettingsDialog } from "@/components/settings-dialog";

type MobileSessionDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreateSession: () => void;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
};

export function MobileSessionDrawer({
  isOpen,
  onClose,
  onCreateSession,
  onSwitchSession,
  onDeleteSession,
}: MobileSessionDrawerProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const chatSessions = useMultiChatStore((s) => s.sessions);
  const unread = useNotificationStore((s) => s.unread);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop — click to close */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer panel */}
      <div className="fixed top-0 left-0 bottom-0 w-3/4 max-w-xs z-50 bg-[#0a0e1a] border-r border-white/[0.06] flex flex-col">
        {/* Header row */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-white/[0.06]">
          <span className="text-sm font-medium text-[#94a3b8]">会话列表</span>
          <button
            onClick={onClose}
            className="p-1 rounded text-[#475569] hover:text-[#94a3b8] hover:bg-white/5"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* New session button */}
        <div className="p-2 border-b border-white/[0.06]">
          <button
            onClick={() => {
              onCreateSession();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#94a3b8] hover:bg-white/5 hover:text-[#f8fafc] transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建会话
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {sessions.length === 0 && (
            <p className="text-xs text-[#475569] text-center py-4">暂无会话</p>
          )}
          {sessions.map((session) => {
            const chatEntry = chatSessions[session.id];
            const isRunning =
              chatEntry?.status === "submitted" ||
              chatEntry?.status === "streaming";
            const hasUnread = unread.has(session.id);
            const isActive = session.id === activeSessionId;

            return (
              <div
                key={session.id}
                className={cn(
                  "group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-sm",
                  isActive
                    ? "bg-white/10 text-[#f8fafc]"
                    : "text-[#94a3b8] hover:bg-white/5 hover:text-[#f8fafc]"
                )}
                onClick={() => onSwitchSession(session.id)}
              >
                <span className="flex-1 truncate">{session.title}</span>

                <div className="flex items-center gap-2 shrink-0">
                  {hasUnread && (
                    <span
                      className="w-2 h-2 rounded-full bg-[#22c55e]"
                      aria-label="新消息"
                    />
                  )}
                  {isRunning && !hasUnread && (
                    <span
                      className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"
                      aria-label="运行中"
                    />
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-[#ef4444] text-[#475569] transition-opacity"
                    aria-label="删除会话"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Settings at bottom */}
        <div className="p-2 border-t border-white/[0.06] flex justify-end">
          <SettingsDialog />
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd ai-sdk-computer-use && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add components/chat-panel/mobile-session-drawer.tsx
git commit -m "feat: add MobileSessionDrawer with session list and settings"
```

---

## Task 2: Restructure Mobile Block in page.tsx

**Files:**
- Modify: `app/page.tsx`

Three changes: (a) add `drawerOpen` state; (b) add `Menu` to lucide imports and import `MobileSessionDrawer`; (c) replace the entire `{/* Mobile: Chat + Debug bottom sheet */}` block.

- [ ] **Step 1: Add `drawerOpen` state**

In `app/page.tsx`, locate the existing state declarations (around line 24):

```tsx
const [debugCollapsed, setDebugCollapsed] = useState(true);
```

Add `drawerOpen` immediately after:

```tsx
const [debugCollapsed, setDebugCollapsed] = useState(true);
const [drawerOpen, setDrawerOpen] = useState(false);
```

- [ ] **Step 2: Update imports**

At the top of `app/page.tsx`, the lucide import currently reads:

```tsx
// (no lucide import — lucide icons are only used in sub-components currently)
```

Add this import after the existing component imports:

```tsx
import { Menu } from "lucide-react";
import { MobileSessionDrawer } from "@/components/chat-panel/mobile-session-drawer";
```

- [ ] **Step 3: Derive active session info for the top nav bar**

In `app/page.tsx`, after the existing `const setActiveSession = ...` line (around line 30), add:

```tsx
const activeSession = sessions.find((s) => s.id === activeSessionId);
const activeChatStatus = useMultiChatStore(
  (s) =>
    activeSessionId
      ? s.sessions[activeSessionId]?.status ?? "ready"
      : "ready"
);
const isActiveRunning =
  activeChatStatus === "submitted" || activeChatStatus === "streaming";
```

Note: `useMultiChatStore` is already imported at the top of the file.

- [ ] **Step 4: Replace the mobile block**

Find the entire `{/* Mobile: Chat + Debug bottom sheet */}` block (currently lines 157–169):

```tsx
{/* Mobile: Chat + Debug bottom sheet */}
<div className="flex flex-col h-dvh xl:hidden">
  <div className="flex-1 min-h-0">
    <ChatPanel
      key={activeSessionId ?? "none"}
      sessionId={activeSessionId ?? ""}
    />
  </div>
  <DebugPanel
    isCollapsed={debugCollapsed}
    onToggle={() => setDebugCollapsed((v) => !v)}
  />
</div>
```

Replace it with:

```tsx
{/* Mobile: VNC top + Chat + Debug bottom sheet */}
<div className="flex flex-col h-dvh xl:hidden">
  {/* Top nav bar */}
  <div className="flex items-center gap-3 px-3 py-2 bg-[#0a0e1a] border-b border-white/[0.06] shrink-0">
    <button
      onClick={() => setDrawerOpen(true)}
      className="p-1 rounded text-[#94a3b8] hover:text-[#f8fafc] hover:bg-white/5"
      aria-label="打开会话列表"
    >
      <Menu className="w-5 h-5" />
    </button>
    <span className="flex-1 text-sm font-medium text-[#f8fafc] truncate">
      {activeSession?.title ?? "No Session"}
    </span>
    {isActiveRunning && (
      <span
        className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0"
        aria-label="运行中"
      />
    )}
  </div>

  {/* VNC panel — fixed 280px height */}
  <div className="h-[280px] shrink-0">
    <VncPanel onRefresh={initSandbox} />
  </div>

  {/* Chat — fills remaining space */}
  <div className="flex-1 min-h-0">
    <ChatPanel
      key={activeSessionId ?? "none"}
      sessionId={activeSessionId ?? ""}
    />
  </div>

  {/* Debug bar at bottom */}
  <DebugPanel
    isCollapsed={debugCollapsed}
    onToggle={() => setDebugCollapsed((v) => !v)}
  />

  {/* Session drawer overlay */}
  <MobileSessionDrawer
    isOpen={drawerOpen}
    onClose={() => setDrawerOpen(false)}
    onCreateSession={handleCreateSession}
    onSwitchSession={(id) => {
      handleSwitchSession(id);
      setDrawerOpen(false);
    }}
    onDeleteSession={handleDeleteSession}
  />
</div>
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx
git commit -m "feat: mobile layout adds VNC top panel and hamburger session drawer"
```

---

## Task 3: Manual Verification

- [ ] **Step 1: Start dev server**

```bash
pnpm dev
```

Open `http://localhost:3000`.

- [ ] **Step 2: Verify mobile layout**

1. Open DevTools → toggle device toolbar → iPhone 14 Pro (390×844).
2. **Top nav bar** visible: hamburger ☰ on left, session title in center, amber pulse dot if running.
3. **VNC panel** below nav bar, ~280px tall. Shows "Loading stream…" spinner if no sandbox is active.
4. **Chat** fills remaining space, messages and input box visible.
5. **Debug bar** pinned at bottom, collapsed by default.

- [ ] **Step 3: Verify session drawer**

1. Tap ☰ → drawer slides in from left, covering ~75% width.
2. Background dims with dark overlay.
3. Drawer shows: "新建会话" button at top, session list, ⚙ settings at bottom.
4. Active session is highlighted (brighter background).
5. Running sessions show amber pulse dot; sessions with new messages show green dot.
6. Tap a session → drawer closes, session switches, top nav title updates.
7. Tap "新建会话" → drawer closes, new session created.
8. Tap overlay (right side) → drawer closes without switching session.
9. Swipe / tap X button → drawer closes.

- [ ] **Step 4: Verify no desktop regressions**

1. Switch DevTools to desktop (≥1280px / xl breakpoint).
2. Desktop layout unchanged: sidebar + resizable Chat | VNC + Debug.
3. Session sidebar, AgentWorker, background execution all work normally.
4. Debug panel Events/Stats tabs and EventRow expand still work.
