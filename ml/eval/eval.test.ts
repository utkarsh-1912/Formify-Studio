import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hfEndpointAdapter } from "./adapters/hf";
import { mockAdapter, type MockMode } from "./adapters/mock";
import { ollamaAdapter } from "./adapters/ollama";
import { openaiCompatAdapter } from "./adapters/openai";
import { ARTIFACTS } from "./artifacts";
import { extractJson } from "./json";
import { aggregate, matchFields, scoreOutput } from "./metrics";
import { runEval } from "./runner";
import { parseField, SEED_CASES } from "./seeds";
import { collectSchemaIssues } from "../../src/utils/formifySchema";
import validateSchema from "../../src/utils/schemaValidation";

describe("seed cases", () => {
  test("has at least 100 cases across many domains with unique ids", () => {
    expect(SEED_CASES.length).toBeGreaterThanOrEqual(100);
    expect(new Set(SEED_CASES.map((c) => c.id)).size).toBe(SEED_CASES.length);
    expect(new Set(SEED_CASES.map((c) => c.domain)).size).toBeGreaterThanOrEqual(15);
  });

  test("every gold schema passes both the JSON Schema and the app's validator", () => {
    for (const c of SEED_CASES) {
      expect(collectSchemaIssues(c.gold), c.id).toEqual([]);
      expect(() => validateSchema(c.gold), c.id).not.toThrow();
    }
  });

  test("prompts are unique", () => {
    expect(new Set(SEED_CASES.map((c) => c.prompt.toLowerCase())).size).toBe(SEED_CASES.length);
  });

  test("DSL parses required flag and options containing colons", () => {
    const f = parseField("slot:select:Time!:3:00 PM,4:00 PM");
    expect(f.required).toBe(true);
    expect(f.label).toBe("Time");
    expect(f.options?.map((o) => o.label)).toEqual(["3:00 PM", "4:00 PM"]);
  });
});

describe("committed artifacts are fresh", () => {
  test.each(ARTIFACTS())("%s matches generator output", (rel, content) => {
    const onDisk = readFileSync(resolve(rel), "utf-8").replace(/\r\n/g, "\n");
    expect(onDisk).toBe(content);
  });
});

describe("extractJson", () => {
  test("handles think blocks, fences and prose", () => {
    expect(extractJson('<think>x {y}</think> ok ```json\n{"a":1}\n``` bye')).toEqual({ a: 1 });
  });
  test("handles braces inside strings", () => {
    expect(extractJson('text {"a":"}{","b":{"c":2}} tail')).toEqual({ a: "}{", b: { c: 2 } });
  });
  test("throws when absent or unterminated", () => {
    expect(() => extractJson("no json")).toThrow();
    expect(() => extractJson('{"a":')).toThrow();
  });
});

describe("matchFields", () => {
  const gold = [
    { id: "email", type: "email", label: "Email Address" },
    { id: "fullName", type: "text", label: "Full Name" }
  ] as any;
  test("matches by id, then label, then fuzzy label, one-to-one", () => {
    const pairs = matchFields(
      [
        { id: "email", label: "x" },
        { id: "name_field", label: "full name" }
      ],
      gold
    );
    expect(pairs).toEqual([[0, 0], [1, 1]]);
    const fuzzy = matchFields([{ id: "zzz", label: "Your Full Name" }], gold);
    expect(fuzzy).toEqual([[0, 1]]);
  });
  test("never matches two predictions to one gold field", () => {
    const pairs = matchFields([{ id: "email" }, { id: "email" }], gold);
    expect(pairs.length).toBe(1);
  });
});

describe("scoreOutput", () => {
  const c = SEED_CASES[0];
  test("oracle scores perfectly", () => {
    const s = scoreOutput(c, JSON.stringify(c.gold), 5);
    expect(s).toMatchObject({ parsed: true, valid: true, precision: 1, recall: 1, f1: 1, logic: 1 });
    expect(s.typeCorrect).toBe(c.gold.fields.length);
  });
  test("wrong type and required flag are penalised", () => {
    const fields = c.gold.fields.map((f, i) => (i === 0 ? { ...f, type: "textarea", required: !f.required } : f));
    const s = scoreOutput(c, JSON.stringify({ ...c.gold, fields }), 1);
    expect(s.typeCorrect).toBe(c.gold.fields.length - 1);
    expect(s.logic).toBeLessThan(1);
    expect(s.valid).toBe(true);
  });
  test("duplicate ids are flagged invalid", () => {
    const fields = [c.gold.fields[0], { ...c.gold.fields[1], id: c.gold.fields[0].id }];
    expect(scoreOutput(c, JSON.stringify({ ...c.gold, fields }), 1).valid).toBe(false);
  });
  test("garbage gives zeros, not an exception", () => {
    const s = scoreOutput(c, "hello", 1);
    expect(s).toMatchObject({ parsed: false, valid: false, f1: 0 });
  });
  test("hallucinated extra fields lower precision but not recall", () => {
    const extra = { id: "bonus", type: "text", label: "Totally Unrelated Thing" };
    const s = scoreOutput(c, JSON.stringify({ ...c.gold, fields: [...c.gold.fields, extra] }), 1);
    expect(s.recall).toBe(1);
    expect(s.precision).toBeCloseTo(c.gold.fields.length / (c.gold.fields.length + 1));
  });
});

describe("runEval with the offline mock adapter", () => {
  const cases = SEED_CASES.slice(0, 20);
  const run = (mode: MockMode, constrained = true) => runEval({ adapter: mockAdapter(cases, mode), cases, concurrency: 3, constrained });

  test("oracle: 100% valid, F1 = 1", async () => {
    const r = await run("oracle");
    expect(r.aggregate).toMatchObject({ cases: 20, parseRate: 1, validRate: 1, f1: 1, typeAccuracy: 1, logic: 1, errors: 0 });
    expect(r.meta.constrained).toBe(true);
  });
  test("chatty output is still parsed", async () => {
    expect((await run("chatty")).aggregate.validRate).toBe(1);
  });
  test("degraded: valid but imperfect", async () => {
    const a = (await run("degraded")).aggregate;
    expect(a.validRate).toBe(1);
    expect(a.f1).toBeLessThan(1);
    expect(a.typeAccuracy).toBeLessThan(1);
  });
  test("invalid-schema parses but is never valid", async () => {
    const a = (await run("invalid-schema")).aggregate;
    expect(a.parseRate).toBe(1);
    expect(a.validRate).toBe(0);
  });
  test("garbage and backend errors are counted, not thrown", async () => {
    expect((await run("garbage")).aggregate.parseRate).toBe(0);
    const e = await run("error");
    expect(e.aggregate.errors).toBe(20);
    expect(e.cases[0].error).toMatch(/simulated/);
  });
  test("per-domain breakdown covers every domain", async () => {
    const r = await run("oracle");
    expect(Object.keys(r.byDomain).sort()).toEqual(Array.from(new Set(cases.map((c) => c.domain))).sort());
  });
  test("latency comes from the injected clock", async () => {
    let t = 0;
    const r = await runEval({ adapter: mockAdapter(cases, "oracle"), cases: cases.slice(0, 4), now: () => (t += 10) });
    expect(r.aggregate.latencyMs.mean).toBe(10);
  });
  test("aggregate percentiles", () => {
    const scores = [10, 20, 30, 40, 50].map((latencyMs) => ({ ...scoreOutput(cases[0], "x", latencyMs) }));
    const a = aggregate(scores);
    expect(a.latencyMs.p50).toBe(30);
    expect(a.latencyMs.p95).toBe(50);
  });
});

describe("HTTP adapters (fake fetch, no network)", () => {
  const req = { system: "sys", user: "usr", jsonSchema: { type: "object" } };
  const fakeFetch = (payload: unknown, status = 200) => {
    const calls: Array<{ url: string; body: any; headers: any }> = [];
    const f = async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body)), headers: init?.headers });
      return new Response(JSON.stringify(payload), { status });
    };
    return { f, calls };
  };

  test("ollama sends schema as `format` and reads message.content", async () => {
    const { f, calls } = fakeFetch({ message: { content: "{}" }, eval_count: 7 });
    const out = await ollamaAdapter({ model: "qwen3:4b", baseUrl: "http://h:1/", fetchImpl: f }).generate(req);
    expect(out.text).toBe("{}");
    expect(out.usage?.completionTokens).toBe(7);
    expect(calls[0].url).toBe("http://h:1/api/chat");
    expect(calls[0].body.format).toEqual({ type: "object" });
    expect(calls[0].body.stream).toBe(false);
  });

  test("ollama omits format when unconstrained", async () => {
    const { f, calls } = fakeFetch({ message: { content: "{}" } });
    await ollamaAdapter({ model: "m", fetchImpl: f }).generate({ ...req, jsonSchema: undefined });
    expect("format" in calls[0].body).toBe(false);
  });

  test("openai-compatible sends json_schema response_format and bearer key", async () => {
    const { f, calls } = fakeFetch({ choices: [{ message: { content: "{\"a\":1}" } }] });
    const out = await openaiCompatAdapter({ model: "m", baseUrl: "http://v/v1", apiKey: "k", fetchImpl: f }).generate(req);
    expect(out.text).toBe('{"a":1}');
    expect(calls[0].url).toBe("http://v/v1/chat/completions");
    expect(calls[0].body.response_format.type).toBe("json_schema");
    expect(calls[0].headers.authorization).toBe("Bearer k");
  });

  test("hf endpoint supports both grammar styles", async () => {
    const a = fakeFetch({ choices: [{ message: { content: "{}" } }] });
    await hfEndpointAdapter({ endpointUrl: "https://e.test", token: "t", fetchImpl: a.f }).generate(req);
    expect(a.calls[0].url).toBe("https://e.test/v1/chat/completions");
    expect(a.calls[0].body.response_format.type).toBe("json_schema");
    const b = fakeFetch({ choices: [{ message: { content: "{}" } }] });
    await hfEndpointAdapter({ endpointUrl: "https://e.test", grammarStyle: "tgi_value", fetchImpl: b.f }).generate(req);
    expect(b.calls[0].body.response_format).toEqual({ type: "json", value: { type: "object" } });
  });

  test("non-2xx and malformed bodies become errors that runEval records", async () => {
    const bad = fakeFetch({ error: "boom" }, 500);
    await expect(ollamaAdapter({ model: "m", fetchImpl: bad.f }).generate(req)).rejects.toThrow(/HTTP 500/);
    const empty = fakeFetch({});
    await expect(openaiCompatAdapter({ model: "m", fetchImpl: empty.f }).generate(req)).rejects.toThrow(/missing/);
    const r = await runEval({ adapter: ollamaAdapter({ model: "m", fetchImpl: bad.f }), cases: SEED_CASES.slice(0, 2) });
    expect(r.aggregate.errors).toBe(2);
  });
});
