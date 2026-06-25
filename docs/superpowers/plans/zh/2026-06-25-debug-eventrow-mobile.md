# Debug EventRow 展开 + 移动端底部抽屉 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 为 Debug EventRow 添加点击展开详情视图，并为移动端布局添加可收起的 Debug 底部抽屉。

**架构：** 两处独立修改 —— (1) `debug-panel.tsx` 中的 `EventRow` 增加本地 `useState` 展开状态，内联渲染键值对详情块；(2) `page.tsx` 移动端区块改为 `flex-col` 布局，ChatPanel + DebugPanel 上下排列，复用现有 `debugCollapsed` 状态。

**技术栈：** Next.js 15 App Router、TypeScript、React `useState`、Tailwind CSS、Lucide icons、`lib/types/index.ts` 中的 `AgentEvent` 类型。

---

## 文件清单

| 文件 | 变更 |
|------|------|
| `components/vnc-panel/debug-panel.tsx` | `EventRow`：增加 `isExpanded` 状态、展开箭头、详情块 |
| `app/page.tsx` | 移动端区块：flex-col 布局 + DebugPanel、移除 banner、默认收起 |

---

## Task 1：EventRow 内联展开

**文件：**
- 修改：`components/vnc-panel/debug-panel.tsx`

- [ ] **Step 1：在 EventRow 前添加辅助函数**

在 `ActionIcon` 函数之后、`EventRow` 函数之前插入：

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

- [ ] **Step 2：用可展开版本替换 EventRow**

将整个 `EventRow` 函数替换为：

```tsx
function EventRow({ event }: { event: AgentEvent }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const label =
    event.tool === "computer"
      ? event.payload.action
      : event.payload.command.slice(0, 30);
  const durationLabel =
    event.duration != null ? formatDuration(event.duration) : null;

  // 收集非空 payload 字段，用于详情块
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
      {/* 摘要行 — 始终可见，点击切换 */}
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

      {/* 详情块 — 展开时显示 */}
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

- [ ] **Step 3：TypeScript 检查**

```bash
npx tsc --noEmit
```

预期：零错误。

- [ ] **Step 4：提交**

```bash
git add components/vnc-panel/debug-panel.tsx
git commit -m "feat: EventRow click-to-expand shows id, timestamp, tool, status, payload"
```

---

## Task 2：移动端底部抽屉

**文件：**
- 修改：`app/page.tsx`

两处修改：(a) `debugCollapsed` 初始值改为 `true`；(b) 移动端区块底部加入 `DebugPanel`。

- [ ] **Step 1：修改 `debugCollapsed` 初始状态**

`app/page.tsx` 第 24 行：

```tsx
// 旧：
const [debugCollapsed, setDebugCollapsed] = useState(false);

// 新：
const [debugCollapsed, setDebugCollapsed] = useState(true);
```

- [ ] **Step 2：替换移动端区块**

将底部 `{/* Mobile: Chat only */}` 整块替换：

```tsx
// 旧：
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

// 新：
{/* Mobile: Chat + Debug 底部抽屉 */}
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

- [ ] **Step 3：TypeScript 检查**

```bash
npx tsc --noEmit
```

预期：零错误。

- [ ] **Step 4：提交**

```bash
git add app/page.tsx
git commit -m "feat: mobile layout adds Debug bottom sheet, removes headless mode banner"
```

---

## Task 3：手动验证

- [ ] **Step 1：启动开发服务器**

```bash
pnpm dev
```

打开 `http://localhost:3000`。

- [ ] **Step 2：验证 EventRow 展开 — 桌面端**

1. 发送触发 tool call 的消息（如「截一张屏」）。
2. 点击 Debug 面板 header 展开面板。
3. 点击任意 event 行 — 应展开显示：`id`、`time`、`tool`、`status`、`duration`、payload 字段。
4. 再次点击 — 应收起。
5. 同时展开两行 — 两行独立保持展开状态。
6. bash event：展开后 `command` 显示完整文本（不截断）。
7. computer event 带 coordinate：展开后显示 `[x, y]` 格式。

- [ ] **Step 3：验证移动端布局**

1. 打开 DevTools → 切换设备工具栏 → 选择手机预设（如 iPhone 14 Pro，390px 宽）。
2. 页面显示 ChatPanel，有消息流和输入框。
3. 底部：可见一条细 Debug header 条（默认收起）。
4. 点击 Debug header — 向上展开，显示 Events tab 和 tool calls。
5. 展开区域内 events 可滚动。
6. 再次点击 — 面板收起，Chat 恢复全高。
7. 页面上不再有「Headless mode」banner。

- [ ] **Step 4：验证桌面端无回归**

1. 桌面端（xl 断点）：Debug 面板默认收起（初始值改为 `true`）。
2. 点击 Debug header 展开 — Events 和 Stats tab 正常工作。
3. EventRow 展开在桌面端也正常工作。
4. Session 侧边栏、session 切换、AgentWorker — 均不受影响。
