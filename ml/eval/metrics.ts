import { collectSchemaIssues } from "../../src/utils/formifySchema";
import { extractJson } from "./json";
import type { AggregateMetrics, CaseScore, EvalCase, GoldField } from "./types";

const norm = (s: unknown): string => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const tokens = (s: unknown): Set<string> =>
  new Set(String(s ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));

function tokenJaccard(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  A.forEach((t) => B.has(t) && inter++);
  return inter / (A.size + B.size - inter);
}

const FUZZY_LABEL_THRESHOLD = 0.6;

/**
 * One-to-one matching of predicted fields to gold fields.
 * Pass 1: normalized id equality. Pass 2: normalized label equality. Pass 3: label token Jaccard >= 0.6 (best first).
 * Returns pairs of [predIndex, goldIndex].
 */
export function matchFields(pred: any[], gold: GoldField[]): Array<[number, number]> {
  const usedP = new Set<number>();
  const usedG = new Set<number>();
  const pairs: Array<[number, number]> = [];
  const take = (p: number, g: number) => {
    usedP.add(p);
    usedG.add(g);
    pairs.push([p, g]);
  };

  pred.forEach((pf, p) => {
    const g = gold.findIndex((gf, gi) => !usedG.has(gi) && norm(gf.id) === norm(pf?.id));
    if (g >= 0 && !usedP.has(p)) take(p, g);
  });
  pred.forEach((pf, p) => {
    if (usedP.has(p)) return;
    const g = gold.findIndex((gf, gi) => !usedG.has(gi) && norm(gf.label) === norm(pf?.label));
    if (g >= 0) take(p, g);
  });
  const cands: Array<[number, number, number]> = [];
  pred.forEach((pf, p) => {
    if (usedP.has(p)) return;
    gold.forEach((gf, g) => {
      if (usedG.has(g)) return;
      const s = tokenJaccard(String(pf?.label ?? ""), gf.label);
      if (s >= FUZZY_LABEL_THRESHOLD) cands.push([p, g, s]);
    });
  });
  cands.sort((x, y) => y[2] - x[2]);
  for (const [p, g] of cands) if (!usedP.has(p) && !usedG.has(g)) take(p, g);
  return pairs;
}

function optionValues(f: any): Set<string> {
  const opts = Array.isArray(f?.options) ? f.options : [];
  return new Set(opts.map((o: any) => norm(o?.value ?? o?.label)));
}

function setJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  a.forEach((x) => b.has(x) && inter++);
  return inter / (a.size + b.size - inter);
}

/** Constraint agreement for one matched pair, in [0,1]. */
export function constraintScore(pred: any, gold: GoldField): number {
  const reqOk = Boolean(pred?.required) === Boolean(gold.required) ? 1 : 0;
  if (gold.type === "select" || gold.type === "radio") {
    return (reqOk + setJaccard(optionValues(pred), optionValues(gold))) / 2;
  }
  return reqOk;
}

const zeroScore = (c: EvalCase, latencyMs: number, extra: Partial<CaseScore>): CaseScore => ({
  caseId: c.id,
  domain: c.domain,
  parsed: false,
  valid: false,
  issues: [],
  predictedFields: 0,
  goldFields: c.gold.fields.length,
  matchedFields: 0,
  precision: 0,
  recall: 0,
  f1: 0,
  typeCorrect: 0,
  logic: 0,
  latencyMs,
  ...extra
});

/** Score a single model output against a case. Never throws. */
export function scoreOutput(c: EvalCase, output: string, latencyMs: number): CaseScore {
  let obj: any;
  try {
    obj = extractJson(output);
  } catch (e) {
    return zeroScore(c, latencyMs, { issues: [(e as Error).message] });
  }

  const issues = collectSchemaIssues(obj).map((i) => `${i.path} ${i.message}`);
  // Duplicate ids pass JSON Schema but are semantically invalid in Formify (see schemaValidation.ts).
  const predFields: any[] = Array.isArray(obj?.fields) ? obj.fields : [];
  const ids = predFields.map((f) => f?.id).filter((x) => typeof x === "string");
  if (new Set(ids).size !== ids.length) issues.push("/fields duplicate field id");

  const pairs = matchFields(predFields, c.gold.fields);
  const matched = pairs.length;
  const precision = predFields.length ? matched / predFields.length : 0;
  const recall = c.gold.fields.length ? matched / c.gold.fields.length : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const typeCorrect = pairs.filter(([p, g]) => predFields[p]?.type === c.gold.fields[g].type).length;
  const logic = matched ? pairs.reduce((s, [p, g]) => s + constraintScore(predFields[p], c.gold.fields[g]), 0) / matched : 0;

  return {
    caseId: c.id,
    domain: c.domain,
    parsed: true,
    valid: issues.length === 0,
    issues,
    predictedFields: predFields.length,
    goldFields: c.gold.fields.length,
    matchedFields: matched,
    precision,
    recall,
    f1,
    typeCorrect,
    logic,
    latencyMs
  };
}

export const failedScore = (c: EvalCase, latencyMs: number, error: string): CaseScore =>
  zeroScore(c, latencyMs, { error });

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

export function aggregate(scores: CaseScore[]): AggregateMetrics {
  const lat = scores.map((s) => s.latencyMs).sort((a, b) => a - b);
  const matched = scores.reduce((s, x) => s + x.matchedFields, 0);
  const typeCorrect = scores.reduce((s, x) => s + x.typeCorrect, 0);
  return {
    cases: scores.length,
    parseRate: mean(scores.map((s) => (s.parsed ? 1 : 0))),
    validRate: mean(scores.map((s) => (s.valid ? 1 : 0))),
    precision: mean(scores.map((s) => s.precision)),
    recall: mean(scores.map((s) => s.recall)),
    f1: mean(scores.map((s) => s.f1)),
    typeAccuracy: matched ? typeCorrect / matched : 0,
    logic: mean(scores.map((s) => s.logic)),
    latencyMs: { mean: mean(lat), p50: percentile(lat, 0.5), p95: percentile(lat, 0.95) },
    errors: scores.filter((s) => s.error).length
  };
}
