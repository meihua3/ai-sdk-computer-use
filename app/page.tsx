"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { toast } from "sonner";
import { useSessionStore } from "@/lib/store/session-store";
import { useEventStore } from "@/lib/store/event-store";
import { useSessionSandbox } from "@/lib/hooks/use-session-sandbox";
import { SessionSidebar } from "@/components/chat-panel/session-sidebar";
import { ChatPanel } from "@/components/chat-panel/chat-panel";
import { VncPanel } from "@/components/vnc-panel/vnc-panel";
import { DebugPanel } from "@/components/vnc-panel/debug-panel";

export default function Page() {
  const [debugCollapsed, setDebugCollapsed] = useState(false);
  const [switchPending, setSwitchPending] = useState<string | null>(null);

  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const createSession = useSessionStore((s) => s.createSession);
  const deleteSession = useSessionStore((s) => s.deleteSession);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const activeSandboxId = useSessionStore((s) => s.activeSandboxId());

  const agentStatus = useEventStore((s) => s.agentStatus);
  const resetEvents = useEventStore((s) => s.reset);

  const { streamUrl, isInitializing, initSandbox, killCurrentSandbox } =
    useSessionSandbox();

  // Initialize with a session if none exists
  useEffect(() => {
    if (sessions.length === 0) {
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

  // Kill desktop on page close
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

  const handleSwitchSession = useCallback(
    async (id: string) => {
      if (id === activeSessionId) return;
      if (agentStatus.type === "running") {
        setSwitchPending(id);
        const confirmed = window.confirm(
          "Agent is running. Stop it and switch session?"
        );
        if (!confirmed) {
          setSwitchPending(null);
          return;
        }
      }
      await killCurrentSandbox();
      resetEvents();
      setActiveSession(id);
      setSwitchPending(null);
    },
    [activeSessionId, agentStatus, killCurrentSandbox, resetEvents, setActiveSession]
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      const isActive = id === activeSessionId;
      if (isActive) {
        const confirmed = window.confirm(
          "Delete this session? The desktop will be closed."
        );
        if (!confirmed) return;
        await killCurrentSandbox();
        resetEvents();
      }
      deleteSession(id);
    },
    [activeSessionId, killCurrentSandbox, resetEvents, deleteSession]
  );

  // suppress unused warning for switchPending
  void switchPending;

  return (
    <div className="flex h-dvh bg-[#0F172A] text-[#f8fafc]">
      {/* Session Sidebar — desktop only */}
      <div className="hidden xl:flex">
        <SessionSidebar
          onSwitchSession={handleSwitchSession}
          onDeleteSession={handleDeleteSession}
        />
      </div>

      {/* Main panels — desktop */}
      <div className="flex-1 hidden xl:block">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Left: Chat */}
          <ResizablePanel defaultSize={35} minSize={25}>
            <ChatPanel sandboxId={activeSandboxId} />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right: VNC + Debug */}
          <ResizablePanel defaultSize={65} minSize={35}>
            <div className="flex flex-col h-full">
              <div className="flex-1 min-h-0">
                <VncPanel
                  streamUrl={streamUrl}
                  isInitializing={isInitializing}
                  onRefresh={initSandbox}
                />
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
        <ChatPanel sandboxId={activeSandboxId} />
      </div>
    </div>
  );
}
