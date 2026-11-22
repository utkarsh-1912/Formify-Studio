import * as Y from "yjs";

/**
 * JSON <-> Yjs bridge.
 *
 * - plain objects become Y.Map (so edits to different keys merge instead of overwriting)
 * - arrays whose items are all objects with a unique string `id` become Y.Array<Y.Map>
 *   (so concurrent edits to different fields of a form merge)
 * - everything else is stored as an atomic value (last writer wins for that leaf)
 */

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const isPlainObject = (v: unknown): v is Record<string, any> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const isIdArray = (v: unknown): v is Array<Record<string, any>> => {
  if (!Array.isArray(v) || v.length === 0) return false;
  const seen = new Set<string>();
  for (const item of v) {
    if (!isPlainObject(item) || typeof item.id !== "string" || seen.has(item.id)) return false;
    seen.add(item.id);
  }
  return true;
};

const isDeepEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const buildValue = (value: any): any => {
  if (isPlainObject(value)) {
    const m = new Y.Map<any>();
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) m.set(k, buildValue(v));
    }
    return m;
  }
  if (isIdArray(value)) {
    const arr = new Y.Array<any>();
    arr.push(value.map((item) => buildValue(item)));
    return arr;
  }
  return value;
};

const toJson = (value: any): Json => {
  if (value instanceof Y.Map) {
    const out: Record<string, Json> = {};
    value.forEach((v, k) => {
      out[k] = toJson(v);
    });
    return out;
  }
  if (value instanceof Y.Array) {
    return value.toArray().map(toJson);
  }
  return value as Json;
};

export const yToJson = (value: Y.Map<any> | Y.Array<any>): any => toJson(value);

const reconcileIdArray = (yarr: Y.Array<any>, next: Array<Record<string, any>>) => {
  const currentIds = yarr.toArray().map((m: Y.Map<any>) => m.get("id"));
  const nextIds = next.map((i) => i.id);

  // Delete items no longer present (back to front so indexes stay valid).
  for (let i = currentIds.length - 1; i >= 0; i--) {
    if (!nextIds.includes(currentIds[i])) {
      yarr.delete(i, 1);
      currentIds.splice(i, 1);
    }
  }

  // If the surviving items are in a different relative order, move by rebuilding that item.
  const survivingOrder = nextIds.filter((id) => currentIds.includes(id));
  for (let i = 0; i < survivingOrder.length; i++) {
    if (currentIds[i] !== survivingOrder[i]) {
      const from = currentIds.indexOf(survivingOrder[i]);
      const snapshot = toJson(yarr.get(from));
      yarr.delete(from, 1);
      currentIds.splice(from, 1);
      yarr.insert(i, [buildValue(snapshot)]);
      currentIds.splice(i, 0, survivingOrder[i]);
    }
  }

  // Update existing items in place, insert new ones at the right position.
  next.forEach((item, index) => {
    const at = currentIds.indexOf(item.id);
    if (at === -1) {
      yarr.insert(index, [buildValue(item)]);
      currentIds.splice(index, 0, item.id);
    } else {
      syncJsonIntoMap(yarr.get(at), item);
    }
  });
};

/** Make `map` structurally equal to `obj`, touching only what actually differs. */
export function syncJsonIntoMap(map: Y.Map<any>, obj: Record<string, any>): void {
  const run = () => {
    for (const key of Array.from(map.keys())) {
      if (!(key in obj) || obj[key] === undefined) map.delete(key);
    }
    for (const [key, next] of Object.entries(obj)) {
      if (next === undefined) continue;
      const cur = map.get(key);
      if (isPlainObject(next)) {
        if (cur instanceof Y.Map) syncJsonIntoMap(cur, next);
        else map.set(key, buildValue(next));
      } else if (isIdArray(next)) {
        if (cur instanceof Y.Array) reconcileIdArray(cur, next);
        else map.set(key, buildValue(next));
      } else {
        const curJson = cur instanceof Y.AbstractType ? toJson(cur) : cur;
        if (!isDeepEqual(curJson, next) || cur instanceof Y.AbstractType) map.set(key, next);
      }
    }
  };
  // Callers wrap this in doc.transact(fn, origin) so the origin identifies local edits.
  run();
}
