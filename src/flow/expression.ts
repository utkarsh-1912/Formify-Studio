/**
 * Safe expression engine for workflow nodes.
 *
 * Hand-written tokenizer + Pratt parser + tree-walking evaluator. It never uses
 * eval / new Function, only reads OWN properties of the scope, blocks prototype
 * keys, only calls whitelisted functions, and enforces size/step limits.
 */

export class ExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpressionError";
  }
}

const MAX_SOURCE = 2000;
const MAX_DEPTH = 50;
const MAX_STEPS = 10000;
const FORBIDDEN_KEYS = ["__proto__", "constructor", "prototype"];

type Tok =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "id"; v: string }
  | { k: "op"; v: string }
  | { k: "end" };

export type Ast =
  | { t: "lit"; v: unknown }
  | { t: "id"; name: string }
  | { t: "member"; obj: Ast; key: string }
  | { t: "index"; obj: Ast; key: Ast }
  | { t: "call"; name: string; args: Ast[] }
  | { t: "unary"; op: string; arg: Ast }
  | { t: "bin"; op: string; l: Ast; r: Ast }
  | { t: "cond"; test: Ast; a: Ast; b: Ast }
  | { t: "arr"; items: Ast[] };

const OPERATORS = [
  "===", "!==", "==", "!=", "<=", ">=", "&&", "||",
  "<", ">", "+", "-", "*", "/", "%", "!", "?", ":", "(", ")", "[", "]", ",", "."
];

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const n = Number(src.slice(i, j));
      if (!isFinite(n)) throw new ExpressionError(`Invalid number '${src.slice(i, j)}'`);
      toks.push({ k: "num", v: n });
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let out = "";
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\" && j + 1 < src.length) {
          const nx = src[j + 1];
          out += nx === "n" ? "\n" : nx === "t" ? "\t" : nx;
          j += 2;
        } else {
          out += src[j++];
        }
      }
      if (j >= src.length) throw new ExpressionError("Unterminated string");
      toks.push({ k: "str", v: out });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
      toks.push({ k: "id", v: src.slice(i, j) });
      i = j;
      continue;
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (!op) throw new ExpressionError(`Unexpected character '${c}'`);
    toks.push({ k: "op", v: op });
    i += op.length;
  }
  toks.push({ k: "end" });
  return toks;
}

const BINARY_PREC: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3, "!=": 3, "===": 3, "!==": 3,
  "<": 4, "<=": 4, ">": 4, ">=": 4,
  "+": 5, "-": 5,
  "*": 6, "/": 6, "%": 6
};

class Parser {
  private pos = 0;
  private depth = 0;
  constructor(private toks: Tok[]) {}

  private peek(): Tok {
    return this.toks[this.pos];
  }
  private next(): Tok {
    return this.toks[this.pos++];
  }
  private isOp(v: string): boolean {
    const t = this.peek();
    return t.k === "op" && t.v === v;
  }
  private expectOp(v: string) {
    if (!this.isOp(v)) throw new ExpressionError(`Expected '${v}'`);
    this.pos++;
  }

  parse(): Ast {
    const ast = this.ternary();
    if (this.peek().k !== "end") throw new ExpressionError("Unexpected token after expression");
    return ast;
  }

  private enter() {
    if (++this.depth > MAX_DEPTH) throw new ExpressionError("Expression too deeply nested");
  }
  private leave() {
    this.depth--;
  }

  private ternary(): Ast {
    this.enter();
    const test = this.binary(1);
    let res = test;
    if (this.isOp("?")) {
      this.pos++;
      const a = this.ternary();
      this.expectOp(":");
      const b = this.ternary();
      res = { t: "cond", test, a, b };
    }
    this.leave();
    return res;
  }

  private binary(minPrec: number): Ast {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      if (t.k !== "op") break;
      const prec = BINARY_PREC[t.v];
      if (prec === undefined || prec < minPrec) break;
      this.pos++;
      const right = this.binary(prec + 1);
      left = { t: "bin", op: t.v, l: left, r: right };
    }
    return left;
  }

  private unary(): Ast {
    if (this.isOp("!") || this.isOp("-")) {
      const op = (this.next() as { v: string }).v;
      this.enter();
      const arg = this.unary();
      this.leave();
      return { t: "unary", op, arg };
    }
    return this.postfix();
  }

  private postfix(): Ast {
    let node = this.primary();
    for (;;) {
      if (this.isOp(".")) {
        this.pos++;
        const t = this.next();
        if (t.k !== "id") throw new ExpressionError("Expected property name after '.'");
        node = { t: "member", obj: node, key: t.v };
      } else if (this.isOp("[")) {
        this.pos++;
        const key = this.ternary();
        this.expectOp("]");
        node = { t: "index", obj: node, key };
      } else break;
    }
    return node;
  }

  private primary(): Ast {
    const t = this.next();
    if (t.k === "num") return { t: "lit", v: t.v };
    if (t.k === "str") return { t: "lit", v: t.v };
    if (t.k === "id") {
      if (t.v === "true") return { t: "lit", v: true };
      if (t.v === "false") return { t: "lit", v: false };
      if (t.v === "null") return { t: "lit", v: null };
      if (this.isOp("(")) {
        this.pos++;
        const args: Ast[] = [];
        if (!this.isOp(")")) {
          for (;;) {
            args.push(this.ternary());
            if (this.isOp(",")) this.pos++;
            else break;
          }
        }
        this.expectOp(")");
        if (!Object.prototype.hasOwnProperty.call(FUNCTIONS, t.v)) {
          throw new ExpressionError(`Unknown function '${t.v}'`);
        }
        return { t: "call", name: t.v, args };
      }
      return { t: "id", name: t.v };
    }
    if (t.k === "op" && t.v === "(") {
      const e = this.ternary();
      this.expectOp(")");
      return e;
    }
    if (t.k === "op" && t.v === "[") {
      const items: Ast[] = [];
      if (!this.isOp("]")) {
        for (;;) {
          items.push(this.ternary());
          if (this.isOp(",")) this.pos++;
          else break;
        }
      }
      this.expectOp("]");
      return { t: "arr", items };
    }
    throw new ExpressionError(t.k === "end" ? "Unexpected end of expression" : "Unexpected token");
  }
}

export function parseExpression(src: string): Ast {
  if (typeof src !== "string") throw new ExpressionError("Expression must be a string");
  if (src.length > MAX_SOURCE) throw new ExpressionError(`Expression longer than ${MAX_SOURCE} characters`);
  return new Parser(tokenize(src)).parse();
}

// ---- Evaluation ----

const toStr = (v: unknown): string =>
  v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);

const FUNCTIONS: Record<string, (...a: any[]) => unknown> = {
  length: (v) => (typeof v === "string" || Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : 0),
  lower: (v) => toStr(v).toLowerCase(),
  upper: (v) => toStr(v).toUpperCase(),
  trim: (v) => toStr(v).trim(),
  string: (v) => toStr(v),
  number: (v) => Number(v),
  round: (v) => Math.round(Number(v)),
  floor: (v) => Math.floor(Number(v)),
  ceil: (v) => Math.ceil(Number(v)),
  abs: (v) => Math.abs(Number(v)),
  min: (...a) => Math.min(...a.map(Number)),
  max: (...a) => Math.max(...a.map(Number)),
  contains: (h, n) => (Array.isArray(h) ? h.indexOf(n) !== -1 : toStr(h).indexOf(toStr(n)) !== -1),
  startsWith: (s, p) => toStr(s).indexOf(toStr(p)) === 0,
  endsWith: (s, p) => {
    const a = toStr(s);
    const b = toStr(p);
    return b.length <= a.length && a.slice(a.length - b.length) === b;
  },
  join: (arr, sep) => (Array.isArray(arr) ? arr.map(toStr).join(sep === undefined ? "," : toStr(sep)) : ""),
  split: (s, sep) => toStr(s).split(toStr(sep)),
  keys: (o) => (o && typeof o === "object" ? Object.keys(o) : []),
  isEmpty: (v) =>
    v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0) ||
    (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0),
  coalesce: (...a) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== null && a[i] !== undefined && a[i] !== "") return a[i];
    return undefined;
  }
};

export interface EvalOptions {
  /** Provide `now()` deterministically (default Date.now). */
  now?: () => number;
}

function safeGet(obj: unknown, key: unknown): unknown {
  if (obj === null || obj === undefined) return undefined;
  const k = typeof key === "number" ? String(key) : key;
  if (typeof k !== "string") return undefined;
  if (FORBIDDEN_KEYS.indexOf(k) !== -1) throw new ExpressionError(`Access to '${k}' is not allowed`);
  if (k === "length" && (typeof obj === "string" || Array.isArray(obj))) return (obj as any).length;
  if (typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, k)) return (obj as any)[k];
  return undefined;
}

export function evaluate(ast: Ast, scope: Record<string, any>, opts: EvalOptions = {}): unknown {
  let steps = 0;
  const run = (n: Ast): unknown => {
    if (++steps > MAX_STEPS) throw new ExpressionError("Expression too complex");
    switch (n.t) {
      case "lit":
        return n.v;
      case "id":
        if (FORBIDDEN_KEYS.indexOf(n.name) !== -1) throw new ExpressionError(`Access to '${n.name}' is not allowed`);
        return Object.prototype.hasOwnProperty.call(scope, n.name) ? scope[n.name] : undefined;
      case "member":
        return safeGet(run(n.obj), n.key);
      case "index":
        return safeGet(run(n.obj), run(n.key));
      case "arr":
        return n.items.map(run);
      case "call": {
        const args = n.args.map(run);
        if (n.name === "now") return (opts.now || Date.now)();
        return FUNCTIONS[n.name].apply(null, args);
      }
      case "unary": {
        const v = run(n.arg);
        return n.op === "!" ? !v : -Number(v);
      }
      case "cond":
        return run(n.test) ? run(n.a) : run(n.b);
      case "bin": {
        if (n.op === "&&") {
          const l = run(n.l);
          return l ? run(n.r) : l;
        }
        if (n.op === "||") {
          const l = run(n.l);
          return l ? l : run(n.r);
        }
        const l = run(n.l) as any;
        const r = run(n.r) as any;
        switch (n.op) {
          case "+":
            return typeof l === "string" || typeof r === "string" ? toStr(l) + toStr(r) : Number(l) + Number(r);
          case "-": return Number(l) - Number(r);
          case "*": return Number(l) * Number(r);
          case "/": return Number(l) / Number(r);
          case "%": return Number(l) % Number(r);
          // eslint-disable-next-line eqeqeq
          case "==": return l == r;
          // eslint-disable-next-line eqeqeq
          case "!=": return l != r;
          case "===": return l === r;
          case "!==": return l !== r;
          case "<": return l < r;
          case "<=": return l <= r;
          case ">": return l > r;
          case ">=": return l >= r;
        }
        throw new ExpressionError(`Unknown operator '${n.op}'`);
      }
    }
  };
  return run(ast);
}

// `now` is a valid function name even though it isn't in FUNCTIONS' table.
FUNCTIONS.now = () => Date.now();

export function evalExpression(src: string, scope: Record<string, any>, opts?: EvalOptions): unknown {
  return evaluate(parseExpression(src), scope, opts);
}

// ---- Templates: "Hello {{ trigger.name }}" ----

const TEMPLATE_RE = /\{\{([\s\S]*?)\}\}/g;

export function extractTemplateExpressions(s: string): string[] {
  const out: string[] = [];
  s.replace(TEMPLATE_RE, (_m, e: string) => {
    out.push(e.trim());
    return "";
  });
  return out;
}

/** If the whole string is one `{{ expr }}`, returns the typed value; otherwise interpolates to string. */
export function renderTemplate(s: string, scope: Record<string, any>, opts?: EvalOptions): unknown {
  const whole = /^\s*\{\{([\s\S]*?)\}\}\s*$/.exec(s);
  if (whole && s.indexOf("}}") === s.lastIndexOf("}}")) return evalExpression(whole[1].trim(), scope, opts);
  return s.replace(TEMPLATE_RE, (_m, e: string) => toStr(evalExpression(e.trim(), scope, opts)));
}

export function resolveDeep(value: unknown, scope: Record<string, any>, opts?: EvalOptions): any {
  if (typeof value === "string") return renderTemplate(value, scope, opts);
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, scope, opts));
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    Object.keys(value).forEach((k) => {
      if (FORBIDDEN_KEYS.indexOf(k) !== -1) return;
      out[k] = resolveDeep((value as any)[k], scope, opts);
    });
    return out;
  }
  return value;
}

/** Collect every expression string referenced in a config (templates only, not raw-expression fields). */
export function collectTemplateExpressions(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") extractTemplateExpressions(value).forEach((e) => out.push(e));
  else if (Array.isArray(value)) value.forEach((v) => collectTemplateExpressions(v, out));
  else if (value && typeof value === "object")
    Object.keys(value).forEach((k) => collectTemplateExpressions((value as any)[k], out));
  return out;
}
