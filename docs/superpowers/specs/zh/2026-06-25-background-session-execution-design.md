# 后台 Session 执行 + Tool 统计 — 设计规范

**日期：** 2026-06-25
**状态：** 已批准

---

## 问题

1. 切换 session 时，`resetEvents()` + `ChatPanel` 重新挂载（`key={activeSessionId}`）会强制杀死正在运行的 agent。
2. 没有每个 session 的独立运行状态指示 — 用户无法得知哪些后台 session 还在运行。
3. 没有限制同时运行的 agent loop 数量，可能产生大量并发请求。
4. Debug 面板的统计数据是全局且短暂的 — 切换 session 后丢失，也没有按 tool 类型分类。

---

## 目标

- 用户切换 session 时，agent 在后台继续完成整个循环（最多 maxSteps 步）。
- 侧边栏为每个运行中的 session 显示脉冲指示点，agent 在后台完成时显示绿点。
- 用户可配置最大并发运行 session 数（默认 2），在提交时强制执行。
- Debug 面板新增 Stats 标签页：按 tool 类型展示调用次数、总时长、平均时长。

## 非目标

- 在用户点击前预加载 session。
- 跨页面刷新持久化 agent 状态（页面刷新后进行中的循环会丢失 — 预期行为）。
- 实时展示后台 session 的输出（用户切换回去时才看到结果）。

---

## 架构

### 子项目 A：后台执行

#### 核心变更：AgentWorker 模式

`ChatPanel` 目前持有 `useChat` 并在每次切换 session 时重新挂载（`key={activeSessionId}`），这会销毁 `useChat` 实例并中止 agent。

**新架构：** 引入 `AgentWorker` 组件 — 无 UI，每个 session 一个，在 `page.tsx` 中始终挂载。它持有 `useChat` 并写入 `useMultiChatStore`。`ChatPanel` 变为纯展示层，从 store 中读取数据。

```
page.tsx
├── AgentWorker key="session-1"   ← useChat 在这里，永不卸载
├── AgentWorker key="session-2"   ← useChat 在这里，永不卸载
└── ChatPanel（当前活跃 session） ← 读取 useMultiChatStore，纯 UI
```

#### 新增 Store

**`useMultiChatStore`** — 运行时，不持久化

```ts
type SessionChatEntry = {
  messages: UIMessage[];
  status: "idle" | "submitted" | "streaming" | "error";
  input: string;
  submit: (input: string) => void;
  stop: () => void;
  setInput: (v: string) => void;
};

type MultiChatStore = {
  sessions: Record<string, SessionChatEntry>;
  set: (sessionId: string, patch: Partial<SessionChatEntry>) => void;
};
```

AgentWorker 在每次渲染时将 `messages`、`status`、`submit`、`stop`、`setInput` 写入此 store。ChatPanel 读取活跃 session 的条目。

**`useNotificationStore`** — 运行时，不持久化

```ts
type NotificationStore = {
  unread: Set<string>;       // agent 在用户离开时完成的 sessionId
  markUnread: (id: string) => void;
  markRead: (id: string) => void;
};
```

**`useSettingsStore`** — 持久化到 localStorage

```ts
type SettingsStore = {
  maxConcurrentSessions: number;   // 默认 2，范围 1–5
  setMaxConcurrentSessions: (n: number) => void;
};
```

#### AgentWorker 组件

```tsx
// components/agent-worker.tsx
export function AgentWorker({ sessionId }: { sessionId: string }) {
  const session = useSessionStore(s => s.sessions.find(s => s.id === sessionId));

  const { messages, status, handleSubmit, input, setInput, stop } = useChat({
    api: "/api/chat",
    id: sessionId,                        // 每个 session 唯一
    initialMessages: session?.messages ?? [],
    body: { sandboxId: session?.sandboxId },
    onFinish: () => {
      // 用户已切换到其他 session → 标记为未读（绿点）
      if (useSessionStore.getState().activeSessionId !== sessionId) {
        useNotificationStore.getState().markUnread(sessionId);
      }
    },
    onError: () => {
      if (useSessionStore.getState().activeSessionId !== sessionId) {
        useNotificationStore.getState().markUnread(sessionId);
      }
    },
  });

  // 将消息同步到 session-store
  useEffect(() => {
    useSessionStore.getState().updateMessages(sessionId, messages);
  }, [messages, sessionId]);

  // 在 multi-chat store 中注册控制函数
  useEffect(() => {
    const submit = (userInput: string) => {
      // 并发上限检查
      const running = Object.values(useMultiChatStore.getState().sessions)
        .filter(s => s.status === "submitted" || s.status === "streaming").length;
      const max = useSettingsStore.getState().maxConcurrentSessions;
      if (running >= max) {
        toast.error(`最多同时运行 ${max} 个 session`, {
          description: "请先停止一个正在运行的 session，再启动新的。",
        });
        return;
      }
      handleSubmit(new Event("submit") as unknown as React.FormEvent, {
        data: { userInput },
      });
    };
    useMultiChatStore.getState().set(sessionId, {
      messages, status, input, submit, stop, setInput,
    });
  }, [messages, status, input, handleSubmit, stop, setInput, sessionId]);

  // 事件同步（tool call → session-store events）
  useEventSync(messages, sessionId);

  return null;
}
```

#### ChatPanel 变更

从 `ChatPanel` 中移除 `useChat`，改为从 `useMultiChatStore` 读取：

```tsx
// components/chat-panel/chat-panel.tsx
export function ChatPanel({ sessionId }: { sessionId: string }) {
  const chatState = useMultiChatStore(s => s.sessions[sessionId]);
  const { messages, status, input, submit, stop, setInput } = chatState ?? {};
  // ... 其余为相同的 UI 渲染
}
```

从 `page.tsx` 的 `ChatPanel` 挂载中移除 `key={activeSessionId}` — 不再需要，因为 ChatPanel 不再持有 session 特定的 React 状态。

#### `page.tsx` 中 session 切换的变更

从 `handleSwitchSession` 中移除 `resetEvents()`。移除「Agent 正在运行」确认弹窗 — 切换现在始终是即时且安全的。切换时标记通知为已读：

```ts
const handleSwitchSession = useCallback((id: string) => {
  if (id === activeSessionId) return;
  setActiveSession(id);
  useNotificationStore.getState().markRead(id);
}, [activeSessionId, setActiveSession]);
```

`handleCreateSession` 中的「Agent 正在运行」确认弹窗保留 — 在某个 session 运行时创建新 session 仍是一个有意义的决策点。

#### Event Store 迁移

`useEventStore` 目前持有活跃 session 的实时事件。新架构下：
- `useEventSync` 移入 `AgentWorker`，按 session 调用。
- Debug 面板从 `useSessionStore`（持久化的 `session.events`）读取事件，而非 `useEventStore`。
- `useEventStore` 中的 `agentStatus` 由 `useMultiChatStore[activeSessionId].status` 替代，用于状态徽章。

#### `useEventSync` Hook 签名变更

当前：`useEventSync(messages)` → 变更为：`useEventSync(messages, sessionId)`，以便将事件写入 `useSessionStore` 中对应的 session。

---

### 子项目 B：Debug 面板 Stats 标签页

#### 数据来源

从 `useEventStore.events`（短暂）改为 `useSessionStore` 活跃 session 的 `events`（持久化）。这意味着统计数据在 session 切换后仍然保留。

#### 统计计算

```ts
// 从 session.events 计算
const byTool = events.reduce((acc, e) => {
  if (!acc[e.tool]) acc[e.tool] = [];
  acc[e.tool].push(e);
  return acc;
}, {} as Record<string, AgentEvent[]>);

function toolStats(events: AgentEvent[]) {
  const completed = events.filter(e => e.duration != null);
  const total = completed.reduce((s, e) => s + (e.duration ?? 0), 0);
  return {
    count: events.length,
    totalMs: total,
    avgMs: completed.length > 0 ? Math.round(total / completed.length) : null,
  };
}
```

#### UI：两个标签页

Debug 面板 header 区域增加标签切换（「Events」| 「Stats」）。默认：「Events」（现有列表视图）。

**Stats 标签页布局：**

| Tool | 调用次数 | 总时长 | 平均时长 |
|------|---------|--------|----------|
| 全部 | 12 | 4823ms | 402ms |
| computer | 9 | 3200ms | 356ms |
| bash | 3 | 1623ms | 541ms |

Tool 名称使用与事件列表相同的图标（computer 用 `Monitor`，bash 用 `Terminal`）。

---

## UI 变更

### Session 侧边栏

每个 `SessionItem` 接收两个新 props：
- `isRunning: boolean` — 该 session 的 `status === "submitted" || status === "streaming"`
- `hasUnread: boolean` — notification store 中 `unread.has(sessionId)`

指示点：
- **isRunning**：session 标题右侧显示小型琥珀色脉冲点（⬤）
- **hasUnread**：小型实心绿点（⬤）— 若两者同时为 true，绿点优先显示

侧边栏底部新增设置齿轮图标（`lucide-react` 的 `Settings`），点击打开 `SettingsDialog`。

### 设置弹窗

```tsx
// components/settings-dialog.tsx
<Dialog>
  <DialogTrigger asChild>
    <Button variant="ghost" size="icon"><Settings /></Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader><DialogTitle>设置</DialogTitle></DialogHeader>
    <div>
      <Label>最大并发运行 session 数</Label>
      <Input
        type="number" min={1} max={5}
        value={maxConcurrentSessions}
        onChange={e => setMaxConcurrentSessions(Number(e.target.value))}
      />
      <p className="text-xs text-muted-foreground">
        达到上限时，新的运行请求会被阻止，直到有 session 完成或停止。
      </p>
    </div>
  </DialogContent>
</Dialog>
```

---

## 文件清单

| 文件 | 操作 | 职责 |
|------|------|------|
| `components/agent-worker.tsx` | **新建** | 每个 session 的 useChat、事件同步、store 写入 |
| `lib/store/multi-chat-store.ts` | **新建** | 每个 session 的聊天状态与控制函数 |
| `lib/store/notification-store.ts` | **新建** | 未读完成运行的追踪 |
| `lib/store/settings-store.ts` | **新建** | 持久化用户设置 |
| `components/settings-dialog.tsx` | **新建** | 并发上限配置 UI |
| `components/chat-panel/chat-panel.tsx` | **修改** | 移除 useChat，改为读取 multi-chat-store |
| `components/chat-panel/session-sidebar.tsx` | **修改** | 运行中与未读指示点，设置齿轮 |
| `lib/hooks/use-event-sync.ts` | **修改** | 接受 sessionId 参数，写入对应 session |
| `components/vnc-panel/debug-panel.tsx` | **修改** | Stats 标签页，从 session.events 读取 |
| `app/page.tsx` | **修改** | 挂载 AgentWorkers，更新切换处理函数 |

---

## 错误处理

- **超过并发上限**：Toast 提示「最多同时运行 N 个 session」，并附说明要先停止一个。不启动新的运行。
- **后台 agent 错误**：AgentWorker 的 `onError` 将该 session 标记为未读（绿点）。用户切换回去时看到错误状态。
- **运行中 session 被删除**：AgentWorker 卸载，`useChat` 中止请求。这是可接受的行为 — 用户明确删除了该 session。

---

## 数据流总结

```
用户在 ChatPanel 提交消息
  → 调用 useMultiChatStore.sessions[id].submit(input)
    → AgentWorker 检查并发上限
    → 调用 useChat.handleSubmit
      → 从 /api/chat 流式传输
      → messages 更新到 useMultiChatStore
      → ChatPanel 重新渲染（读取 store）
      → useEventSync 将事件写入 session.events（useSessionStore）
    → onFinish：
        若 activeSessionId !== sessionId → markUnread(sessionId)

用户切换 session
  → setActiveSession(newId)
  → markRead(newId)
  → ChatPanel 读取 useMultiChatStore[newId] — 即时，无网络请求
  → 上一个 session 的 AgentWorker 继续运行，不受影响
```
