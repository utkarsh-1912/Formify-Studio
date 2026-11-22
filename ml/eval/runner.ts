import { FORMIFY_SCHEMA_VERSION, formifySchemaV1 } from "../../src/utils/formifySchema";
import { aggregate, failedScore, scoreOutput } from "./metrics";
import { SYSTEM_PROMPT, userPrompt } from "./prompt";
import type { CaseScore, EvalCase, EvalReport, ModelAdapter } from "./types";

export interface RunOptions {
  adapter: ModelAdapter;
  cases: EvalCase[];
  /** Parallel in-flight requests. Keep 1 for honest latency numbers on a single local GPU. */
  concurrency?: number;
  /** Send the Formify JSON Schema to the backend for constrained decoding. Default true. */
  constrained?: boolean;
  includeRaw?: boolean;
  onProgress?: (done: number, total: number, score: CaseScore) => void;
  /** Injectable clock for tests. */
  now?: () => number;
}

export async function runEval(opts: RunOptions): Promise<EvalReport> {
  const { adapter, cases, concurrency = 1, constrained = true, includeRaw = false, onProgress } = opts;
  const now = opts.now ?? (() => performance.now());
  const startedAt = new Date().toISOString();
  const scores: CaseScore[] = new Array(cases.length);
  let next = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= cases.length) return;
      const c = cases[i];
      const t0 = now();
      let score: CaseScore;
      try {
        const res = await adapter.generate({
          system: SYSTEM_PROMPT,
          user: userPrompt(c.prompt),
          jsonSchema: constrained ? formifySchemaV1 : undefined,
          caseId: c.id
        });
        score = scoreOutput(c, res.text, now() - t0);
        if (includeRaw) score.raw = res.text;
      } catch (e) {
        score = failedScore(c, now() - t0, (e as Error).message);
      }
      scores[i] = score;
      onProgress?.(++done, cases.length, score);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  const byDomain: EvalReport["byDomain"] = {};
  const domains = Array.from(new Set(cases.map((c) => c.domain))).sort();
  for (const d of domains) byDomain[d] = aggregate(scores.filter((s) => s.domain === d));

  return {
    meta: {
      adapter: adapter.name,
      model: adapter.model,
      startedAt,
      schemaVersion: FORMIFY_SCHEMA_VERSION,
      constrained,
      caseCount: cases.length
    },
    aggregate: aggregate(scores),
    byDomain,
    cases: scores
  };
}

export function formatSummary(r: EvalReport): string {
  const a = r.aggregate;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  return [
    `adapter=${r.meta.adapter} model=${r.meta.model} constrained=${r.meta.constrained} cases=${a.cases}`,
    `parse ${pct(a.parseRate)} | AJV-valid ${pct(a.validRate)} | F1 ${pct(a.f1)} (P ${pct(a.precision)} R ${pct(a.recall)})`,
    `type-acc ${pct(a.typeAccuracy)} | constraints ${pct(a.logic)} | errors ${a.errors}`,
    `latency mean ${a.latencyMs.mean.toFixed(0)}ms p50 ${a.latencyMs.p50.toFixed(0)}ms p95 ${a.latencyMs.p95.toFixed(0)}ms`
  ].join("\n");
}
