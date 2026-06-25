"use client";

import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useSettingsStore } from "@/lib/store/settings-store";

export function SettingsDialog() {
  const maxConcurrentSessions = useSettingsStore(
    (s) => s.maxConcurrentSessions
  );
  const setMaxConcurrentSessions = useSettingsStore(
    (s) => s.setMaxConcurrentSessions
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 text-[#475569] hover:text-[#94a3b8] hover:bg-white/5"
          aria-label="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[#0a0e1a] border-white/[0.06] text-[#f8fafc] max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[#f8fafc]">Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 pt-2">
          <Label className="text-[#94a3b8] text-sm">
            Max concurrent running sessions
          </Label>
          <Input
            type="number"
            min={1}
            max={5}
            value={maxConcurrentSessions}
            onChange={(e) =>
              setMaxConcurrentSessions(Number(e.target.value))
            }
            className="bg-white/5 border-white/10 text-[#f8fafc] w-24"
          />
          <p className="text-xs text-[#475569]">
            New runs are blocked when this limit is reached. Range: 1–5.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
