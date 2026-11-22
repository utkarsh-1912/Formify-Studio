import { migrateWorkflow, validateWorkflow } from "../schema";
import { cronMatches, isValidCron, matchTriggers, nextCronRun } from "../triggers";
import { FLOW_SCHEMA_VERSION } from "../types";
import { edge, node, wf } from "./helpers";

const base = () =>
  wf(
    [node("t", "trigger", { type: "submission" }), node("c", "condition", { expression: "1 == 1" }), node("a", "transform", { values: {} }), node("b", "transform", { values: {} })],
    [edge("t", "c"), edge("c", "a", "true"), edge("c", "b", "false")]
  );

const messages = (w: unknown) => validateWorkflow(w).map((i) => i.message);

describe("validateWorkflow", () => {
  test("accepts a valid workflow", () => {
    expect(validateWorkflow(base())).toEqual([]);
  });

  test("structural errors come from the JSON schema", () => {
    expect(validateWorkflow({}).length).toBeGreaterThan(0);
    expect(validateWorkflow({ ...base(), nodes: [{ id: "x", type: "bogus", config: {} }] }).length).toBeGreaterThan(0);
    expect(validateWorkflow({ ...base(), schemaVersion: 0 }).length).toBeGreaterThan(0);
  });

  test("detects cycles", () => {
    const w = base();
    w.edges.push(edge("a", "c"));
    expect(messages(w)).toContain("Workflow contains a cycle");
  });

  test("detects duplicate ids and dangling edges", () => {
    const w = base();
    w.nodes.push(node("a", "transform", { values: {} }));
    expect(messages(w).join()).toMatch(/Duplicate node id 'a'/);
    const w2 = base();
    w2.edges.push(edge("a", "ghost"));
    expect(messages(w2).join()).toMatch(/unknown target 'ghost'/);
  });

  test("requires a trigger, and orphan nodes are flagged", () => {
    expect(messages(wf([node("a", "transform", { values: {} })], []))).toEqual(
      expect.arrayContaining(["Workflow needs at least one trigger node"])
    );
    const w = base();
    w.nodes.push(node("orphan", "transform", { values: {} }));
    expect(messages(w).join()).toMatch(/no incoming edge/);
  });

  test("branch labels must suit the source node", () => {
    const w = base();
    w.edges[1] = edge("c", "a", "approved");
    expect(messages(w).join()).toMatch(/invalid branch 'approved' for condition/);
    const w2 = base();
    w2.edges[1] = edge("c", "a"); // condition edge without branch
    expect(messages(w2).join()).toMatch(/needs a branch/);
  });

  test("'error' edges require onError=continue", () => {
    const w = wf([node("t", "trigger", { type: "manual" }), node("x", "transform", { values: {} }), node("y", "transform", { values: {} })], [edge("t", "x"), edge("x", "y", "error")]);
    expect(messages(w).join()).toMatch(/onError is not 'continue'/);
    w.nodes[1].onError = "continue";
    expect(validateWorkflow(w)).toEqual([]);
  });

  test("expression syntax is checked up front", () => {
    const w = base();
    w.nodes[1].config.expression = "1 +";
    expect(messages(w).join()).toMatch(/Condition expression/);
    const w2 = base();
    w2.nodes[2].config.values = { a: "{{ eval('x') }}" };
    expect(messages(w2).join()).toMatch(/Unknown function/);
  });

  test("per-type config rules", () => {
    const mk = (n: any) => wf([node("t", "trigger", { type: "manual" }), n], [edge("t", n.id)]);
    expect(messages(mk(node("h", "http", {})))[0]).toMatch(/needs a url/);
    expect(messages(mk(node("h", "http", { url: "https://a.b", method: "TRACE" })))[0]).toMatch(/method/);
    expect(messages(mk(node("e", "email", { to: "x" })))[0]).toMatch(/Email needs/);
    expect(messages(mk(node("a", "ai", {})))[0]).toMatch(/needs a prompt/);
    expect(messages(mk(node("d", "delay", {})))[0]).toMatch(/needs 'ms'/);
    expect(messages(mk(node("w", "write", {})))[0]).toMatch(/needs a target/);
    expect(messages(mk(node("x", "transform", {})))[0]).toMatch(/Transform needs/);
  });

  test("schedule triggers need a valid cron", () => {
    expect(messages(wf([node("t", "trigger", { type: "schedule", cron: "nope" })], []))[0]).toMatch(/cron/);
    expect(validateWorkflow(wf([node("t", "trigger", { type: "schedule", cron: "*/5 * * * *" })], []))).toEqual([]);
  });

  test("trigger nodes cannot have incoming edges", () => {
    const w = wf([node("t", "trigger", { type: "manual" }), node("t2", "trigger", { type: "manual" })], [edge("t", "t2")]);
    expect(messages(w).join()).toMatch(/cannot have incoming/);
  });

  describe("loop structure", () => {
    const loop = (extraNodes: any[], extraEdges: any[]) =>
      wf(
        [node("t", "trigger", { type: "manual" }), node("l", "loop", { items: "trigger.xs" }), node("b", "transform", { values: {} }), ...extraNodes],
        [edge("t", "l"), edge("l", "b", "each"), ...extraEdges]
      );

    test("valid loop", () => {
      expect(validateWorkflow(loop([node("after", "transform", { values: {} })], [edge("l", "after", "done")]))).toEqual([]);
    });

    test("loop needs an each edge", () => {
      const w = wf([node("t", "trigger", { type: "manual" }), node("l", "loop", { items: "x" })], [edge("t", "l")]);
      expect(messages(w).join()).toMatch(/needs an 'each' edge/);
    });

    test("approval inside a loop body is rejected", () => {
      const w = loop([node("ap", "approval", {})], [edge("b", "ap")]);
      expect(messages(w).join()).toMatch(/Approval nodes are not allowed inside a loop/);
    });

    test("edges may not leave the loop body or enter it from outside", () => {
      const leave = loop([node("after", "transform", { values: {} })], [edge("l", "after", "done"), edge("b", "after")]);
      expect(messages(leave).join()).toMatch(/leaving the loop body|edge leaving/);
      const enter = loop([node("o", "transform", { values: {} })], [edge("t", "o"), edge("o", "b")]);
      expect(messages(enter).join()).toMatch(/incoming edge from outside the loop/);
    });
  });
});

describe("migrateWorkflow", () => {
  test("stamps current version and rejects future versions", () => {
    expect(migrateWorkflow({ ...base(), schemaVersion: undefined }).schemaVersion).toBe(FLOW_SCHEMA_VERSION);
    expect(() => migrateWorkflow({ ...base(), schemaVersion: 99 })).toThrow(/newer/);
  });
});

describe("triggers", () => {
  test("matchTriggers honours field and path filters", () => {
    const w = wf(
      [
        node("s", "trigger", { type: "submission" }),
        node("f", "trigger", { type: "field_changed", field: "email" }),
        node("h", "trigger", { type: "webhook", path: "/hook" })
      ],
      []
    );
    expect(matchTriggers(w, { type: "submission", payload: {} })).toEqual(["s"]);
    expect(matchTriggers(w, { type: "field_changed", payload: { field: "email" } })).toEqual(["f"]);
    expect(matchTriggers(w, { type: "field_changed", payload: { field: "x" } })).toEqual([]);
    expect(matchTriggers(w, { type: "webhook", payload: { path: "/hook" } })).toEqual(["h"]);
    expect(matchTriggers(w, { type: "webhook", payload: { path: "/other" } })).toEqual([]);
  });

  test("cron parsing and matching (UTC)", () => {
    expect(isValidCron("*/15 * * * *")).toBe(true);
    expect(isValidCron("0 9 * * 1-5")).toBe(true);
    expect(isValidCron("61 * * * *")).toBe(false);
    expect(isValidCron("* * * *")).toBe(false);
    expect(isValidCron("*/0 * * * *")).toBe(false);
    const monday9 = new Date(Date.UTC(2026, 0, 5, 9, 0)); // Mon 5 Jan 2026
    expect(cronMatches("0 9 * * 1-5", monday9)).toBe(true);
    expect(cronMatches("0 9 * * 0,6", monday9)).toBe(false);
    expect(cronMatches("30 9 * * *", monday9)).toBe(false);
  });

  test("nextCronRun finds the next slot", () => {
    const from = Date.UTC(2026, 0, 5, 9, 0);
    expect(nextCronRun("*/15 * * * *", from)).toBe(Date.UTC(2026, 0, 5, 9, 15));
    expect(nextCronRun("0 9 * * *", from)).toBe(Date.UTC(2026, 0, 6, 9, 0));
    expect(nextCronRun("0 0 31 2 *", from)).toBeNull();
  });
});
