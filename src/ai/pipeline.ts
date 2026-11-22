import type { CriticIssue, PatchOp, PipelineResult, TraceEntry } from "./types";
import validateSchema from "../utils/schemaValidation";
import { collectSchemaIssues } from "../utils/formifySchema";
import { applyPatch, invertPatch, parsePatchOps, PATCH_JSON_SCHEMA } from "./patch";
import { extractJson } from "./sanitize";
import {
  authorMessages,
  criticMessages,
  CRITIC_JSON_SCHEMA,
  logicMessages,
  plannerMessages,
  PLANNER_JSON_SCHEMA
} from "./agents";
import type { Router } from "./router";

export const MAX_AUTHOR_ATTEMPTS = 3;
const MAX_REQUEST_CHARS = 4000;

export class PipelineError extends Error {
  constructor(
    message: string,
    readonly trace: TraceEntry[]
  ) {
    super(message);
    this.name = "PipelineError";
  }
}

export interface PipelineOptions {
  request: string;
  /** Current form schema; null/undefined starts from an empty form. */
  schema?: any;
  router: Router;
  signal?: AbortSignal;
  /** Skip the optional Logic and Critic stages (faster, for small on-device models). */
  fast?: boolean;
  onStep?: (entry: TraceEntry) => void;
}

const EMPTY_FORM = { formTitle: "Untitled form", fields: [] as any[] };

/** Deterministic Validator agent: returns a list of human-readable problems (empty = valid). */
export function validateCandidate(schema: unknown): string[] {
  try {
    validateSchema(schema);
  } catch (e) {
    return [(e as Error).message];
  }
  return collectSchemaIssues(schema).map((i) => `${i.path} ${i.message}`);
}

/** Parse model text → ops → apply → validate. Throws with a message suitable to feed back to the model. */
function tryPatch(text: string, base: any): { ops: PatchOp[]; next: any } {
  const ops = parsePatchOps(extractJson(text));
  const next = applyPatch(base, ops);
  const problems = validateCandidate(next);
  if (problems.length) throw new Error(problems.join("; "));
  return { ops, next };
}

export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const { router, signal } = options;
  const request = options.request.slice(0, MAX_REQUEST_CHARS);
  if (!request.trim()) throw new PipelineError("Request is empty.", []);

  const input = options.schema && typeof options.schema === "object" ? options.schema : EMPTY_FORM;
  const trace: TraceEntry[] = [];
  const log = (e: TraceEntry) => {
    trace.push(e);
    options.onStep?.(e);
  };

  // 1. Planner (best effort: a failed plan must not block authoring)
  let brief: string | undefined;
  try {
    const r = await router.generate({
      messages: plannerMessages(request, input),
      jsonSchema: PLANNER_JSON_SCHEMA,
      signal
    });
    const plan = extractJson(r.text) as any;
    brief = JSON.stringify({ summary: plan?.summary, fields: plan?.fields, notes: plan?.notes });
    log({ agent: "planner", provider: r.provider.id, ok: true });
  } catch (e) {
    log({ agent: "planner", ok: false, note: (e as Error).message });
  }

  // 2. Schema Author with validator feedback loop
  let working = input;
  const ops: PatchOp[] = [];
  let feedback: { previous: string; errors: string[] } | null = null;
  let authored = false;
  for (let attempt = 1; attempt <= MAX_AUTHOR_ATTEMPTS && !authored; attempt++) {
    let text = "";
    let providerId: string | undefined;
    try {
      const r = await router.generate({
        messages: authorMessages(request, input, brief, feedback),
        jsonSchema: PATCH_JSON_SCHEMA,
        signal
      });
      text = r.text;
      providerId = r.provider.id;
      const { ops: newOps, next } = tryPatch(text, input);
      ops.push(...newOps);
      working = next;
      authored = true;
      log({ agent: "author", provider: providerId, attempt, ok: true });
    } catch (e) {
      const msg = (e as Error).message;
      log({ agent: "author", provider: providerId, attempt, ok: false, note: msg });
      log({ agent: "validator", attempt, ok: false, note: msg });
      if (!text) throw new PipelineError(msg, trace); // provider failure, not a validation failure
      feedback = { previous: text.slice(0, 4000), errors: [msg] };
    }
  }
  if (!authored) {
    throw new PipelineError(`Could not produce a valid form after ${MAX_AUTHOR_ATTEMPTS} attempts.`, trace);
  }
  log({ agent: "validator", ok: true });

  // 3. Logic Agent (optional, failures are skipped, never fatal)
  const issues: CriticIssue[] = [];
  if (!options.fast) {
    try {
      const r = await router.generate({ messages: logicMessages(request, working), jsonSchema: PATCH_JSON_SCHEMA, signal });
      const { ops: o, next } = tryPatch(r.text, working);
      ops.push(...o);
      working = next;
      log({ agent: "logic", provider: r.provider.id, ok: true, note: `${o.length} ops` });
    } catch (e) {
      log({ agent: "logic", ok: false, note: (e as Error).message });
    }

    // 4. UX Critic
    try {
      const r = await router.generate({ messages: criticMessages(request, working), jsonSchema: CRITIC_JSON_SCHEMA, signal });
      const out = extractJson(r.text) as any;
      const list = Array.isArray(out?.issues) ? out.issues : [];
      for (const i of list) {
        if (i && typeof i.message === "string") {
          const severity = ["info", "warn", "error"].includes(i.severity) ? i.severity : "info";
          issues.push({ severity, message: i.message.slice(0, 500) });
        }
      }
      if (Array.isArray(out?.ops) && out.ops.length) {
        try {
          const { ops: o, next } = tryPatch(JSON.stringify(out.ops), working);
          ops.push(...o);
          working = next;
        } catch (e) {
          issues.push({ severity: "info", message: `A suggested fix was discarded: ${(e as Error).message}` });
        }
      }
      log({ agent: "critic", provider: r.provider.id, ok: true });
    } catch (e) {
      log({ agent: "critic", ok: false, note: (e as Error).message });
    }
  }

  return {
    ops,
    nextSchema: working,
    inverse: invertPatch(input, ops),
    issues,
    trace,
    brief
  };
}
