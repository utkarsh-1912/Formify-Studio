import { AdapterName, FromWorker, ToWorker, WorkerConfig } from "./workerHandler";
import { FlowDeps, ResumeEvent, Run, TriggerEvent, Workflow } from "./types";

/** The slice of the Worker API the client needs (also implemented by the in-memory test channel). */
export interface WorkerLike {
  postMessage(msg: ToWorker): void;
  onmessage: ((e: { data: FromWorker }) => void) | null;
  terminate?(): void;
}

/** Creates the real browser Worker. Only call in the browser. */
export function createFlowWorker(): WorkerLike {
  return new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike;
}

/** Main-thread facade: runs workflows in a Worker, serving adapter calls from `handlers`. */
export class FlowWorkerClient {
  private seq = 0;
  private jobs: Record<number, { resolve: (r: Run) => void; reject: (e: Error) => void }> = {};

  constructor(private worker: WorkerLike, private handlers: FlowDeps = {}) {
    worker.onmessage = (e) => this.onMessage(e.data);
  }

  private config(): WorkerConfig {
    const names: AdapterName[] = [];
    (["ai", "http", "email", "write", "vault"] as AdapterName[]).forEach((n) => {
      if (this.handlers[n]) names.push(n);
    });
    return {
      allowedDomains: this.handlers.allowedDomains,
      maxInlineDelayMs: this.handlers.maxInlineDelayMs,
      maxSteps: this.handlers.maxSteps,
      adapters: names
    };
  }

  private onMessage(msg: FromWorker) {
    if (msg.type === "done" || msg.type === "error") {
      const job = this.jobs[msg.reqId];
      if (!job) return;
      delete this.jobs[msg.reqId];
      if (msg.type === "done") job.resolve(msg.run);
      else job.reject(new Error(msg.message));
      return;
    }
    // rpc from worker -> serve from main-thread adapters
    const target = (this.handlers as any)[msg.adapter];
    Promise.resolve()
      .then(() => {
        if (!target || typeof target[msg.method] !== "function") throw new Error(`No handler for ${msg.adapter}.${msg.method}`);
        return target[msg.method].apply(target, msg.args);
      })
      .then(
        (value) => this.worker.postMessage({ type: "rpc-result", id: msg.id, ok: true, value }),
        (e) => this.worker.postMessage({ type: "rpc-result", id: msg.id, ok: false, error: (e as Error).message })
      );
  }

  private submit(build: (reqId: number) => ToWorker): Promise<Run> {
    const reqId = ++this.seq;
    return new Promise<Run>((resolve, reject) => {
      this.jobs[reqId] = { resolve, reject };
      this.worker.postMessage(build(reqId));
    });
  }

  start(workflow: Workflow, trigger: TriggerEvent): Promise<Run> {
    return this.submit((reqId) => ({ type: "start", reqId, workflow, trigger, config: this.config() }));
  }

  resume(workflow: Workflow, run: Run, event: ResumeEvent): Promise<Run> {
    return this.submit((reqId) => ({ type: "resume", reqId, workflow, run, event, config: this.config() }));
  }

  terminate() {
    Object.keys(this.jobs).forEach((k) => this.jobs[Number(k)].reject(new Error("Worker terminated")));
    this.jobs = {};
    if (this.worker.terminate) this.worker.terminate();
  }
}
