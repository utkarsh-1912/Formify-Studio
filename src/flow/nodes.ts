import { checkOutboundUrl } from "./adapters";
import { evalExpression, resolveDeep } from "./expression";
import { FlowDeps, FlowNode } from "./types";

/** Error that should not be retried (bad config, denied by policy, ...). */
export class FlowError extends Error {
  retryable: boolean;
  constructor(message: string, retryable = false) {
    super(message);
    this.name = "FlowError";
    this.retryable = retryable;
  }
}

/** Fields whose string value is a raw expression (not a `{{ }}` template). */
export const RAW_EXPRESSION_FIELDS: Record<string, string[]> = {
  condition: ["expression"],
  transform: ["expression"],
  loop: ["items"]
};

export interface PreparedNode {
  /** Config with templates resolved (raw-expression fields removed). */
  resolved: Record<string, any>;
  /** Raw-expression fields, unevaluated. */
  raw: Record<string, string>;
  scope: Record<string, any>;
  /** Secret values used by this node; used for redaction only. */
  secretValues: string[];
}

export interface NodeResult {
  output?: any;
  branches?: string[];
  wait?: { kind: "approval" } | { kind: "timer"; resumeAt: number };
}

const SECRET_REF = /secrets\.([A-Za-z_][A-Za-z0-9_]*)/g;

export async function prepareNode(node: FlowNode, scope: Record<string, any>, deps: FlowDeps): Promise<PreparedNode> {
  const cfg: Record<string, any> = { ...node.config };
  const raw: Record<string, string> = {};
  (RAW_EXPRESSION_FIELDS[node.type] || []).forEach((f) => {
    if (typeof cfg[f] === "string") {
      raw[f] = cfg[f];
      delete cfg[f];
    }
  });

  let resolveScope = scope;
  const secretValues: string[] = [];
  if (node.type === "http") {
    const secrets: Record<string, string> = {};
    const src = JSON.stringify(node.config);
    let m: RegExpExecArray | null;
    SECRET_REF.lastIndex = 0;
    while ((m = SECRET_REF.exec(src))) {
      const name = m[1];
      if (secrets[name] !== undefined) continue;
      const v = deps.vault ? await deps.vault.get(name) : undefined;
      if (v === undefined) throw new FlowError(`Missing secret '${name}'`);
      secrets[name] = v;
      if (v) secretValues.push(v);
    }
    resolveScope = { ...scope, secrets };
  }

  try {
    return { resolved: resolveDeep(cfg, resolveScope, { now: deps.now }), raw, scope, secretValues };
  } catch (e) {
    throw new FlowError((e as Error).message);
  }
}

/** Deep-replace every secret value in strings with [REDACTED]. */
export function redactSecrets<T>(value: T, secretValues: string[]): T {
  if (!secretValues.length || value === undefined) return value;
  const walk = (v: any): any => {
    if (typeof v === "string") {
      let s = v;
      secretValues.forEach((sec) => {
        if (sec) s = s.split(sec).join("[REDACTED]");
      });
      return s;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o: Record<string, any> = {};
      Object.keys(v).forEach((k) => (o[k] = walk(v[k])));
      return o;
    }
    return v;
  };
  return walk(value);
}

const evalRaw = (p: PreparedNode, field: string, deps: FlowDeps): unknown => {
  try {
    return evalExpression(p.raw[field], p.scope, { now: deps.now });
  } catch (e) {
    throw new FlowError(`${field}: ${(e as Error).message}`);
  }
};

const MAX_DELAY_MS = 7 * 24 * 3600 * 1000;

export function delayMsOf(p: PreparedNode): number {
  const ms = Number(p.resolved.ms);
  if (!isFinite(ms) || ms < 0) throw new FlowError("Delay 'ms' must be a non-negative number");
  return Math.min(ms, MAX_DELAY_MS);
}

/** Executes a non-loop node. Loop nodes are driven by the executor. */
export async function runNodeHandler(
  node: FlowNode,
  p: PreparedNode,
  deps: FlowDeps,
  opts: { inLoop: boolean }
): Promise<NodeResult> {
  const c = p.resolved;
  const now = deps.now || Date.now;
  switch (node.type) {
    case "trigger":
      return { output: p.scope.trigger };

    case "condition": {
      const result = !!evalRaw(p, "expression", deps);
      return { output: { result }, branches: [String(result)] };
    }

    case "transform": {
      if (p.raw.expression !== undefined) return { output: evalRaw(p, "expression", deps) };
      return { output: c.values };
    }

    case "ai": {
      if (!deps.ai) throw new FlowError("No AI provider configured");
      const output = await deps.ai.generate({ prompt: String(c.prompt), system: c.system, schema: c.schema });
      return { output };
    }

    case "http": {
      if (!deps.http) throw new FlowError("No HTTP client configured");
      const url = String(c.url);
      const check = checkOutboundUrl(url, deps.allowedDomains);
      if (!check.ok) throw new FlowError(`Outbound request blocked: ${check.reason}`);
      const headers: Record<string, string> = {};
      Object.keys(c.headers || {}).forEach((k) => (headers[k] = String(c.headers[k])));
      const method = String(c.method || "GET").toUpperCase();
      const res = await deps.http.request({ url, method, headers, body: c.body });
      if (res.status >= 400 && c.failOnError !== false) {
        throw new FlowError(`HTTP ${res.status}`, res.status >= 500 || res.status === 429);
      }
      return { output: { status: res.status, body: res.body } };
    }

    case "delay": {
      const ms = delayMsOf(p);
      if (opts.inLoop || ms <= (deps.maxInlineDelayMs ?? 30000)) {
        await (deps.sleep || ((t: number) => new Promise<void>((r) => setTimeout(r, t))))(ms);
        return { output: { waitedMs: ms } };
      }
      return { wait: { kind: "timer", resumeAt: now() + ms } };
    }

    case "approval":
      if (opts.inLoop) throw new FlowError("Approval is not allowed inside a loop");
      return { wait: { kind: "approval" } };

    case "email": {
      if (!deps.email) throw new FlowError("No email adapter configured");
      const output = await deps.email.send({ to: String(c.to), subject: String(c.subject), body: String(c.body) });
      return { output };
    }

    case "write": {
      if (!deps.write) throw new FlowError("No write adapter configured");
      const output = await deps.write.write({ target: String(c.target), data: c.data });
      return { output };
    }
  }
  throw new FlowError(`Unsupported node type '${node.type}'`);
}

export function evalLoopItems(p: PreparedNode, deps: FlowDeps): any[] {
  const items = evalRaw(p, "items", deps);
  if (!Array.isArray(items)) throw new FlowError("Loop 'items' must evaluate to an array");
  return items;
}
