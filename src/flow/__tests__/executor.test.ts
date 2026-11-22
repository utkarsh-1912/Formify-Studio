import { createMemoryVault, createMockAi, createMockEmail, createMockHttp, createMockWrite } from "../adapters";
import { replayRun, resumeRun, startRun } from "../executor";
import { edge, fastDeps, node, trig, wf } from "./helpers";

describe("branching", () => {
  const flow = wf(
    [
      node("t", "trigger", { type: "submission" }),
      node("c", "condition", { expression: "number(trigger.budget) > 100" }),
      node("big", "write", { target: "big", data: "{{ trigger }}" }),
      node("small", "write", { target: "small", data: "{{ trigger }}" })
    ],
    [edge("t", "c"), edge("c", "big", "true"), edge("c", "small", "false")]
  );

  test("takes the true branch and skips the other", async () => {
    const write = createMockWrite();
    const run = await startRun(flow, trig({ budget: "500" }), { ...fastDeps, write });
    expect(run.status).toBe("succeeded");
    expect(run.nodeStates.c.output).toEqual({ result: true });
    expect(run.nodeStates.big.status).toBe("succeeded");
    expect(run.nodeStates.small.status).toBe("skipped");
    expect(write.calls).toEqual([{ target: "big", data: { budget: "500" } }]);
  });

  test("takes the false branch", async () => {
    const write = createMockWrite();
    const run = await startRun(flow, trig({ budget: 5 }), { ...fastDeps, write });
    expect(run.nodeStates.big.status).toBe("skipped");
    expect(run.nodeStates.small.status).toBe("succeeded");
    expect(write.calls[0].target).toBe("small");
  });

  test("join node runs when any incoming branch is live", async () => {
    const f = wf(
      [
        node("t", "trigger", { type: "submission" }),
        node("c", "condition", { expression: "trigger.x" }),
        node("a", "transform", { values: { v: "a" } }),
        node("b", "transform", { values: { v: "b" } }),
        node("j", "transform", { values: { done: true } })
      ],
      [edge("t", "c"), edge("c", "a", "true"), edge("c", "b", "false"), edge("a", "j"), edge("b", "j")]
    );
    const run = await startRun(f, trig({ x: false }), fastDeps);
    expect(run.status).toBe("succeeded");
    expect(run.nodeStates.a.status).toBe("skipped");
    expect(run.nodeStates.j.status).toBe("succeeded");
  });

  test("node outputs are available to later nodes", async () => {
    const f = wf(
      [
        node("t", "trigger", { type: "submission" }),
        node("x", "transform", { values: { full: "{{ trigger.first }} {{ trigger.last }}" } }),
        node("y", "transform", { expression: "upper(nodes.x.full)" })
      ],
      [edge("t", "x"), edge("x", "y")]
    );
    const run = await startRun(f, trig({ first: "Ada", last: "Lovelace" }), fastDeps);
    expect(run.nodeStates.y.output).toBe("ADA LOVELACE");
  });
});

describe("triggers", () => {
  test("fails the run when no trigger matches the event", async () => {
    const f = wf([node("t", "trigger", { type: "webhook" })], []);
    const run = await startRun(f, trig({}, "submission"), fastDeps);
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/No trigger/);
  });

  test("field_changed filters by field name", async () => {
    const f = wf(
      [node("t", "trigger", { type: "field_changed", field: "email" }), node("x", "transform", { values: { ok: 1 } })],
      [edge("t", "x")]
    );
    expect((await startRun(f, trig({ field: "name" }, "field_changed"), fastDeps)).status).toBe("failed");
    expect((await startRun(f, trig({ field: "email" }, "field_changed"), fastDeps)).status).toBe("succeeded");
  });

  test("only the matching trigger's branch runs", async () => {
    const f = wf(
      [
        node("t1", "trigger", { type: "submission" }),
        node("t2", "trigger", { type: "manual" }),
        node("a", "transform", { values: { a: 1 } }),
        node("b", "transform", { values: { b: 1 } })
      ],
      [edge("t1", "a"), edge("t2", "b")]
    );
    const run = await startRun(f, trig({}, "manual"), fastDeps);
    expect(run.nodeStates.a.status).toBe("skipped");
    expect(run.nodeStates.b.status).toBe("succeeded");
  });
});

describe("loops", () => {
  const flow = wf(
    [
      node("t", "trigger", { type: "manual" }),
      node("l", "loop", { items: "trigger.emails" }),
      node("m", "email", { to: "{{ item }}", subject: "Hi #{{ index }}", body: "x" }),
      node("w", "write", { target: "log", data: { sent: "{{ nodes.l.count }}" } })
    ],
    [edge("t", "l"), edge("l", "m", "each"), edge("l", "w", "done")]
  );

  test("runs the body once per item, then continues via done", async () => {
    const email = createMockEmail();
    const write = createMockWrite();
    const run = await startRun(flow, trig({ emails: ["a@x.io", "b@x.io", "c@x.io"] }, "manual"), { ...fastDeps, email, write });
    expect(run.status).toBe("succeeded");
    expect(email.calls.map((c) => c.to)).toEqual(["a@x.io", "b@x.io", "c@x.io"]);
    expect(email.calls.map((c) => c.subject)).toEqual(["Hi #0", "Hi #1", "Hi #2"]);
    expect(write.calls).toEqual([{ target: "log", data: { sent: 3 } }]);
    expect(run.nodeStates.l.output.count).toBe(3);
    expect(run.nodeStates.l.output.results).toHaveLength(3);
    expect(run.log.filter((l) => l.nodeId === "m" && l.status === "succeeded").map((l) => l.iteration)).toEqual([[0], [1], [2]]);
  });

  test("empty list skips the body but still runs done", async () => {
    const email = createMockEmail();
    const write = createMockWrite();
    const run = await startRun(flow, trig({ emails: [] }, "manual"), { ...fastDeps, email, write });
    expect(run.status).toBe("succeeded");
    expect(email.calls).toHaveLength(0);
    expect(run.nodeStates.m.status).toBe("skipped");
    expect(write.calls[0].data).toEqual({ sent: 0 });
  });

  test("a failing iteration fails the loop and the run", async () => {
    const email = createMockEmail();
    email.send = async (m) => {
      if (m.to === "bad") throw new Error("smtp down");
      return {};
    };
    const run = await startRun(flow, trig({ emails: ["ok", "bad", "never"] }, "manual"), { ...fastDeps, email, write: createMockWrite() });
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/Iteration 1 failed at 'm'.*smtp down/);
    expect(run.nodeStates.l.status).toBe("failed");
    expect(run.nodeStates.w.status).toBe("skipped");
  });

  test("non-array items fail clearly", async () => {
    const run = await startRun(flow, trig({ emails: "nope" }, "manual"), { ...fastDeps, email: createMockEmail() });
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/must evaluate to an array/);
  });

  test("maxIterations guard", async () => {
    const f = wf(
      [node("t", "trigger", { type: "manual" }), node("l", "loop", { items: "trigger.n", maxIterations: 2 }), node("x", "transform", { values: { a: 1 } })],
      [edge("t", "l"), edge("l", "x", "each")]
    );
    const run = await startRun(f, trig({ n: [1, 2, 3] }, "manual"), fastDeps);
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/maxIterations/);
  });

  test("nested loops expose inner item/index and iteration paths", async () => {
    const f = wf(
      [
        node("t", "trigger", { type: "manual" }),
        node("outer", "loop", { items: "trigger.rows" }),
        node("inner", "loop", { items: "item" }),
        node("e", "email", { to: "{{ item }}", subject: "s", body: "b" })
      ],
      [edge("t", "outer"), edge("outer", "inner", "each"), edge("inner", "e", "each")]
    );
    const email = createMockEmail();
    const run = await startRun(f, trig({ rows: [["a", "b"], ["c"]] }, "manual"), { ...fastDeps, email });
    expect(run.status).toBe("succeeded");
    expect(email.calls.map((c) => c.to)).toEqual(["a", "b", "c"]);
    expect(run.log.filter((l) => l.nodeId === "e" && l.status === "succeeded").map((l) => l.iteration)).toEqual([
      [0, 0],
      [0, 1],
      [1, 0]
    ]);
  });
});

describe("failure, retry and timeout", () => {
  const single = (type: any, config: any, extra: any = {}) =>
    wf([node("t", "trigger", { type: "submission" }), node("n", type, config, extra), node("after", "transform", { values: { ok: 1 } })], [edge("t", "n"), edge("n", "after")]);

  test("failure fails the run and skips the rest", async () => {
    const run = await startRun(single("ai", { prompt: "hi" }), trig(), fastDeps); // no ai provider
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/No AI provider/);
    expect(run.nodeStates.n.status).toBe("failed");
    expect(run.nodeStates.after.status).toBe("skipped");
    expect(run.endedAt).toBeDefined();
  });

  test("retries a flaky node with backoff and succeeds", async () => {
    let calls = 0;
    const ai = createMockAi(() => {
      if (++calls < 3) throw new Error("flaky");
      return { text: "ok" };
    });
    const sleeps: number[] = [];
    const run = await startRun(single("ai", { prompt: "hi" }, { retry: { attempts: 3, backoffMs: 100 } }), trig(), {
      ai,
      sleep: async (ms: number) => void sleeps.push(ms)
    });
    expect(run.status).toBe("succeeded");
    expect(run.nodeStates.n.attempts).toBe(3);
    expect(sleeps).toEqual([100, 200]);
  });

  test("gives up after the configured attempts", async () => {
    const ai = createMockAi(() => {
      throw new Error("always");
    });
    const run = await startRun(single("ai", { prompt: "hi" }, { retry: { attempts: 2 } }), trig(), { ai, sleep: async () => {} });
    expect(run.status).toBe("failed");
    expect(run.nodeStates.n.attempts).toBe(2);
  });

  test("times out a hanging node", async () => {
    const ai = { generate: () => new Promise<never>(() => {}) };
    const run = await startRun(single("ai", { prompt: "hi" }, { timeoutMs: 20 }), trig(), { ai });
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/Timed out after 20ms/);
  });

  test("onError=continue routes through the error branch only", async () => {
    const f = wf(
      [
        node("t", "trigger", { type: "submission" }),
        node("h", "http", { url: "https://api.example.com/x" }, { onError: "continue" }),
        node("ok", "transform", { values: { v: "ok" } }),
        node("err", "transform", { values: { v: "handled" } })
      ],
      [edge("t", "h"), edge("h", "ok"), edge("h", "err", "error")]
    );
    const http = createMockHttp(() => ({ status: 500, body: "boom" }));
    const run = await startRun(f, trig(), { ...fastDeps, http, allowedDomains: ["api.example.com"] });
    expect(run.status).toBe("succeeded");
    expect(run.nodeStates.h.status).toBe("failed");
    expect(run.nodeStates.ok.status).toBe("skipped");
    expect(run.nodeStates.err.output).toEqual({ v: "handled" });
  });

  test("expression errors at runtime are non-retryable failures", async () => {
    const f = wf(
      [node("t", "trigger", { type: "submission" }), node("c", "condition", { expression: "trigger.x.constructor" }, { retry: { attempts: 5 } })],
      [edge("t", "c")]
    );
    // fails validation? no: syntax is fine, runtime access is blocked
    const run = await startRun(f, trig({ x: {} }), fastDeps);
    expect(run.status).toBe("failed");
    expect(run.nodeStates.c.attempts).toBe(1);
  });

  test("step limit stops runaway runs", async () => {
    const run = await startRun(single("transform", { values: {} }), trig(), { ...fastDeps, maxSteps: 1 });
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/Step limit/);
  });
});

describe("approval pause / resume", () => {
  const flow = wf(
    [
      node("t", "trigger", { type: "submission" }),
      node("a", "approval", { message: "ok?" }),
      node("yes", "email", { to: "{{ trigger.who }}", subject: "approved", body: "b" }),
      node("no", "email", { to: "{{ trigger.who }}", subject: "rejected", body: "b" }),
      node("side", "transform", { values: { independent: true } })
    ],
    [edge("t", "a"), edge("a", "yes", "approved"), edge("a", "no", "rejected"), edge("t", "side")]
  );

  test("pauses at the approval node while independent branches still run", async () => {
    const run = await startRun(flow, trig({ who: "me@x.io" }), { ...fastDeps, email: createMockEmail() });
    expect(run.status).toBe("waiting");
    expect(run.endedAt).toBeUndefined();
    expect(run.nodeStates.a.status).toBe("waiting");
    expect(run.nodeStates.side.status).toBe("succeeded");
    expect(run.nodeStates.yes.status).toBe("pending");
  });

  test("approve -> approved branch runs, rejected branch skipped", async () => {
    const email = createMockEmail();
    const deps = { ...fastDeps, email };
    const waiting = await startRun(flow, trig({ who: "me@x.io" }), deps);
    const done = await resumeRun(flow, waiting, deps, { type: "approval", nodeId: "a", approved: true, by: "boss" });
    expect(done.status).toBe("succeeded");
    expect(done.nodeStates.a.output).toEqual({ approved: true, by: "boss", comment: undefined });
    expect(done.nodeStates.yes.status).toBe("succeeded");
    expect(done.nodeStates.no.status).toBe("skipped");
    expect(email.calls.map((c) => c.subject)).toEqual(["approved"]);
    // original is untouched (resume returns a new object)
    expect(waiting.status).toBe("waiting");
  });

  test("reject -> rejected branch", async () => {
    const email = createMockEmail();
    const deps = { ...fastDeps, email };
    const waiting = await startRun(flow, trig({ who: "me@x.io" }), deps);
    const done = await resumeRun(flow, waiting, deps, { type: "approval", nodeId: "a", approved: false });
    expect(email.calls.map((c) => c.subject)).toEqual(["rejected"]);
    expect(done.nodeStates.yes.status).toBe("skipped");
  });

  test("a resumed run does not re-execute completed nodes", async () => {
    const email = createMockEmail();
    const deps = { ...fastDeps, email };
    const waiting = await startRun(flow, trig({ who: "me@x.io" }), deps);
    const sideStart = waiting.nodeStates.side.startedAt;
    const done = await resumeRun(flow, waiting, deps, { type: "approval", nodeId: "a", approved: true });
    expect(done.nodeStates.side.startedAt).toBe(sideStart);
    expect(done.log.filter((l) => l.nodeId === "side" && l.status === "running")).toHaveLength(1);
  });

  test("resume survives JSON serialization of the run", async () => {
    const deps = { ...fastDeps, email: createMockEmail() };
    const waiting = await startRun(flow, trig({ who: "me@x.io" }), deps);
    const restored = JSON.parse(JSON.stringify(waiting));
    const done = await resumeRun(flow, restored, deps, { type: "approval", nodeId: "a", approved: true });
    expect(done.status).toBe("succeeded");
  });

  test("rejects invalid resumes", async () => {
    const deps = { ...fastDeps, email: createMockEmail() };
    const waiting = await startRun(flow, trig({ who: "m" }), deps);
    await expect(resumeRun(flow, waiting, deps, { type: "approval", nodeId: "side", approved: true })).rejects.toThrow(/not waiting for approval/);
    const done = await resumeRun(flow, waiting, deps, { type: "approval", nodeId: "a", approved: true });
    await expect(resumeRun(flow, done, deps, { type: "approval", nodeId: "a", approved: true })).rejects.toThrow(/not waiting/);
  });

  test("a failure after resume fails the run", async () => {
    // no email adapter -> yes branch fails after approval
    const waiting = await startRun(flow, trig({ who: "m" }), fastDeps);
    const done = await resumeRun(flow, waiting, fastDeps, { type: "approval", nodeId: "a", approved: true });
    expect(done.status).toBe("failed");
    expect(done.error).toMatch(/No email adapter/);
  });
});

describe("delay", () => {
  const flow = wf(
    [node("t", "trigger", { type: "submission" }), node("d", "delay", { ms: "{{ trigger.ms }}" }), node("x", "transform", { values: { after: true } })],
    [edge("t", "d"), edge("d", "x")]
  );

  test("short delays sleep inline", async () => {
    const sleeps: number[] = [];
    const run = await startRun(flow, trig({ ms: 250 }), { sleep: async (ms: number) => void sleeps.push(ms) });
    expect(run.status).toBe("succeeded");
    expect(sleeps).toEqual([250]);
  });

  test("long delays pause the run until the timer is due", async () => {
    let t = 1_000_000;
    const deps = { ...fastDeps, now: () => t, maxInlineDelayMs: 1000 };
    const waiting = await startRun(flow, trig({ ms: 60_000 }), deps);
    expect(waiting.status).toBe("waiting");
    expect(waiting.nodeStates.d.resumeAt).toBe(1_060_000);

    t = 1_030_000;
    const notYet = await resumeRun(flow, waiting, deps, { type: "timer" });
    expect(notYet.status).toBe("waiting");

    t = 1_060_001;
    const done = await resumeRun(flow, notYet, deps, { type: "timer" });
    expect(done.status).toBe("succeeded");
    expect(done.nodeStates.x.status).toBe("succeeded");
  });

  test("negative or invalid delays fail", async () => {
    const run = await startRun(flow, trig({ ms: -5 }), fastDeps);
    expect(run.status).toBe("failed");
  });
});

describe("outbound allowlist", () => {
  const flow = (url: string) =>
    wf([node("t", "trigger", { type: "submission" }), node("h", "http", { url, method: "POST", body: { a: 1 } }, { retry: { attempts: 3 } })], [edge("t", "h")]);

  test("denies hosts that are not allowlisted, without retrying or calling the client", async () => {
    const http = createMockHttp();
    const run = await startRun(flow("https://evil.example.org/x"), trig(), { ...fastDeps, http, allowedDomains: ["api.example.com"] });
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/not in the outbound allowlist/);
    expect(run.nodeStates.h.attempts).toBe(1);
    expect(http.calls).toHaveLength(0);
  });

  test("denies everything when the allowlist is empty or missing", async () => {
    const http = createMockHttp();
    expect((await startRun(flow("https://api.example.com"), trig(), { ...fastDeps, http })).error).toMatch(/No outbound domains/);
    expect((await startRun(flow("https://api.example.com"), trig(), { ...fastDeps, http, allowedDomains: [] })).status).toBe("failed");
    expect(http.calls).toHaveLength(0);
  });

  test("allows exact hosts and wildcard subdomains (but not the bare domain or look-alikes)", async () => {
    const http = createMockHttp();
    const deps = { ...fastDeps, http, allowedDomains: ["api.example.com", "*.trusted.io"] };
    expect((await startRun(flow("https://api.example.com/a"), trig(), deps)).status).toBe("succeeded");
    expect((await startRun(flow("https://hooks.trusted.io/a"), trig(), deps)).status).toBe("succeeded");
    expect((await startRun(flow("https://trusted.io/a"), trig(), deps)).status).toBe("failed");
    expect((await startRun(flow("https://evil-trusted.io/a"), trig(), deps)).status).toBe("failed");
    expect((await startRun(flow("https://api.example.com.evil.com/a"), trig(), deps)).status).toBe("failed");
    expect(http.calls).toHaveLength(2);
  });

  test("blocks embedded credentials, odd protocols and invalid urls", async () => {
    const deps = { ...fastDeps, http: createMockHttp(), allowedDomains: ["api.example.com"] };
    expect((await startRun(flow("https://user:pw@api.example.com/"), trig(), deps)).error).toMatch(/credentials/);
    expect((await startRun(flow("file:///etc/passwd"), trig(), deps)).error).toMatch(/Protocol/);
    expect((await startRun(flow("not a url"), trig(), deps)).error).toMatch(/Invalid URL/);
  });

  test("allowlist is applied to templated urls after resolution", async () => {
    const http = createMockHttp();
    const f = flow("https://{{ trigger.host }}/x");
    const deps = { ...fastDeps, http, allowedDomains: ["api.example.com"] };
    expect((await startRun(f, trig({ host: "api.example.com" }), deps)).status).toBe("succeeded");
    expect((await startRun(f, trig({ host: "169.254.169.254" }), deps)).status).toBe("failed");
  });

  test("http 4xx is not retried, 5xx is", async () => {
    let n = 0;
    const http = createMockHttp(() => {
      n++;
      return { status: 503, body: "" };
    });
    const deps = { ...fastDeps, http, allowedDomains: ["api.example.com"] };
    await startRun(flow("https://api.example.com"), trig(), deps);
    expect(n).toBe(3);
    n = 0;
    const http4 = createMockHttp(() => {
      n++;
      return { status: 404, body: "" };
    });
    await startRun(flow("https://api.example.com"), trig(), { ...fastDeps, http: http4, allowedDomains: ["api.example.com"] });
    expect(n).toBe(1);
  });
});

describe("secrets", () => {
  const flow = wf(
    [
      node("t", "trigger", { type: "submission" }),
      node("h", "http", { url: "https://api.example.com/x?k={{ secrets.KEY }}", headers: { Authorization: "Bearer {{ secrets.KEY }}" } }),
      node("after", "transform", { expression: "nodes.h.body.echo" })
    ],
    [edge("t", "h"), edge("h", "after")]
  );
  const SECRET = "s3cr3t-token-value";

  test("secrets reach the http client but never appear in the run record", async () => {
    const http = createMockHttp((req) => ({ status: 200, body: { echo: `server saw ${req.headers.Authorization}` } }));
    const run = await startRun(flow, trig(), { ...fastDeps, http, vault: createMemoryVault({ KEY: SECRET }), allowedDomains: ["api.example.com"] });
    expect(run.status).toBe("succeeded");
    expect(http.calls[0].headers.Authorization).toBe(`Bearer ${SECRET}`);
    expect(http.calls[0].url).toContain(SECRET);
    expect(JSON.stringify(run)).not.toContain(SECRET);
    expect(JSON.stringify(run)).toContain("[REDACTED]");
  });

  test("secrets are redacted from error messages too", async () => {
    const http = createMockHttp(() => {
      throw new Error(`connect failed for ${SECRET}`);
    });
    const run = await startRun(flow, trig(), { ...fastDeps, http, vault: createMemoryVault({ KEY: SECRET }), allowedDomains: ["api.example.com"] });
    expect(run.status).toBe("failed");
    expect(JSON.stringify(run)).not.toContain(SECRET);
  });

  test("a missing secret fails without calling out", async () => {
    const http = createMockHttp();
    const run = await startRun(flow, trig(), { ...fastDeps, http, vault: createMemoryVault({}), allowedDomains: ["api.example.com"] });
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/Missing secret 'KEY'/);
    expect(http.calls).toHaveLength(0);
  });

  test("secrets cannot be referenced from non-http nodes (validation)", async () => {
    const f = wf([node("t", "trigger", { type: "submission" }), node("ai", "ai", { prompt: "leak {{ secrets.KEY }}" })], [edge("t", "ai")]);
    await expect(startRun(f, trig(), { ...fastDeps, ai: createMockAi() })).rejects.toThrow(/Secrets may only be referenced from http/);
  });
});

describe("ai node + replay", () => {
  test("passes the resolved prompt and schema to the provider", async () => {
    const ai = createMockAi(() => ({ score: 9 }));
    const f = wf(
      [node("t", "trigger", { type: "submission" }), node("a", "ai", { prompt: "Rate {{ trigger.name }}", system: "be brief", schema: { type: "object" } })],
      [edge("t", "a")]
    );
    const run = await startRun(f, trig({ name: "Ada" }), { ai });
    expect(ai.calls[0]).toEqual({ prompt: "Rate Ada", system: "be brief", schema: { type: "object" } });
    expect(run.nodeStates.a.output).toEqual({ score: 9 });
  });

  test("replay re-runs the same trigger with a new id linked to the original", async () => {
    const f = wf([node("t", "trigger", { type: "submission" }), node("x", "transform", { expression: "trigger.n * 2" })], [edge("t", "x")]);
    const first = await startRun(f, trig({ n: 4 }), fastDeps);
    const again = await replayRun(f, first, fastDeps);
    expect(again.id).not.toBe(first.id);
    expect(again.replayOf).toBe(first.id);
    expect(again.nodeStates.x.output).toBe(8);
  });

  test("invalid workflows are rejected before running", async () => {
    const cyc = wf(
      [node("t", "trigger", { type: "submission" }), node("a", "transform", { values: {} }), node("b", "transform", { values: {} })],
      [edge("t", "a"), edge("a", "b"), edge("b", "a")]
    );
    await expect(startRun(cyc, trig(), fastDeps)).rejects.toThrow(/cycle/);
  });
});
