import { create } from "zustand";
import type { AgentEvent, AgentStatus } from "@/lib/types";

type EventStore = {
  events: AgentEvent[];
  agentStatus: AgentStatus;

  addEvent: (event: AgentEvent) => void;
  updateEvent: (id: string, patch: Partial<AgentEvent>) => void;
  setAgentStatus: (status: AgentStatus) => void;
  reset: () => void;
};

export const useEventStore = create<EventStore>()((set) => ({
  events: [],
  agentStatus: { type: "idle" },

  addEvent: (event) =>
    set((state) => ({ events: [...state.events, event] })),

  updateEvent: (id, patch) =>
    set((state) => ({
      events: state.events.map((e) =>
        e.id === id ? ({ ...e, ...patch } as AgentEvent) : e
      ),
    })),

  setAgentStatus: (agentStatus) => set({ agentStatus }),

  reset: () => set({ events: [], agentStatus: { type: "idle" } }),
}));
