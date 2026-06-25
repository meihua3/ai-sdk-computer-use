// components/chat-panel/chat-panel.tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/input";
import { useScrollToBottom } from "@/lib/use-scroll-to-bottom";
import { useMultiChatStore } from "@/lib/store/multi-chat-store";
import { ToolCallCard } from "./tool-call-card";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";
import type { UIMessage } from "ai";

type ChatPanelProps = {
  sessionId: string;
  testMessage?: string;
};

export function ChatPanel({ sessionId, testMessage }: ChatPanelProps) {
  const [containerRef, endRef] = useScrollToBottom();
  const [input, setInput] = useState("");

  const chatEntry = useMultiChatStore((s) => s.sessions[sessionId]);
  const messages = chatEntry?.messages ?? [];
  const status = chatEntry?.status ?? "ready";

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !chatEntry) return;
    chatEntry.submit(trimmed);
    setInput("");
  };

  const isLoading = status !== "ready" && status !== "error";

  return (
    <div className="flex flex-col h-full bg-[#0F172A]">
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <p className="text-[#94a3b8] text-sm">
              Ask the agent to do something on the desktop
            </p>
            <p className="text-[#475569] text-xs">
              e.g. &ldquo;What&apos;s the weather in Dubai?&rdquo;
            </p>
          </div>
        )}
        {messages.map((message, i) => (
          <MessageItem
            key={message.id}
            message={message}
            isLatest={i === messages.length - 1}
            chatStatus={status}
          />
        ))}
        <div ref={endRef} />
      </div>

      {testMessage && (
        <div className="px-3 pt-2">
          <button
            onClick={() =>
              !isLoading && chatEntry?.submit(testMessage)
            }
            disabled={isLoading}
            className="w-full py-2 rounded-lg bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
          >
            {isLoading ? "Running..." : `▶ Send: "${testMessage}"`}
          </button>
        </div>
      )}

      <div className="border-t border-white/[0.06] p-3">
        <form onSubmit={handleSubmit}>
          <Input
            handleInputChange={handleInputChange}
            input={input}
            isInitializing={false}
            isLoading={isLoading}
            status={status}
            stop={chatEntry?.stop ?? (() => {})}
          />
        </form>
      </div>
    </div>
  );
}

function MessageItem({
  message,
  isLatest,
  chatStatus,
}: {
  message: UIMessage;
  isLatest: boolean;
  chatStatus: "error" | "submitted" | "streaming" | "ready";
}) {
  return (
    <div
      className={cn("flex flex-col gap-1", {
        "items-end": message.role === "user",
        "items-start": message.role !== "user",
      })}
    >
      {message.parts?.map((part, i) => {
        if (part.type === "text") {
          return (
            <div
              key={i}
              className={cn("max-w-[85%] text-sm", {
                "bg-white/10 text-[#f8fafc] px-3 py-2 rounded-2xl rounded-br-sm":
                  message.role === "user",
                "text-[#e2e8f0]": message.role !== "user",
              })}
            >
              <Streamdown>{part.text}</Streamdown>
            </div>
          );
        }
        if (part.type === "tool-invocation") {
          const { toolName, state, args } = part.toolInvocation;
          const result =
            state === "result"
              ? (part.toolInvocation as { result: unknown }).result
              : undefined;
          return (
            <div key={i} className="w-full max-w-full">
              <ToolCallCard
                toolName={toolName}
                state={state as "call" | "result" | "partial-call"}
                args={args as Record<string, unknown>}
                result={result}
                isLatest={isLatest}
                chatStatus={chatStatus}
              />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
