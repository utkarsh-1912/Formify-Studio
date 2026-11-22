import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { addNodeTo, connectNodes, DEFAULT_CONFIG, removeNodeFrom } from "../FlowCanvas";
import RunPanel from "../RunPanel";
import { validateWorkflow } from "../../../flow/schema";
import { createTestRunner } from "../../../flow/testRunner";
import { NODE_TYPES } from "../../../flow/types";
import { WORKFLOW_TEMPLATES } from "../../../flow/templates";

const approval = WORKFLOW_TEMPLATES.filter((t) => t.key === "approval")[0];
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe("editor graph helpers", () => {
  test("addNodeTo creates unique ids and default configs for every node type", () => {
    let w = clone(approval.workflow);
    NODE_TYPES.forEach((t) => {
      w = addNodeTo(w, t);
      w = addNodeTo(w, t);
    });
    const ids = w.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(DEFAULT_CONFIG).sort()).toEqual(NODE_TYPES.slice().sort());
  });

  test("removeNodeFrom drops the node and its edges", () => {
    const w = removeNodeFrom(clone(approval.workflow), "a");
    expect(w.nodes.some((n) => n.id === "a")).toBe(false);
    expect(w.edges.some((e) => e.source === "a" || e.target === "a")).toBe(false);
  });

  test("connectNodes maps handle ids to branches and ignores duplicates", () => {
    const base = { ...clone(approval.workflow), edges: [] };
    const w1 = connectNodes(base, "a", "ok", "approved");
    expect(w1.edges).toEqual([{ id: "a:approved->ok", source: "a", target: "ok", branch: "approved" }]);
    expect(connectNodes(w1, "a", "ok", "approved")).toBe(w1);
    const w2 = connectNodes(base, "t", "a", "default");
    expect(w2.edges[0].branch).toBeUndefined();
  });

  test("a freshly added unconnected node is reported by validation", () => {
    const w = addNodeTo(clone(approval.workflow), "email");
    expect(validateWorkflow(w).some((i) => /no incoming edge/.test(i.message))).toBe(true);
  });
});

describe("test runner", () => {
  test("main-thread runner executes mocks, enforces the allowlist and fast-forwards delays", async () => {
    const lead = WORKFLOW_TEMPLATES.filter((t) => t.key === "lead-notify")[0];
    const open = createTestRunner({ allowedDomains: ["hooks.example.com"] });
    expect((await open.start(lead.workflow, { type: "submission", payload: lead.sampleTrigger })).status).toBe("succeeded");
    const closed = createTestRunner({ allowedDomains: [] });
    expect((await closed.start(lead.workflow, { type: "submission", payload: lead.sampleTrigger })).status).toBe("failed");

    const delayed = clone(approval.workflow);
    delayed.nodes = delayed.nodes.filter((n) => n.id === "t").concat({ id: "d", type: "delay", config: { ms: 3_600_000 } });
    delayed.edges = [{ id: "t->d", source: "t", target: "d" }];
    const r = createTestRunner({ allowedDomains: [] });
    const waiting = await r.start(delayed, { type: "submission", payload: {} });
    expect(waiting.status).toBe("waiting");
    r.fastForward();
    expect((await r.resume(delayed, waiting, { type: "timer" })).status).toBe("succeeded");
  });
});

describe("RunPanel", () => {
  test("runs the sample submission, shows the waiting approval and resolves it", async () => {
    render(<RunPanel workflow={clone(approval.workflow)} sampleTrigger={approval.sampleTrigger} canRun />);
    const runBtn = await screen.findByRole("button", { name: /run test/i });
    await waitFor(() => expect(runBtn).not.toBeDisabled());
    fireEvent.click(runBtn);

    expect(await screen.findByText(/needs a decision/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(screen.getAllByText("succeeded").length).toBeGreaterThan(0));
    expect(screen.queryByText(/needs a decision/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No runs yet/i)).not.toBeInTheDocument(); // history now has an entry
  });

  test("invalid sample JSON is reported instead of crashing", async () => {
    render(<RunPanel workflow={clone(approval.workflow)} sampleTrigger={approval.sampleTrigger} canRun />);
    const runBtn = await screen.findByRole("button", { name: /run test/i });
    await waitFor(() => expect(runBtn).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText(/sample submission/i), { target: { value: "{nope" } });
    fireEvent.click(runBtn);
    expect(await screen.findByText(/not valid JSON/i)).toBeInTheDocument();
  });

  test("run is disabled while the workflow has validation issues", async () => {
    render(<RunPanel workflow={clone(approval.workflow)} sampleTrigger={approval.sampleTrigger} canRun={false} />);
    expect(await screen.findByRole("button", { name: /run test/i })).toBeDisabled();
  });
});
