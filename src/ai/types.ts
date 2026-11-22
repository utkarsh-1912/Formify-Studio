export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface GenerateOptions {
  messages: ChatMessage[];
  /** JSON Schema the output must conform to (providers that support constrained decoding enforce it). */
  jsonSchema?: object;
  temperature?: number;
  signal?: AbortSignal;
}

export type ProviderKind = "local" | "remote";

/** Every model backend implements this. Implementations must be mockable (no work at construction time). */
export interface AiProvider {
  readonly id: string;
  readonly label: string;
  /** "local" = data never leaves the device / user's machine. */
  readonly kind: ProviderKind;
  isAvailable(): Promise<boolean>;
  generate(opts: GenerateOptions): Promise<string>;
}

export type PatchOp =
  | { op: "add"; path: string; value: unknown }
  | { op: "replace"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "test"; path: string; value: unknown };

export type AgentName = "planner" | "author" | "logic" | "critic" | "validator";

export interface TraceEntry {
  agent: AgentName;
  provider?: string;
  attempt?: number;
  ok: boolean;
  note?: string;
}

export interface CriticIssue {
  severity: "info" | "warn" | "error";
  message: string;
}

export interface PipelineResult {
  /** Combined, validated patch against the *input* schema. */
  ops: PatchOp[];
  /** Schema after applying ops. */
  nextSchema: any;
  /** Ops that undo `ops` when applied to `nextSchema`. */
  inverse: PatchOp[];
  issues: CriticIssue[];
  trace: TraceEntry[];
  brief?: string;
}
