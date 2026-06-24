"use client";

import { useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { toast } from "sonner";
import { Input } from "@/components/input";
import { useScrollToBottom } from "@/lib/use-scroll-to-bottom";
import { useSessionStore } from "@/lib/store/session-store";
import { useEventSync } from "@/lib/hooks/use-event-sync";
import { ToolCallCard } from "./tool-call-card";
import { ABORTED } from "@/lib/utils";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";
import type { UIMessage } from "ai";

type ChatPanelProps = {
  sandboxId: string | null;
};

export function ChatPanel({ sandboxId }: ChatPanelProps) {
  const [containerRef, endRef] = useScrollToBottom();
  const activeSession = useSessionStore((s) => s.activeSession());
  const updateMessages = useSessionStore((s) => s.updateMessages);
  const updateSessionTitle = useSessionStore((s) => s.updateSessionTitle);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    status,
    stop: stopGeneration,
    setMessages,
  } = useChat({
    api: "/api/chat",
    id: activeSession?.id ?? undefined,
    body: { sandboxId },
    maxSteps: 30,
    initialMessages: activeSession?.messages ?? [],
    onError: (error) => {
      console.error(error);
      toast.error("There was an error", {
        description: "Please try again later.",
        richColors: true,
        position: "top-center",
      });
    },
  });

  // Sync messages back to session store for persistence
  useEffect(() => {
    if (activeSession?.id) {
      updateMessages(activeSession.id, messages);
      const firstUser = messages.find((m) => m.role === "user");
      if (firstUser && activeSession.title === "New Session") {
        const content =
          typeof firstUser.content === "string" ? firstUser.content : "";
        if (content) updateSessionTitle(activeSession.id, content);
      }
    }
  }, [messages, activeSession?.id, updateMessages, updateSessionTitle, activeSession?.title]);

  // Bridge useChat messages → event pipeline
  useEventSync(messages, status, activeSession?.id ?? null);

  const stop = () => {
    stopGeneration();
    const lastMessage = messages.at(-1);
    const lastPart = lastMessage?.parts.at(-1);
    if (
      lastMessage?.role === "assistant" &&
      lastPart?.type === "tool-invocation"
    ) {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          ...lastMessage,
          parts: [
            ...lastMessage.parts.slice(0, -1),
            {
              ...lastPart,
              toolInvocation: {
                ...lastPart.toolInvocation,
                state: "result",
                result: ABORTED,
              },
            },
          ],
        },
      ]);
    }
  };

  const isLoading = status !== "ready";

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

      <div className="border-t border-white/[0.06] p-3">
        <form onSubmit={handleSubmit}>
          <Input
            handleInputChange={handleInputChange}
            input={input}
            isInitializing={false}
            isLoading={isLoading}
            status={status}
            stop={stop}
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
