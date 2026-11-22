import { FlowEdge, FlowNode, FLOW_SCHEMA_VERSION, Workflow } from "../types";

export const node = (id: string, type: FlowNode["type"], config: Record<string, any> = {}, extra: Partial<FlowNode> = {}): FlowNode => ({
  id,
  type,
  config,
  ...extra
});

export const edge = (source: string, target: string, branch?: string): FlowEdge => ({
  id: `${source}${branch ? ":" + branch : ""}->${target}`,
  source,
  target,
  ...(branch ? { branch } : {})
});

export const wf = (nodes: FlowNode[], edges: FlowEdge[]): Workflow => ({
  schemaVersion: FLOW_SCHEMA_VERSION,
  id: "wf",
  name: "Test",
  nodes,
  edges
});

export const trig = (payload: Record<string, any> = {}, type: any = "submission") => ({ type, payload });

export const fastDeps = { sleep: async () => {} };
