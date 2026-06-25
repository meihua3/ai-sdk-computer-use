// components/chat-panel/session-sidebar.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useSessionStore } from "@/lib/store/session-store";
import { useMultiChatStore } from "@/lib/store/multi-chat-store";
import { useNotificationStore } from "@/lib/store/notification-store";
import { cn } from "@/lib/utils";
import { Plus, Trash2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsDialog } from "@/components/settings-dialog";

type SessionItemProps = {
  id: string;
  title: string;
  isActive: boolean;
  isRunning: boolean;
  hasUnread: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
};

function SessionItem({
  title,
  isActive,
  isRunning,
  hasUnread,
  onSelect,
  onDelete,
  onRename,
}: SessionItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const commitRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== title) onRename(trimmed);
    setIsEditing(false);
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm",
        isActive
          ? "bg-white/10 text-[#f8fafc]"
          : "text-[#94a3b8] hover:bg-white/5 hover:text-[#f8fafc]"
      )}
      onClick={!isEditing ? onSelect : undefined}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setIsEditing(false);
          }}
          className="flex-1 bg-transparent outline-none border-b border-[#22c55e] text-[#f8fafc] text-sm"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="flex-1 truncate">{title}</span>
      )}

      {/* Status indicators */}
      {!isEditing && (
        <div className="flex items-center gap-1 shrink-0">
          {hasUnread && (
            <span
              className="w-2 h-2 rounded-full bg-[#22c55e]"
              aria-label="New activity"
            />
          )}
          {isRunning && !hasUnread && (
            <span
              className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"
              aria-label="Running"
            />
          )}
        </div>
      )}

      {!isEditing && (
        <div className="hidden group-hover:flex items-center gap-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditValue(title);
              setIsEditing(true);
            }}
            className="p-1 rounded hover:text-[#f8fafc] text-[#475569]"
            aria-label="Rename session"
          >
            <PenLine className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 rounded hover:text-[#ef4444] text-[#475569]"
            aria-label="Delete session"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

type SessionSidebarProps = {
  onCreateSession: () => void;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
};

export function SessionSidebar({
  onCreateSession,
  onSwitchSession,
  onDeleteSession,
}: SessionSidebarProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const renameSession = useSessionStore((s) => s.renameSession);
  const chatSessions = useMultiChatStore((s) => s.sessions);
  const unread = useNotificationStore((s) => s.unread);

  return (
    <div className="flex flex-col w-[200px] shrink-0 bg-[#0a0e1a] border-r border-white/[0.06] h-full">
      <div className="p-3 border-b border-white/[0.06]">
        <Button
          onClick={onCreateSession}
          className="w-full gap-2 bg-white/5 hover:bg-white/10 text-[#f8fafc] border border-white/10 text-xs h-8"
          variant="ghost"
          size="sm"
        >
          <Plus className="w-3.5 h-3.5" />
          New Session
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {sessions.length === 0 && (
          <p className="text-xs text-[#475569] text-center py-4">
            No sessions yet
          </p>
        )}
        {sessions.map((session) => {
          const chatEntry = chatSessions[session.id];
          const isRunning =
            chatEntry?.status === "submitted" ||
            chatEntry?.status === "streaming";
          const hasUnread = unread.has(session.id);
          return (
            <SessionItem
              key={session.id}
              id={session.id}
              title={session.title}
              isActive={session.id === activeSessionId}
              isRunning={isRunning}
              hasUnread={hasUnread}
              onSelect={() => onSwitchSession(session.id)}
              onDelete={() => onDeleteSession(session.id)}
              onRename={(title) => renameSession(session.id, title)}
            />
          );
        })}
      </div>

      {/* Settings gear at bottom */}
      <div className="p-2 border-t border-white/[0.06] flex justify-end">
        <SettingsDialog />
      </div>
    </div>
  );
}
