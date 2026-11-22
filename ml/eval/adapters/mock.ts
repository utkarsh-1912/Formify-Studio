import type { EvalCase, GenerateRequest, GenerateResult, ModelAdapter } from "../types";

export type MockMode =
  /** Returns the gold schema verbatim (upper bound; proves the harness scores 100%). */
  | "oracle"
  /** Valid but imperfect: drops the last field and flips the first field's type. */
  | "degraded"
  /** Valid JSON that fails the Formify schema (unknown field type). */
  | "invalid-schema"
  /** Not JSON at all. */
  | "garbage"
  /** Wraps the gold in <think> + markdown fence, like Qwen3 with a fence-happy template. */
  | "chatty"
  /** Throws, to exercise error accounting. */
  | "error";

/** Offline adapter for tests and dry runs. Deterministic; needs no network. */
export function mockAdapter(cases: EvalCase[], mode: MockMode = "oracle"): ModelAdapter {
  const byId = new Map(cases.map((c) => [c.id, c]));
  return {
    name: "mock",
    model: `mock-${mode}`,
    async generate(req: GenerateRequest): Promise<GenerateResult> {
      const c = req.caseId ? byId.get(req.caseId) : undefined;
      if (!c) throw new Error(`mock adapter: unknown caseId ${req.caseId}`);
      const gold = c.gold;
      switch (mode) {
        case "oracle":
          return { text: JSON.stringify(gold) };
        case "degraded": {
          const fields = gold.fields.slice(0, Math.max(1, gold.fields.length - 1)).map((f, i) => (i === 0 ? { ...f, type: f.type === "text" ? "textarea" : "text" } : f));
          return { text: JSON.stringify({ ...gold, fields }) };
        }
        case "invalid-schema":
          return { text: JSON.stringify({ ...gold, fields: gold.fields.map((f) => ({ ...f, type: "telepathy" })) }) };
        case "garbage":
          return { text: "Sure! Here is a lovely form for you." };
        case "chatty":
          return { text: `<think>planning fields</think>\nHere you go:\n\`\`\`json\n${JSON.stringify(gold, null, 2)}\n\`\`\`` };
        case "error":
          throw new Error("mock adapter: simulated backend failure");
      }
    }
  };
}
