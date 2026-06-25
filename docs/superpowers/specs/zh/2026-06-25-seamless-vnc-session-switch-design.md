# 无痛 VNC Session 切换 — 设计规范

**日期：** 2026-06-25
**状态：** 已批准

## 问题

切换 session 时，代码会先将 `streamUrl` 设为 `null`，导致 VNC iframe 消失并显示 loading spinner。即使切换回的 session 的 sandbox 仍在运行，用户也会看到明显的中断。

## 目标

已访问过的 session 切换时完全即时——不黑屏、不转圈。首次访问新 session 仍走正常的初始化流程，但之后每次切回都是瞬间的。

## 非目标

- 在用户点击前预初始化 sandbox（避免不必要的连接）
- 跨页面刷新持久化 VNC URL（URL 可能过期；重新加载时重连是可接受的）

---

## 架构

### 1. 新增运行时 Store — `useSandboxUrlStore`

一个**不带** `persist` 中间件的 Zustand store（运行时内存，页面关闭即清空）。

```ts
type SandboxUrlStore = {
  urls: Record<string, string | null>; // sessionId → url | null（null = 初始化中）
  setUrl: (sessionId: string, url: string) => void;
  setInitializing: (sessionId: string) => void; // 设为 null（标记为加载中）
  clearUrl: (sessionId: string) => void;         // 完全删除条目
};
```

- 值为 `string` → sandbox 就绪，可以渲染 iframe
- 值为 `null` → sandbox 初始化中，在 iframe 槽位显示 spinner
- key 不存在 → 该 session 从未被访问，不渲染 iframe

**文件：** `lib/store/sandbox-url-store.ts`

---

### 2. 重构 `useSessionSandbox`

管理已访问集合并驱动初始化。

**状态：**
- `visitedIds: Set<string>` — 内部 `useRef`，非响应式；记录本次页面生命周期内访问过的 session
- 不再持有 `streamUrl` 或 `isInitializing` 本地 React state

**`activeSessionId` 变化时的行为：**
1. 将 `activeSessionId` 加入 `visitedIds`
2. 检查 `sandboxUrlStore` 中是否已有该 session 的 URL → 若有，结束（iframe 已在 DOM 中，直接显示）
3. 若没有条目 → 调用 `setInitializing(activeSessionId)` → 调用 `getDesktopURL(existingSandboxId)` → 成功后调用 `setUrl(activeSessionId, url)`

**保活（Keepalive）：** 对 `visitedIds` 中所有有 sandboxId 的 session 发送心跳（不仅是当前 active 的），防止后台 session 超时断连。

**对外 API：**
```ts
// useSessionSandbox 返回：
{
  initSandbox: () => Promise<void>;  // "New Desktop" 按钮——强制为当前 session 新建 sandbox
  killSandboxForSession: (sessionId, sandboxId) => Promise<void>;
}
// streamUrl 和 isInitializing 不再返回，VncPanel 直接读 store
```

**文件：** `lib/hooks/use-session-sandbox.ts`

---

### 3. 重构 `VncPanel`

从 store 自行读取数据，不再从父组件接收 URL/loading props。

**新 Props：**
```ts
type VncPanelProps = {
  onRefresh: () => void; // "New Desktop" 按钮回调
};
```

**渲染逻辑：**
1. 从 `useSessionStore` 订阅 `sessions`（获知哪些 sessionId 存在）
2. 从 `useSandboxUrlStore` 订阅 `urls`（获知哪些已访问且就绪）
3. 从 `useSessionStore` 订阅 `activeSessionId`
4. 为 `urls` 中有条目的每个 session 渲染一个容器：
   - `null` 条目 → 显示 spinner（初始化中）
   - `string` 条目 → 渲染 `<iframe src={url} />`
   - 当前 active session 的容器：`display: block`
   - 其他：`display: none`（iframe 保持挂载，WebSocket 保持存活）

**props 稳定性：** `onRefresh` 仍是 `page.tsx` 中 deps 稳定的 `useCallback`；`React.memo` 包装保留。

**文件：** `components/vnc-panel/vnc-panel.tsx`

---

### 4. `page.tsx` 变更

- 从 `useSessionSandbox` 解构中删除 `streamUrl` 和 `isInitializing`
- 从 `<VncPanel>` 调用中删除这两个 prop
- `VncPanel` 只接收 `onRefresh={initSandbox}`
- 保留 `activeSandboxId` 订阅——`<ChatPanel sandboxId={activeSandboxId} />` 仍需要

---

## 数据流

```
用户点击 session B
  → handleSwitchSession(B)
    → setActiveSession(B)           [Zustand]
      → activeSessionId 变化
        → useSessionSandbox effect 触发
          → B 不在 visitedIds？
            → visitedIds.add(B)
            → setInitializing(B)    [sandboxUrlStore]
            → getDesktopURL(existingSandboxId)
            → setUrl(B, url)        [sandboxUrlStore]
          → B 已在 visitedIds 且有 URL？
            → 什么都不做（iframe 已在 DOM）

VncPanel（memo，订阅 sandboxUrlStore + sessionStore）：
  → 只在 urls map 变化时重渲染
  → 显示 session B 的 iframe（display: block）
  → 隐藏 session A 的 iframe（display: none）
```

---

## 连接数

- **页面加载时：** 1 个连接（仅 active session）
- **访问 N 个 session 后：** N 个连接（每个已访问 session 一个）
- **页面刷新后：** 重置为 1

实际使用中，用户在一次页面生命周期内最多访问 2–4 个 session，连接数完全可控。

---

## 错误处理

- 如果 session B 的 `getDesktopURL` 失败：调用 `clearUrl(B)`（删除条目，恢复为未访问状态），显示错误 toast。用户可再次点击该 session 重试。
- 如果后台 sandbox 超时：noVNC 的 `reconnect=true` + `heartbeat=10` 自动处理重连，无需应用层干预。

---

## 涉及文件

| 文件 | 变更 |
|------|------|
| `lib/store/sandbox-url-store.ts` | **新建** — 运行时 URL map store |
| `lib/hooks/use-session-sandbox.ts` | **重构** — visited set，从 store 驱动 |
| `components/vnc-panel/vnc-panel.tsx` | **重构** — 多 iframe，从 store 读取 |
| `app/page.tsx` | **小改** — 删除 streamUrl/isInitializing 传递 |
