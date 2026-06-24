import { useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { getDesktopURL, killDesktop } from "@/lib/sandbox/utils";
import { useSessionStore } from "@/lib/store/session-store";
import { useSandboxUrlStore } from "@/lib/store/sandbox-url-store";

export function useSessionSandbox() {
  const visitedIds = useRef<Set<string>>(new Set());

  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  // Lazy-initialize sandbox on first visit to each session
  useEffect(() => {
    if (!activeSessionId) return;

    visitedIds.current.add(activeSessionId);

    // Already has an entry (initializing or ready) — iframe is in DOM, just becomes visible
    if (useSandboxUrlStore.getState().urls[activeSessionId] !== undefined) return;

    // First visit: start initialization
    const existingSandboxId = useSessionStore.getState().activeSandboxId();
    useSandboxUrlStore.getState().setInitializing(activeSessionId);

    let cancelled = false;
    getDesktopURL(existingSandboxId ?? undefined)
      .then(({ streamUrl, id }) => {
        if (cancelled) return;
        useSandboxUrlStore.getState().setUrl(activeSessionId, streamUrl);
        useSessionStore.getState().setSandboxId(activeSessionId, id);
      })
      .catch(() => {
        if (cancelled) return;
        useSandboxUrlStore.getState().clearUrl(activeSessionId);
        toast.error("Failed to connect desktop", {
          description: "Click the session again to retry.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);

  // Keepalive — ping ALL visited sessions every 25s to prevent idle timeout
  useEffect(() => {
    const ping = () => {
      const { sessions } = useSessionStore.getState();
      for (const sessionId of visitedIds.current) {
        const session = sessions.find((s) => s.id === sessionId);
        if (!session?.sandboxId) continue;
        fetch("/api/sandbox-keepalive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sandboxId: session.sandboxId }),
        }).catch(() => {});
      }
    };
    const id = setInterval(ping, 25_000);
    return () => clearInterval(id);
  }, []);

  // Force-create a brand new sandbox for the active session (New Desktop button)
  const initSandbox = useCallback(async () => {
    if (!activeSessionId) return;
    useSandboxUrlStore.getState().setInitializing(activeSessionId);
    try {
      const { streamUrl, id } = await getDesktopURL(undefined);
      useSandboxUrlStore.getState().setUrl(activeSessionId, streamUrl);
      useSessionStore.getState().setSandboxId(activeSessionId, id);
    } catch {
      useSandboxUrlStore.getState().clearUrl(activeSessionId);
      toast.error("Failed to create desktop");
    }
  }, [activeSessionId]);

  // Kill a specific session's sandbox (used on session delete)
  const killSandboxForSession = useCallback(
    async (sessionId: string, sandboxId: string) => {
      try {
        await killDesktop(sandboxId);
      } catch {}
      useSandboxUrlStore.getState().clearUrl(sessionId);
      useSessionStore.getState().setSandboxId(sessionId, null);
    },
    []
  );

  return { initSandbox, killSandboxForSession };
}
