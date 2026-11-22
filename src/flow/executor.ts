import { buildIndex, directNodes, GraphIndex, loopBody, topoSort } from "./graph";
import {
  evalLoopItems,
  FlowError,
  NodeResult,
  prepareNode,
  PreparedNode,
  redactSecrets,
  runNodeHandler
} from "./nodes";
import { validateWorkflow } from "./schema";
import { matchTriggers } from "./triggers";
import {
  FlowDeps,
  FlowEdge,
  FlowNode,
  LogEntry,
  NodeState,
  ResumeEvent,
  Run,
  TriggerEvent,
  Workflow
} from "./types";

interface Frame {
  states: Record<string, NodeState>;
  parent?: Frame;
  vars: Record<string, any>;
  iteration: number[];
  /** Nodes that are live because the parent loop's "each" edge feeds them. */
  entry?: Record<string, boolean>;
  /** Selected trigger nodes (top-level frame only). */
  triggerSel?: Record<string, boolean>;
}

interface Ctx {
  wf: Workflow;
  g: GraphIndex;
  deps: FlowDeps;
  run: Run;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  steps: number;
  maxSteps: number;
}

interface Failure {
  nodeId: string;
  error: string;
}

const isTerminal = (s?: NodeState) => !!s && (s.status === "succeeded" || s.status === "failed" || s.status === "skipped");

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new FlowError(`Timed out after ${ms}ms`, true)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function buildScope(ctx: Ctx, frame: Frame): Record<string, any> {
  const chain: Frame[] = [];
  for (let f: Frame | undefined = frame; f; f = f.parent) chain.unshift(f);
  const nodes: Record<string, any> = {};
  let vars: Record<string, any> = {};
  chain.forEach((f) => {
    Object.keys(f.states).forEach((id) => {
      if (f.states[id].status === "succeeded") nodes[id] = f.states[id].output;
    });
    vars = { ...vars, ...f.vars };
  });
  return { ...vars, trigger: ctx.run.trigger.payload, nodes };
}

function branchMatches(s: NodeState, e: FlowEdge): boolean {
  if (s.status === "failed") return e.branch === "error";
  if (s.status !== "succeeded") return false;
  const b = e.branch === undefined ? "default" : e.branch;
  if (b === "error") return false;
  return (s.branches || ["default"]).indexOf(b) !== -1;
}

function isLive(ctx: Ctx, frame: Frame, node: FlowNode): boolean {
  if (node.type === "trigger") return !!(frame.triggerSel && frame.triggerSel[node.id]);
  if (frame.entry && frame.entry[node.id]) return true;
  return ctx.g.inn[node.id].some((e) => {
    const s = frame.states[e.source];
    return !!s && branchMatches(s, e);
  });
}

function log(ctx: Ctx, frame: Frame, entry: Omit<LogEntry, "at" | "iteration">) {
  ctx.run.log.push({ at: ctx.now(), iteration: frame.iteration.length ? frame.iteration.slice() : undefined, ...entry });
}

/** Runs the nodes of one region (top level, or one loop iteration) in topological order. */
async function execRegion(ctx: Ctx, frame: Frame, region: string[]): Promise<Failure | null> {
  const order = topoSort(region, ctx.g) as string[];
  for (const id of order) {
    const node = ctx.g.nodes[id];
    const existing = frame.states[id];
    if (isTerminal(existing) || (existing && existing.status === "waiting")) continue;

    if (!isLive(ctx, frame, node)) {
      const upstreamOpen = ctx.g.inn[id].some((e) => {
        const s = frame.states[e.source];
        return !!s && (s.status === "waiting" || s.status === "pending");
      });
      if (upstreamOpen) {
        frame.states[id] = { status: "pending", attempts: 0 };
      } else {
        frame.states[id] = { status: "skipped", attempts: 0, branches: [] };
        log(ctx, frame, { nodeId: id, status: "skipped" });
        if (node.type === "loop") loopBody(id, ctx.g).forEach((b) => markSkipped(ctx, frame, b));
      }
      continue;
    }

    if (++ctx.steps > ctx.maxSteps) return { nodeId: id, error: `Step limit (${ctx.maxSteps}) exceeded` };
    const failure = await executeNode(ctx, frame, node);
    if (failure) return failure;
  }
  return null;
}

function markSkipped(ctx: Ctx, frame: Frame, id: string) {
  if (!frame.states[id]) frame.states[id] = { status: "skipped", attempts: 0, branches: [] };
}

async function executeNode(ctx: Ctx, frame: Frame, node: FlowNode): Promise<Failure | null> {
  const st: NodeState = { status: "running", attempts: 0, startedAt: ctx.now() };
  frame.states[node.id] = st;
  const scope = buildScope(ctx, frame);
  let secretValues: string[] = [];
  const red = <T>(v: T) => redactSecrets(v, secretValues);
  log(ctx, frame, { nodeId: node.id, status: "running" });

  try {
    const prepared: PreparedNode = await prepareNode(node, scope, ctx.deps);
    secretValues = prepared.secretValues;
    st.input = red({ ...prepared.resolved, ...prepared.raw });

    let result: NodeResult;
    if (node.type === "loop") {
      st.attempts = 1;
      result = await runLoop(ctx, frame, node, prepared);
    } else {
      const policy = node.retry || { attempts: 1 };
      const baseTimeout = node.timeoutMs ?? 30000;
      let lastErr: unknown;
      result = undefined as unknown as NodeResult;
      for (let attempt = 1; attempt <= policy.attempts; attempt++) {
        st.attempts = attempt;
        try {
          const timeout =
            node.type === "delay" ? Math.max(baseTimeout, Number(prepared.resolved.ms) + 1000 || 0) : baseTimeout;
          result = await withTimeout(
            runNodeHandler(node, prepared, ctx.deps, { inLoop: !!frame.parent }),
            timeout
          );
          lastErr = undefined;
          break;
        } catch (e) {
          lastErr = e;
          const retryable = !(e instanceof FlowError) || e.retryable;
          log(ctx, frame, { nodeId: node.id, status: "running", attempt, message: red(`attempt ${attempt} failed: ${(e as Error).message}`) });
          if (!retryable || attempt >= policy.attempts) break;
          await ctx.sleep((policy.backoffMs || 0) * Math.pow(2, attempt - 1));
        }
      }
      if (lastErr) throw lastErr;
    }

    st.endedAt = ctx.now();
    if (result.wait) {
      st.status = "waiting";
      if (result.wait.kind === "timer") st.resumeAt = result.wait.resumeAt;
      log(ctx, frame, { nodeId: node.id, status: "waiting", message: result.wait.kind });
    } else {
      st.status = "succeeded";
      st.output = red(result.output);
      st.branches = result.branches || ["default"];
      log(ctx, frame, { nodeId: node.id, status: "succeeded", output: st.output });
    }
    return null;
  } catch (e) {
    st.endedAt = ctx.now();
    st.status = "failed";
    st.error = redactSecrets((e as Error).message || String(e), secretValues);
    st.branches = [];
    log(ctx, frame, { nodeId: node.id, status: "failed", message: st.error });
    if (node.onError === "continue") return null;
    return { nodeId: node.id, error: st.error };
  }
}

async function runLoop(ctx: Ctx, frame: Frame, node: FlowNode, p: PreparedNode): Promise<NodeResult> {
  const items = evalLoopItems(p, ctx.deps);
  const max = Number(node.config.maxIterations ?? 1000);
  if (items.length > max) throw new FlowError(`Loop has ${items.length} items, above maxIterations (${max})`);

  const body = loopBody(node.id, ctx.g);
  const region = directNodes(body, ctx.g);
  const entry: Record<string, boolean> = Object.create(null);
  ctx.g.out[node.id].forEach((e) => {
    if (e.branch === "each") entry[e.target] = true;
  });

  const results: Array<{ index: number; item: unknown; outputs: Record<string, unknown> }> = [];
  let lastFrame: Frame | undefined;
  for (let index = 0; index < items.length; index++) {
    const iterFrame: Frame = {
      states: {},
      parent: frame,
      vars: { item: items[index], index },
      iteration: frame.iteration.concat(index),
      entry
    };
    lastFrame = iterFrame;
    const failure = await execRegion(ctx, iterFrame, region);
    const outputs: Record<string, unknown> = {};
    Object.keys(iterFrame.states).forEach((id) => {
      if (iterFrame.states[id].status === "succeeded") outputs[id] = iterFrame.states[id].output;
    });
    results.push({ index, item: items[index], outputs });
    if (failure) {
      publishBodyStates(ctx, frame, lastFrame);
      throw new FlowError(`Iteration ${index} failed at '${failure.nodeId}': ${failure.error}`);
    }
  }
  if (lastFrame) publishBodyStates(ctx, frame, lastFrame);
  else body.forEach((b) => markSkipped(ctx, frame, b));
  return { output: { count: items.length, results }, branches: ["done"] };
}

/** Copy the last iteration's node states into the owning frame so UIs can show them. */
function publishBodyStates(_ctx: Ctx, frame: Frame, iter: Frame) {
  Object.keys(iter.states).forEach((id) => {
    if (!frame.states[id]) frame.states[id] = iter.states[id];
  });
}

function newRunId(now: number): string {
  return `run_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeCtx(wf: Workflow, run: Run, deps: FlowDeps): Ctx {
  return {
    wf,
    g: buildIndex(wf),
    deps,
    run,
    now: deps.now || Date.now,
    sleep: deps.sleep || ((ms) => new Promise<void>((r) => setTimeout(r, ms))),
    steps: 0,
    maxSteps: deps.maxSteps ?? 10000
  };
}

async function drive(ctx: Ctx): Promise<Run> {
  const { run, g, wf } = ctx;
  const sel: Record<string, boolean> = {};
  matchTriggers(wf, run.trigger).forEach((id) => (sel[id] = true));
  const frame: Frame = { states: run.nodeStates, vars: {}, iteration: [], triggerSel: sel };

  // Top-level region = every node that is not inside a loop body.
  const bodyNodes: Record<string, boolean> = {};
  wf.nodes.forEach((n) => {
    if (n.type === "loop") loopBody(n.id, g).forEach((b) => (bodyNodes[b] = true));
  });
  const region = wf.nodes.map((n) => n.id).filter((id) => !bodyNodes[id]);

  let failure: Failure | null = null;
  try {
    failure = await execRegion(ctx, frame, region);
  } catch (e) {
    failure = { nodeId: "", error: (e as Error).message };
  }

  const waiting = Object.keys(run.nodeStates).some((id) => run.nodeStates[id].status === "waiting");
  if (failure) {
    run.status = "failed";
    run.error = failure.nodeId ? `Node '${failure.nodeId}' failed: ${failure.error}` : failure.error;
  } else if (waiting) {
    run.status = "waiting";
  } else {
    run.status = "succeeded";
  }

  if (run.status !== "waiting") {
    wf.nodes.forEach((n) => {
      const s = run.nodeStates[n.id];
      if (!s || s.status === "pending" || s.status === "running" || (run.status === "failed" && s.status === "waiting")) {
        run.nodeStates[n.id] = { status: "skipped", attempts: 0, branches: [] };
      }
    });
    run.endedAt = ctx.now();
  }
  return run;
}

function assertValid(wf: Workflow) {
  const issues = validateWorkflow(wf);
  if (issues.length) throw new Error(`Invalid workflow: ${issues.map((i) => i.message).join("; ")}`);
}

/** Start a new run for a trigger event. Resolves when the run finishes or pauses (waiting). */
export async function startRun(
  workflow: Workflow,
  trigger: TriggerEvent,
  deps: FlowDeps = {},
  opts: { replayOf?: string } = {}
): Promise<Run> {
  assertValid(workflow);
  const now = deps.now || Date.now;
  const run: Run = {
    id: newRunId(now()),
    workflowId: workflow.id,
    workflowVersion: workflow.schemaVersion,
    status: "running",
    trigger: clone(trigger),
    startedAt: now(),
    nodeStates: {},
    log: [],
    replayOf: opts.replayOf
  };
  if (matchTriggers(workflow, trigger).length === 0) {
    run.status = "failed";
    run.error = `No trigger node matches '${trigger.type}' event`;
    run.endedAt = now();
    return run;
  }
  return drive(makeCtx(workflow, run, deps));
}

/** Resume a waiting run (approval decision or timer wake-up). Returns a new Run object. */
export async function resumeRun(workflow: Workflow, previous: Run, deps: FlowDeps, event: ResumeEvent): Promise<Run> {
  assertValid(workflow);
  if (previous.status !== "waiting") throw new Error(`Run is '${previous.status}', not waiting`);
  const run = clone(previous);
  const now = (deps.now || Date.now)();

  if (event.type === "approval") {
    const node = workflow.nodes.filter((n) => n.id === event.nodeId)[0];
    const st = run.nodeStates[event.nodeId];
    if (!node || node.type !== "approval" || !st || st.status !== "waiting") {
      throw new Error(`Node '${event.nodeId}' is not waiting for approval`);
    }
    st.status = "succeeded";
    st.endedAt = now;
    st.output = { approved: event.approved, by: event.by, comment: event.comment };
    st.branches = [event.approved ? "approved" : "rejected"];
    run.log.push({ at: now, nodeId: event.nodeId, status: "succeeded", output: st.output, message: "approval decision" });
  } else {
    let due = 0;
    Object.keys(run.nodeStates).forEach((id) => {
      const st = run.nodeStates[id];
      if (st.status === "waiting" && st.resumeAt !== undefined && st.resumeAt <= now) {
        st.status = "succeeded";
        st.endedAt = now;
        st.output = { resumedAt: now };
        st.branches = ["default"];
        run.log.push({ at: now, nodeId: id, status: "succeeded", message: "timer elapsed" });
        due++;
      }
    });
    if (!due) return run; // nothing due yet; still waiting
  }

  run.status = "running";
  delete run.error;
  return drive(makeCtx(workflow, run, deps));
}

/** Re-run a finished run's trigger from scratch (fresh run id, linked via replayOf). */
export function replayRun(workflow: Workflow, previous: Run, deps: FlowDeps = {}): Promise<Run> {
  return startRun(workflow, previous.trigger, deps, { replayOf: previous.id });
}
