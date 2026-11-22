import {
  evalExpression,
  ExpressionError,
  extractTemplateExpressions,
  parseExpression,
  renderTemplate,
  resolveDeep
} from "../expression";

const scope = {
  trigger: { name: "Ada", age: "36", tags: ["a", "b"], nested: { deep: 5 } },
  nodes: { x: { n: 2 } },
  list: [10, 20, 30]
};

describe("expression engine", () => {
  test("literals, arithmetic and precedence", () => {
    expect(evalExpression("1 + 2 * 3", {})).toBe(7);
    expect(evalExpression("(1 + 2) * 3", {})).toBe(9);
    expect(evalExpression("10 % 4", {})).toBe(2);
    expect(evalExpression("-3 + 5", {})).toBe(2);
    expect(evalExpression("'a' + 'b'", {})).toBe("ab");
    expect(evalExpression('"x" + 1', {})).toBe("x1");
  });

  test("member and index access", () => {
    expect(evalExpression("trigger.name", scope)).toBe("Ada");
    expect(evalExpression("trigger.nested.deep", scope)).toBe(5);
    expect(evalExpression("list[1]", scope)).toBe(20);
    expect(evalExpression("trigger.tags[0]", scope)).toBe("a");
    expect(evalExpression("trigger.missing.deeper", scope)).toBeUndefined();
    expect(evalExpression("trigger.tags.length", scope)).toBe(2);
  });

  test("comparison, logic and ternary", () => {
    expect(evalExpression("number(trigger.age) > 18", scope)).toBe(true);
    expect(evalExpression("trigger.age == 36", scope)).toBe(true);
    expect(evalExpression("trigger.age === 36", scope)).toBe(false);
    expect(evalExpression("1 < 2 && 2 < 3", {})).toBe(true);
    expect(evalExpression("false || 'fallback'", {})).toBe("fallback");
    expect(evalExpression("!false", {})).toBe(true);
    expect(evalExpression("1 > 2 ? 'a' : 'b'", {})).toBe("b");
  });

  test("whitelisted functions", () => {
    expect(evalExpression("upper(trigger.name)", scope)).toBe("ADA");
    expect(evalExpression("contains(trigger.tags, 'b')", scope)).toBe(true);
    expect(evalExpression("contains('hello', 'ell')", {})).toBe(true);
    expect(evalExpression("join(trigger.tags, '-')", scope)).toBe("a-b");
    expect(evalExpression("max(1, 5, 3)", {})).toBe(5);
    expect(evalExpression("coalesce(missing, '', 'x')", {})).toBe("x");
    expect(evalExpression("isEmpty('')", {})).toBe(true);
    expect(evalExpression("length(list)", scope)).toBe(3);
    expect(evalExpression("now()", {}, { now: () => 42 })).toBe(42);
  });

  test("short-circuits", () => {
    expect(evalExpression("false && missing.x.y", {})).toBe(false);
    expect(evalExpression("true || missing.x.y", {})).toBe(true);
  });

  test("unknown functions are rejected at parse time", () => {
    expect(() => parseExpression("eval('1')")).toThrow(/Unknown function/);
    expect(() => parseExpression("trigger.name.toString()")).toThrow(ExpressionError);
  });

  test("blocks prototype access", () => {
    expect(() => evalExpression("trigger.constructor", scope)).toThrow(/not allowed/);
    expect(() => evalExpression("trigger.__proto__", scope)).toThrow(/not allowed/);
    expect(() => evalExpression("trigger['constructor']", scope)).toThrow(/not allowed/);
    expect(() => evalExpression("constructor", scope)).toThrow(/not allowed/);
    expect(evalExpression("toString", {})).toBeUndefined();
    expect(evalExpression("trigger.hasOwnProperty", scope)).toBeUndefined();
  });

  test("cannot reach globals", () => {
    expect(evalExpression("process", {})).toBeUndefined();
    expect(evalExpression("globalThis", {})).toBeUndefined();
    expect(evalExpression("window", {})).toBeUndefined();
  });

  test("syntax errors", () => {
    expect(() => parseExpression("1 +")).toThrow(ExpressionError);
    expect(() => parseExpression("(1")).toThrow(ExpressionError);
    expect(() => parseExpression("'unterminated")).toThrow(/Unterminated/);
    expect(() => parseExpression("a @ b")).toThrow(/Unexpected character/);
    expect(() => parseExpression("1 2")).toThrow(ExpressionError);
  });

  test("limits", () => {
    expect(() => parseExpression("1+".repeat(1500) + "1")).toThrow(/longer than/);
    expect(() => parseExpression("(".repeat(100) + "1" + ")".repeat(100))).toThrow(/nested/);
  });
});

describe("templates", () => {
  test("single expression keeps its type", () => {
    expect(renderTemplate("{{ trigger.nested }}", scope)).toEqual({ deep: 5 });
    expect(renderTemplate("{{ 1 + 1 }}", {})).toBe(2);
  });

  test("interpolation stringifies", () => {
    expect(renderTemplate("Hi {{ trigger.name }}, tags: {{ trigger.tags }}", scope)).toBe('Hi Ada, tags: ["a","b"]');
    expect(renderTemplate("x{{ missing }}y", {})).toBe("xy");
  });

  test("resolveDeep walks objects and arrays and drops forbidden keys", () => {
    const out = resolveDeep({ a: ["{{ trigger.name }}", 1], b: { c: "{{ list[0] }}" } }, scope);
    expect(out).toEqual({ a: ["Ada", 1], b: { c: 10 } });
    const evil = JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}');
    const res = resolveDeep(evil, {});
    expect(res.ok).toBe(1);
    expect(({} as any).polluted).toBeUndefined();
  });

  test("extractTemplateExpressions", () => {
    expect(extractTemplateExpressions("a {{ x }} b {{ y.z }}")).toEqual(["x", "y.z"]);
  });
});
