/**
 * Formify engine core — pure, dependency-free form logic.
 *
 * IMPORTANT: this file is ALSO embedded verbatim (as text, types stripped) into generated
 * HTML / React / Web Component exports, so it follows a restricted style:
 *   - only top-level `function`/`const` declarations (optionally prefixed with `export`)
 *   - the only type annotations allowed are `: any` and `: any[]`
 *   - no imports, no TS-only syntax (enums, generics, interfaces, `as` casts other than `as any`)
 *   - no dynamic code evaluation at all: expressions go through the tokenizer + parser below.
 * See runtimeSource.ts for the stripping step.
 */

const FORMIFY_CACHE: any = new Map();
const FORMIFY_MAX_EXPR = 500;
const FORMIFY_FNS = [
  "sum", "min", "max", "avg", "round", "floor", "ceil", "abs", "len",
  "contains", "isEmpty", "number", "text", "concat", "if"
];

function formifyHas(obj: any, key: any) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}

export function formifyIsEmpty(v: any) {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function formifyIsNumeric(v: any) {
  if (typeof v === "number") return isFinite(v);
  return typeof v === "string" && v.trim() !== "" && isFinite(Number(v));
}

export function formifyTruthy(v: any) {
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim() !== "" && v !== "false" && v !== "0";
  return !!v;
}

// ---------------------------------------------------------------- tokenizer

export function formifyTokenize(src: any) {
  if (typeof src !== "string") throw new Error("Expression must be a string");
  if (src.length > FORMIFY_MAX_EXPR) throw new Error("Expression is too long");
  const tokens: any[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const n = Number(src.slice(i, j));
      if (!isFinite(n)) throw new Error("Invalid number '" + src.slice(i, j) + "'");
      tokens.push({ t: "num", v: n });
      i = j;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let out = "";
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\" && j + 1 < src.length) j++;
        out += src[j];
        j++;
      }
      if (j >= src.length) throw new Error("Unterminated string");
      tokens.push({ t: "str", v: out });
      i = j + 1;
      continue;
    }
    if (c === "{") {
      const j = src.indexOf("}", i);
      if (j < 0) throw new Error("Unterminated {field} reference");
      const name = src.slice(i + 1, j).trim();
      if (!name) throw new Error("Empty {field} reference");
      tokens.push({ t: "ref", v: name });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$.]/.test(src[j])) j++;
      tokens.push({ t: "id", v: src.slice(i, j) });
      i = j;
      continue;
    }
    const three = src.slice(i, i + 3);
    const two = src.slice(i, i + 2);
    if (three === "===" || three === "!==") { tokens.push({ t: "op", v: three.slice(0, 2) }); i += 3; continue; }
    if (["==", "!=", "<=", ">=", "&&", "||"].indexOf(two) >= 0) { tokens.push({ t: "op", v: two }); i += 2; continue; }
    if ("+-*/%<>!(),?:".indexOf(c) >= 0) { tokens.push({ t: "op", v: c }); i++; continue; }
    throw new Error("Unexpected character '" + c + "'");
  }
  return tokens;
}

// ------------------------------------------------------------------- parser

export function formifyParse(src: any) {
  const cached = FORMIFY_CACHE.get(src);
  if (cached) return cached;
  const tokens = formifyTokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v: any) => !!tokens[pos] && tokens[pos].t === "op" && tokens[pos].v === v;
  const eat = (v: any) => {
    if (!isOp(v)) throw new Error("Expected '" + v + "'");
    pos++;
  };
  const binary = (next: any, ops: any) => () => {
    let left = next();
    while (peek() && peek().t === "op" && ops.indexOf(peek().v) >= 0) {
      const op = tokens[pos++].v;
      left = { k: "bin", op: op, l: left, r: next() };
    }
    return left;
  };
  let ternary: any = null;
  const primary = () => {
    const tok = tokens[pos++];
    if (!tok) throw new Error("Unexpected end of expression");
    if (tok.t === "num" || tok.t === "str") return { k: "lit", v: tok.v };
    if (tok.t === "ref") return { k: "ref", name: tok.v };
    if (tok.t === "id") {
      if (isOp("(")) {
        if (FORMIFY_FNS.indexOf(tok.v) < 0) throw new Error("Unknown function '" + tok.v + "'");
        pos++;
        const args: any[] = [];
        if (!isOp(")")) {
          args.push(ternary());
          while (isOp(",")) { pos++; args.push(ternary()); }
        }
        eat(")");
        return { k: "call", fn: tok.v, args: args };
      }
      if (tok.v === "true") return { k: "lit", v: true };
      if (tok.v === "false") return { k: "lit", v: false };
      if (tok.v === "null") return { k: "lit", v: null };
      return { k: "ref", name: tok.v };
    }
    if (tok.t === "op" && tok.v === "(") {
      const inner = ternary();
      eat(")");
      return inner;
    }
    throw new Error("Unexpected '" + tok.v + "'");
  };
  const unary = (): any => {
    if (isOp("!") || isOp("-")) {
      const op = tokens[pos++].v;
      return { k: "un", op: op, e: unary() };
    }
    return primary();
  };
  const mul = binary(unary, ["*", "/", "%"]);
  const add = binary(mul, ["+", "-"]);
  const cmp = binary(add, ["<", "<=", ">", ">="]);
  const eq = binary(cmp, ["==", "!=", "==="]);
  const and = binary(eq, ["&&"]);
  const or = binary(and, ["||"]);
  ternary = () => {
    const cond = or();
    if (isOp("?")) {
      pos++;
      const a = ternary();
      eat(":");
      const b = ternary();
      return { k: "tern", c: cond, a: a, b: b };
    }
    return cond;
  };
  const ast = ternary();
  if (pos < tokens.length) throw new Error("Unexpected '" + tokens[pos].v + "'");
  if (FORMIFY_CACHE.size > 500) FORMIFY_CACHE.clear();
  FORMIFY_CACHE.set(src, ast);
  return ast;
}

// ---------------------------------------------------------------- evaluator

function formifyNum(v: any) {
  return formifyIsNumeric(v) ? Number(v) : NaN;
}

function formifyFlat(args: any) {
  const out: any[] = [];
  args.forEach((a: any) => {
    if (Array.isArray(a)) a.forEach((x: any) => out.push(x));
    else out.push(a);
  });
  return out;
}

function formifyNums(args: any) {
  return formifyFlat(args).filter(formifyIsNumeric).map(Number);
}

function formifyEquals(a: any, b: any) {
  if (formifyIsEmpty(a) && formifyIsEmpty(b)) return true;
  if (a === b) return true;
  if (formifyIsNumeric(a) && formifyIsNumeric(b)) return Number(a) === Number(b);
  if (typeof a === "boolean" || typeof b === "boolean") return String(a) === String(b);
  return false;
}

function formifyCompare(a: any, b: any) {
  if (formifyIsNumeric(a) && formifyIsNumeric(b)) return Number(a) - Number(b);
  const x = String(a == null ? "" : a);
  const y = String(b == null ? "" : b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function formifyCall(fn: any, a: any) {
  switch (fn) {
    case "sum": return formifyNums(a).reduce((s: any, n: any) => s + n, 0);
    case "avg": { const n = formifyNums(a); return n.length ? n.reduce((s: any, x: any) => s + x, 0) / n.length : NaN; }
    case "min": { const n = formifyNums(a); return n.length ? Math.min.apply(null, n) : NaN; }
    case "max": { const n = formifyNums(a); return n.length ? Math.max.apply(null, n) : NaN; }
    case "round": {
      const n = formifyNum(a[0]);
      const d = a.length > 1 ? formifyNum(a[1]) : 0;
      const f = Math.pow(10, isFinite(d) ? d : 0);
      return Math.round(n * f) / f;
    }
    case "floor": return Math.floor(formifyNum(a[0]));
    case "ceil": return Math.ceil(formifyNum(a[0]));
    case "abs": return Math.abs(formifyNum(a[0]));
    case "len": return Array.isArray(a[0]) || typeof a[0] === "string" ? a[0].length : 0;
    case "contains":
      if (Array.isArray(a[0])) return a[0].some((x: any) => formifyEquals(x, a[1]));
      return String(a[0] == null ? "" : a[0]).indexOf(String(a[1] == null ? "" : a[1])) >= 0;
    case "isEmpty": return formifyIsEmpty(a[0]);
    case "number": return formifyNum(a[0]);
    case "text": return a[0] == null ? "" : String(a[0]);
    case "concat": return formifyFlat(a).map((x: any) => (x == null ? "" : String(x))).join("");
    case "if": return formifyTruthy(a[0]) ? a[1] : a[2];
    default: throw new Error("Unknown function '" + fn + "'");
  }
}

export function formifyEval(node: any, values: any): any {
  switch (node.k) {
    case "lit": return node.v;
    case "ref": return formifyHas(values, node.name) ? values[node.name] : undefined;
    case "un": {
      const v = formifyEval(node.e, values);
      return node.op === "!" ? !formifyTruthy(v) : -formifyNum(v);
    }
    case "tern": return formifyTruthy(formifyEval(node.c, values)) ? formifyEval(node.a, values) : formifyEval(node.b, values);
    case "call": return formifyCall(node.fn, node.args.map((x: any) => formifyEval(x, values)));
    case "bin": {
      if (node.op === "&&") { const l = formifyEval(node.l, values); return formifyTruthy(l) ? formifyEval(node.r, values) : l; }
      if (node.op === "||") { const l = formifyEval(node.l, values); return formifyTruthy(l) ? l : formifyEval(node.r, values); }
      const a = formifyEval(node.l, values);
      const b = formifyEval(node.r, values);
      switch (node.op) {
        case "+":
          if (formifyIsNumeric(a) && formifyIsNumeric(b)) return Number(a) + Number(b);
          if ((a == null || a === "") && formifyIsNumeric(b)) return Number(b);
          if ((b == null || b === "") && formifyIsNumeric(a)) return Number(a);
          return String(a == null ? "" : a) + String(b == null ? "" : b);
        case "-": return formifyNum(a) - formifyNum(b);
        case "*": return formifyNum(a) * formifyNum(b);
        case "/": return formifyNum(a) / formifyNum(b);
        case "%": return formifyNum(a) % formifyNum(b);
        case "==": case "===": return formifyEquals(a, b);
        case "!=": case "!==": return !formifyEquals(a, b);
        case "<": return formifyCompare(a, b) < 0;
        case "<=": return formifyCompare(a, b) <= 0;
        case ">": return formifyCompare(a, b) > 0;
        case ">=": return formifyCompare(a, b) >= 0;
      }
      throw new Error("Unknown operator '" + node.op + "'");
    }
  }
  throw new Error("Bad expression node");
}

/** Parse + evaluate an expression string against flat field values. Throws on syntax errors. */
export function formifyExpr(src: any, values: any) {
  return formifyEval(formifyParse(src), values || {});
}

// -------------------------------------------------------------------- rules

/**
 * A rule is: boolean | expression string | { field, op, value } | { all: [] } | { any: [] } | { not: rule }.
 * Ops: eq neq gt gte lt lte contains notContains in empty notEmpty.
 * Evaluation errors FAIL OPEN (rule => true for visibility, handled by callers) — never throws.
 */
export function formifyRule(rule: any, values: any): any {
  if (rule === undefined || rule === null) return true;
  if (typeof rule === "boolean") return rule;
  if (typeof rule === "string") {
    if (rule.trim() === "") return true;
    try { return formifyTruthy(formifyExpr(rule, values)); } catch (e) { return true; }
  }
  if (typeof rule !== "object") return true;
  if (Array.isArray(rule.all)) return rule.all.every((r: any) => formifyRule(r, values));
  if (Array.isArray(rule.any)) return rule.any.some((r: any) => formifyRule(r, values));
  if (rule.not !== undefined) return !formifyRule(rule.not, values);
  if (typeof rule.field !== "string") return true;
  const v = formifyHas(values, rule.field) ? values[rule.field] : undefined;
  const t = rule.value;
  switch (rule.op || "eq") {
    case "eq": return Array.isArray(v) ? v.some((x: any) => formifyEquals(x, t)) : formifyEquals(v, t);
    case "neq": return Array.isArray(v) ? !v.some((x: any) => formifyEquals(x, t)) : !formifyEquals(v, t);
    case "gt": return !formifyIsEmpty(v) && formifyCompare(v, t) > 0;
    case "gte": return !formifyIsEmpty(v) && formifyCompare(v, t) >= 0;
    case "lt": return !formifyIsEmpty(v) && formifyCompare(v, t) < 0;
    case "lte": return !formifyIsEmpty(v) && formifyCompare(v, t) <= 0;
    case "contains": return formifyCall("contains", [v, t]);
    case "notContains": return !formifyCall("contains", [v, t]);
    case "in": return Array.isArray(t) && (Array.isArray(v) ? v.some((x: any) => t.some((y: any) => formifyEquals(x, y))) : t.some((y: any) => formifyEquals(v, y)));
    case "empty": return formifyIsEmpty(v);
    case "notEmpty": return !formifyIsEmpty(v);
  }
  return true;
}

/** Returns an error message for a bad expression/rule, or "" if it is well-formed. */
export function formifyCheckRule(rule: any): any {
  if (rule === undefined || rule === null || typeof rule === "boolean") return "";
  if (typeof rule === "string") {
    try { formifyParse(rule); return ""; } catch (e) { return (e as any).message; }
  }
  if (typeof rule !== "object" || Array.isArray(rule)) return "Rule must be a string, boolean or object.";
  const list = Array.isArray(rule.all) ? rule.all : Array.isArray(rule.any) ? rule.any : null;
  if (list) {
    for (let i = 0; i < list.length; i++) { const m = formifyCheckRule(list[i]); if (m) return m; }
    return "";
  }
  if (rule.not !== undefined) return formifyCheckRule(rule.not);
  if (typeof rule.field !== "string" || rule.field === "") return "Rule needs a 'field' string, or one of all / any / not.";
  const ops = ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "notContains", "in", "empty", "notEmpty"];
  if (rule.op !== undefined && ops.indexOf(rule.op) < 0) return "Unknown rule operator '" + rule.op + "'.";
  return "";
}

// ------------------------------------------------------------ field helpers

const FORMIFY_NON_INPUT = ["section", "pagebreak", "calculated", "hidden"];

export function formifyIsInput(field: any) {
  return FORMIFY_NON_INPUT.indexOf(field.type) < 0;
}

export function formifyVisible(field: any, values: any) {
  return formifyRule(field.visibleIf, values);
}

export function formifyRequired(field: any, values: any) {
  if (!formifyIsInput(field)) return false;
  if (field.requiredIf !== undefined && field.requiredIf !== null) return formifyRule(field.requiredIf, values) === true && formifyVisible(field, values);
  return !!field.required;
}

export function formifyDefault(field: any) {
  if (field.defaultValue !== undefined) return field.defaultValue;
  switch (field.type) {
    case "checkbox": return false;
    case "multiselect": return [];
    case "file": return [];
    case "rating": return 0;
    case "slider": {
      const lo = field.min !== undefined ? Number(field.min) : 0;
      return isFinite(lo) ? lo : 0;
    }
    default: return "";
  }
}

export function formifyInitialValues(schema: any) {
  const out: any = {};
  ((schema && schema.fields) || []).forEach((f: any) => {
    if (f && f.id && f.type !== "section" && f.type !== "pagebreak") out[f.id] = formifyDefault(f);
  });
  return formifyCompute(schema, out);
}

/** Fills in calculated fields (formulas may depend on each other; resolved in up to 10 passes). */
export function formifyCompute(schema: any, values: any) {
  const out: any = {};
  Object.keys(values || {}).forEach((k: any) => { out[k] = values[k]; });
  const calcs = ((schema && schema.fields) || []).filter((f: any) => f && f.type === "calculated" && typeof f.formula === "string");
  for (let pass = 0; pass < 10; pass++) {
    let changed = false;
    calcs.forEach((f: any) => {
      let v: any = "";
      try {
        v = formifyExpr(f.formula, out);
        if (typeof v === "number") {
          if (!isFinite(v)) v = "";
          else if (typeof f.precision === "number") v = Math.round(v * Math.pow(10, f.precision)) / Math.pow(10, f.precision);
        }
        if (v === undefined || v === null) v = "";
      } catch (e) { v = ""; }
      if (out[f.id] !== v) { out[f.id] = v; changed = true; }
    });
    if (!changed) break;
  }
  return out;
}

/** Splits fields into steps at visible `pagebreak` fields. Steps with no visible inputs are dropped. */
export function formifySteps(schema: any, values: any) {
  const steps: any[] = [];
  let cur: any = { title: "", description: "", fields: [] };
  ((schema && schema.fields) || []).forEach((f: any) => {
    if (!f || !formifyVisible(f, values)) return;
    if (f.type === "pagebreak") {
      if (cur.fields.length > 0) steps.push(cur);
      cur = { title: f.label || "", description: f.description || "", fields: [] };
      return;
    }
    cur.fields.push(f);
  });
  if (cur.fields.length > 0) steps.push(cur);
  const active = steps.filter((s: any) => s.fields.some((f: any) => f.type !== "section"));
  return active.length > 0 ? active : [{ title: "", description: "", fields: [] }];
}

// --------------------------------------------------------------- validation

const FORMIFY_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function formifyRequiredMessage(field: any) {
  switch (field.type) {
    case "checkbox": return "You must select this checkbox.";
    case "multiselect": return "Select at least one option.";
    case "file": return "Please attach a file.";
    case "rating": return "Please provide a rating.";
    case "radio": case "select": return "Please choose an option.";
    default: return "This field is required.";
  }
}

export function formifyPhoneOk(v: any) {
  const s = String(v);
  if (!/^[+]?[0-9()\-.\s]+$/.test(s)) return false;
  const digits = s.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15;
}

export function formifyDateOk(v: any) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return false;
  const d = new Date(String(v) + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === String(v);
}

export function formifyOptionValues(field: any) {
  return (field.options || []).map((o: any) => o.value);
}

export function formifyHasOption(field: any, v: any) {
  return formifyOptionValues(field).some((o: any) => formifyEquals(o, v));
}

/** Checks that AJV can't express cleanly (date validity, file size/type, option membership). "" when fine. */
export function formifyExtraCheck(field: any, v: any) {
  if (formifyIsEmpty(v)) return "";
  if (field.type === "date") {
    if (!formifyDateOk(v)) return "Enter a valid date.";
    if (field.min !== undefined && String(v) < String(field.min)) return "Date must be on or after " + field.min + ".";
    if (field.max !== undefined && String(v) > String(field.max)) return "Date must be on or before " + field.max + ".";
  }
  if (field.type === "file" && Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const f = v[i] || {};
      if (typeof field.maxSizeKB === "number" && f.size > field.maxSizeKB * 1024) return "File is too large (max " + field.maxSizeKB + " KB).";
      if (typeof field.accept === "string" && field.accept.trim() !== "" && !formifyAccepts(field.accept, f)) return "File type not allowed.";
    }
  }
  return "";
}

export function formifyAccepts(accept: any, file: any) {
  const name = String(file.name || "").toLowerCase();
  const type = String(file.type || "").toLowerCase();
  return accept.split(",").some((raw: any) => {
    const a = raw.trim().toLowerCase();
    if (!a) return false;
    if (a[0] === ".") return name.slice(-a.length) === a;
    if (a.slice(-2) === "/*") return type.indexOf(a.slice(0, -1)) === 0;
    return type === a;
  });
}

/**
 * Dependency-free validator used by exports (the app itself validates through AJV in engine/validate.ts,
 * and tests assert both agree). Returns { fieldId: message } for visible input fields only.
 * `onlyIds` (optional array) restricts which fields are checked (used per-step).
 */
export function formifyValidate(schema: any, rawValues: any, onlyIds: any) {
  const values = formifyCompute(schema, rawValues || {});
  const errors: any = {};
  ((schema && schema.fields) || []).forEach((field: any) => {
    if (!field || !field.id || !formifyIsInput(field)) return;
    if (onlyIds && onlyIds.indexOf(field.id) < 0) return;
    if (!formifyVisible(field, values)) return;
    const v = values[field.id];
    const v2 = field.validation || {};
    const fail = (m: any) => { if (!errors[field.id]) errors[field.id] = m; };
    const empty = field.type === "checkbox" ? v !== true && v !== "true" : field.type === "rating" ? !(Number(v) > 0) : formifyIsEmpty(v);
    if (formifyRequired(field, values) && empty) { fail(formifyRequiredMessage(field)); return; }
    if (formifyIsEmpty(v) || (field.type === "checkbox") || (field.type === "rating" && !(Number(v) > 0))) return;

    switch (field.type) {
      case "email": if (!FORMIFY_EMAIL.test(String(v))) fail(v2.message || "Enter a valid email address."); break;
      case "phone": if (!formifyPhoneOk(v)) fail(v2.message || "Enter a valid phone number."); break;
      case "number": case "slider": case "rating": {
        if (!formifyIsNumeric(v)) { fail("Enter a valid number."); break; }
        const n = Number(v);
        const max = field.type === "rating" && field.max === undefined ? 5 : field.max;
        if (field.min !== undefined && n < Number(field.min)) fail("Must be at least " + field.min + ".");
        else if (max !== undefined && n > Number(max)) fail("Must be at most " + max + ".");
        else if (field.type === "rating" && n % 1 !== 0) fail("Enter a valid number.");
        break;
      }
      case "select": case "radio": if (!formifyHasOption(field, v)) fail("Select a valid option."); break;
      case "multiselect": {
        const arr = Array.isArray(v) ? v : [v];
        if (!arr.every((x: any) => formifyHasOption(field, x))) fail("Select a valid option.");
        else if (field.min !== undefined && arr.length < Number(field.min)) fail("Select at least " + field.min + ".");
        else if (field.max !== undefined && arr.length > Number(field.max)) fail("Select at most " + field.max + ".");
        break;
      }
      case "file": {
        const files = Array.isArray(v) ? v : [];
        if (field.min !== undefined && files.length < Number(field.min)) fail("Attach at least " + field.min + " file(s).");
        else if (field.max !== undefined && files.length > Number(field.max)) fail("Attach at most " + field.max + " file(s).");
        break;
      }
      case "text": case "textarea": default: {
        const s = String(v);
        if (typeof v2.minLength === "number" && s.length < v2.minLength) fail("Must be at least " + v2.minLength + " characters.");
        else if (typeof v2.maxLength === "number" && s.length > v2.maxLength) fail("Must be at most " + v2.maxLength + " characters.");
      }
    }
    if (!errors[field.id] && typeof v2.pattern === "string" && v2.pattern && typeof v !== "object") {
      try { if (!new RegExp(v2.pattern).test(String(v))) fail(v2.message || "Invalid format."); } catch (e) { /* bad regex is reported by schema validation */ }
    }
    if (!errors[field.id]) { const m = formifyExtraCheck(field, v); if (m) fail(m); }
  });
  return errors;
}

/** Final submission payload: visible input fields + hidden + calculated, typed. Empty scalars are "". */
export function formifyCollect(schema: any, rawValues: any) {
  const values = formifyCompute(schema, rawValues || {});
  const out: any = {};
  ((schema && schema.fields) || []).forEach((f: any) => {
    if (!f || !f.id || f.type === "section" || f.type === "pagebreak") return;
    if (!formifyVisible(f, values)) return;
    let v = values[f.id];
    if (v === undefined || v === null) v = formifyDefault(f);
    if ((f.type === "number" || f.type === "slider") && formifyIsNumeric(v)) v = Number(v);
    if (f.type === "rating") v = formifyIsNumeric(v) ? Number(v) : 0;
    if (f.type === "checkbox") v = v === true || v === "true";
    if ((f.type === "multiselect" || f.type === "file") && !Array.isArray(v)) v = formifyIsEmpty(v) ? [] : [v];
    out[f.id] = v;
  });
  return out;
}
