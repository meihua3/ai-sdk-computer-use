// app/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { toast } from "sonner";
import { useSessionStore } from "@/lib/store/session-store";
import { useMultiChatStore } from "@/lib/store/multi-chat-store";
import { useNotificationStore } from "@/lib/store/notification-store";
import { useSessionSandbox } from "@/lib/hooks/use-session-sandbox";
import { useSandboxUrlStore } from "@/lib/store/sandbox-url-store";
import { killDesktop } from "@/lib/sandbox/utils";
import { AgentWorker } from "@/components/agent-worker";
import { SessionSidebar } from "@/components/chat-panel/session-sidebar";
import { ChatPanel } from "@/components/chat-panel/chat-panel";
import { VncPanel } from "@/components/vnc-panel/vnc-panel";
import { DebugPanel } from "@/components/vnc-panel/debug-panel";
import { Menu } from "lucide-react";
import { MobileSessionDrawer } from "@/components/chat-panel/mobile-session-drawer";

export default function Page() {
  const [debugCollapsed, setDebugCollapsed] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const createSession = useSessionStore((s) => s.createSession);
  const deleteSession = useSessionStore((s) => s.deleteSession);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeChatStatus = useMultiChatStore(
    (s) =>
      activeSessionId
        ? s.sessions[activeSessionId]?.status ?? "ready"
        : "ready"
  );
  const isActiveRunning =
    activeChatStatus === "submitted" || activeChatStatus === "streaming";

  const { initSandbox } = useSessionSandbox();

  // Initialize with a session if none exists
  useEffect(() => {
    if (useSessionStore.getState().sessions.length === 0) {
      createSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for storage warning events
  useEffect(() => {
    const handler = () => {
      toast.warning("Storage almost full", {
        description: "Consider deleting old sessions to free up space.",
        richColors: true,
      });
    };
    window.addEventListener("storage-warning", handler);
    return () => window.removeEventListener("storage-warning", handler);
  }, []);

  // Kill active sandbox on page close
  useEffect(() => {
    const active = useSessionStore.getState().activeSession();
    if (!active?.sandboxId) return;
    const kill = () => {
      navigator.sendBeacon(
        `/api/kill-desktop?sandboxId=${encodeURIComponent(active.sandboxId!)}`
      );
    };
    window.addEventListener("beforeunload", kill);
    return () => window.removeEventListener("beforeunload", kill);
  }, [activeSessionId]);

  // Create new session — confirm only if active session is running
  const handleCreateSession = useCallback(() => {
    const activeId = useSessionStore.getState().activeSessionId;
    const activeStatus = activeId
      ? useMultiChatStore.getState().sessions[activeId]?.status
      : "ready";
    if (activeStatus === "submitted" || activeStatus === "streaming") {
      const confirmed = window.confirm(
        "Agent is running. Create new session anyway?"
      );
      if (!confirmed) return;
    }
    createSession();
  }, [createSession]);

  // Switch session — instant, agent keeps running in background
  const handleSwitchSession = useCallback(
    (id: string) => {
      if (id === activeSessionId) return;
      setActiveSession(id);
      useNotificationStore.getState().markRead(id);
    },
    [activeSessionId, setActiveSession]
  );

  // Delete session — kill sandbox, clear stores, remove
  const handleDeleteSession = useCallback(
    async (id: string) => {
      const session = useSessionStore.getState().sessions.find((s) => s.id === id);
      const isActive = id === activeSessionId;
      if (isActive) {
        const confirmed = window.confirm(
          "Delete this session? The desktop will be closed."
        );
        if (!confirmed) return;
      }
      if (session?.sandboxId) {
        killDesktop(session.sandboxId).catch(() => {});
      }
      useSandboxUrlStore.getState().clearUrl(id);
      useNotificationStore.getState().markRead(id);
      deleteSession(id);
    },
    [activeSessionId, deleteSession]
  );

  return (
    <div className="flex h-dvh bg-[#0F172A] text-[#f8fafc]">
      {/* AgentWorker for every session — no UI, keeps useChat alive */}
      {sessions.map((session) => (
        <AgentWorker key={session.id} sessionId={session.id} />
      ))}

      {/* Session Sidebar — desktop only */}
      <div className="hidden xl:flex">
        <SessionSidebar
          onCreateSession={handleCreateSession}
          onSwitchSession={handleSwitchSession}
          onDeleteSession={handleDeleteSession}
        />
      </div>

      {/* Main panels — desktop */}
      <div className="flex-1 hidden xl:block">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Left: Chat */}
          <ResizablePanel defaultSize={35} minSize={25}>
            <ChatPanel
              key={activeSessionId ?? "none"}
              sessionId={activeSessionId ?? ""}
            />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right: VNC + Debug */}
          <ResizablePanel defaultSize={65} minSize={35}>
            <div className="flex flex-col h-full">
              <div className="flex-1 min-h-0">
                <VncPanel onRefresh={initSandbox} />
              </div>
              <DebugPanel
                isCollapsed={debugCollapsed}
                onToggle={() => setDebugCollapsed((v) => !v)}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

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
    </div>
  );
}
