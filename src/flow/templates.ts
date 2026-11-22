import { FlowEdge, FlowNode, FLOW_SCHEMA_VERSION, NodeType, Workflow } from "./types";

const n = (
  id: string,
  type: NodeType,
  label: string,
  config: Record<string, any>,
  x: number,
  y: number,
  extra: Partial<FlowNode> = {}
): FlowNode => ({ id, type, label, config, position: { x, y }, ...extra });

const e = (source: string, target: string, branch?: string): FlowEdge => ({
  id: `${source}${branch ? `:${branch}` : ""}->${target}`,
  source,
  target,
  ...(branch ? { branch } : {})
});

export interface WorkflowTemplate {
  key: string;
  title: string;
  description: string;
  sampleTrigger: Record<string, any>;
  workflow: Workflow;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    key: "lead-notify",
    title: "Lead → notify",
    description: "High-budget leads get an AI summary, a webhook ping and an email; others are just stored.",
    sampleTrigger: { name: "Ada Lovelace", email: "ada@example.com", budget: 25000, message: "Need a custom form platform." },
    workflow: {
      schemaVersion: FLOW_SCHEMA_VERSION,
      id: "tpl-lead-notify",
      name: "Lead → notify",
      nodes: [
        n("t", "trigger", "Form submitted", { type: "submission" }, 0, 120),
        n("c", "condition", "Budget > 10k?", { expression: "number(trigger.budget) > 10000" }, 220, 120),
        n("ai", "ai", "Summarize lead", { prompt: "Summarize this lead in one sentence: {{ trigger.name }} - {{ trigger.message }}" }, 460, 20),
        n(
          "h",
          "http",
          "Ping sales webhook",
          {
            method: "POST",
            url: "https://hooks.example.com/sales",
            headers: { Authorization: "Bearer {{ secrets.SALES_TOKEN }}" },
            body: { lead: "{{ trigger.email }}", summary: "{{ nodes.ai.text }}" }
          },
          700,
          20,
          { retry: { attempts: 3, backoffMs: 500 } }
        ),
        n("m", "email", "Email sales", { to: "sales@example.com", subject: "Hot lead: {{ trigger.name }}", body: "{{ nodes.ai.text }}" }, 940, 20),
        n("w", "write", "Store lead", { target: "leads", data: "{{ trigger }}" }, 460, 240)
      ],
      edges: [e("t", "c"), e("c", "ai", "true"), e("ai", "h"), e("h", "m"), e("c", "w", "false")]
    }
  },
  {
    key: "approval",
    title: "Approval request",
    description: "Pauses for a human decision, then emails the requester the outcome.",
    sampleTrigger: { requester: "sam@example.com", amount: 1200, reason: "Conference ticket" },
    workflow: {
      schemaVersion: FLOW_SCHEMA_VERSION,
      id: "tpl-approval",
      name: "Approval request",
      nodes: [
        n("t", "trigger", "Request submitted", { type: "submission" }, 0, 120),
        n("a", "approval", "Manager approval", { message: "Approve {{ trigger.amount }} for {{ trigger.reason }}?" }, 240, 120),
        n("ok", "email", "Notify approved", { to: "{{ trigger.requester }}", subject: "Approved", body: "Your request was approved." }, 500, 20),
        n("no", "email", "Notify rejected", { to: "{{ trigger.requester }}", subject: "Rejected", body: "Your request was rejected." }, 500, 240)
      ],
      edges: [e("t", "a"), e("a", "ok", "approved"), e("a", "no", "rejected")]
    }
  },
  {
    key: "enrichment",
    title: "Enrich & store",
    description: "Looks the contact up via an API (falling back gracefully on failure), then stores the result.",
    sampleTrigger: { email: "grace@example.com", name: "Grace Hopper" },
    workflow: {
      schemaVersion: FLOW_SCHEMA_VERSION,
      id: "tpl-enrichment",
      name: "Enrich & store",
      nodes: [
        n("t", "trigger", "Form submitted", { type: "submission" }, 0, 120),
        n(
          "h",
          "http",
          "Lookup contact",
          { method: "GET", url: "https://api.example.com/enrich?email={{ trigger.email }}" },
          240,
          120,
          { onError: "continue", timeoutMs: 8000, retry: { attempts: 2, backoffMs: 300 } }
        ),
        n("x", "transform", "Merge data", { values: { email: "{{ trigger.email }}", name: "{{ trigger.name }}", company: "{{ nodes.h.body.company }}", enriched: true } }, 500, 20),
        n("fb", "transform", "Fallback data", { values: { email: "{{ trigger.email }}", name: "{{ trigger.name }}", enriched: false } }, 500, 240),
        n("w", "write", "Save contact", { target: "contacts", data: "{{ nodes.x }}" }, 760, 20),
        n("w2", "write", "Save contact (fallback)", { target: "contacts", data: "{{ nodes.fb }}" }, 760, 240)
      ],
      edges: [e("t", "h"), e("h", "x"), e("h", "fb", "error"), e("x", "w"), e("fb", "w2")]
    }
  },
  {
    key: "bulk-loop",
    title: "Bulk notify (loop)",
    description: "Loops over a list of recipients, emailing each one, then records a summary.",
    sampleTrigger: { recipients: ["a@example.com", "b@example.com", "c@example.com"], subject: "Announcement" },
    workflow: {
      schemaVersion: FLOW_SCHEMA_VERSION,
      id: "tpl-bulk-loop",
      name: "Bulk notify (loop)",
      nodes: [
        n("t", "trigger", "Manual run", { type: "manual" }, 0, 120),
        n("l", "loop", "Each recipient", { items: "trigger.recipients" }, 220, 120),
        n("m", "email", "Send email", { to: "{{ item }}", subject: "{{ trigger.subject }}", body: "Hello #{{ index }}" }, 460, 20),
        n("w", "write", "Record summary", { target: "campaigns", data: { sent: "{{ nodes.l.count }}" } }, 460, 240)
      ],
      edges: [e("t", "l"), e("l", "m", "each"), e("l", "w", "done")]
    }
  }
];
