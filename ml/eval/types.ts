export type FieldType = "text" | "email" | "number" | "select" | "radio" | "checkbox" | "textarea" | "date";

export interface FieldOption {
  value: string;
  label: string;
}

export interface GoldField {
  id: string;
  type: FieldType;
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: FieldOption[];
  validation?: { pattern?: string; message?: string };
}

export interface FormSchema {
  schemaVersion?: number;
  formTitle: string;
  formDescription?: string;
  fields: GoldField[];
}

export interface EvalCase {
  id: string;
  domain: string;
  prompt: string;
  gold: FormSchema;
}

// ---- adapters ----

export interface GenerateRequest {
  system: string;
  user: string;
  /** JSON Schema used for constrained decoding when the backend supports it. Omitted for unconstrained runs. */
  jsonSchema?: object;
  /** Lets offline/mock adapters look up the gold answer. Real adapters ignore it. */
  caseId?: string;
}

export interface GenerateResult {
  text: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export interface ModelAdapter {
  readonly name: string;
  readonly model: string;
  generate(req: GenerateRequest): Promise<GenerateResult>;
}

// ---- scoring ----

export interface CaseScore {
  caseId: string;
  domain: string;
  /** Output contained a parseable JSON object. */
  parsed: boolean;
  /** Parsed AND passes Formify JSON Schema v1 (AJV). */
  valid: boolean;
  issues: string[];
  predictedFields: number;
  goldFields: number;
  matchedFields: number;
  precision: number;
  recall: number;
  f1: number;
  /** Matched fields whose type equals gold type. */
  typeCorrect: number;
  /**
   * Constraint agreement over matched fields: `required` flag equality, plus option-value-set
   * Jaccard for select/radio. Averaged per matched field (0 when nothing matched).
   * NOTE: Formify v1 has no conditional-logic construct yet; extend once Phase 1 lands.
   */
  logic: number;
  latencyMs: number;
  error?: string;
  raw?: string;
}

export interface AggregateMetrics {
  cases: number;
  parseRate: number;
  validRate: number;
  precision: number;
  recall: number;
  f1: number;
  /** Micro-averaged: sum(typeCorrect) / sum(matchedFields). */
  typeAccuracy: number;
  logic: number;
  latencyMs: { mean: number; p50: number; p95: number };
  errors: number;
}

export interface EvalReport {
  meta: {
    adapter: string;
    model: string;
    startedAt: string;
    schemaVersion: number;
    constrained: boolean;
    caseCount: number;
  };
  aggregate: AggregateMetrics;
  byDomain: Record<string, AggregateMetrics>;
  cases: CaseScore[];
}
