# Debug EventRow 展开 + 移动端底部抽屉 — 设计规范

**日期：** 2026-06-25
**状态：** 已批准

---

## 问题

1. Debug 面板的 Events tab 每个 tool call 只显示紧凑摘要（图标 + action 名称 + 耗时）。id、timestamp、完整 payload、status 等字段均不可见。
2. 没有直接可视化整个 event store 数据的方式（不读 localStorage 的情况下）。
3. 移动端只显示 ChatPanel，用户无法在手机上看到 Debug / tool call 信息。

---

## 目标

- Events tab 的每个 EventRow 可点击展开，内联显示所有 event 字段。
- 多行可同时展开。
- 移动端在底部新增可收起的 DebugPanel（底部抽屉模式）。
- 移动端移除遮挡界面的「Headless mode」悬浮 banner。

## 非目标

- 独立的全屏 event 浏览器页面。
- 移动端抽屉的拖拽手势（点击切换已足够）。
- 移动端显示 VNC 面板（需要直播流，不在本期范围）。

---

## 架构

### Part 1：EventRow 内联展开

**文件：** `components/vnc-panel/debug-panel.tsx`

每个 `EventRow` 用 `useState(false)` 维护自己的 `isExpanded` 状态。组件有两种视觉状态：

**收起（默认）：**
```
[状态]  [图标]  [标签]                [耗时]  ▼
```

**展开（点击后）：**
```
[状态]  [图标]  [标签]                [耗时]  ▲
  id        evt_toolu_01CUaB4hgwmRMGVwjvgD5qQK
  time      14:23:05
  tool      computer
  action    screenshot
  status    success
  duration  312ms
```

**Payload 字段展示规则（仅显示非空字段）：**

`computer` 工具：`action`、`coordinate`（格式为 `[x, y]`）、`text`、`duration`（payload 自带字段）、`scroll_direction`、`scroll_amount`。

`bash` 工具：`command`（完整显示，不截断）。

**样式：**
- 展开区域：`bg-white/[0.02] rounded-b border-t border-white/[0.04]`
- 键值行：`font-mono text-[10px] text-[#64748b]`，key 用 `text-[#475569]`，value 用 `text-[#94a3b8]`
- `id` 超过 32 字符时截断并加 `…`
- `time`：由 `event.timestamp`（Unix ms）格式化为 `HH:mm:ss`
- 右上角显示 `▼` / `▲` 展开指示

### Part 2：移动端底部抽屉

**文件：** `app/page.tsx`

移动端区块从：
```tsx
<div className="flex-1 xl:hidden">
  <div>Headless mode banner</div>
  <ChatPanel ... />
</div>
```

改为：
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

要点：
- 完全移除「Headless mode」悬浮 banner。
- 复用现有 `DebugPanel` 组件，无需修改，共用 `page.tsx` 中已有的 `debugCollapsed`/`setDebugCollapsed` 状态。
- `ChatPanel` 使用 `flex-1 min-h-0`，展开时自动给 DebugPanel 让出空间。
- 收起时 DebugPanel 只显示 header 条（约 40px）在底部。
- 展开时显示 Events/Stats tab（`max-h-40` = 160px），Chat 区域相应缩小。
- `debugCollapsed` 初始值改为 `true`，移动端默认收起。

---

## 文件清单

| 文件 | 变更 |
|------|------|
| `components/vnc-panel/debug-panel.tsx` | EventRow 增加展开/收起状态，展开时渲染详情区块 |
| `app/page.tsx` | 移动端区块改为 flex-col 布局：ChatPanel + DebugPanel |

---

## 展开 EventRow 显示的数据

| 字段 | 来源 | 格式 |
|------|------|------|
| id | `event.id` | 等宽字体，超 32 字符截断 |
| time | `event.timestamp` | `new Date(ts).toLocaleTimeString()` |
| tool | `event.tool` | `"computer"` 或 `"bash"` |
| status | `event.status` | `"pending"` / `"success"` / `"error"` / `"aborted"` |
| duration | `event.duration` | `Nms` 或 `N.Ns`，null 时显示 `—` |
| payload 字段 | `event.payload.*` | 逐字段展示，跳过 null/undefined |

`computer` payload：`action`、`coordinate`（`[x, y]`）、`text`、`scroll_direction`、`scroll_amount`。
`bash` payload：`command`（完整字符串，较长时自动换行）。

---

## 边缘情况

- **pending event（duration 为 null）：** duration 行显示 `—`。
- **长命令（bash）：** `command` 换行显示（`break-all`），不截断。
- **长 id：** 截断至 32 字符并加 `…`。
- **无事件：** 保持现有空状态提示不变。
- **移动端 DebugPanel 默认收起：** `debugCollapsed` 初始值从 `false` 改为 `true`。
