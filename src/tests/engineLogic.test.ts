import {
  evaluateExpression,
  checkExpression,
  evaluateRule,
  checkRule,
  isFieldVisible,
  isFieldRequired,
  getVisibleFields,
  computeValues,
  getSteps,
  getInitialValues,
  collectSubmission,
  FormSchema
} from "../engine/logic";

const ev = (src: string, values: Record<string, any> = {}) => evaluateExpression(src, values);

describe("expression evaluator", () => {
  test("arithmetic with precedence and parentheses", () => {
    expect(ev("1 + 2 * 3")).toBe(7);
    expect(ev("(1 + 2) * 3")).toBe(9);
    expect(ev("10 / 4")).toBe(2.5);
    expect(ev("10 % 4")).toBe(2);
    expect(ev("-3 + 5")).toBe(2);
    expect(ev("2 * -3")).toBe(-6);
  });

  test("field references, including numeric strings and {braced} ids", () => {
    expect(ev("a + b", { a: "2", b: 3 })).toBe(5);
    expect(ev("{first-name}", { "first-name": "Ada" })).toBe("Ada");
    expect(ev("price * qty", { price: "9.5", qty: 2 })).toBe(19);
  });

  test("string concatenation and comparison", () => {
    expect(ev("'Hello ' + name", { name: "Bob" })).toBe("Hello Bob");
    expect(ev("name == 'Bob'", { name: "Bob" })).toBe(true);
    expect(ev("name != 'Bob'", { name: "Eve" })).toBe(true);
    expect(ev("'b' > 'a'")).toBe(true);
  });

  test("comparison is numeric when both sides look numeric", () => {
    expect(ev("a > b", { a: "10", b: "9" })).toBe(true); // not string compare
    expect(ev("a == b", { a: "5", b: 5 })).toBe(true);
  });

  test("boolean operators short-circuit and return operands", () => {
    expect(ev("a && b", { a: true, b: false })).toBe(false);
    expect(ev("a || 'x'", { a: "" })).toBe("x");
    expect(ev("!a", { a: "" })).toBe(true);
    expect(ev("true && false || true")).toBe(true);
  });

  test("ternary", () => {
    expect(ev("n > 5 ? 'big' : 'small'", { n: 9 })).toBe("big");
    expect(ev("n > 5 ? 'big' : 'small'", { n: 1 })).toBe("small");
  });

  test("empty values act as empty on both sides of ==", () => {
    expect(ev("x == ''", {})).toBe(true);
    expect(ev("x == ''", { x: null })).toBe(true);
    expect(ev("x == ''", { x: "a" })).toBe(false);
  });

  test("functions", () => {
    expect(ev("sum(a, b, 4)", { a: 1, b: "2" })).toBe(7);
    expect(ev("sum(list)", { list: [1, 2, 3] })).toBe(6);
    expect(ev("min(3, 1, 2)")).toBe(1);
    expect(ev("max(3, 1, 2)")).toBe(3);
    expect(ev("avg(2, 4)")).toBe(3);
    expect(ev("round(3.14159, 2)")).toBe(3.14);
    expect(ev("round(2.5)")).toBe(3);
    expect(ev("floor(2.9)")).toBe(2);
    expect(ev("ceil(2.1)")).toBe(3);
    expect(ev("abs(-4)")).toBe(4);
    expect(ev("len(s)", { s: "abcd" })).toBe(4);
    expect(ev("len(l)", { l: [1, 2] })).toBe(2);
    expect(ev("contains(l, 'b')", { l: ["a", "b"] })).toBe(true);
    expect(ev("contains(s, 'ell')", { s: "hello" })).toBe(true);
    expect(ev("isEmpty(x)", { x: [] })).toBe(true);
    expect(ev("number('12') + 1")).toBe(13);
    expect(ev("text(5) + 'x'")).toBe("5x");
    expect(ev("concat('a', 1, 'b')")).toBe("a1b");
    expect(ev("if(a > 1, 'y', 'n')", { a: 2 })).toBe("y");
  });

  test("syntax errors throw with a helpful message; checkExpression reports them", () => {
    expect(() => ev("1 +")).toThrow(/Unexpected end/);
    expect(() => ev("(1 + 2")).toThrow(/Expected '\)'/);
    expect(() => ev("'abc")).toThrow(/Unterminated string/);
    expect(() => ev("1 @ 2")).toThrow(/Unexpected character/);
    expect(checkExpression("a +")).not.toBe("");
    expect(checkExpression("a + b")).toBe("");
  });

  test("division by zero yields a non-finite number, never throws", () => {
    expect(Number.isFinite(ev("1 / 0") as number)).toBe(false);
  });
});

describe("expression evaluator safety (no eval)", () => {
  test("unknown functions are rejected at parse time", () => {
    expect(() => ev("alert(1)")).toThrow(/Unknown function/);
    expect(() => ev("constructor('return 1')")).toThrow(/Unknown function/);
    expect(() => ev("process.exit(1)")).toThrow(/Unknown function/);
  });

  test("property-access / call-chaining syntax is not supported", () => {
    expect(() => ev("a.constructor.constructor('return 1')()")).toThrow();
    expect(() => ev("a['constructor']")).toThrow();
    expect(() => ev("this")).not.toThrow(); // just an (undefined) field reference named "this"
    expect(ev("this")).toBeUndefined();
  });

  test("prototype keys resolve to undefined, not Object.prototype members", () => {
    expect(ev("constructor", {})).toBeUndefined();
    expect(ev("__proto__", {})).toBeUndefined();
    expect(ev("toString", {})).toBeUndefined();
    expect(ev("{hasOwnProperty}", {})).toBeUndefined();
  });

  test("code-ish payloads are inert text, not executed", () => {
    (globalThis as any).__pwned = false;
    expect(() => ev("(globalThis.__pwned = true)")).toThrow();
    expect(() => ev("__pwned = true")).toThrow();
    expect((globalThis as any).__pwned).toBe(false);
    expect(ev("'(globalThis.__pwned = true)'")).toBe("(globalThis.__pwned = true)");
  });

  test("expressions are length-limited", () => {
    expect(() => ev("1+".repeat(400) + "1")).toThrow(/too long/);
  });

  test("core source contains no eval / Function constructor", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/engine/core.ts", "utf8");
    expect(src).not.toMatch(/\beval\s*\(/);
    expect(src).not.toMatch(/new\s+Function\b/);
    expect(src).not.toMatch(/\bFunction\s*\(/);
  });
});

describe("rules", () => {
  const v = { plan: "pro", seats: 8, tags: ["a", "b"], note: "" };

  test("primitive and expression rules", () => {
    expect(evaluateRule(undefined, v)).toBe(true);
    expect(evaluateRule(true, v)).toBe(true);
    expect(evaluateRule(false, v)).toBe(false);
    expect(evaluateRule("plan == 'pro'", v)).toBe(true);
    expect(evaluateRule("seats > 10", v)).toBe(false);
    expect(evaluateRule("", v)).toBe(true);
  });

  test("structured operators", () => {
    expect(evaluateRule({ field: "plan", op: "eq", value: "pro" }, v)).toBe(true);
    expect(evaluateRule({ field: "plan", value: "pro" }, v)).toBe(true); // eq is the default
    expect(evaluateRule({ field: "plan", op: "neq", value: "pro" }, v)).toBe(false);
    expect(evaluateRule({ field: "seats", op: "gt", value: 5 }, v)).toBe(true);
    expect(evaluateRule({ field: "seats", op: "gte", value: 8 }, v)).toBe(true);
    expect(evaluateRule({ field: "seats", op: "lt", value: 8 }, v)).toBe(false);
    expect(evaluateRule({ field: "seats", op: "lte", value: 8 }, v)).toBe(true);
    expect(evaluateRule({ field: "tags", op: "contains", value: "a" }, v)).toBe(true);
    expect(evaluateRule({ field: "tags", op: "notContains", value: "z" }, v)).toBe(true);
    expect(evaluateRule({ field: "tags", op: "eq", value: "b" }, v)).toBe(true); // array eq = membership
    expect(evaluateRule({ field: "plan", op: "in", value: ["free", "pro"] }, v)).toBe(true);
    expect(evaluateRule({ field: "note", op: "empty" }, v)).toBe(true);
    expect(evaluateRule({ field: "plan", op: "notEmpty" }, v)).toBe(true);
  });

  test("comparisons against empty values are false (not 0)", () => {
    expect(evaluateRule({ field: "missing", op: "lt", value: 5 }, v)).toBe(false);
    expect(evaluateRule({ field: "missing", op: "gte", value: 0 }, v)).toBe(false);
  });

  test("all / any / not combinators nest", () => {
    expect(evaluateRule({ all: [{ field: "plan", value: "pro" }, "seats > 5"] }, v)).toBe(true);
    expect(evaluateRule({ all: [{ field: "plan", value: "free" }, "seats > 5"] }, v)).toBe(false);
    expect(evaluateRule({ any: [{ field: "plan", value: "free" }, "seats > 5"] }, v)).toBe(true);
    expect(evaluateRule({ not: { field: "plan", value: "pro" } }, v)).toBe(false);
    expect(evaluateRule({ not: { any: [{ field: "plan", value: "free" }, { field: "seats", op: "lt", value: 1 }] } }, v)).toBe(true);
  });

  test("malformed rules fail open instead of throwing", () => {
    expect(evaluateRule("1 +" as any, v)).toBe(true);
    expect(evaluateRule({ nonsense: 1 } as any, v)).toBe(true);
    expect(evaluateRule(42 as any, v)).toBe(true);
  });

  test("checkRule reports problems", () => {
    expect(checkRule("a == 1")).toBe("");
    expect(checkRule({ field: "a", op: "eq", value: 1 })).toBe("");
    expect(checkRule({ all: [{ field: "a" }, "b >"] })).not.toBe("");
    expect(checkRule({ field: "a", op: "wat" })).toMatch(/Unknown rule operator/);
    expect(checkRule({})).toMatch(/needs a 'field'/);
    expect(checkRule([] as any)).not.toBe("");
  });
});

const baseSchema = (fields: any[]): FormSchema => ({ formTitle: "T", fields });

describe("visibility / required", () => {
  const fields: any[] = [
    { id: "plan", type: "select", label: "Plan", options: [{ value: "free", label: "Free" }, { value: "pro", label: "Pro" }] },
    { id: "seats", type: "number", label: "Seats", visibleIf: "plan == 'pro'", requiredIf: "plan == 'pro'" },
    { id: "note", type: "text", label: "Note", required: true }
  ];

  test("visibleIf toggles with other values", () => {
    expect(isFieldVisible(fields[1], { plan: "pro" })).toBe(true);
    expect(isFieldVisible(fields[1], { plan: "free" })).toBe(false);
    expect(getVisibleFields(baseSchema(fields), { plan: "free" }).map((f) => f.id)).toEqual(["plan", "note"]);
  });

  test("requiredIf overrides static required, and hidden fields are never required", () => {
    expect(isFieldRequired(fields[1], { plan: "pro" })).toBe(true);
    expect(isFieldRequired(fields[1], { plan: "free" })).toBe(false);
    expect(isFieldRequired(fields[2], {})).toBe(true);
  });

  test("layout/derived types are never required", () => {
    expect(isFieldRequired({ id: "s", type: "section", label: "S", required: true } as any, {})).toBe(false);
    expect(isFieldRequired({ id: "c", type: "calculated", label: "C", formula: "1", required: true } as any, {})).toBe(false);
  });
});

describe("calculated fields", () => {
  const schema = baseSchema([
    { id: "price", type: "number", label: "Price" },
    { id: "qty", type: "number", label: "Qty" },
    { id: "total", type: "calculated", label: "Total", formula: "price * qty" },
    { id: "withTax", type: "calculated", label: "With tax", formula: "round(total * 1.2, 2)", precision: 2 },
    { id: "label", type: "calculated", label: "Label", formula: "'Total: ' + total" }
  ]);

  test("computes and chains dependent formulas", () => {
    const out = computeValues(schema, { price: "10", qty: 3 });
    expect(out.total).toBe(30);
    expect(out.withTax).toBe(36);
    expect(out.label).toBe("Total: 30");
  });

  test("does not mutate its input", () => {
    const input = { price: 2, qty: 2 };
    computeValues(schema, input);
    expect(input).toEqual({ price: 2, qty: 2 });
  });

  test("bad formulas and non-finite results become empty string", () => {
    const s = baseSchema([
      { id: "a", type: "number", label: "A" },
      { id: "bad", type: "calculated", label: "Bad", formula: "1 +" },
      { id: "div", type: "calculated", label: "Div", formula: "10 / a" }
    ]);
    const out = computeValues(s, { a: 0 });
    expect(out.bad).toBe("");
    expect(out.div).toBe("");
  });

  test("order independent: a formula may reference a calculated field defined later", () => {
    const s = baseSchema([
      { id: "x", type: "number", label: "X" },
      { id: "double", type: "calculated", label: "D", formula: "half * 4" },
      { id: "half", type: "calculated", label: "H", formula: "x / 2" }
    ]);
    expect(computeValues(s, { x: 10 }).double).toBe(20);
  });

  test("circular formulas terminate", () => {
    const s = baseSchema([
      { id: "a", type: "calculated", label: "A", formula: "b + 1" },
      { id: "b", type: "calculated", label: "B", formula: "a + 1" }
    ]);
    expect(() => computeValues(s, {})).not.toThrow();
  });
});

describe("steps", () => {
  const fields: any[] = [
    { id: "name", type: "text", label: "Name" },
    { id: "pb1", type: "pagebreak", label: "Company" },
    { id: "company", type: "text", label: "Company" },
    { id: "pb2", type: "pagebreak", label: "Extras", visibleIf: "wantExtras == true" },
    { id: "extra", type: "text", label: "Extra" },
    { id: "wantExtras", type: "checkbox", label: "Extras?" }
  ];

  test("splits at page breaks; the first step has no title", () => {
    const steps = getSteps(baseSchema(fields), { wantExtras: true });
    expect(steps.map((s) => s.title)).toEqual(["", "Company", "Extras"]);
    expect(steps.map((s) => s.fields.map((f) => f.id))).toEqual([["name"], ["company"], ["extra", "wantExtras"]]);
  });

  test("a hidden page break merges its step into the previous one", () => {
    const steps = getSteps(baseSchema(fields), { wantExtras: false });
    expect(steps.map((s) => s.title)).toEqual(["", "Company"]);
    expect(steps[1].fields.map((f) => f.id)).toEqual(["company", "extra", "wantExtras"]);
  });

  test("a leading page break titles step one", () => {
    const steps = getSteps(baseSchema([{ id: "p", type: "pagebreak", label: "First" }, { id: "a", type: "text", label: "A" }] as any), {});
    expect(steps).toHaveLength(1);
    expect(steps[0].title).toBe("First");
  });

  test("steps whose fields are all hidden or only sections are dropped; always returns >= 1 step", () => {
    const s = baseSchema([
      { id: "a", type: "text", label: "A", visibleIf: false },
      { id: "p", type: "pagebreak", label: "Next" },
      { id: "sec", type: "section", label: "Just a heading" }
    ] as any);
    const steps = getSteps(s, {});
    expect(steps).toHaveLength(1);
    expect(steps[0].fields).toEqual([]);
  });
});

describe("initial values & submission collection", () => {
  const schema = baseSchema([
    { id: "t", type: "text", label: "T" },
    { id: "n", type: "number", label: "N" },
    { id: "c", type: "checkbox", label: "C" },
    { id: "m", type: "multiselect", label: "M", options: [{ value: "a", label: "A" }] },
    { id: "r", type: "rating", label: "R" },
    { id: "s", type: "slider", label: "S", min: 5, max: 10 },
    { id: "h", type: "hidden", defaultValue: "campaign-1" },
    { id: "sec", type: "section", label: "Heading" },
    { id: "x", type: "text", label: "X", visibleIf: "c == true" },
    { id: "sum", type: "calculated", label: "Sum", formula: "n + 1" }
  ] as any);

  test("defaults are typed per field type", () => {
    const v = getInitialValues(schema);
    expect(v).toMatchObject({ t: "", n: "", c: false, m: [], r: 0, s: 5, h: "campaign-1" });
    expect(v).not.toHaveProperty("sec");
  });

  test("submission is typed, drops hidden-by-logic fields, includes hidden + calculated", () => {
    const out = collectSubmission(schema, { t: "hi", n: "4", c: false, m: "a", r: "3", s: "7", x: "secret" });
    expect(out).toEqual({ t: "hi", n: 4, c: false, m: ["a"], r: 3, s: 7, h: "campaign-1", sum: 5 });
    expect(out).not.toHaveProperty("x");
  });

  test("conditional field is included once its condition holds", () => {
    const out = collectSubmission(schema, { c: true, x: "ok" });
    expect(out.x).toBe("ok");
  });

  test("empty scalars stay '' (legacy shape); non-numeric number text is kept as-is for validation", () => {
    const out = collectSubmission(schema, { n: "abc" });
    expect(out.t).toBe("");
    expect(out.n).toBe("abc");
  });
});
