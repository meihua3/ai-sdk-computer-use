import type { UIMessage } from "ai";

export type EventStatus = "pending" | "success" | "error" | "aborted";

export type AgentStatus =
  | { type: "idle" }
  | { type: "running"; startedAt: number }
  | { type: "error"; message: string };

export type ComputerToolPayload = {
  action: string;
  coordinate?: [number, number];
  text?: string;
  duration?: number;
  scroll_direction?: string;
  scroll_amount?: number;
  result?: unknown;
};

export type BashToolPayload = {
  command: string;
  result?: string;
};

export type AgentEvent =
  | {
      id: string;
      timestamp: number;
      duration: number | null;
      status: EventStatus;
      tool: "computer";
      payload: ComputerToolPayload;
    }
  | {
      id: string;
      timestamp: number;
      duration: number | null;
      status: EventStatus;
      tool: "bash";
      payload: BashToolPayload;
    };

export type Session = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: UIMessage[];
  events: AgentEvent[];
  sandboxId: string | null;
};
