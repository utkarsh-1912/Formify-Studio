import { createMemoryVault, createMockAi, createMockEmail, createMockHttp, createMockWrite } from "../adapters";
import { resumeRun, startRun } from "../executor";
import { validateWorkflow } from "../schema";
import { WORKFLOW_TEMPLATES } from "../templates";

const tpl = (k: string) => WORKFLOW_TEMPLATES.filter((t) => t.key === k)[0];
const deps = () => ({
  sleep: async () => {},
  ai: createMockAi(() => ({ text: "A hot lead" })),
  http: createMockHttp((req) => ({ status: 200, body: { company: "Analytical Engines", url: req.url } })),
  email: createMockEmail(),
  write: createMockWrite(),
  vault: createMemoryVault({ SALES_TOKEN: "tok_abcdef" }),
  allowedDomains: ["hooks.example.com", "api.example.com"]
});

describe("workflow templates", () => {
  test.each(WORKFLOW_TEMPLATES.map((t) => [t.key]))("%s validates", (key) => {
    expect(validateWorkflow(tpl(key).workflow)).toEqual([]);
  });

  test("lead-notify: big budget goes through AI -> http -> email", async () => {
    const d = deps();
    const t = tpl("lead-notify");
    const run = await startRun(t.workflow, { type: "submission", payload: t.sampleTrigger }, d);
    expect(run.status).toBe("succeeded");
    expect(d.email.calls[0]).toEqual({ to: "sales@example.com", subject: "Hot lead: Ada Lovelace", body: "A hot lead" });
    expect(d.http.calls[0].headers.Authorization).toBe("Bearer tok_abcdef");
    expect(d.write.calls).toHaveLength(0);
    expect(JSON.stringify(run)).not.toContain("tok_abcdef");
  });

  test("lead-notify: small budget is only stored", async () => {
    const d = deps();
    const t = tpl("lead-notify");
    const run = await startRun(t.workflow, { type: "submission", payload: { ...t.sampleTrigger, budget: 50 } }, d);
    expect(run.status).toBe("succeeded");
    expect(d.email.calls).toHaveLength(0);
    expect(d.write.calls[0].target).toBe("leads");
  });

  test("approval: waits, then emails the outcome", async () => {
    const d = deps();
    const t = tpl("approval");
    const waiting = await startRun(t.workflow, { type: "submission", payload: t.sampleTrigger }, d);
    expect(waiting.status).toBe("waiting");
    const done = await resumeRun(t.workflow, waiting, d, { type: "approval", nodeId: "a", approved: false });
    expect(done.status).toBe("succeeded");
    expect(d.email.calls[0].subject).toBe("Rejected");
  });

  test("enrichment: uses API data, falls back when the API fails", async () => {
    const d = deps();
    const t = tpl("enrichment");
    const ok = await startRun(t.workflow, { type: "submission", payload: t.sampleTrigger }, d);
    expect(ok.status).toBe("succeeded");
    expect(d.write.calls[0].data).toMatchObject({ company: "Analytical Engines", enriched: true });

    const d2 = { ...deps(), http: createMockHttp(() => ({ status: 500, body: "" })) };
    const fb = await startRun(t.workflow, { type: "submission", payload: t.sampleTrigger }, d2);
    expect(fb.status).toBe("succeeded");
    expect(fb.nodeStates.h.attempts).toBe(2); // retry policy honoured
    expect(d2.write.calls[0].data).toMatchObject({ enriched: false });
  });

  test("bulk-loop: emails every recipient then records the count", async () => {
    const d = deps();
    const t = tpl("bulk-loop");
    const run = await startRun(t.workflow, { type: "manual", payload: t.sampleTrigger }, d);
    expect(run.status).toBe("succeeded");
    expect(d.email.calls.map((c) => c.to)).toEqual(t.sampleTrigger.recipients);
    expect(d.write.calls[0].data).toEqual({ sent: 3 });
  });
});
