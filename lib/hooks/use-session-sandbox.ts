import { useState, useEffect, useCallback } from "react";
import { getDesktopURL, killDesktop } from "@/lib/sandbox/utils";
import { useSessionStore } from "@/lib/store/session-store";
import { useEventStore } from "@/lib/store/event-store";

export function useSessionSandbox() {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  const activeSession = useSessionStore((s) => s.activeSession());
  const setSandboxId = useSessionStore((s) => s.setSandboxId);
  const resetEvents = useEventStore((s) => s.reset);

  const initSandbox = useCallback(async () => {
    if (!activeSession) return;
    setIsInitializing(true);
    try {
      const { streamUrl, id } = await getDesktopURL(
        activeSession.sandboxId ?? undefined
      );
      setStreamUrl(streamUrl);
      setSandboxId(activeSession.id, id);
    } catch (err) {
      console.error("Failed to init sandbox:", err);
    } finally {
      setIsInitializing(false);
    }
  }, [activeSession, setSandboxId]);

  const killCurrentSandbox = useCallback(async () => {
    if (!activeSession?.sandboxId) return;
    try {
      await killDesktop(activeSession.sandboxId);
    } catch {
      // ignore
    }
    if (activeSession) {
      setSandboxId(activeSession.id, null);
    }
    setStreamUrl(null);
    resetEvents();
  }, [activeSession, setSandboxId, resetEvents]);

  useEffect(() => {
    initSandbox();
    return () => {
      // Kill on unmount (page close handled by sendBeacon in page.tsx)
    };
  }, [activeSession?.id]); // Re-run only when active session changes

  return { streamUrl, isInitializing, initSandbox, killCurrentSandbox };
}
