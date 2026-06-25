# Debug EventRow Expansion + Mobile Bottom Sheet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add click-to-expand detail view to each Debug EventRow, and add a collapsible Debug bottom sheet to the mobile layout.

**Architecture:** Two isolated changes — (1) `EventRow` in `debug-panel.tsx` gets local `useState` for expansion and renders a key-value detail block inline; (2) `page.tsx` mobile block is restructured to `flex-col` with `ChatPanel` + `DebugPanel` stacked, reusing the existing `debugCollapsed` state.

**Tech Stack:** Next.js 15 App Router, TypeScript, React `useState`, Tailwind CSS, Lucide icons, existing `AgentEvent` types from `lib/types/index.ts`.

---

## File Map

| File | Change |
|------|--------|
| `components/vnc-panel/debug-panel.tsx` | `EventRow`: add `isExpanded` state, chevron, detail block |
| `app/page.tsx` | Mobile block: flex-col layout + DebugPanel, remove banner, start collapsed |

---

## Task 1: EventRow Inline Expansion

**Files:**
- Modify: `components/vnc-panel/debug-panel.tsx`

The current `EventRow` is a flat row with no expandability. We'll add local state, a chevron indicator, and a detail block that renders below when expanded.

- [ ] **Step 1: Add helper functions above `EventRow`**

In `components/vnc-panel/debug-panel.tsx`, add these two helpers right before the `EventRow` function (after the existing `ActionIcon` function):

```tsx
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

function truncateId(id: string): string {
  return id.length > 32 ? id.slice(0, 32) + "…" : id;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 min-w-0">
      <span className="text-[#475569] shrink-0 w-20">{label}</span>
      <span className="text-[#94a3b8] break-all">{value}</span>
    </div>
  );
}
```

- [ ] **Step 2: Replace `EventRow` with the expandable version**

Replace the entire `EventRow` function with:

```tsx
function EventRow({ event }: { event: AgentEvent }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const label =
    event.tool === "computer"
      ? event.payload.action
      : event.payload.command.slice(0, 30);
  const durationLabel =
    event.duration != null ? formatDuration(event.duration) : null;

  // Collect non-null payload fields for the detail block
  const payloadFields: { label: string; value: string }[] = [];
  if (event.tool === "computer") {
    const p = event.payload;
    payloadFields.push({ label: "action", value: p.action });
    if (p.coordinate != null)
      payloadFields.push({
        label: "coordinate",
        value: `[${p.coordinate[0]}, ${p.coordinate[1]}]`,
      });
    if (p.text != null) payloadFields.push({ label: "text", value: p.text });
    if (p.scroll_direction != null)
      payloadFields.push({ label: "scroll_dir", value: p.scroll_direction });
    if (p.scroll_amount != null)
      payloadFields.push({
        label: "scroll_amt",
        value: String(p.scroll_amount),
      });
    if (p.duration != null)
      payloadFields.push({ label: "wait_ms", value: String(p.duration) });
  } else {
    payloadFields.push({ label: "command", value: event.payload.command });
  }

  return (
    <div className="rounded overflow-hidden">
      {/* Summary row — always visible, click to toggle */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 cursor-pointer select-none"
        onClick={() => setIsExpanded((v) => !v)}
      >
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
        <span className="text-[10px] text-[#334155] shrink-0 ml-1">
          {isExpanded ? "▲" : "▼"}
        </span>
      </div>

      {/* Detail block — shown when expanded */}
      {isExpanded && (
        <div className="bg-white/[0.02] border-t border-white/[0.04] px-3 py-2 font-mono text-[10px] space-y-1">
          <DetailRow label="id" value={truncateId(event.id)} />
          <DetailRow label="time" value={formatTime(event.timestamp)} />
          <DetailRow label="tool" value={event.tool} />
          <DetailRow label="status" value={event.status} />
          <DetailRow
            label="duration"
            value={
              event.duration != null ? formatDuration(event.duration) : "—"
            }
          />
          {payloadFields.map(({ label, value }) => (
            <DetailRow key={label} label={label} value={value} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add components/vnc-panel/debug-panel.tsx
git commit -m "feat: EventRow click-to-expand shows id, timestamp, tool, status, payload"
```

---

## Task 2: Mobile Bottom Sheet

**Files:**
- Modify: `app/page.tsx`

Two changes: (a) `debugCollapsed` initial state → `true` so both desktop and mobile start with the panel collapsed; (b) mobile block gets `DebugPanel` at the bottom.

- [ ] **Step 1: Change `debugCollapsed` initial state**

In `app/page.tsx`, line 24:

```tsx
// Old:
const [debugCollapsed, setDebugCollapsed] = useState(false);

// New:
const [debugCollapsed, setDebugCollapsed] = useState(true);
```

- [ ] **Step 2: Replace the mobile block**

Find and replace the entire `{/* Mobile: Chat only */}` block (currently at the bottom of the JSX return):

```tsx
// Old:
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

// New:
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

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: mobile layout adds Debug bottom sheet, removes headless mode banner"
```

---

## Task 3: Manual Verification

- [ ] **Step 1: Start dev server**

```bash
pnpm dev
```

Open `http://localhost:3000`.

- [ ] **Step 2: Verify EventRow expansion — desktop**

1. Send a message that triggers tool calls (e.g. "take a screenshot").
2. Open Debug panel (click header to expand).
3. Click any event row — it should expand showing: `id`, `time`, `tool`, `status`, `duration`, plus payload fields.
4. Click again — it should collapse.
5. Expand two rows simultaneously — both stay open independently.
6. For a `bash` event: expanded detail shows full `command` text (not truncated).
7. For a `computer` event with coordinate: `coordinate` field shows as `[x, y]`.

- [ ] **Step 3: Verify mobile layout**

1. Open DevTools → toggle device toolbar → pick a mobile preset (e.g. iPhone 14 Pro, 390px wide).
2. Page shows ChatPanel with messages and input box.
3. At the bottom: a thin Debug header strip is visible (collapsed by default).
4. Tap the Debug header — it expands upward showing Events tab with tool calls.
5. Events are scrollable in the expanded panel.
6. Tap the header again — panel collapses, Chat takes full height.
7. No "Headless mode" banner visible anywhere.

- [ ] **Step 4: Verify no desktop regressions**

1. On desktop (xl breakpoint): Debug panel starts collapsed (initial state is now `true`).
2. Click Debug header to expand — Events and Stats tabs work correctly.
3. EventRow expansion still works on desktop.
4. Session sidebar, session switching, AgentWorker — all unaffected.
