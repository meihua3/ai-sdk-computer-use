// components/agent-worker.tsx
"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { toast } from "sonner";
import { useSessionStore } from "@/lib/store/session-store";
import { useMultiChatStore } from "@/lib/store/multi-chat-store";
import type { SessionChatStatus } from "@/lib/store/multi-chat-store";
import { useNotificationStore } from "@/lib/store/notification-store";
import { useSettingsStore } from "@/lib/store/settings-store";
import { useEventSync } from "@/lib/hooks/use-event-sync";
import { ABORTED } from "@/lib/utils";

export function AgentWorker({ sessionId }: { sessionId: string }) {
  const session = useSessionStore((s) =>
    s.sessions.find((sess) => sess.id === sessionId)
  );
  const updateMessages = useSessionStore((s) => s.updateMessages);
  const updateSessionTitle = useSessionStore((s) => s.updateSessionTitle);
  const setInStore = useMultiChatStore((s) => s.set);
  const removeFromStore = useMultiChatStore((s) => s.remove);

  const {
    messages,
    status,
    append,
    stop: stopGeneration,
    setMessages,
  } = useChat({
    api: "/api/chat",
    id: sessionId,
    body: { sandboxId: session?.sandboxId ?? null },
    maxSteps: 30,
    initialMessages: session?.messages ?? [],
    onFinish: () => {
      if (useSessionStore.getState().activeSessionId !== sessionId) {
        useNotificationStore.getState().markUnread(sessionId);
      }
    },
    onError: (error) => {
      console.error("[AgentWorker]", error);
      if (useSessionStore.getState().activeSessionId !== sessionId) {
        useNotificationStore.getState().markUnread(sessionId);
      } else {
        toast.error("There was an error", {
          description: "Please try again later.",
          richColors: true,
          position: "top-center",
        });
      }
    },
  });

  // Sync messages to session store for persistence + auto-title
  useEffect(() => {
    updateMessages(sessionId, messages);
    const firstUser = messages.find((m) => m.role === "user");
    if (firstUser) {
      const content =
        typeof firstUser.content === "string" ? firstUser.content : "";
      if (content) updateSessionTitle(sessionId, content);
    }
  }, [messages, sessionId, updateMessages, updateSessionTitle]);

  // Use refs so registered functions don't capture stale closures
  const appendRef = useRef(append);
  appendRef.current = append;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const stopRef = useRef(stopGeneration);
  stopRef.current = stopGeneration;
  const setMessagesRef = useRef(setMessages);
  setMessagesRef.current = setMessages;

  // Register controls in multi-chat store
  useEffect(() => {
    const submit = (content: string) => {
      const running = Object.values(
        useMultiChatStore.getState().sessions
      ).filter(
        (s) => s.status === "submitted" || s.status === "streaming"
      ).length;
      const max = useSettingsStore.getState().maxConcurrentSessions;
      if (running >= max) {
        toast.error(`Max ${max} sessions can run simultaneously`, {
          description: "Stop a running session before starting a new one.",
        });
        return;
      }
      appendRef.current({ role: "user", content });
    };

    const stop = () => {
      stopRef.current();
      const msgs = messagesRef.current;
      const lastMessage = msgs.at(-1);
      const lastPart = lastMessage?.parts.at(-1);
      if (
        lastMessage?.role === "assistant" &&
        lastPart?.type === "tool-invocation"
      ) {
        setMessagesRef.current((prev) => [
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

    setInStore(sessionId, { messages, status: status as SessionChatStatus, submit, stop });
  }, [messages, status, sessionId, setInStore]);

  // Cleanup when session is deleted (AgentWorker unmounts)
  useEffect(() => {
    return () => {
      removeFromStore(sessionId);
      useNotificationStore.getState().markRead(sessionId);
    };
  }, [sessionId, removeFromStore]);

  // Bridge tool call messages → session event pipeline
  useEventSync(messages, status, sessionId);

  return null;
}
