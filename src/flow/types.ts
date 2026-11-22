/**
 * Formify workflow engine — shared types.
 * A workflow is a versioned JSON DAG stored next to a form schema.
 */

export const FLOW_SCHEMA_VERSION = 1;

export const TRIGGER_TYPES = ["submission", "field_changed", "schedule", "webhook", "manual"] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const NODE_TYPES = [
  "trigger",
  "condition",
  "transform",
  "ai",
  "http",
  "delay",
  "approval",
  "loop",
  "email",
  "write"
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export interface RetryPolicy {
  /** Total number of tries (1 = no retry). */
  attempts: number;
  /** Base backoff in ms; doubles each retry. */
  backoffMs?: number;
}

export interface FlowNode {
  id: string;
  type: NodeType;
  label?: string;
  position?: { x: number; y: number };
  config: Record<string, any>;
  retry?: RetryPolicy;
  /** Per-attempt timeout in ms (default 30000). */
  timeoutMs?: number;
  /**
   * "fail" (default): the run fails.
   * "continue": the node is marked failed and only edges with branch "error" fire.
   */
  onError?: "fail" | "continue";
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  /**
   * Branch label. condition: "true"|"false"; approval: "approved"|"rejected";
   * loop: "each"|"done"; any node: "error" (needs onError:"continue"). Omitted = default.
   */
  branch?: string;
}

export interface Workflow {
  schemaVersion: number;
  id: string;
  name: string;
  description?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface TriggerEvent {
  type: TriggerType;
  payload: Record<string, any>;
}

export type NodeStatus = "pending" | "running" | "waiting" | "succeeded" | "failed" | "skipped";
export type RunStatus = "running" | "waiting" | "succeeded" | "failed";

export interface NodeState {
  status: NodeStatus;
  /** Resolved (and redacted) config the node ran with. */
  input?: any;
  output?: any;
  error?: string;
  attempts: number;
  startedAt?: number;
  endedAt?: number;
  /** Branch labels this node activated (default ["default"]). */
  branches?: string[];
  /** For long delays: epoch ms at which the run may resume. */
  resumeAt?: number;
}

export interface LogEntry {
  at: number;
  nodeId: string;
  /** Loop iteration path, e.g. [2] or [0,1] for nested loops. */
  iteration?: number[];
  status: NodeStatus;
  attempt?: number;
  message?: string;
  input?: any;
  output?: any;
}

export interface Run {
  id: string;
  workflowId: string;
  workflowVersion: number;
  status: RunStatus;
  trigger: TriggerEvent;
  startedAt: number;
  endedAt?: number;
  nodeStates: Record<string, NodeState>;
  log: LogEntry[];
  error?: string;
  /** Id of the run this one replays, if any. */
  replayOf?: string;
}

// ---- Injected adapters ----

export interface AiProvider {
  generate(req: { prompt: string; system?: string; schema?: Record<string, any> }): Promise<unknown>;
}

export interface HttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}
export interface HttpResponse {
  status: number;
  body: unknown;
}
export interface HttpClient {
  request(req: HttpRequest): Promise<HttpResponse>;
}

export interface EmailAdapter {
  send(msg: { to: string; subject: string; body: string }): Promise<unknown>;
}
export interface WriteAdapter {
  write(req: { target: string; data: unknown }): Promise<unknown>;
}
export interface SecretVault {
  get(name: string): string | undefined | Promise<string | undefined>;
}

export interface FlowDeps {
  ai?: AiProvider;
  http?: HttpClient;
  email?: EmailAdapter;
  write?: WriteAdapter;
  vault?: SecretVault;
  /** Outbound domains allowed for http nodes. Exact host, or "*.example.com". Empty = deny all. */
  allowedDomains?: string[];
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Delays above this pause the run instead of sleeping inline (default 30000). */
  maxInlineDelayMs?: number;
  /** Safety cap on node executions per run pass (default 10000). */
  maxSteps?: number;
}

export type ResumeEvent =
  | { type: "approval"; nodeId: string; approved: boolean; by?: string; comment?: string }
  | { type: "timer" };
