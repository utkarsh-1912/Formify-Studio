import { applyPatch, invertPatch, parsePatchOps, describeOp } from "../../ai/patch";
import type { PatchOp } from "../../ai/types";

const doc = () => ({
  formTitle: "T",
  fields: [
    { id: "a", type: "text", label: "A" },
    { id: "b", type: "email", label: "B" }
  ]
});

describe("applyPatch", () => {
  test("add / replace / remove", () => {
    const out = applyPatch(doc(), [
      { op: "add", path: "/fields/-", value: { id: "c", type: "text", label: "C" } },
      { op: "replace", path: "/fields/0/label", value: "Name" },
      { op: "remove", path: "/fields/1" }
    ]);
    expect(out.fields.map((f) => f.id)).toEqual(["a", "c"]);
    expect(out.fields[0].label).toBe("Name");
  });

  test("never mutates the input", () => {
    const d = doc();
    const snapshot = JSON.stringify(d);
    applyPatch(d, [{ op: "remove", path: "/fields/0" }]);
    expect(JSON.stringify(d)).toBe(snapshot);
  });

  test("invalid ops throw and leave input untouched", () => {
    const d = doc();
    expect(() => applyPatch(d, [{ op: "remove", path: "/nope" }])).toThrow();
    expect(() => applyPatch(d, [{ op: "replace", path: "/fields/9/label", value: "x" }])).toThrow();
    expect(() => applyPatch(d, [{ op: "add", path: "/fields/9", value: {} }])).toThrow();
    expect(d).toEqual(doc());
  });

  test("blocks prototype pollution paths", () => {
    expect(() => applyPatch(doc(), [{ op: "add", path: "/__proto__/polluted", value: 1 }])).toThrow();
    expect(() => applyPatch(doc(), [{ op: "add", path: "/constructor/prototype/x", value: 1 }])).toThrow();
    expect(({} as any).polluted).toBeUndefined();
  });

  test("handles escaped pointer tokens", () => {
    const out = applyPatch({ "a/b": 1 } as any, [{ op: "replace", path: "/a~1b", value: 2 }]);
    expect(out["a/b"]).toBe(2);
  });

  test("test op guards", () => {
    expect(() => applyPatch(doc(), [{ op: "test", path: "/formTitle", value: "nope" }])).toThrow();
    expect(() => applyPatch(doc(), [{ op: "test", path: "/formTitle", value: "T" }])).not.toThrow();
  });
});

describe("parsePatchOps", () => {
  test("rejects malformed model output", () => {
    expect(() => parsePatchOps({})).toThrow();
    expect(() => parsePatchOps([{ op: "move", path: "/a" }])).toThrow(/unsupported/);
    expect(() => parsePatchOps([{ op: "add", path: "/a" }])).toThrow(/value/);
    expect(parsePatchOps([{ op: "remove", path: "/a", extra: 1 }])).toEqual([{ op: "remove", path: "/a" }]);
  });

  test("describeOp is readable", () => {
    expect(describeOp({ op: "remove", path: "/fields/0" })).toBe("Remove /fields/0");
  });
});

/** Seeded PRNG so failures are reproducible. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function randomOps(r: () => number, d: any): PatchOp[] {
  const ops: PatchOp[] = [];
  let cur = JSON.parse(JSON.stringify(d));
  const n = 1 + Math.floor(r() * 6);
  for (let i = 0; i < n; i++) {
    const len = cur.fields.length;
    const pick = r();
    let op: PatchOp;
    if (pick < 0.35 || len === 0) {
      const idx = Math.floor(r() * (len + 1));
      op = { op: "add", path: r() < 0.5 ? "/fields/-" : `/fields/${idx}`, value: { id: `n${i}${Math.floor(r() * 1e6)}`, type: "text", label: "L" } };
    } else if (pick < 0.65) {
      op = { op: "replace", path: `/fields/${Math.floor(r() * len)}/label`, value: `v${Math.floor(r() * 100)}` };
    } else if (pick < 0.8) {
      op = { op: "replace", path: "/formTitle", value: `title${Math.floor(r() * 100)}` };
    } else if (pick < 0.9) {
      op = { op: "add", path: `/fields/${Math.floor(r() * len)}/required`, value: true };
    } else {
      op = { op: "remove", path: `/fields/${Math.floor(r() * len)}` };
    }
    cur = applyPatch(cur, [op]);
    ops.push(op);
  }
  return ops;
}

describe("property: invertPatch undoes applyPatch", () => {
  test("500 random patches round-trip", () => {
    const r = rng(42);
    for (let i = 0; i < 500; i++) {
      const start = doc();
      const ops = randomOps(r, start);
      const next = applyPatch(start, ops);
      const inv = invertPatch(start, ops);
      expect(applyPatch(next, inv)).toEqual(start);
    }
  });

  test("apply is deterministic and pure", () => {
    const r = rng(7);
    for (let i = 0; i < 100; i++) {
      const start = doc();
      const ops = randomOps(r, start);
      const a = applyPatch(start, ops);
      const b = applyPatch(start, ops);
      expect(a).toEqual(b);
      expect(start).toEqual(doc());
    }
  });
});
