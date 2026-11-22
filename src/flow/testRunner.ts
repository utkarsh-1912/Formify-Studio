import { createMockAi, createMockEmail, createMockHttp, createMockWrite } from "./adapters";
import { resumeRun, startRun } from "./executor";
import { FlowDeps, ResumeEvent, Run, TriggerEvent, Workflow } from "./types";
import { createFlowWorker, FlowWorkerClient } from "./workerClient";

/** Executes workflows for the editor's test-run panel. Everything is mocked: no real network, email or writes. */
export interface FlowRunner {
  readonly mode: "main-thread" | "worker";
  start(workflow: Workflow, trigger: TriggerEvent): Promise<Run>;
  resume(workflow: Workflow, run: Run, event: ResumeEvent): Promise<Run>;
  /** Make pending long delays due (main-thread mode only; no-op in worker mode). */
  fastForward(): void;
  dispose(): void;
}

export interface TestRunnerOptions {
  allowedDomains: string[];
  useWorker?: boolean;
  /** Overrides for tests. */
  worker?: () => ReturnType<typeof createFlowWorker>;
}

/** Mock adapters: AI echoes, http returns a canned 200, every secret resolves to a fake value. */
export function createTestDeps(allowedDomains: string[]): FlowDeps {
  return {
    ai: createMockAi((req) => ({ text: `[mock AI] ${req.prompt.slice(0, 120)}` })),
    http: createMockHttp((req) => ({ status: 200, body: { mock: true, method: req.method, url: req.url } })),
    email: createMockEmail(),
    write: createMockWrite(),
    vault: { get: (name: string) => `mock-secret-${name}` },
    allowedDomains
  };
}

export function createTestRunner(opts: TestRunnerOptions): FlowRunner {
  if (opts.useWorker && typeof Worker !== "undefined") {
    try {
      const client = new FlowWorkerClient((opts.worker || createFlowWorker)(), createTestDeps(opts.allowedDomains));
      return {
        mode: "worker",
        start: (w, t) => client.start(w, t),
        resume: (w, r, e) => client.resume(w, r, e),
        fastForward() {},
        dispose: () => client.terminate()
      };
    } catch {
      // fall through to the main-thread runner
    }
  }
  let skew = 0;
  const deps = (): FlowDeps => ({ ...createTestDeps(opts.allowedDomains), now: () => Date.now() + skew });
  return {
    mode: "main-thread",
    start: (w, t) => startRun(w, t, deps()),
    resume: (w, r, e) => resumeRun(w, r, deps(), e),
    fastForward() {
      skew += 8 * 24 * 3600 * 1000;
    },
    dispose() {}
  };
}
