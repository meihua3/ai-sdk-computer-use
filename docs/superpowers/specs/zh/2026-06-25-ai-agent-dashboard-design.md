# AI Agent Dashboard — 设计文档

**日期：** 2026-06-25
**项目：** ai-sdk-computer-use
**范围：** 将现有 computer-use demo 升级为生产级 AI Agent Dashboard

---

## 1. 概述

在现有 Next.js + AI SDK computer-use demo 基础上扩展，新增：
- 分栏布局（左 Chat，右 VNC）
- 多 Session 管理 + localStorage 持久化
- Event Pipeline，记录每次 tool call
- 可折叠 Debug 面板（右侧，VNC 下方）
- 严格 TypeScript（禁 `any`，使用 discriminated unions）
- VNC 与 Chat 状态隔离，互不触发重渲染

---

## 2. 布局

```
┌──────────────────────────────────────────────────────────┐
│ [Session侧边栏]  │  [Chat面板]      │  [VNC面板]          │
│                  │                  │                     │
│  + 新建Session   │  消息流           │  VNC iframe         │
│  ─────────────   │  (tool call      │                     │
│  Session 1 ●    │   折叠卡片)       │  ───────────────    │
│  Session 2       │                  │  [Debug面板]        │
│  Session 3       │                  │  event列表          │
│                  │  ─────────────   │  agent状态          │
│                  │  输入框           │  [折叠按钮]         │
└──────────────────────────────────────────────────────────┘
```

- **Session 侧边栏**：固定宽度约 200px，可折叠；支持双击重命名、右键删除
- **Chat 面板**：`ResizablePanel`，最小宽度 300px；tool call 卡片默认折叠，点击展开
- **VNC 面板**：上方为 VNC iframe，下方为 Debug 面板，中间有拖拽分隔线；Debug 面板折叠后 VNC 占满右侧
- **移动端**：Session 侧边栏隐藏，仅显示 Chat，VNC 隐藏（与现有逻辑一致）
- 左右主面板支持水平拖拽调整宽度

---

## 3. 类型系统

所有类型定义在 `lib/types/` 下，禁止 `any`，全面使用 discriminated unions。

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

// Agent 状态（discriminated union）
type AgentStatus =
  | { type: 'idle' }
  | { type: 'running'; startedAt: number }
  | { type: 'error'; message: string }

// Event 状态
type EventStatus = 'pending' | 'success' | 'error' | 'aborted'

// Tool call event（discriminated union，按工具类型区分）
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

## 4. 状态管理

使用两个 Zustand Store，新增依赖：`zustand`（含 `persist` middleware）。

### `useSessionStore`

管理 session 列表、当前活跃 session、CRUD 操作、localStorage 持久化。

```typescript
type SessionStore = {
  sessions: Session[]
  activeSessionId: string | null
  activeSandboxId: string | null        // 派生值，供 VncPanel selector 使用

  createSession: () => string            // 返回新 session id
  switchSession: (id: string) => void    // 有守卫：agent running 时弹确认
  deleteSession: (id: string) => void    // 有守卫：删除当前 session 时弹确认
  renameSession: (id: string, title: string) => void
  updateSessionTitle: (id: string, title: string) => void  // 首条消息后自动设标题
  updateMessages: (id: string, messages: UIMessage[]) => void
  appendEvent: (id: string, event: AgentEvent) => void
  updateEvent: (id: string, eventId: string, patch: Partial<AgentEvent>) => void
  setSandboxId: (id: string, sandboxId: string | null) => void
}
```

**持久化规则：**
- `zustand/persist` 序列化整个 session 列表（含 messages 和 events）
- 每次写入前检查：`sessions.length > 20` → 淘汰最老的
- 写入后检查 `navigator.storage.estimate()`；使用率 > 80% → toast 提示用户清理

### `useEventStore`

当前 session 的运行时 event pipeline，session 切换时整体重置，不持久化。

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

### 数据流

```
useChat (AI SDK)
  ↓ messages 变化
useEventSync（自定义 hook）
  ↓ diff tool-invocation parts，识别新增或状态变化
useEventStore
  ├── 新 tool call   → addEvent({ status: 'pending' })
  ├── tool call 完成 → updateEvent({ status: 'success', duration })
  ├── tool call 出错 → updateEvent({ status: 'error' })
  └── stop() 触发   → updateEvent({ status: 'aborted' })
  ↓
Debug 面板 ← 订阅 events
Agent 状态指示器 ← 订阅 agentStatus
```

### `useEventSync` Hook

在 ChatPanel 内运行，监听 `useChat` 返回的 `messages`。每次变化时 diff 前后 tool-invocation 状态，同时派发到**两个 store**：`useEventStore`（运行时快速访问，供 Debug 面板订阅）和 `useSessionStore.appendEvent()`（将 events 持久化到 `session.events[]` 写入 localStorage）。同时将 `useChat` 的 `status` 字段映射为 `agentStatus`：

- `status === 'streaming'` → `{ type: 'running', startedAt }`
- `status === 'ready'` → `{ type: 'idle' }`
- `status === 'error'` → `{ type: 'error', message }`

---

## 6. Session 管理

| 操作 | 行为 |
|------|------|
| 创建 | 生成新 session（空 title），立即切换到该 session |
| 切换（agent 空闲） | 销毁旧 sandbox，为目标 session 初始化新 sandbox |
| 切换（agent 运行中） | 弹确认框 → 确认 → stop agent → 销毁 sandbox → 切换 |
| 删除（非当前 session） | 直接从 store 删除，无需确认 |
| 删除（当前 session） | 弹确认框 → 确认 → 销毁 sandbox → 删除 → 自动创建新空白 session |
| 重命名 | 双击标题 → inline 输入框 → 回车/失焦保存 |
| 自动命名 | 第一条用户消息发送后，取前 20 个字符设为 title |

### Sandbox 懒加载

- 每个 session 存储 `sandboxId: string | null`
- 切换到某 session 时：若 `sandboxId` 为 null 或 sandbox 已失效 → 调用 `getDesktopURL()` 创建新 sandbox
- 离开 session 时：调用 `killDesktop(sandboxId)`，将该 session 的 `sandboxId` 重置为 null

---

## 7. 性能——VNC 隔离

VncPanel 不能因 Chat 或 Event 更新而重渲染。

```
SessionStore
  └── activeSandboxId（selector）

VncPanel（React.memo）
  └── 只订阅 activeSandboxId
      chat 更新 → sandboxId 不变 → VncPanel 跳过渲染 ✓

ChatPanel
  └── 订阅 messages、events、agentStatus
      自由更新，与 VncPanel 状态树完全隔离 ✓
```

- `VncPanel` 用 `React.memo` 包裹，props 只接受 `sandboxId: string | null` 和 `isInitializing: boolean`
- `streamUrl` 仅在 `sandboxId` 变化时重新计算，不受任何 chat 状态影响
- Debug 面板是独立兄弟组件，自己订阅 event store，不经过 VncPanel

---

## 8. 新增文件结构

```
app/
  page.tsx                          ← 改造：session 侧边栏 + 可调整面板
  api/chat/route.ts                 ← 不变
components/
  chat-panel/
    chat-panel.tsx                  ← 消息流、输入框、useEventSync
    tool-call-card.tsx              ← 可折叠 tool call 展示卡片
    session-sidebar.tsx             ← session 列表、创建、重命名、删除
  vnc-panel/
    vnc-panel.tsx                   ← React.memo，只包含 iframe
    debug-panel.tsx                 ← event 列表、agent 状态、折叠按钮
lib/
  types/
    index.ts                        ← Session、AgentEvent、AgentStatus、EventStatus
  store/
    session-store.ts                ← Zustand + persist
    event-store.ts                  ← Zustand，仅运行时
  hooks/
    use-event-sync.ts               ← 桥接 useChat → event store
    use-session-sandbox.ts          ← session 切换时的 sandbox 懒加载/销毁
  sandbox/                          ← 不变
```

---

## 9. 边界条件汇总

| # | 边界条件 | 决策 |
|---|---------|------|
| 1 | Session/Sandbox 关系 | 懒加载，切换时旧 sandbox 销毁 |
| 2 | Event store 作用域 | 每个 session 独立 |
| 3 | 删除当前 session | 弹确认框 → 销毁 → 自动创建新 session |
| 4 | localStorage 满 | 最多 20 个 session，自动淘汰最老，使用率 >80% 提示 |
| 5 | 无 tool call 时 Debug 面板 | 显示占位符 |
| 6 | agent 运行时切换 session | 弹确认框 → 中断 → 切换 |
| 7 | 单 session event 数量 | 不限制，存储接近满时提示用户 |
| 8 | Session 命名 | 自动取首条消息前 20 字符，支持双击重命名 |
| 9 | Debug 面板 = tool call 详情区 | 同一组件，可折叠，折叠后 VNC 占满右侧 |
| 10 | 布局方向 | 左 Chat，右 VNC |
