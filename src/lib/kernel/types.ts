export type OrbState =
  | "idle"
  | "looking"
  | "reading"
  | "thinking"
  | "needs-approval"
  | "done"
  | "listening"
  | "speaking"
  | "searching"
  | "writing-code"
  | "saving-memory"
  | "confused"
  | "error"
  | "paused"
  | "sleeping"
  | "offline"
  | "celebrating"
  | "surprised";

export const ORB_STATES: OrbState[] = [
  "idle", "looking", "reading", "thinking", "needs-approval", "done", "listening", "speaking",
  "searching", "writing-code", "saving-memory", "confused", "error", "paused", "sleeping",
  "offline", "celebrating", "surprised",
];

export type StepStatus = "pending" | "running" | "done" | "failed";

export interface Step {
  id: string;
  title: string;
  detail?: string;
  status: StepStatus;
  startedAt?: number;
  endedAt?: number;
}

export interface ApprovalRequest {
  id: string;
  kind: "write-file" | "run-code" | "send-data";
  title: string;
  preview: string;
}

export interface ApprovalRecord extends ApprovalRequest {
  decision: "allowed" | "denied";
}

export interface Task {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  taskId: string;
  role: "user" | "assistant";
  content: string;
  steps?: Step[];
  approvals?: ApprovalRecord[];
  createdAt: number;
}

export interface MemoryNote {
  id: string;
  path: string;
  content: string;
  updatedAt: number;
}

export type ProviderKind = "demo" | "openai" | "openrouter" | "together" | "ollama";

export interface Settings {
  id: "settings";
  onboarded: boolean;
  provider: ProviderKind;
  baseUrl: string;
  model: string;
}

export interface WorkspaceView {
  url: string;
  readingLine: number;
  code: string;
  status: string;
}

export type AgentEvent =
  | { type: "status"; orb: OrbState; label: string }
  | { type: "step"; step: Step }
  | { type: "text"; delta: string }
  | { type: "workspace"; patch: Partial<WorkspaceView> }
  | { type: "approval-result"; record: ApprovalRecord };
