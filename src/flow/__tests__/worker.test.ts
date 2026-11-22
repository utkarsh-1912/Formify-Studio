import { createMemoryVault, createMockAi, createMockEmail, createMockHttp } from "../adapters";
import { FlowWorkerClient, WorkerLike } from "../workerClient";
import { createFlowWorkerHandler, FromWorker, ToWorker } from "../workerHandler";
import { WORKFLOW_TEMPLATES } from "../templates";
import { edge, node, trig, wf } from "./helpers";

/** In-memory stand-in for a Worker: messages are structured-cloned and delivered asynchronously. */
function memoryWorker(): WorkerLike {
  let toWorker: (m: ToWorker) => void;
  const client: WorkerLike = {
    onmessage: null,
    postMessage(m) {
      const copy = JSON.parse(JSON.stringify(m));
      setTimeout(() => toWorker(copy), 0);
    }
  };
  toWorker = createFlowWorkerHandler((m: FromWorker) => {
    const copy = JSON.parse(JSON.stringify(m));
    setTimeout(() => client.onmessage && client.onmessage({ data: copy }), 0);
  });
  return client;
}

describe("worker protocol", () => {
  test("runs a workflow in the worker and serves adapters over RPC", async () => {
    const email = createMockEmail();
    const ai = createMockAi(() => ({ text: "summary" }));
    const client = new FlowWorkerClient(memoryWorker(), { email, ai });
    const f = wf(
      [
        node("t", "trigger", { type: "submission" }),
        node("a", "ai", { prompt: "sum {{ trigger.name }}" }),
        node("e", "email", { to: "x@y.z", subject: "s", body: "{{ nodes.a.text }}" })
      ],
      [edge("t", "a"), edge("a", "e")]
    );
    const run = await client.start(f, trig({ name: "Ada" }));
    expect(run.status).toBe("succeeded");
    expect(ai.calls[0].prompt).toBe("sum Ada");
    expect(email.calls[0].body).toBe("summary");
  });

  test("approval pause/resume across the worker boundary", async () => {
    const email = createMockEmail();
    const client = new FlowWorkerClient(memoryWorker(), { email });
    const tpl = WORKFLOW_TEMPLATES.filter((t) => t.key === "approval")[0];
    const waiting = await client.start(tpl.workflow, trig(tpl.sampleTrigger));
    expect(waiting.status).toBe("waiting");
    const done = await client.resume(tpl.workflow, waiting, { type: "approval", nodeId: "a", approved: true });
    expect(done.status).toBe("succeeded");
    expect(email.calls[0].subject).toBe("Approved");
  });

  test("allowlist and secrets work through the worker; secrets stay out of the run", async () => {
    const http = createMockHttp();
    const SECRET = "tok_live_123456";
    const client = new FlowWorkerClient(memoryWorker(), {
      http,
      vault: createMemoryVault({ K: SECRET }),
      allowedDomains: ["api.example.com"]
    });
    const f = (url: string) =>
      wf([node("t", "trigger", { type: "manual" }), node("h", "http", { url, headers: { A: "{{ secrets.K }}" } })], [edge("t", "h")]);
    const ok = await client.start(f("https://api.example.com/x"), trig({}, "manual"));
    expect(ok.status).toBe("succeeded");
    expect(http.calls[0].headers.A).toBe(SECRET);
    expect(JSON.stringify(ok)).not.toContain(SECRET);

    const denied = await client.start(f("https://evil.com/x"), trig({}, "manual"));
    expect(denied.status).toBe("failed");
    expect(http.calls).toHaveLength(1);
  });

  test("adapter errors surface as node failures; invalid workflows reject", async () => {
    const email = createMockEmail();
    email.send = async () => {
      throw new Error("smtp down");
    };
    const client = new FlowWorkerClient(memoryWorker(), { email });
    const f = wf([node("t", "trigger", { type: "manual" }), node("e", "email", { to: "a", subject: "b", body: "c" })], [edge("t", "e")]);
    const run = await client.start(f, trig({}, "manual"));
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/smtp down/);

    await expect(client.start(wf([], []), trig())).rejects.toThrow(/Invalid workflow/);
  });
});
