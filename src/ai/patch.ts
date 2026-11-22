import type { PatchOp } from "./types";

/** Pure JSON Patch (RFC 6902 subset: add / replace / remove / test). Inputs are never mutated. */

const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

const unescapeToken = (t: string) => t.replace(/~1/g, "/").replace(/~0/g, "~");
export const escapeToken = (t: string) => t.replace(/~/g, "~0").replace(/\//g, "~1");

export function parsePointer(path: string): string[] {
  if (path === "") return [];
  if (!path.startsWith("/")) throw new Error(`Invalid JSON pointer '${path}'.`);
  return path.slice(1).split("/").map(unescapeToken);
}

const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);

const isIndex = (t: string) => /^(0|[1-9]\d*)$/.test(t);

function resolveParent(doc: any, tokens: string[]): { parent: any; key: string } {
  let cur = doc;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i];
    if (FORBIDDEN.has(t)) throw new Error(`Forbidden path segment '${t}'.`);
    if (cur === null || typeof cur !== "object" || !(t in cur)) {
      throw new Error(`Path segment '${t}' does not exist.`);
    }
    cur = cur[t];
  }
  const key = tokens[tokens.length - 1];
  if (FORBIDDEN.has(key)) throw new Error(`Forbidden path segment '${key}'.`);
  if (cur === null || typeof cur !== "object") throw new Error("Patch target parent is not a container.");
  return { parent: cur, key };
}

const deepEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function applyOne(doc: any, op: PatchOp): any {
  const tokens = parsePointer(op.path);
  if (tokens.length === 0) {
    if (op.op === "add" || op.op === "replace") return clone(op.value);
    if (op.op === "test") {
      if (!deepEqual(doc, op.value)) throw new Error("test failed at root.");
      return doc;
    }
    throw new Error("Cannot remove the document root.");
  }
  const { parent, key } = resolveParent(doc, tokens);
  const isArr = Array.isArray(parent);

  switch (op.op) {
    case "add": {
      if (isArr) {
        const idx = key === "-" ? parent.length : Number(key);
        if (!isIndex(key) && key !== "-") throw new Error(`Bad array index '${key}'.`);
        if (idx > parent.length) throw new Error(`Array index ${idx} out of range.`);
        parent.splice(idx, 0, clone(op.value));
      } else {
        parent[key] = clone(op.value);
      }
      return doc;
    }
    case "replace": {
      if (isArr) {
        if (!isIndex(key) || Number(key) >= parent.length) throw new Error(`Bad array index '${key}'.`);
      } else if (!(key in parent)) {
        throw new Error(`Cannot replace missing key '${key}'.`);
      }
      parent[key] = clone(op.value);
      return doc;
    }
    case "remove": {
      if (isArr) {
        if (!isIndex(key) || Number(key) >= parent.length) throw new Error(`Bad array index '${key}'.`);
        parent.splice(Number(key), 1);
      } else {
        if (!(key in parent)) throw new Error(`Cannot remove missing key '${key}'.`);
        delete parent[key];
      }
      return doc;
    }
    case "test": {
      if (!deepEqual(parent[key], op.value)) throw new Error(`test failed at '${op.path}'.`);
      return doc;
    }
    default:
      throw new Error(`Unsupported op '${(op as any).op}'.`);
  }
}

/** Apply ops to a deep copy of `doc`. Throws (leaving `doc` untouched) if any op is invalid. */
export function applyPatch<T = any>(doc: T, ops: PatchOp[]): T {
  let out: any = clone(doc);
  for (const op of ops) out = applyOne(out, op);
  return out;
}

const getAt = (doc: any, tokens: string[]) => tokens.reduce((c, t) => (c == null ? undefined : c[t]), doc);

/**
 * Compute the ops that undo `ops` when applied to the *result* of applying `ops` to `doc`.
 * `test` ops are dropped (they do not change the document).
 */
export function invertPatch(doc: any, ops: PatchOp[]): PatchOp[] {
  const inverse: PatchOp[] = [];
  let cur = clone(doc);
  for (const op of ops) {
    if (op.op === "test") {
      cur = applyOne(cur, op);
      continue;
    }
    const tokens = parsePointer(op.path);
    if (tokens.length === 0) {
      inverse.unshift({ op: "replace", path: "", value: clone(cur) });
      cur = applyOne(cur, op);
      continue;
    }
    const before = getAt(cur, tokens);
    const { parent, key } = resolveParent(cur, tokens);
    if (op.op === "add") {
      if (Array.isArray(parent)) {
        const idx = key === "-" ? parent.length : Number(key);
        inverse.unshift({ op: "remove", path: `${tokens.slice(0, -1).map((t) => "/" + escapeToken(t)).join("")}/${idx}` });
      } else if (key in parent) {
        inverse.unshift({ op: "replace", path: op.path, value: clone(before) });
      } else {
        inverse.unshift({ op: "remove", path: op.path });
      }
    } else if (op.op === "replace") {
      inverse.unshift({ op: "replace", path: op.path, value: clone(before) });
    } else if (op.op === "remove") {
      inverse.unshift({ op: "add", path: op.path, value: clone(before) });
    }
    cur = applyOne(cur, op);
  }
  return inverse;
}

/** Shallow runtime check that untrusted model output looks like a patch array. */
export function parsePatchOps(raw: unknown): PatchOp[] {
  if (!Array.isArray(raw)) throw new Error("Patch must be an array of operations.");
  return raw.map((o, i) => {
    if (!o || typeof o !== "object") throw new Error(`Op ${i} is not an object.`);
    const { op, path } = o as any;
    if (typeof path !== "string") throw new Error(`Op ${i} is missing a string 'path'.`);
    if (op === "remove") return { op, path };
    if (op === "add" || op === "replace" || op === "test") {
      if (!("value" in o)) throw new Error(`Op ${i} ('${op}') is missing 'value'.`);
      return { op, path, value: (o as any).value };
    }
    throw new Error(`Op ${i} has unsupported 'op' '${String(op)}'.`);
  });
}

/** Human-readable one-liner per op, for the review UI. */
export function describeOp(op: PatchOp): string {
  const preview = (v: unknown) => {
    const s = JSON.stringify(v);
    return s.length > 80 ? s.slice(0, 77) + "..." : s;
  };
  switch (op.op) {
    case "add":
      return `Add ${op.path} = ${preview(op.value)}`;
    case "replace":
      return `Change ${op.path} → ${preview(op.value)}`;
    case "remove":
      return `Remove ${op.path}`;
    case "test":
      return `Check ${op.path} = ${preview(op.value)}`;
  }
}

export const PATCH_JSON_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    required: ["op", "path"],
    properties: {
      op: { enum: ["add", "replace", "remove"] },
      path: { type: "string" },
      value: {}
    }
  }
} as const;
