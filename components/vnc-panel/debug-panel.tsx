// components/vnc-panel/debug-panel.tsx
"use client";

import { useState } from "react";
import { useSessionStore } from "@/lib/store/session-store";
import { useMultiChatStore } from "@/lib/store/multi-chat-store";
import { cn } from "@/lib/utils";
import {
  Camera,
  Terminal,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  CircleSlash,
  MousePointer,
  Keyboard,
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

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

function truncateId(id: string): string {
  return id.length > 32 ? id.slice(0, 32) + "…" : id;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 min-w-0">
      <span className="text-[#475569] shrink-0 w-20">{label}</span>
      <span className="text-[#94a3b8] break-all">{value}</span>
    </div>
  );
}

function EventRow({ event }: { event: AgentEvent }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const label =
    event.tool === "computer"
      ? event.payload.action
      : event.payload.command.slice(0, 30);
  const durationLabel =
    event.duration != null ? formatDuration(event.duration) : null;

  // Collect non-null payload fields for the detail block
  const payloadFields: { label: string; value: string }[] = [];
  if (event.tool === "computer") {
    const p = event.payload;
    payloadFields.push({ label: "action", value: p.action });
    if (p.coordinate != null)
      payloadFields.push({
        label: "coordinate",
        value: `[${p.coordinate[0]}, ${p.coordinate[1]}]`,
      });
    if (p.text != null) payloadFields.push({ label: "text", value: p.text });
    if (p.scroll_direction != null)
      payloadFields.push({ label: "scroll_direction", value: p.scroll_direction });
    if (p.scroll_amount != null)
      payloadFields.push({
        label: "scroll_amount",
        value: String(p.scroll_amount),
      });
    if (p.duration != null)
      payloadFields.push({ label: "wait_ms", value: String(p.duration) });
  } else {
    payloadFields.push({ label: "command", value: event.payload.command });
  }

  return (
    <div className="rounded overflow-hidden">
      {/* Summary row — always visible, click to toggle */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 cursor-pointer select-none"
        onClick={() => setIsExpanded((v) => !v)}
      >
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
        <span className="text-[10px] text-[#334155] shrink-0 ml-1">
          {isExpanded ? "▲" : "▼"}
        </span>
      </div>

      {/* Detail block — shown when expanded */}
      {isExpanded && (
        <div className="bg-white/[0.02] border-t border-white/[0.04] px-3 py-2 font-mono text-[10px] space-y-1">
          <DetailRow label="id" value={truncateId(event.id)} />
          <DetailRow label="time" value={formatTime(event.timestamp)} />
          <DetailRow label="tool" value={event.tool} />
          <DetailRow label="status" value={event.status} />
          <DetailRow
            label="duration"
            value={
              event.duration != null ? formatDuration(event.duration) : "—"
            }
          />
          {payloadFields.map(({ label, value }) => (
            <DetailRow key={label} label={label} value={value} />
          ))}
        </div>
      )}
    </div>
  );
}

type DebugPanelProps = {
  isCollapsed: boolean;
  onToggle: () => void;
};

function StatCell({ label, value }: { label: string; value: string }) {
  const hasData = value !== "—";
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0">
      <span
        className={cn(
          "text-[11px] font-mono tabular-nums font-medium leading-none",
          hasData ? "text-[#22c55e]" : "text-[#334155]"
        )}
      >
        {value}
      </span>
      <span className="text-[9px] text-[#475569] uppercase tracking-wide leading-none">
        {label}
      </span>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function computeStats(events: AgentEvent[]) {
  const completed = events.filter((e) => e.duration != null);
  const total = completed.reduce((s, e) => s + (e.duration ?? 0), 0);
  return {
    count: events.length,
    totalMs: total,
    avgMs:
      completed.length > 0 ? Math.round(total / completed.length) : null,
  };
}

function getActionKey(event: AgentEvent): string {
  return event.tool === "computer" ? event.payload.action : "bash";
}

function ActionIcon({ event }: { event: AgentEvent }) {
  if (event.tool === "bash") return <Terminal className="w-3 h-3 text-[#94a3b8]" />;
  const action = event.payload.action;
  if (action === "screenshot") return <Camera className="w-3 h-3 text-[#94a3b8]" />;
  if (action === "wait") return <Clock className="w-3 h-3 text-[#94a3b8]" />;
  if (action === "key" || action === "type") return <Keyboard className="w-3 h-3 text-[#94a3b8]" />;
  return <MousePointer className="w-3 h-3 text-[#94a3b8]" />;
}

export function DebugPanel({ isCollapsed, onToggle }: DebugPanelProps) {
  const [activeTab, setActiveTab] = useState<"events" | "stats">("events");

  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const events = useSessionStore(
    (s) => s.sessions.find((sess) => sess.id === activeSessionId)?.events ?? []
  );
  const chatStatus = useMultiChatStore(
    (s) =>
      activeSessionId
        ? s.sessions[activeSessionId]?.status ?? "ready"
        : "ready"
  );

  // Deduplicate by id — guards against legacy store data with duplicate entries
  const uniqueEvents = Array.from(
    new Map(events.map((e) => [e.id, e])).values()
  );

  const agentStatus: AgentStatus =
    chatStatus === "streaming" || chatStatus === "submitted"
      ? { type: "running", startedAt: 0 }
      : chatStatus === "error"
        ? { type: "error", message: "Chat error occurred" }
        : { type: "idle" };

  const completedEvents = uniqueEvents.filter((e) => e.duration != null);
  const totalCalls = uniqueEvents.length;
  const totalDuration = completedEvents.reduce(
    (sum, e) => sum + (e.duration ?? 0),
    0
  );
  const avgDuration =
    completedEvents.length > 0
      ? Math.round(totalDuration / completedEvents.length)
      : null;

  // Group by specific action (screenshot, wait, left_click, bash, etc.)
  const byAction = uniqueEvents.reduce<Record<string, AgentEvent[]>>((acc, e) => {
    const key = getActionKey(e);
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});
  const actionBreakdown = Object.entries(byAction).map(([action, actionEvents]) => ({
    action,
    sampleEvent: actionEvents[0]!,
    ...computeStats(actionEvents),
  }));

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
        </div>

        {/* Summary stats always visible */}
        <div className="flex items-center gap-3 mr-2">
          <StatCell
            label="calls"
            value={totalCalls > 0 ? String(totalCalls) : "—"}
          />
          <div className="w-px h-4 bg-white/[0.06]" />
          <StatCell
            label="total"
            value={totalDuration > 0 ? formatDuration(totalDuration) : "—"}
          />
          <div className="w-px h-4 bg-white/[0.06]" />
          <StatCell
            label="avg"
            value={avgDuration != null ? formatDuration(avgDuration) : "—"}
          />
        </div>

        <span className="text-[#475569] text-xs shrink-0">
          {isCollapsed ? "▲" : "▼"}
        </span>
      </button>

      {!isCollapsed && (
        <div className="flex flex-col flex-1">
          {/* Tab toggle */}
          <div className="flex border-b border-white/[0.06]">
            {(["events", "stats"] as const).map((tab) => (
              <button
                key={tab}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab(tab);
                }}
                className={cn(
                  "flex-1 py-1.5 text-[10px] uppercase tracking-wide font-medium transition-colors",
                  activeTab === tab
                    ? "text-[#22c55e] border-b border-[#22c55e]"
                    : "text-[#475569] hover:text-[#94a3b8]"
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Events tab */}
          {activeTab === "events" && (
            <div className="overflow-y-auto max-h-40 py-1">
              {uniqueEvents.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-[#475569]">
                  No tool calls yet
                </div>
              ) : (
                [...uniqueEvents].reverse().map((event) => (
                  <EventRow key={event.id} event={event} />
                ))
              )}
            </div>
          )}

          {/* Stats tab */}
          {activeTab === "stats" && (
            <div className="overflow-y-auto max-h-40 py-2 px-3">
              {uniqueEvents.length === 0 ? (
                <div className="py-4 text-center text-xs text-[#475569]">
                  No tool calls yet
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[#475569] text-[10px] uppercase tracking-wide">
                      <th className="text-left pb-2 font-normal">Action</th>
                      <th className="text-right pb-2 font-normal">Calls</th>
                      <th className="text-right pb-2 font-normal">Total</th>
                      <th className="text-right pb-2 font-normal">Avg</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-[#94a3b8] border-b border-white/[0.04]">
                      <td className="py-1.5 font-medium">All</td>
                      <td className="text-right tabular-nums">{totalCalls}</td>
                      <td className="text-right tabular-nums font-mono">
                        {totalDuration > 0 ? formatDuration(totalDuration) : "—"}
                      </td>
                      <td className="text-right tabular-nums font-mono">
                        {avgDuration != null ? formatDuration(avgDuration) : "—"}
                      </td>
                    </tr>
                    {actionBreakdown.map(({ action, sampleEvent, count, totalMs, avgMs }) => (
                      <tr key={action} className="text-[#64748b]">
                        <td className="py-1.5">
                          <div className="flex items-center gap-1.5">
                            <ActionIcon event={sampleEvent} />
                            {action}
                          </div>
                        </td>
                        <td className="text-right tabular-nums">{count}</td>
                        <td className="text-right tabular-nums font-mono">
                          {totalMs > 0 ? formatDuration(totalMs) : "—"}
                        </td>
                        <td className="text-right tabular-nums font-mono">
                          {avgMs != null ? formatDuration(avgMs) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}