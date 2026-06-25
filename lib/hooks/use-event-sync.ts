// lib/hooks/use-event-sync.ts
import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { useSessionStore } from "@/lib/store/session-store";
import type { AgentEvent, ComputerToolPayload, BashToolPayload } from "@/lib/types";

type ChatStatus = "error" | "submitted" | "streaming" | "ready";

function generateEventId(toolCallId: string): string {
  return `evt_${toolCallId}`;
}

export function useEventSync(
  messages: UIMessage[],
  status: ChatStatus,
  sessionId: string | null
) {
  const { appendEvent, updateEvent: persistEvent } = useSessionStore();
  const trackedIds = useRef<Set<string>>(new Set());
  const startTimes = useRef<Map<string, number>>(new Map());
  const prevSessionId = useRef<string | null>(null);

  // Reset tracking state when session changes, pre-populate from existing events
  // to avoid re-adding historical tool calls as duplicates on mount
  useEffect(() => {
    if (sessionId !== prevSessionId.current) {
      const existingEvents =
        useSessionStore
          .getState()
          .sessions.find((s) => s.id === sessionId)?.events ?? [];
      trackedIds.current = new Set(existingEvents.map((e) => e.id));
      startTimes.current.clear();
      prevSessionId.current = sessionId;
    }
  }, [sessionId]);

  // Sync tool call events from messages into session store
  useEffect(() => {
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts ?? []) {
        if (part.type !== "tool-invocation") continue;
        const { toolCallId, toolName, state, args, result } =
          part.toolInvocation as {
            toolCallId: string;
            toolName: string;
            state: "call" | "result" | "partial-call";
            args: Record<string, unknown>;
            result?: unknown;
          };

        const eventId = generateEventId(toolCallId);

        if (state === "call" && !trackedIds.current.has(eventId)) {
          trackedIds.current.add(eventId);
          startTimes.current.set(eventId, Date.now());

          const event: AgentEvent =
            toolName === "computer"
              ? {
                  id: eventId,
                  timestamp: Date.now(),
                  duration: null,
                  status: "pending",
                  tool: "computer",
                  payload: args as ComputerToolPayload,
                }
              : {
                  id: eventId,
                  timestamp: Date.now(),
                  duration: null,
                  status: "pending",
                  tool: "bash",
                  payload: args as BashToolPayload,
                };

          if (sessionId) appendEvent(sessionId, event);
        }

        if (state === "result" && trackedIds.current.has(eventId)) {
          const startTime = startTimes.current.get(eventId) ?? Date.now();
          const duration = Date.now() - startTime;
          const resultStr =
            typeof result === "string" ? result : JSON.stringify(result);
          const isAborted = resultStr === "User aborted";
          const newStatus = isAborted ? "aborted" : "success";

          const patch: Partial<AgentEvent> = { status: newStatus, duration };
          if (sessionId) persistEvent(sessionId, eventId, patch);
        }
      }
    }
  }, [messages, sessionId, appendEvent, persistEvent]);

  // status parameter kept for API compatibility — AgentWorker uses it
  void status;
}
