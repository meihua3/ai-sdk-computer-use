"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Camera,
  Terminal,
  CheckCircle2,
  XCircle,
  Loader2,
  CircleSlash,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { ABORTED } from "@/lib/utils";

type ToolCallState = "call" | "result" | "partial-call";

type ToolCallCardProps = {
  toolName: string;
  state: ToolCallState;
  args: Record<string, unknown>;
  result?: unknown;
  isLatest: boolean;
  chatStatus: "error" | "submitted" | "streaming" | "ready";
};

export function ToolCallCard({
  toolName,
  state,
  args,
  result,
  isLatest,
  chatStatus,
}: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isRunning = state === "call" && isLatest && chatStatus !== "ready";
  const isAborted = result === ABORTED;

  const label =
    toolName === "computer"
      ? String(args.action ?? "action")
      : toolName === "bash"
        ? `bash: ${String(args.command ?? "").slice(0, 30)}`
        : toolName;

  const StatusIcon = () => {
    if (state === "call") {
      if (isRunning) return <Loader2 className="w-3.5 h-3.5 animate-spin text-[#94a3b8]" />;
      return <XCircle className="w-3.5 h-3.5 text-[#ef4444]" />;
    }
    if (isAborted) return <CircleSlash className="w-3.5 h-3.5 text-[#f59e0b]" />;
    return <CheckCircle2 className="w-3.5 h-3.5 text-[#22c55e]" />;
  };

  const ToolIcon =
    toolName === "computer"
      ? Camera
      : Terminal;

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] overflow-hidden mb-2">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors text-left"
        onClick={() => setIsExpanded((v) => !v)}
      >
        <ToolIcon className="w-3.5 h-3.5 text-[#94a3b8] shrink-0" />
        <span className="flex-1 text-xs font-mono text-[#e2e8f0] truncate">
          {label}
        </span>
        <StatusIcon />
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-[#475569]" />
        ) : (
          <ChevronRight className="w-3 h-3 text-[#475569]" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-white/[0.06] px-3 py-2 space-y-2">
          <div>
            <p className="text-[10px] text-[#475569] mb-1 uppercase tracking-wider">Args</p>
            <pre className="text-[11px] text-[#94a3b8] font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>
          {state === "result" && result !== undefined && (
            <div>
              <p className="text-[10px] text-[#475569] mb-1 uppercase tracking-wider">Result</p>
              {typeof result === "object" &&
              result !== null &&
              "type" in result &&
              (result as { type: string }).type === "image" &&
              "data" in result ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/png;base64,${(result as { data: string }).data}`}
                  alt="Screenshot"
                  className="w-full rounded"
                />
              ) : (
                <pre className="text-[11px] text-[#94a3b8] font-mono whitespace-pre-wrap break-all">
                  {typeof result === "string"
                    ? result.slice(0, 500)
                    : JSON.stringify(result, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
