import { FlowEdge, FlowNode, Workflow } from "./types";

export interface GraphIndex {
  nodes: Record<string, FlowNode>;
  out: Record<string, FlowEdge[]>;
  inn: Record<string, FlowEdge[]>;
}

export function buildIndex(wf: Pick<Workflow, "nodes" | "edges">): GraphIndex {
  const nodes: Record<string, FlowNode> = Object.create(null);
  const out: Record<string, FlowEdge[]> = Object.create(null);
  const inn: Record<string, FlowEdge[]> = Object.create(null);
  wf.nodes.forEach((n) => {
    nodes[n.id] = n;
    out[n.id] = [];
    inn[n.id] = [];
  });
  wf.edges.forEach((e) => {
    if (out[e.source] && inn[e.target]) {
      out[e.source].push(e);
      inn[e.target].push(e);
    }
  });
  return { nodes, out, inn };
}

/** Kahn topological sort over `ids` (edges leaving the subset are ignored). Returns null on a cycle. */
export function topoSort(ids: string[], g: GraphIndex): string[] | null {
  const inSet: Record<string, boolean> = Object.create(null);
  ids.forEach((i) => (inSet[i] = true));
  const indeg: Record<string, number> = Object.create(null);
  ids.forEach((i) => (indeg[i] = 0));
  ids.forEach((i) =>
    g.out[i].forEach((e) => {
      if (inSet[e.target]) indeg[e.target]++;
    })
  );
  const queue = ids.filter((i) => indeg[i] === 0);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift() as string;
    order.push(id);
    g.out[id].forEach((e) => {
      if (inSet[e.target] && --indeg[e.target] === 0) queue.push(e.target);
    });
  }
  return order.length === ids.length ? order : null;
}

/** Nodes reachable from `starts` (inclusive). */
export function reach(starts: string[], g: GraphIndex): Record<string, boolean> {
  const seen: Record<string, boolean> = Object.create(null);
  const stack = starts.slice();
  while (stack.length) {
    const id = stack.pop() as string;
    if (seen[id] || !g.nodes[id]) continue;
    seen[id] = true;
    g.out[id].forEach((e) => stack.push(e.target));
  }
  return seen;
}

/** Direct body of a loop node: reachable via "each" edges, minus anything also reachable via "done". */
export function loopBody(loopId: string, g: GraphIndex): string[] {
  const each = g.out[loopId].filter((e) => e.branch === "each").map((e) => e.target);
  const done = g.out[loopId].filter((e) => e.branch === "done").map((e) => e.target);
  const a = reach(each, g);
  const b = reach(done, g);
  return Object.keys(a).filter((id) => !b[id]);
}

/** Nodes that belong to `region` directly, i.e. not inside a nested loop body. */
export function directNodes(region: string[], g: GraphIndex): string[] {
  const nested: Record<string, boolean> = Object.create(null);
  region.forEach((id) => {
    if (g.nodes[id].type === "loop") loopBody(id, g).forEach((b) => (nested[b] = true));
  });
  return region.filter((id) => !nested[id]);
}

export function allLoopBodyNodes(g: GraphIndex): Record<string, boolean> {
  const s: Record<string, boolean> = Object.create(null);
  Object.keys(g.nodes).forEach((id) => {
    if (g.nodes[id].type === "loop") loopBody(id, g).forEach((b) => (s[b] = true));
  });
  return s;
}
