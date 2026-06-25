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

export default function Page() {
  const [debugCollapsed, setDebugCollapsed] = useState(false);

  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const createSession = useSessionStore((s) => s.createSession);
  const deleteSession = useSessionStore((s) => s.deleteSession);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);

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
    </div>
  );
}
