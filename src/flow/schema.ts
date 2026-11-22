import Ajv from "ajv";
import { FLOW_SCHEMA_VERSION, NODE_TYPES, TRIGGER_TYPES, Workflow } from "./types";
import { buildIndex, loopBody, topoSort } from "./graph";
import { collectTemplateExpressions, parseExpression } from "./expression";
import { isValidCron } from "./triggers";

/** Formal JSON Schema for a workflow document (v1). Semantic rules live in validateWorkflow. */
export const workflowSchemaV1 = {
  $id: "https://formify.dev/schema/workflow-v1.json",
  type: "object",
  required: ["schemaVersion", "id", "name", "nodes", "edges"],
  properties: {
    schemaVersion: { type: "integer", minimum: 1 },
    id: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    nodes: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "type", "config"],
        properties: {
          id: { type: "string", minLength: 1 },
          type: { enum: [...NODE_TYPES] },
          label: { type: "string" },
          config: { type: "object" },
          position: {
            type: "object",
            required: ["x", "y"],
            properties: { x: { type: "number" }, y: { type: "number" } }
          },
          retry: {
            type: "object",
            required: ["attempts"],
            properties: {
              attempts: { type: "integer", minimum: 1, maximum: 10 },
              backoffMs: { type: "number", minimum: 0 }
            }
          },
          timeoutMs: { type: "number", minimum: 1 },
          onError: { enum: ["fail", "continue"] }
        }
      }
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "source", "target"],
        properties: {
          id: { type: "string", minLength: 1 },
          source: { type: "string" },
          target: { type: "string" },
          branch: { type: "string" }
        }
      }
    }
  }
} as const;

const ajv = new Ajv({ allErrors: true, strict: false });
const compiled = ajv.compile(workflowSchemaV1);

export interface FlowIssue {
  message: string;
  nodeId?: string;
  edgeId?: string;
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const BRANCHES: Record<string, string[]> = {
  condition: ["true", "false", "error"],
  approval: ["approved", "rejected", "error"],
  loop: ["each", "done", "error"]
};

function hasSecretRef(v: unknown): boolean {
  return /secrets\./.test(JSON.stringify(v ?? null));
}

export function migrateWorkflow(wf: any): Workflow {
  const version = typeof wf?.schemaVersion === "number" ? wf.schemaVersion : 1;
  if (version > FLOW_SCHEMA_VERSION) {
    throw new Error(`Workflow version ${version} is newer than supported (${FLOW_SCHEMA_VERSION}).`);
  }
  return { ...wf, schemaVersion: FLOW_SCHEMA_VERSION };
}

/** Full validation: structure (AJV) + graph rules + per-node config + expression syntax. Empty = valid. */
export function validateWorkflow(input: unknown): FlowIssue[] {
  if (!compiled(input)) {
    return (compiled.errors || []).map((e) => ({ message: `${e.instancePath || "/"} ${e.message}` }));
  }
  const wf = input as Workflow;
  const issues: FlowIssue[] = [];
  const add = (message: string, nodeId?: string, edgeId?: string) => issues.push({ message, nodeId, edgeId });

  // unique ids
  const seen: Record<string, boolean> = Object.create(null);
  wf.nodes.forEach((n) => {
    if (seen[n.id]) add(`Duplicate node id '${n.id}'`, n.id);
    seen[n.id] = true;
  });
  const seenEdge: Record<string, boolean> = Object.create(null);
  wf.edges.forEach((e) => {
    if (seenEdge[e.id]) add(`Duplicate edge id '${e.id}'`, undefined, e.id);
    seenEdge[e.id] = true;
    if (!seen[e.source]) add(`Edge '${e.id}' has unknown source '${e.source}'`, undefined, e.id);
    if (!seen[e.target]) add(`Edge '${e.id}' has unknown target '${e.target}'`, undefined, e.id);
    if (e.source === e.target) add(`Edge '${e.id}' connects a node to itself`, undefined, e.id);
  });
  if (issues.length) return issues; // graph helpers assume consistent ids

  const g = buildIndex(wf);

  if (!wf.nodes.some((n) => n.type === "trigger")) add("Workflow needs at least one trigger node");

  // cycles
  if (!topoSort(wf.nodes.map((n) => n.id), g)) add("Workflow contains a cycle");

  wf.nodes.forEach((n) => {
    const c = n.config || {};
    const need = (cond: boolean, msg: string) => {
      if (!cond) add(msg, n.id);
    };
    const expr = (src: unknown, what: string) => {
      if (typeof src !== "string" || !src.trim()) return add(`${what} is required`, n.id);
      try {
        parseExpression(src);
      } catch (e) {
        add(`${what}: ${(e as Error).message}`, n.id);
      }
    };

    // edges / branches
    if (n.type === "trigger") need(g.inn[n.id].length === 0, "Trigger nodes cannot have incoming edges");
    else need(g.inn[n.id].length > 0, "Node has no incoming edge and can never run");
    const allowed = BRANCHES[n.type] || ["error"];
    g.out[n.id].forEach((e) => {
      if (e.branch === undefined || e.branch === "default") {
        if (BRANCHES[n.type] && n.type !== "loop") add(`Edge '${e.id}' from ${n.type} needs a branch (${allowed.join("/")})`, n.id, e.id);
        if (n.type === "loop") add(`Edge '${e.id}' from loop needs branch 'each' or 'done'`, n.id, e.id);
      } else if (allowed.indexOf(e.branch) === -1) {
        add(`Edge '${e.id}' has invalid branch '${e.branch}' for ${n.type}`, n.id, e.id);
      }
      if (e.branch === "error" && n.onError !== "continue") {
        add(`Edge '${e.id}' uses 'error' branch but node onError is not 'continue'`, n.id, e.id);
      }
    });

    // per-type config
    switch (n.type) {
      case "trigger":
        if (TRIGGER_TYPES.indexOf(c.type) === -1) add(`Trigger type must be one of ${TRIGGER_TYPES.join(", ")}`, n.id);
        if (c.type === "schedule") need(typeof c.cron === "string" && isValidCron(c.cron), "Schedule trigger needs a valid 5-field cron");
        break;
      case "condition":
        expr(c.expression, "Condition expression");
        break;
      case "transform":
        need(typeof c.expression === "string" || (c.values && typeof c.values === "object"), "Transform needs 'expression' or 'values'");
        if (typeof c.expression === "string") expr(c.expression, "Transform expression");
        break;
      case "ai":
        need(typeof c.prompt === "string" && !!c.prompt, "AI node needs a prompt");
        break;
      case "http":
        need(typeof c.url === "string" && !!c.url, "HTTP node needs a url");
        need(c.method === undefined || HTTP_METHODS.indexOf(String(c.method).toUpperCase()) !== -1, `HTTP method must be one of ${HTTP_METHODS.join(", ")}`);
        break;
      case "delay":
        need(typeof c.ms === "number" || typeof c.ms === "string", "Delay needs 'ms'");
        break;
      case "loop":
        expr(c.items, "Loop items expression");
        need(g.out[n.id].some((e) => e.branch === "each"), "Loop needs an 'each' edge");
        break;
      case "email":
        need(["to", "subject", "body"].every((k) => typeof c[k] === "string"), "Email needs 'to', 'subject' and 'body'");
        break;
      case "write":
        need(typeof c.target === "string" && !!c.target, "Write node needs a target");
        break;
    }

    // templates must parse
    collectTemplateExpressions(c).forEach((src) => {
      try {
        parseExpression(src);
      } catch (e) {
        add(`Template '{{ ${src} }}': ${(e as Error).message}`, n.id);
      }
    });

    // secrets only where the node can keep them private
    if (n.type !== "http" && hasSecretRef(c)) add("Secrets may only be referenced from http nodes", n.id);
  });

  // loop bodies
  wf.nodes.forEach((n) => {
    if (n.type !== "loop") return;
    const body = loopBody(n.id, g);
    const inBody: Record<string, boolean> = Object.create(null);
    body.forEach((b) => (inBody[b] = true));
    body.forEach((b) => {
      const node = g.nodes[b];
      if (node.type === "approval") add("Approval nodes are not allowed inside a loop body", b);
      if (node.type === "trigger") add("Trigger nodes cannot be inside a loop body", b);
      g.inn[b].forEach((e) => {
        if (!inBody[e.source] && !(e.source === n.id && e.branch === "each")) {
          add(`Loop body node '${b}' has an incoming edge from outside the loop`, b, e.id);
        }
      });
      g.out[b].forEach((e) => {
        if (!inBody[e.target]) add(`Loop body node '${b}' has an edge leaving the loop body`, b, e.id);
      });
    });
  });

  return issues;
}
