# Debug EventRow Expansion + Mobile Bottom Sheet — Design Spec

**Date:** 2026-06-25
**Status:** Approved

---

## Problem

1. The Debug panel's Events tab shows only a compact summary per tool call (icon + action label + duration). All other fields — id, timestamp, full payload, status — are invisible.
2. There is no way to inspect the full event store data without reading localStorage directly.
3. Mobile layout shows only ChatPanel. Users have no access to Debug / tool call information on mobile.

---

## Goals

- Each EventRow in the Events tab can be clicked to expand, revealing all event fields inline.
- Multiple rows can be expanded simultaneously.
- Mobile layout adds a collapsible DebugPanel at the bottom (bottom sheet pattern).
- Mobile removes the blocking "Headless mode" banner.

## Non-Goals

- A dedicated full-screen event explorer page.
- Drag-to-resize gesture on the mobile sheet (tap-to-toggle is sufficient).
- VNC panel on mobile (out of scope — requires live stream).

---

## Architecture

### Part 1: EventRow Inline Expansion

**File:** `components/vnc-panel/debug-panel.tsx`

Each `EventRow` manages its own `isExpanded: boolean` with `useState(false)`. The component has two visual states:

**Collapsed (default):**
```
[status]  [icon]  [label]                [duration]  ▼
```

**Expanded (after click):**
```
[status]  [icon]  [label]                [duration]  ▲
  id        evt_toolu_01CUaB4hgwmRMGVwjvgD5qQK
  time      14:23:05
  tool      computer
  action    screenshot
  status    success
  duration  312ms
```

**Payload fields rendered (non-null only):**

For `computer` tool: `action`, `coordinate` (as `[x, y]`), `text`, `duration` (payload field), `scroll_direction`, `scroll_amount`.

For `bash` tool: `command` (full, not truncated).

**Styling:**
- Expanded area: `bg-white/[0.02] rounded-b border-t border-white/[0.04]`
- Key-value rows: `font-mono text-[10px] text-[#64748b]`, key in `text-[#475569]`, value in `text-[#94a3b8]`
- `id` value: truncated to 32 chars with `…` if longer
- `time`: formatted as `HH:mm:ss` from `event.timestamp` (Unix ms)
- Chevron `▼`/`▲` in top-right of each row

The row click handler toggles `isExpanded`. Clicking the expand area (when open) also collapses.

### Part 2: Mobile Bottom Sheet

**File:** `app/page.tsx`

Mobile block changes from:
```tsx
<div className="flex-1 xl:hidden">
  <div>Headless mode banner</div>
  <ChatPanel ... />
</div>
```

To:
```tsx
<div className="flex flex-col h-dvh xl:hidden">
  <div className="flex-1 min-h-0">
    <ChatPanel key={activeSessionId ?? "none"} sessionId={activeSessionId ?? ""} />
  </div>
  <DebugPanel
    isCollapsed={debugCollapsed}
    onToggle={() => setDebugCollapsed((v) => !v)}
  />
</div>
```

Key points:
- Removes the "Headless mode" floating banner entirely.
- Reuses `DebugPanel` component unchanged — same `isCollapsed`/`onToggle` state already tracked in `page.tsx`.
- `ChatPanel` uses `flex-1 min-h-0` so it gives space to `DebugPanel` when expanded.
- When DebugPanel is collapsed, it shows only the header strip (~40px) at the bottom.
- When expanded, it shows Events/Stats tabs (`max-h-40` = 160px), chat area shrinks proportionally.
- The DebugPanel header at the bottom acts as the tap target.

---

## File Map

| File | Change |
|------|--------|
| `components/vnc-panel/debug-panel.tsx` | Add expand/collapse state to `EventRow`, render detail section when expanded |
| `app/page.tsx` | Replace mobile block: flex-col layout with ChatPanel + DebugPanel |

---

## Data Displayed in Expanded EventRow

| Field | Source | Format |
|-------|--------|--------|
| id | `event.id` | monospace, truncated to 32 chars |
| time | `event.timestamp` | `new Date(ts).toLocaleTimeString()` |
| tool | `event.tool` | `"computer"` or `"bash"` |
| status | `event.status` | `"pending"` / `"success"` / `"error"` / `"aborted"` |
| duration | `event.duration` | `Nms` or `N.Ns`, `—` if null |
| payload fields | `event.payload.*` | per-field, skip null/undefined |

For `computer` payload: `action`, `coordinate` (`[x, y]`), `text`, `scroll_direction`, `scroll_amount`.
For `bash` payload: `command` (full string, wraps to multiple lines if long).

---

## Edge Cases

- **Pending event (duration null):** duration row shows `—`.
- **Long command (bash):** `command` value wraps (`break-all`), not truncated.
- **Long id:** truncated to 32 chars with `…`.
- **No events:** existing empty-state message unchanged.
- **Mobile DebugPanel starts collapsed:** `debugCollapsed` initial state is `false` in page.tsx (currently), which means on mobile the debug panel would start open. Change initial state to `true` so on mobile it starts collapsed and users tap to open.
