"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { createTestRunner, FlowRunner } from "../../flow/testRunner";
import type { Run, TriggerType, Workflow } from "../../flow/types";

interface RunPanelProps {
  workflow: Workflow;
  sampleTrigger: Record<string, any>;
  /** Highlights the chosen run's node states on the canvas. */
  onActiveRunChange?: (run: Run | null) => void;
  /** Disable when the workflow currently has validation issues. */
  canRun: boolean;
}

const STATUS_CHIP: Record<string, string> = {
  succeeded: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  waiting: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  running: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  skipped: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  pending: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
};

const Chip = ({ s }: { s: string }) => (
  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_CHIP[s] || STATUS_CHIP.pending}`}>{s}</span>
);

const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString();

export default function RunPanel({ workflow, sampleTrigger, onActiveRunChange, canRun }: RunPanelProps) {
  const triggerTypes = useMemo(
    () => workflow.nodes.filter((n) => n.type === "trigger").map((n) => String(n.config.type) as TriggerType),
    [workflow.nodes]
  );
  const [triggerType, setTriggerType] = useState<TriggerType>(triggerTypes[0] || "manual");
  const [payloadText, setPayloadText] = useState(() => JSON.stringify(sampleTrigger, null, 2));
  const [domains, setDomains] = useState("api.example.com, hooks.example.com");
  const [useWorker, setUseWorker] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the payload in sync when a different workflow/template is loaded.
  const sampleKey = JSON.stringify(sampleTrigger);
  useEffect(() => {
    setPayloadText(JSON.stringify(sampleTrigger, null, 2));
    setRuns([]);
    setActiveId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleKey, workflow.id]);
  useEffect(() => {
    if (triggerTypes.length && triggerTypes.indexOf(triggerType) === -1) setTriggerType(triggerTypes[0]);
  }, [triggerTypes, triggerType]);

  const [runner, setRunner] = useState<FlowRunner | null>(null);
  useEffect(() => {
    const allowed = domains.split(",").map((d) => d.trim()).filter(Boolean);
    const r = createTestRunner({ allowedDomains: allowed, useWorker });
    setRunner(r);
    return () => r.dispose();
  }, [domains, useWorker]);

  const active = runs.filter((r) => r.id === activeId)[0] || null;
  useEffect(() => onActiveRunChange?.(active), [active, onActiveRunChange]);

  const record = (run: Run) => {
    setRuns((prev) => [run].concat(prev.filter((r) => r.id !== run.id)).slice(0, 20));
    setActiveId(run.id);
  };
  const guard = async (fn: () => Promise<Run>) => {
    if (!runner) return;
    setBusy(true);
    setError(null);
    try {
      record(await fn());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onRun = () => {
    let payload: Record<string, any>;
    try {
      payload = JSON.parse(payloadText);
    } catch (e) {
      setError(`Sample submission is not valid JSON: ${(e as Error).message}`);
      return;
    }
    if (!runner) return;
    guard(() => runner.start(workflow, { type: triggerType, payload }));
  };

  const waitingApprovals = active ? workflow.nodes.filter((n) => n.type === "approval" && active.nodeStates[n.id]?.status === "waiting") : [];
  const waitingTimers = active ? Object.keys(active.nodeStates).filter((id) => active.nodeStates[id].status === "waiting" && active.nodeStates[id].resumeAt !== undefined) : [];

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-sm" data-testid="run-panel">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Test run</h3>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          <input type="checkbox" checked={useWorker} onChange={(e) => setUseWorker(e.target.checked)} />
          Web Worker
        </label>
      </div>

      <label className="text-xs font-medium text-gray-500">
        Trigger
        <select
          className="mt-1 w-full rounded-md border border-gray-300 bg-white p-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          value={triggerType}
          onChange={(e) => setTriggerType(e.target.value as TriggerType)}
        >
          {(triggerTypes.length ? triggerTypes : (["manual"] as TriggerType[])).map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>

      <label className="text-xs font-medium text-gray-500">
        Sample submission (JSON)
        <textarea
          className="mt-1 h-28 w-full rounded-md border border-gray-300 bg-white p-2 font-mono text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          value={payloadText}
          onChange={(e) => setPayloadText(e.target.value)}
          spellCheck={false}
        />
      </label>

      <label className="text-xs font-medium text-gray-500">
        Allowed outbound domains
        <input
          className="mt-1 w-full rounded-md border border-gray-300 bg-white p-1.5 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          value={domains}
          onChange={(e) => setDomains(e.target.value)}
        />
      </label>
      <p className="text-[11px] text-gray-400">Test runs use mock AI, HTTP, email and storage. Nothing leaves your browser.</p>

      <button
        onClick={onRun}
        disabled={busy || !canRun || !runner}
        className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        <Play className="h-4 w-4" /> {busy ? "Running…" : "Run test"}
      </button>
      {!canRun && <p className="text-xs text-red-500">Fix validation issues before running.</p>}
      {error && <p className="rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {active && (
        <div className="rounded-lg border border-gray-200 p-2 dark:border-gray-700" data-testid="active-run">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Chip s={active.status} />
              <span className="text-xs text-gray-500">{active.id.slice(0, 14)}</span>
            </div>
            <button
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
              onClick={() => runner && guard(() => runner.start(workflow, active.trigger))}
              disabled={busy || !canRun}
            >
              <RotateCcw className="h-3 w-3" /> Replay
            </button>
          </div>
          {active.error && <p className="mb-2 text-xs text-red-600">{active.error}</p>}

          {waitingApprovals.map((n) => (
            <div key={n.id} className="mb-2 rounded-md bg-orange-50 p-2 dark:bg-orange-950">
              <div className="mb-1 text-xs font-medium">{n.label || n.id} needs a decision</div>
              <div className="flex gap-2">
                <button
                  className="rounded bg-emerald-600 px-2 py-1 text-xs text-white"
                  onClick={() => guard(() => runner!.resume(workflow, active, { type: "approval", nodeId: n.id, approved: true, by: "tester" }))}
                >
                  Approve
                </button>
                <button
                  className="rounded bg-red-600 px-2 py-1 text-xs text-white"
                  onClick={() => guard(() => runner!.resume(workflow, active, { type: "approval", nodeId: n.id, approved: false, by: "tester" }))}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
          {waitingTimers.length > 0 && (
            <button
              className="mb-2 rounded bg-gray-700 px-2 py-1 text-xs text-white"
              onClick={() => {
                runner?.fastForward();
                guard(() => runner!.resume(workflow, active, { type: "timer" }));
              }}
            >
              Fast-forward delay
            </button>
          )}

          <ol className="space-y-1">
            {workflow.nodes.map((n) => {
              const s = active.nodeStates[n.id];
              if (!s) return null;
              return (
                <li key={n.id} className="rounded-md bg-gray-50 p-1.5 dark:bg-gray-800/60">
                  <details>
                    <summary className="flex cursor-pointer items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">{n.label || n.id}</span>
                      <Chip s={s.status} />
                    </summary>
                    <div className="mt-1 space-y-1 text-[11px]">
                      {s.attempts > 1 && <div className="text-gray-500">attempts: {s.attempts}</div>}
                      {s.error && <div className="text-red-600">{s.error}</div>}
                      {s.input !== undefined && (
                        <pre className="max-h-32 overflow-auto rounded bg-white p-1 dark:bg-gray-900">in: {JSON.stringify(s.input, null, 1)}</pre>
                      )}
                      {s.output !== undefined && (
                        <pre className="max-h-32 overflow-auto rounded bg-white p-1 dark:bg-gray-900">out: {JSON.stringify(s.output, null, 1)}</pre>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">History</h4>
        {runs.length === 0 && <p className="text-xs text-gray-400">No runs yet.</p>}
        <ul className="space-y-1">
          {runs.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setActiveId(r.id)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-800 ${r.id === activeId ? "bg-gray-100 dark:bg-gray-800" : ""}`}
              >
                <span>
                  {fmtTime(r.startedAt)} · {r.trigger.type}
                  {r.replayOf ? " ↻" : ""}
                </span>
                <Chip s={r.status} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
