import { createFetchHttpClient } from "./adapters";
import { resumeRun, startRun } from "./executor";
import { FlowDeps, ResumeEvent, Run, TriggerEvent, Workflow } from "./types";

/**
 * Message protocol between the main thread and the executor Web Worker.
 * Adapters (AI, email, write, vault, optionally http) cannot cross postMessage,
 * so the worker calls back to the main thread through `rpc` messages.
 */

export type AdapterName = "ai" | "http" | "email" | "write" | "vault";

export interface WorkerConfig {
  allowedDomains?: string[];
  maxInlineDelayMs?: number;
  maxSteps?: number;
  /** Which adapters the main thread provides over RPC. Others fall back (http -> fetch). */
  adapters: AdapterName[];
}

export type ToWorker =
  | { type: "start"; reqId: number; workflow: Workflow; trigger: TriggerEvent; config: WorkerConfig }
  | { type: "resume"; reqId: number; workflow: Workflow; run: Run; event: ResumeEvent; config: WorkerConfig }
  | { type: "rpc-result"; id: number; ok: boolean; value?: unknown; error?: string };

export type FromWorker =
  | { type: "done"; reqId: number; run: Run }
  | { type: "error"; reqId: number; message: string }
  | { type: "rpc"; id: number; adapter: AdapterName; method: string; args: unknown[] };

export function createFlowWorkerHandler(post: (m: FromWorker) => void): (m: ToWorker) => void {
  let rpcId = 0;
  const pending: Record<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }> = {};

  const call = (adapter: AdapterName, method: string, args: unknown[]) =>
    new Promise<any>((resolve, reject) => {
      const id = ++rpcId;
      pending[id] = { resolve, reject };
      post({ type: "rpc", id, adapter, method, args });
    });

  const buildDeps = (cfg: WorkerConfig): FlowDeps => {
    const has = (a: AdapterName) => cfg.adapters.indexOf(a) !== -1;
    const deps: FlowDeps = {
      allowedDomains: cfg.allowedDomains,
      maxInlineDelayMs: cfg.maxInlineDelayMs,
      maxSteps: cfg.maxSteps
    };
    if (has("ai")) deps.ai = { generate: (req) => call("ai", "generate", [req]) };
    if (has("email")) deps.email = { send: (m) => call("email", "send", [m]) };
    if (has("write")) deps.write = { write: (r) => call("write", "write", [r]) };
    if (has("vault")) deps.vault = { get: (n) => call("vault", "get", [n]) };
    deps.http = has("http") ? { request: (r) => call("http", "request", [r]) } : createFetchHttpClient();
    return deps;
  };

  return (msg) => {
    if (msg.type === "rpc-result") {
      const p = pending[msg.id];
      if (!p) return;
      delete pending[msg.id];
      if (msg.ok) p.resolve(msg.value);
      else p.reject(new Error(msg.error || "RPC failed"));
      return;
    }
    const job =
      msg.type === "start"
        ? startRun(msg.workflow, msg.trigger, buildDeps(msg.config))
        : resumeRun(msg.workflow, msg.run, buildDeps(msg.config), msg.event);
    job.then(
      (run) => post({ type: "done", reqId: msg.reqId, run }),
      (e) => post({ type: "error", reqId: msg.reqId, message: (e as Error).message })
    );
  };
}
