"use client";

import { useEventStore } from "@/lib/store/event-store";
import { cn } from "@/lib/utils";
import {
  Camera,
  Terminal,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  CircleSlash,
} from "lucide-react";
import type { AgentEvent, AgentStatus } from "@/lib/types";

function StatusIcon({ status }: { status: AgentEvent["status"] }) {
  switch (status) {
    case "pending":
      return <Loader2 className="w-3 h-3 animate-spin text-[#94a3b8]" />;
    case "success":
      return <CheckCircle2 className="w-3 h-3 text-[#22c55e]" />;
    case "error":
      return <XCircle className="w-3 h-3 text-[#ef4444]" />;
    case "aborted":
      return <CircleSlash className="w-3 h-3 text-[#f59e0b]" />;
  }
}

function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const label =
    status.type === "idle"
      ? "Idle"
      : status.type === "running"
        ? "Running"
        : "Error";
  const color =
    status.type === "idle"
      ? "text-[#94a3b8] bg-white/5"
      : status.type === "running"
        ? "text-[#22c55e] bg-[#22c55e]/10"
        : "text-[#ef4444] bg-[#ef4444]/10";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full",
        color
      )}
    >
      {status.type === "running" && (
        <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
      )}
      {label}
    </span>
  );
}

function EventRow({ event }: { event: AgentEvent }) {
  const label =
    event.tool === "computer"
      ? event.payload.action
      : event.payload.command.slice(0, 30);
  const durationLabel =
    event.duration != null ? `${event.duration}ms` : null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 rounded group">
      <StatusIcon status={event.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {event.tool === "computer" ? (
            <Camera className="w-3 h-3 text-[#94a3b8] shrink-0" />
          ) : (
            <Terminal className="w-3 h-3 text-[#94a3b8] shrink-0" />
          )}
          <span className="text-xs text-[#e2e8f0] font-mono truncate">
            {label}
          </span>
        </div>
      </div>
      {durationLabel && (
        <span className="text-[10px] text-[#475569] flex items-center gap-0.5">
          <Clock className="w-2.5 h-2.5" />
          {durationLabel}
        </span>
      )}
    </div>
  );
}

type DebugPanelProps = {
  isCollapsed: boolean;
  onToggle: () => void;
};

export function DebugPanel({ isCollapsed, onToggle }: DebugPanelProps) {
  const events = useEventStore((s) => s.events);
  const agentStatus = useEventStore((s) => s.agentStatus);

  return (
    <div className="flex flex-col border-t border-white/[0.06] bg-[#0F172A]">
      <button
        onClick={onToggle}
        className="flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-[#94a3b8]" />
          <span className="text-xs font-medium text-[#94a3b8]">Debug</span>
          <AgentStatusBadge status={agentStatus} />
          {events.length > 0 && (
            <span className="text-[10px] text-[#475569]">
              {events.length} events
            </span>
          )}
        </div>
        <span className="text-[#475569] text-xs">
          {isCollapsed ? "▲" : "▼"}
        </span>
      </button>

      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto max-h-48 py-1">
          {events.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-[#475569]">
              No tool calls yet
            </div>
          ) : (
            [...events].reverse().map((event) => (
              <EventRow key={event.id} event={event} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
