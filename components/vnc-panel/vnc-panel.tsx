"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useSessionStore } from "@/lib/store/session-store";
import { useSandboxUrlStore } from "@/lib/store/sandbox-url-store";

type VncPanelProps = {
  onRefresh: () => void;
};

export const VncPanel = memo(function VncPanel({ onRefresh }: VncPanelProps) {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const urls = useSandboxUrlStore((s) => s.urls);

  // Sessions that have been visited (have any entry in urls map, null or string)
  const visitedSessionIds = Object.keys(urls);

  const activeUrl = activeSessionId !== null ? urls[activeSessionId] : undefined;
  // activeUrl === undefined → not visited / no iframe yet
  // activeUrl === null     → initializing
  // activeUrl === string   → ready
  const isInitializing = activeSessionId !== null && activeUrl === null;

  return (
    <div className="relative w-full h-full bg-[#0a0a0f]">
      {/* One container per visited session */}
      {visitedSessionIds.map((sessionId) => {
        const url = urls[sessionId];
        const isActive = sessionId === activeSessionId;
        return (
          <div
            key={sessionId}
            className="absolute inset-0"
            style={{ display: isActive ? "block" : "none" }}
            aria-hidden={!isActive}
          >
            {url ? (
              <iframe
                src={url}
                className="w-full h-full border-0"
                allow="autoplay"
              />
            ) : (
              /* null = initializing */
              <div className="w-full h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-[#94a3b8]">
                  <div className="w-8 h-8 border-2 border-[#22c55e]/40 border-t-[#22c55e] rounded-full animate-spin" />
                  <span className="text-sm">Initializing desktop...</span>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Fallback: active session not yet in visited set (should be brief) */}
      {activeSessionId !== null && !(activeSessionId in urls) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-[#94a3b8]">
            <div className="w-8 h-8 border-2 border-[#22c55e]/40 border-t-[#22c55e] rounded-full animate-spin" />
            <span className="text-sm">Loading stream...</span>
          </div>
        </div>
      )}

      {/* New Desktop button — shown only when active session has a URL (ready or initializing) */}
      {activeSessionId !== null && activeSessionId in urls && (
        <Button
          onClick={onRefresh}
          disabled={isInitializing}
          size="sm"
          className="absolute top-2 right-2 z-10 bg-black/60 hover:bg-black/80 text-white border border-white/10 backdrop-blur-sm text-xs gap-1.5"
        >
          <RefreshCw className="w-3 h-3" />
          {isInitializing ? "Creating..." : "New Desktop"}
        </Button>
      )}
    </div>
  );
});
