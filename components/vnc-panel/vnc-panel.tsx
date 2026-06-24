"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

type VncPanelProps = {
  streamUrl: string | null;
  isInitializing: boolean;
  onRefresh: () => void;
};

export const VncPanel = memo(function VncPanel({
  streamUrl,
  isInitializing,
  onRefresh,
}: VncPanelProps) {
  return (
    <div className="relative w-full h-full bg-[#0a0a0f] flex items-center justify-center">
      {streamUrl ? (
        <>
          <iframe
            src={streamUrl}
            className="w-full h-full border-0"
            allow="autoplay"
          />
          <Button
            onClick={onRefresh}
            disabled={isInitializing}
            size="sm"
            className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white border border-white/10 backdrop-blur-sm text-xs gap-1.5"
          >
            <RefreshCw className="w-3 h-3" />
            {isInitializing ? "Creating..." : "New Desktop"}
          </Button>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 text-[#94a3b8]">
          <div className="w-8 h-8 border-2 border-[#22c55e]/40 border-t-[#22c55e] rounded-full animate-spin" />
          <span className="text-sm">
            {isInitializing ? "Initializing desktop..." : "Loading stream..."}
          </span>
        </div>
      )}
    </div>
  );
});
