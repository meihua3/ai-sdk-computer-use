// components/chat-panel/mobile-session-drawer.tsx
"use client";

import { useSessionStore } from "@/lib/store/session-store";
import { useMultiChatStore } from "@/lib/store/multi-chat-store";
import { useNotificationStore } from "@/lib/store/notification-store";
import { cn } from "@/lib/utils";
import { Plus, Trash2, X } from "lucide-react";
import { SettingsDialog } from "@/components/settings-dialog";

type MobileSessionDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreateSession: () => void;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
};

export function MobileSessionDrawer({
  isOpen,
  onClose,
  onCreateSession,
  onSwitchSession,
  onDeleteSession,
}: MobileSessionDrawerProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const chatSessions = useMultiChatStore((s) => s.sessions);
  const unread = useNotificationStore((s) => s.unread);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop — click to close */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer panel */}
      <div className="fixed top-0 left-0 bottom-0 w-3/4 max-w-xs z-50 bg-[#0a0e1a] border-r border-white/[0.06] flex flex-col">
        {/* Header row */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-white/[0.06]">
          <span className="text-sm font-medium text-[#94a3b8]">会话列表</span>
          <button
            onClick={onClose}
            className="p-1 rounded text-[#475569] hover:text-[#94a3b8] hover:bg-white/5"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* New session button */}
        <div className="p-2 border-b border-white/[0.06]">
          <button
            onClick={() => {
              onCreateSession();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#94a3b8] hover:bg-white/5 hover:text-[#f8fafc] transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建会话
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {sessions.length === 0 && (
            <p className="text-xs text-[#475569] text-center py-4">暂无会话</p>
          )}
          {sessions.map((session) => {
            const chatEntry = chatSessions[session.id];
            const isRunning =
              chatEntry?.status === "submitted" ||
              chatEntry?.status === "streaming";
            const hasUnread = unread.has(session.id);
            const isActive = session.id === activeSessionId;

            return (
              <div
                key={session.id}
                className={cn(
                  "group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-sm",
                  isActive
                    ? "bg-white/10 text-[#f8fafc]"
                    : "text-[#94a3b8] hover:bg-white/5 hover:text-[#f8fafc]"
                )}
                onClick={() => onSwitchSession(session.id)}
              >
                <span className="flex-1 truncate">{session.title}</span>

                <div className="flex items-center gap-2 shrink-0">
                  {hasUnread && (
                    <span
                      className="w-2 h-2 rounded-full bg-[#22c55e]"
                      aria-label="新消息"
                    />
                  )}
                  {isRunning && !hasUnread && (
                    <span
                      className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"
                      aria-label="运行中"
                    />
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:text-[#ef4444] text-[#475569] transition-opacity"
                    aria-label="删除会话"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Settings at bottom */}
        <div className="p-2 border-t border-white/[0.06] flex justify-end">
          <SettingsDialog />
        </div>
      </div>
    </>
  );
}
