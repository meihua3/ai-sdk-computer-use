# 无痛 VNC Session 切换 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 每个访问过的 session 在 DOM 里保留一个 VNC iframe，切换 session 时无黑屏、无 reload，完全即时。

**架构：** 新增运行时 Zustand store（`useSandboxUrlStore`）存储 `sessionId → streamUrl | null` 映射。`useSessionSandbox` 懒加载初始化（首次点击才建连接），写入 store。`VncPanel` 直接读 store，渲染 N 个 iframe，用 `display: none/block` 切换可见性。`page.tsx` 不再向 `VncPanel` 传递 stream 相关 props。

**Tech Stack：** Next.js 15 App Router，TypeScript，Zustand（无 persist），React.memo，noVNC iframe

---

## 文件清单

| 文件 | 操作 | 职责 |
|------|------|------|
| `lib/store/sandbox-url-store.ts` | **新建** | 运行时 URL 映射：sessionId → url\|null\|不存在 |
| `lib/hooks/use-session-sandbox.ts` | **重写** | 按需懒加载，keepalive 所有已访问 session |
| `components/vnc-panel/vnc-panel.tsx` | **重写** | 多 iframe，读 store，不接收 URL props |
| `app/page.tsx` | **修改** | 删除 streamUrl/isInitializing 传递 |

---

## Task 1：创建 `sandbox-url-store.ts`

**文件：**
- 新建：`lib/store/sandbox-url-store.ts`

- [ ] **Step 1：写 store**

```ts
import { create } from "zustand";

type SandboxUrlStore = {
  urls: Record<string, string | null>; // sessionId → url | null（null = 初始化中）
  setUrl: (sessionId: string, url: string) => void;
  setInitializing: (sessionId: string) => void;
  clearUrl: (sessionId: string) => void;
};

export const useSandboxUrlStore = create<SandboxUrlStore>()((set) => ({
  urls: {},

  setUrl: (sessionId, url) =>
    set((state) => ({ urls: { ...state.urls, [sessionId]: url } })),

  setInitializing: (sessionId) =>
    set((state) => ({ urls: { ...state.urls, [sessionId]: null } })),

  clearUrl: (sessionId) =>
    set((state) => {
      const urls = { ...state.urls };
      delete urls[sessionId];
      return { urls };
    }),
}));
```

**语义说明：**
- key 不存在 → session 从未访问过，不渲染 iframe
- `null` → 初始化中（显示 spinner）
- `string` → URL 就绪，渲染 iframe

- [ ] **Step 2：TypeScript 检查**

```bash
npx tsc --noEmit
```

预期：无与 `sandbox-url-store.ts` 相关的错误。

- [ ] **Step 3：Commit**

```bash
git add lib/store/sandbox-url-store.ts
git commit -m "feat: add sandbox-url-store for per-session VNC URL tracking"
```

---

## Task 2：重写 `use-session-sandbox.ts`

**文件：**
- 修改：`lib/hooks/use-session-sandbox.ts`

替换整个文件。核心变更：
- `visitedIds` ref 记录本次页面生命周期内访问过的 session
- `activeSessionId` 变化时：若 URL store 无此条目 → 标记初始化中 → 拉取 URL → 写入 store
- 若 URL 条目已存在 → 什么都不做（iframe 已在 DOM，直接显现）
- Keepalive 改为 ping **所有**已访问 session（不仅是当前 active）
- 不再返回 `streamUrl` 或 `isInitializing`

- [ ] **Step 1：重写 hook**

完整替换 `lib/hooks/use-session-sandbox.ts`：

```ts
import { useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { getDesktopURL, killDesktop } from "@/lib/sandbox/utils";
import { useSessionStore } from "@/lib/store/session-store";
import { useSandboxUrlStore } from "@/lib/store/sandbox-url-store";

export function useSessionSandbox() {
  const visitedIds = useRef<Set<string>>(new Set());

  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  // 首次访问每个 session 时懒加载初始化
  useEffect(() => {
    if (!activeSessionId) return;

    visitedIds.current.add(activeSessionId);

    // 已有条目（初始化中或就绪）→ iframe 已在 DOM，直接显现
    if (useSandboxUrlStore.getState().urls[activeSessionId] !== undefined) return;

    // 首次访问：开始初始化
    const existingSandboxId = useSessionStore.getState().activeSandboxId();
    useSandboxUrlStore.getState().setInitializing(activeSessionId);

    let cancelled = false;
    getDesktopURL(existingSandboxId ?? undefined)
      .then(({ streamUrl, id }) => {
        if (cancelled) return;
        useSandboxUrlStore.getState().setUrl(activeSessionId, streamUrl);
        useSessionStore.getState().setSandboxId(activeSessionId, id);
      })
      .catch(() => {
        if (cancelled) return;
        useSandboxUrlStore.getState().clearUrl(activeSessionId);
        toast.error("Failed to connect desktop", {
          description: "Click the session again to retry.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);

  // Keepalive — 每 25s ping 所有已访问 session，防止空闲超时
  useEffect(() => {
    const ping = () => {
      const { sessions } = useSessionStore.getState();
      for (const sessionId of visitedIds.current) {
        const session = sessions.find((s) => s.id === sessionId);
        if (!session?.sandboxId) continue;
        fetch("/api/sandbox-keepalive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sandboxId: session.sandboxId }),
        }).catch(() => {});
      }
    };
    const id = setInterval(ping, 25_000);
    return () => clearInterval(id);
  }, []);

  // 强制为当前 session 新建 sandbox（"New Desktop" 按钮）
  const initSandbox = useCallback(async () => {
    if (!activeSessionId) return;
    useSandboxUrlStore.getState().setInitializing(activeSessionId);
    try {
      const { streamUrl, id } = await getDesktopURL(undefined);
      useSandboxUrlStore.getState().setUrl(activeSessionId, streamUrl);
      useSessionStore.getState().setSandboxId(activeSessionId, id);
    } catch {
      useSandboxUrlStore.getState().clearUrl(activeSessionId);
      toast.error("Failed to create desktop");
    }
  }, [activeSessionId]);

  // 销毁指定 session 的 sandbox（用于删除 session）
  const killSandboxForSession = useCallback(
    async (sessionId: string, sandboxId: string) => {
      try {
        await killDesktop(sandboxId);
      } catch {}
      useSandboxUrlStore.getState().clearUrl(sessionId);
      useSessionStore.getState().setSandboxId(sessionId, null);
    },
    []
  );

  return { initSandbox, killSandboxForSession };
}
```

- [ ] **Step 2：TypeScript 检查**

```bash
npx tsc --noEmit
```

预期：只有 `vnc-panel.tsx` 和 `page.tsx` 的报错（它们还在用旧 API），Task 3/4 修复。

- [ ] **Step 3：Commit**

```bash
git add lib/hooks/use-session-sandbox.ts
git commit -m "refactor: use-session-sandbox drives lazy init via sandbox-url-store"
```

---

## Task 3：重写 `vnc-panel.tsx`

**文件：**
- 修改：`components/vnc-panel/vnc-panel.tsx`

核心变更：
- Props 精简为 `{ onRefresh: () => void }`，删除 `streamUrl` / `isInitializing`
- 内部订阅 `useSandboxUrlStore` 和 `activeSessionId`
- 为每个已访问 session 渲染一个绝对定位容器；active = `display: block`，其他 = `display: none`
- "New Desktop" 按钮 `z-10` 叠在所有 iframe 上方，仅当 active session 有条目时显示

- [ ] **Step 1：重写组件**

完整替换 `components/vnc-panel/vnc-panel.tsx`：

```tsx
"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useSessionStore } from "@/lib/store/session-store";
import { useSandboxUrlStore } from "@/lib/store/sandbox-url-store";

type VncPanelProps = {
  onRefresh: () => void;
};

export const VncPanel = memo(function VncPanel({ onRefresh }: VncPanelProps) {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const urls = useSandboxUrlStore((s) => s.urls);

  const visitedSessionIds = Object.keys(urls);

  const activeUrl = activeSessionId !== null ? urls[activeSessionId] : undefined;
  // activeUrl === undefined → 未访问 / 无 iframe
  // activeUrl === null     → 初始化中
  // activeUrl === string   → 就绪
  const isInitializing = activeSessionId !== null && activeUrl === null;

  return (
    <div className="relative w-full h-full bg-[#0a0a0f]">
      {/* 每个已访问 session 一个容器 */}
      {visitedSessionIds.map((sessionId) => {
        const url = urls[sessionId];
        const isActive = sessionId === activeSessionId;
        return (
          <div
            key={sessionId}
            className="absolute inset-0"
            style={{ display: isActive ? "block" : "none" }}
          >
            {url ? (
              <iframe
                src={url}
                className="w-full h-full border-0"
                allow="autoplay"
              />
            ) : (
              /* null = 初始化中 */
              <div className="w-full h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-[#94a3b8]">
                  <div className="w-8 h-8 border-2 border-[#22c55e]/40 border-t-[#22c55e] rounded-full animate-spin" />
                  <span className="text-sm">Initializing desktop...</span>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* 兜底：active session 还没进 visited set（极短暂） */}
      {activeSessionId !== null && !(activeSessionId in urls) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-[#94a3b8]">
            <div className="w-8 h-8 border-2 border-[#22c55e]/40 border-t-[#22c55e] rounded-full animate-spin" />
            <span className="text-sm">Loading stream...</span>
          </div>
        </div>
      )}

      {/* New Desktop 按钮 — 仅当 active session 有条目时显示 */}
      {activeSessionId !== null && activeSessionId in urls && (
        <Button
          onClick={onRefresh}
          disabled={isInitializing}
          size="sm"
          className="absolute top-2 right-2 z-10 bg-black/60 hover:bg-black/80 text-white border border-white/10 backdrop-blur-sm text-xs gap-1.5"
        >
          <RefreshCw className="w-3 h-3" />
          {isInitializing ? "Creating..." : "New Desktop"}
        </Button>
      )}
    </div>
  );
});
```

- [ ] **Step 2：TypeScript 检查**

```bash
npx tsc --noEmit
```

预期：只剩 `page.tsx` 的报错（传了旧 props），Task 4 修复。

- [ ] **Step 3：Commit**

```bash
git add components/vnc-panel/vnc-panel.tsx
git commit -m "refactor: vnc-panel renders per-session iframes, reads from sandbox-url-store"
```

---

## Task 4：更新 `app/page.tsx`

**文件：**
- 修改：`app/page.tsx`

变更：
1. 从 `useSessionSandbox` 解构中删除 `streamUrl` 和 `isInitializing`
2. 新增 `useSandboxUrlStore` 导入
3. `<VncPanel>` 只传 `onRefresh={initSandbox}`
4. `handleDeleteSession` 中新增 `useSandboxUrlStore.getState().clearUrl(id)` 清理 URL map

- [ ] **Step 1：更新 imports 和 hook 解构**

在 `app/page.tsx` 中修改：

```ts
// 旧
const { streamUrl, isInitializing, initSandbox } = useSessionSandbox();

// 新
import { useSandboxUrlStore } from "@/lib/store/sandbox-url-store";
// ...
const { initSandbox } = useSessionSandbox();
```

- [ ] **Step 2：更新 `handleDeleteSession`**

在 `deleteSession(id)` 之前加一行：

```ts
useSandboxUrlStore.getState().clearUrl(id);
deleteSession(id);
```

- [ ] **Step 3：更新 `<VncPanel>` JSX**

```tsx
// 旧
<VncPanel
  streamUrl={streamUrl}
  isInitializing={isInitializing}
  onRefresh={initSandbox}
/>

// 新
<VncPanel onRefresh={initSandbox} />
```

- [ ] **Step 4：TypeScript 全量检查**

```bash
npx tsc --noEmit
```

预期：零错误。

- [ ] **Step 5：Commit**

```bash
git add app/page.tsx
git commit -m "refactor: page.tsx removes streamUrl/isInitializing passthrough to VncPanel"
```

---

## Task 5：手动验证

- [ ] **Step 1：启动开发服务器**

```bash
pnpm dev
```

打开 `http://localhost:3000`。

- [ ] **Step 2：验证初始加载**

- VNC 面板立即显示 spinner
- 约 5-30s 后（取决于是否已有 sandbox）iframe 出现桌面
- "New Desktop" 按钮出现在 VNC 右上角
- 控制台无 TypeScript/运行时错误

- [ ] **Step 3：验证即时切换**

1. 等待 Session A 桌面完全加载（iframe 显示桌面）
2. 点击侧边栏 "New Session" —— Session B 创建，VNC 显示 spinner（首次访问）
3. 等待 Session B 桌面加载
4. 点回 Session A ——**桌面立即出现，无 spinner，无黑屏**
5. 点回 Session B ——**同样，即时显示**

- [ ] **Step 4：验证 "New Desktop" 按钮**

1. 在任意已加载桌面的 session 中点击 "New Desktop"
2. 按钮显示 "Creating..." 并禁用
3. 新 sandbox 创建完成后，iframe 显示新桌面
4. 按钮恢复为 "New Desktop"

- [ ] **Step 5：验证删除 session 清理**

1. 创建 2 个 session，都加载好桌面
2. 删除 Session A
3. 确认弹窗出现，点 OK
4. Session A 的 iframe 从 DOM 移除（URL store 条目清除）
5. Session B 仍正常工作

- [ ] **Step 6：验证 chat 更新不影响 VNC**

1. 加载一个有可见桌面的 session
2. 向 agent 发送消息
3. 观察：VNC iframe 在流式响应期间**不闪烁、不 reload、不丢失桌面**
4. 预期：只有 chat 面板更新，VNC 完全稳定

- [ ] **Step 7：最终 commit**

```bash
git commit --allow-empty -m "chore: seamless VNC session switch verified and complete"
```
