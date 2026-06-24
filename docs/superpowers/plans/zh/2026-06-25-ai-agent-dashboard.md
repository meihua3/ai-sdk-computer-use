# AI Agent Dashboard 实现计划

> **代理工作者注意：** 必须使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务执行此计划。步骤使用复选框（`- [ ]`）语法跟踪进度。

**目标：** 将 ai-sdk-computer-use demo 升级为生产级 AI Agent Dashboard，包含多 Session 管理、事件管道、Debug 面板和严格 TypeScript。

**架构：** Zustand 管理状态（session store + event store），React.memo 隔离 VNC 避免被 chat 重渲染，zustand/persist 实现 localStorage 持久化，useEventSync hook 桥接 AI SDK 消息到事件管道。

**技术栈：** Next.js 15、AI SDK、Zustand、shadcn/ui、Tailwind CSS 4、TypeScript strict、react-resizable-panels

**设计系统（来自 ui-ux-pro-max）：**
- 风格：Dark Mode OLED + 数据密集型 Dashboard
- 背景：`#0F172A`，表面：`#1E293B`，边框：`rgba(255,255,255,0.08)`
- Accent：`#22C55E`（运行中/成功），错误：`#EF4444`，静音：`#272F42`
- 字体：Inter（标题+正文统一），过渡：150-300ms ease-out
- Glassmorphism 卡片：`backdrop-filter: blur(20px)`，顶部边缘高光

---

## 任务 1：安装依赖 & TypeScript 配置

**文件：**
- 修改：`package.json`
- 修改：`tsconfig.json`

- [ ] **步骤 1：安装 zustand**

```bash
cd ai-sdk-computer-use
pnpm add zustand
```

- [ ] **步骤 2：启用严格 TypeScript**

在 `tsconfig.json` 中确保：
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

- [ ] **步骤 3：提交**

```bash
git add package.json pnpm-lock.yaml tsconfig.json
git commit -m "chore: add zustand, enable strict TypeScript"
```

---

## 任务 2：类型系统

**文件：**
- 创建：`lib/types/index.ts`

参见英文版 Task 2 中的完整代码。包含：`EventStatus`、`AgentStatus`（discriminated union）、`ComputerToolPayload`、`BashToolPayload`、`AgentEvent`（discriminated union）、`Session`。

- [ ] **步骤 1：创建类型定义文件**（见英文计划 Task 2 Step 1）
- [ ] **步骤 2：提交**

```bash
git add lib/types/index.ts
git commit -m "feat: add core type definitions with discriminated unions"
```

---

## 任务 3：Session Store

**文件：**
- 创建：`lib/store/session-store.ts`

核心功能：
- `createSession()`：创建新 session，超过 20 个时自动淘汰最老的
- `deleteSession(id)`：若删除当前 session 则自动创建新的
- `setSandboxId(id, sandboxId)`：记录每个 session 的沙箱 ID
- `appendEvent / updateEvent`：将 events 持久化到 session
- `zustand/persist`：自动同步到 localStorage（key: `ai-agent-sessions`）
- `checkStorageUsage()`：写入后检查，使用率 > 80% 时触发 `storage-warning` 事件

参见英文版 Task 3 中的完整代码。

- [ ] **步骤 1：创建 session store**（见英文计划 Task 3 Step 1）
- [ ] **步骤 2：提交**

```bash
git add lib/store/session-store.ts
git commit -m "feat: add session store with zustand persist and 20-session cap"
```

---

## 任务 4：Event Store

**文件：**
- 创建：`lib/store/event-store.ts`

运行时状态，不持久化，session 切换时调用 `reset()` 清空。

参见英文版 Task 4 中的完整代码。

- [ ] **步骤 1：创建 event store**（见英文计划 Task 4 Step 1）
- [ ] **步骤 2：提交**

```bash
git add lib/store/event-store.ts
git commit -m "feat: add runtime event store"
```

---

## 任务 5：useEventSync Hook

**文件：**
- 创建：`lib/hooks/use-event-sync.ts`

桥接逻辑：
- 监听 `useChat` 的 `messages`，diff tool-invocation parts
- 新 tool call：同时写入 `useEventStore.addEvent()` 和 `useSessionStore.appendEvent()`（运行时 + 持久化双写）
- tool call 完成：更新 status 为 `success`，计算 duration
- `agentStatus` 由 `useChat` 的 `status` 字段驱动

参见英文版 Task 5 中的完整代码。

- [ ] **步骤 1：创建 hook**（见英文计划 Task 5 Step 1）
- [ ] **步骤 2：提交**

```bash
git add lib/hooks/use-event-sync.ts
git commit -m "feat: add useEventSync hook bridging AI SDK messages to event pipeline"
```

---

## 任务 6：useSessionSandbox Hook

**文件：**
- 创建：`lib/hooks/use-session-sandbox.ts`

懒加载逻辑：
- 监听 `activeSession?.id` 变化
- 切换时：调用 `killDesktop()` 销毁旧沙箱，调用 `getDesktopURL()` 创建新沙箱
- 返回 `streamUrl`、`isInitializing`、`initSandbox`、`killCurrentSandbox`

参见英文版 Task 6 中的完整代码。

- [ ] **步骤 1：创建 hook**（见英文计划 Task 6 Step 1）
- [ ] **步骤 2：提交**

```bash
git add lib/hooks/use-session-sandbox.ts
git commit -m "feat: add useSessionSandbox hook for lazy sandbox lifecycle"
```

---

## 任务 7：VNC 面板组件

**文件：**
- 创建：`components/vnc-panel/vnc-panel.tsx`（React.memo 隔离）
- 创建：`components/vnc-panel/debug-panel.tsx`（event 列表 + agent 状态徽章）
- 创建：`components/vnc-panel/index.ts`

设计要点：
- `VncPanel`：props 只接收 `sandboxId` 和 `isInitializing`，用 `React.memo` 包裹，保证 chat 更新时零重渲染
- `DebugPanel`：订阅 `useEventStore`，显示事件列表（最新在前）、agent 状态徽章（绿色脉冲=运行中）；折叠/展开由父组件控制

参见英文版 Task 7 中的完整代码。

- [ ] **步骤 1：创建 VncPanel**（见英文计划 Task 7 Step 1）
- [ ] **步骤 2：创建 DebugPanel**（见英文计划 Task 7 Step 2）
- [ ] **步骤 3：创建 barrel 导出**（见英文计划 Task 7 Step 3）
- [ ] **步骤 4：提交**

```bash
git add components/vnc-panel/
git commit -m "feat: add VncPanel (memo-isolated) and DebugPanel with event timeline"
```

---

## 任务 8：Session 侧边栏组件

**文件：**
- 创建：`components/chat-panel/session-sidebar.tsx`

功能：
- Session 列表，活跃 session 高亮
- 双击标题 → inline 输入框 → 回车/失焦保存
- 悬停显示铅笔（重命名）和垃圾桶（删除）图标
- "+ New Session" 按钮

参见英文版 Task 8 中的完整代码。

- [ ] **步骤 1：创建 SessionSidebar**（见英文计划 Task 8 Step 1）
- [ ] **步骤 2：提交**

```bash
git add components/chat-panel/session-sidebar.tsx
git commit -m "feat: add SessionSidebar with inline rename and delete"
```

---

## 任务 9：Tool Call 卡片组件

**文件：**
- 创建：`components/chat-panel/tool-call-card.tsx`

功能：
- 默认折叠，只显示工具名 + 动作摘要 + 状态图标
- 点击展开，显示完整 args JSON 和 result（截图则渲染图片）
- 状态：pending（spinner）→ success（绿色勾）→ error（红色叉）→ aborted（黄色斜线）

参见英文版 Task 9 中的完整代码。

- [ ] **步骤 1：创建 ToolCallCard**（见英文计划 Task 9 Step 1）
- [ ] **步骤 2：提交**

```bash
git add components/chat-panel/tool-call-card.tsx
git commit -m "feat: add collapsible ToolCallCard component"
```

---

## 任务 10：Chat 面板组件

**文件：**
- 创建：`components/chat-panel/chat-panel.tsx`
- 创建：`components/chat-panel/index.ts`

功能：
- Session 感知的 `useChat`：`id` 和 `initialMessages` 绑定当前 session
- 消息同步回 `useSessionStore`（每次 messages 变化时持久化）
- 首条用户消息后自动更新 session 标题
- 调用 `useEventSync` 驱动事件管道
- 用户消息：右对齐气泡（`bg-white/10`）；助手消息：左对齐，支持 Markdown
- Tool call 用 `ToolCallCard` 渲染（折叠卡片）

参见英文版 Task 10 中的完整代码。

- [ ] **步骤 1：创建 ChatPanel**（见英文计划 Task 10 Step 1）
- [ ] **步骤 2：创建 barrel 导出**（见英文计划 Task 10 Step 2）
- [ ] **步骤 3：提交**

```bash
git add components/chat-panel/
git commit -m "feat: add ChatPanel with session-aware useChat and message rendering"
```

---

## 任务 11：重写 page.tsx

**文件：**
- 修改：`app/page.tsx`

布局：
- 左：Session 侧边栏（200px，仅桌面端）
- 中：Chat 面板（ResizablePanel，默认 35%）
- 右：VNC 面板 + Debug 面板（ResizablePanel，默认 65%）
- 移动端：仅显示 Chat，VNC 和侧边栏隐藏
- 监听 `storage-warning` 事件，触发 toast 提示
- `beforeunload` 时 `sendBeacon` 销毁沙箱
- 切换 session / 删除 session 时的守卫逻辑

参见英文版 Task 11 中的完整代码。

- [ ] **步骤 1：重写 page.tsx**（见英文计划 Task 11 Step 1）
- [ ] **步骤 2：提交**

```bash
git add app/page.tsx
git commit -m "feat: rewire page.tsx with session sidebar, split panels, VNC isolation"
```

---

## 任务 12：全局样式 & 设计系统 Token

**文件：**
- 修改：`app/globals.css`

添加 CSS 变量：
- `--color-bg: #0F172A`、`--color-surface: #1E293B`
- `--color-accent: #22C55E`（运行/成功）
- `--color-destructive: #EF4444`
- 自定义滚动条（深色细滚动条）
- Inter 字体导入

参见英文版 Task 12 中的完整代码。

- [ ] **步骤 1：添加 CSS 变量**（见英文计划 Task 12 Step 1）
- [ ] **步骤 2：添加 Inter 字体**（见英文计划 Task 12 Step 2）
- [ ] **步骤 3：提交**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: add design system CSS tokens (dark OLED + glassmorphism palette)"
```

---

## 任务 13：冒烟测试 & 修复

- [ ] **步骤 1：启动开发服务器**

```bash
pnpm dev
```

- [ ] **步骤 2：手动验证清单**

- [ ] 页面加载无 TypeScript 错误
- [ ] 首次加载自动创建一个 session
- [ ] "+ New Session" 可创建新 session
- [ ] 双击 session 标题可重命名，回车保存
- [ ] 删除非活跃 session 无需确认，直接删除
- [ ] 删除活跃 session 弹出确认框
- [ ] Chat 面板显示空状态提示
- [ ] VNC 面板在沙箱初始化期间显示加载动画
- [ ] 发送消息（"What's the weather in Dubai?"）— VNC 显示 agent 工作
- [ ] Tool call 卡片默认折叠，点击展开
- [ ] Debug 面板实时显示 events
- [ ] Debug 面板可折叠/展开
- [ ] Agent 空闲时切换 session 即时生效
- [ ] Agent 运行时切换 session 弹出确认框
- [ ] localStorage 有 `ai-agent-sessions` 数据（DevTools > Application > Storage）

- [ ] **步骤 3：修复发现的问题后提交**

```bash
git add -A
git commit -m "fix: smoke test corrections"
```

---

## 需求覆盖矩阵

| 需求 | 对应任务 |
|------|---------|
| 左 Chat 右 VNC 布局 | 任务 11 |
| Session 侧边栏 | 任务 8、11 |
| 可拖拽调整面板宽度 | 任务 11 |
| Tool call 折叠卡片 | 任务 9 |
| Debug 面板（可折叠，右侧） | 任务 7 |
| VNC memo 隔离 | 任务 7（React.memo）|
| Event Pipeline（id/时间戳/类型/payload/状态/耗时） | 任务 5 |
| Agent 状态（idle/running/error） | 任务 4、5 |
| 多 Session 创建/切换/删除 | 任务 3、8 |
| localStorage 持久化 | 任务 3（persist middleware）|
| 最多 20 个 session，自动淘汰 | 任务 3 |
| 存储 80% 时 toast 警告 | 任务 3、11 |
| 删除活跃 session → 确认 → 自动创建 | 任务 3 |
| agent 运行时切换 → 确认 | 任务 11 |
| Session 自动以首条消息命名 | 任务 10 |
| 双击重命名 | 任务 8 |
| Sandbox 懒加载 | 任务 6 |
| Discriminated unions，禁 any | 任务 2 |
| 移动端：仅 Chat，VNC 隐藏 | 任务 11 |
| Dark OLED 设计系统 | 任务 12 |
