"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Connection,
  Controls,
  Edge,
  MarkerType,
  MiniMap,
  OnEdgesChange,
  OnNodesChange,
  ReactFlow
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Trash2 } from "lucide-react";
import { validateWorkflow } from "../../flow/schema";
import { NODE_TYPES, FlowNode, NodeType, Run, Workflow } from "../../flow/types";
import FlowNodeCard, { FlowRFNode, NODE_META } from "./FlowNodeCard";
import RunPanel from "./RunPanel";

const nodeTypes = { flowNode: FlowNodeCard };

/** xyflow passes either a plain array or a Changeset, depending on version. */
const asList = (changes: any): any[] => (Array.isArray(changes) ? changes : changes.toArray());

export const DEFAULT_CONFIG: Record<NodeType, Record<string, any>> = {
  trigger: { type: "manual" },
  condition: { expression: "true" },
  transform: { values: {} },
  ai: { prompt: "Summarize: {{ trigger }}" },
  http: { method: "GET", url: "https://api.example.com/" },
  delay: { ms: 1000 },
  approval: { message: "Approve?" },
  loop: { items: "trigger.items" },
  email: { to: "someone@example.com", subject: "Subject", body: "Body" },
  write: { target: "collection", data: "{{ trigger }}" }
};

/** Pure helpers (exported for tests). */
export function addNodeTo(wf: Workflow, type: NodeType): Workflow {
  let i = 1;
  while (wf.nodes.some((n) => n.id === `${type}_${i}`)) i++;
  const count = wf.nodes.length;
  const node: FlowNode = {
    id: `${type}_${i}`,
    type,
    config: JSON.parse(JSON.stringify(DEFAULT_CONFIG[type])),
    position: { x: 60 + (count % 4) * 40, y: 60 + count * 70 }
  };
  return { ...wf, nodes: wf.nodes.concat(node) };
}

export function removeNodeFrom(wf: Workflow, id: string): Workflow {
  return {
    ...wf,
    nodes: wf.nodes.filter((n) => n.id !== id),
    edges: wf.edges.filter((e) => e.source !== id && e.target !== id)
  };
}

export function connectNodes(wf: Workflow, source: string, target: string, sourceHandle?: string | null): Workflow {
  const branch = sourceHandle && sourceHandle !== "default" ? sourceHandle : undefined;
  const id = `${source}${branch ? ":" + branch : ""}->${target}`;
  if (wf.edges.some((e) => e.id === id)) return wf;
  return { ...wf, edges: wf.edges.concat({ id, source, target, ...(branch ? { branch } : {}) }) };
}

interface FlowCanvasProps {
  workflow: Workflow;
  onChange: (wf: Workflow) => void;
  sampleTrigger?: Record<string, any>;
  className?: string;
}

function NodeInspector({ node, onUpdate, onDelete }: { node: FlowNode; onUpdate: (n: FlowNode) => void; onDelete: () => void }) {
  const [text, setText] = useState(() => JSON.stringify(node.config, null, 2));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setText(JSON.stringify(node.config, null, 2));
    setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  const input =
    "mt-1 w-full rounded-md border border-gray-300 bg-white p-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100";
  const num = (v: string) => (v === "" ? undefined : Number(v));

  return (
    <div className="space-y-3 p-3 text-sm" data-testid="inspector">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{NODE_META[node.type].label}</h3>
        <button onClick={onDelete} className="flex items-center gap-1 text-xs text-red-600 hover:underline" aria-label="Delete node">
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>
      <label className="block text-xs font-medium text-gray-500">
        Id
        <input className={input} value={node.id} readOnly />
      </label>
      <label className="block text-xs font-medium text-gray-500">
        Label
        <input className={input} value={node.label || ""} onChange={(e) => onUpdate({ ...node, label: e.target.value || undefined })} />
      </label>
      <label className="block text-xs font-medium text-gray-500">
        Config (JSON)
        <textarea
          className={`${input} h-44 font-mono text-xs`}
          value={text}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            try {
              const parsed = JSON.parse(text);
              if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Config must be a JSON object");
              setErr(null);
              onUpdate({ ...node, config: parsed });
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        />
      </label>
      {err && <p className="text-xs text-red-600">{err}</p>}
      {node.type !== "trigger" && (
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs font-medium text-gray-500">
            Attempts
            <input
              type="number"
              min={1}
              max={10}
              className={input}
              value={node.retry?.attempts ?? 1}
              onChange={(e) => {
                const attempts = Math.max(1, Math.min(10, Number(e.target.value) || 1));
                onUpdate({ ...node, retry: attempts > 1 ? { attempts, backoffMs: node.retry?.backoffMs } : undefined });
              }}
            />
          </label>
          <label className="text-xs font-medium text-gray-500">
            Backoff ms
            <input
              type="number"
              min={0}
              className={input}
              value={node.retry?.backoffMs ?? ""}
              disabled={!node.retry}
              onChange={(e) => node.retry && onUpdate({ ...node, retry: { ...node.retry, backoffMs: num(e.target.value) } })}
            />
          </label>
          <label className="text-xs font-medium text-gray-500">
            Timeout ms
            <input type="number" min={1} className={input} value={node.timeoutMs ?? ""} placeholder="30000" onChange={(e) => onUpdate({ ...node, timeoutMs: num(e.target.value) })} />
          </label>
        </div>
      )}
      {node.type !== "trigger" && (
        <label className="block text-xs font-medium text-gray-500">
          On error
          <select className={input} value={node.onError || "fail"} onChange={(e) => onUpdate({ ...node, onError: e.target.value === "continue" ? "continue" : undefined })}>
            <option value="fail">Fail the run</option>
            <option value="continue">Continue via “error” branch</option>
          </select>
        </label>
      )}
    </div>
  );
}

export default function FlowCanvas({ workflow, onChange, sampleTrigger = {}, className = "h-[680px]" }: FlowCanvasProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"inspect" | "run">("inspect");
  const [activeRun, setActiveRun] = useState<Run | null>(null);

  const issues = useMemo(() => validateWorkflow(workflow), [workflow]);
  const issueNodes = useMemo(() => {
    const s: Record<string, boolean> = {};
    issues.forEach((i) => i.nodeId && (s[i.nodeId] = true));
    return s;
  }, [issues]);

  const rfNodes: FlowRFNode[] = useMemo(
    () =>
      workflow.nodes.map((n, i) => ({
        id: n.id,
        type: "flowNode" as const,
        position: n.position || { x: 40 + i * 30, y: 40 + i * 90 },
        selected: n.id === selectedId,
        data: { node: n, status: activeRun?.nodeStates[n.id]?.status, hasIssue: !!issueNodes[n.id] }
      })),
    [workflow.nodes, selectedId, activeRun, issueNodes]
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      workflow.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.branch || "default",
        label: e.branch,
        markerEnd: { type: MarkerType.ArrowClosed }
      })),
    [workflow.edges]
  );

  const onNodesChange: OnNodesChange<FlowRFNode> = useCallback(
    (changes) => {
      let next = workflow;
      asList(changes).forEach((ch) => {
        if (ch.type === "position" && ch.position) {
          const pos = ch.position;
          next = { ...next, nodes: next.nodes.map((n) => (n.id === ch.id ? { ...n, position: pos } : n)) };
        } else if (ch.type === "remove") {
          next = removeNodeFrom(next, ch.id);
          if (selectedId === ch.id) setSelectedId(null);
        }
      });
      if (next !== workflow) onChange(next);
    },
    [workflow, onChange, selectedId]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      const removed: Record<string, boolean> = {};
      asList(changes).forEach((c) => c.type === "remove" && (removed[c.id] = true));
      if (Object.keys(removed).length) onChange({ ...workflow, edges: workflow.edges.filter((e) => !removed[e.id]) });
    },
    [workflow, onChange]
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) onChange(connectNodes(workflow, c.source, c.target, c.sourceHandle));
    },
    [workflow, onChange]
  );

  const selected = workflow.nodes.filter((n) => n.id === selectedId)[0];

  return (
    <div className={`flex w-full overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-950 ${className}`} data-testid="flow-canvas">
      {/* Palette */}
      <aside className="w-40 shrink-0 space-y-1 overflow-y-auto border-r border-gray-200 p-2 dark:border-gray-700">
        <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Add node</div>
        {NODE_TYPES.map((t) => {
          const Icon = NODE_META[t].icon;
          return (
            <button
              key={t}
              onClick={() => onChange(addNodeTo(workflow, t))}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              aria-label={`Add ${NODE_META[t].label} node`}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{NODE_META[t].label}</span>
              <Plus className="h-3 w-3 text-gray-400" />
            </button>
          );
        })}
      </aside>

      {/* Canvas */}
      <div className="relative min-w-0 flex-1">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => {
            setSelectedId(n.id);
            setTab("inspect");
          }}
          onPaneClick={() => setSelectedId(null)}
          deleteKeyCode={["Backspace", "Delete"]}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
        {issues.length > 0 && (
          <div className="absolute left-3 top-3 max-h-40 max-w-sm overflow-auto rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800 shadow dark:border-red-900 dark:bg-red-950 dark:text-red-200" role="alert" data-testid="issues">
            <div className="mb-1 font-semibold">{issues.length} issue{issues.length > 1 ? "s" : ""}</div>
            <ul className="space-y-0.5">
              {issues.map((i, k) => (
                <li key={k}>
                  {i.nodeId ? (
                    <button className="text-left underline-offset-2 hover:underline" onClick={() => { setSelectedId(i.nodeId!); setTab("inspect"); }}>
                      {i.message}
                    </button>
                  ) : (
                    i.message
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Right panel */}
      <aside className="flex w-80 shrink-0 flex-col border-l border-gray-200 dark:border-gray-700">
        <div className="flex border-b border-gray-200 text-sm dark:border-gray-700" role="tablist">
          {(["inspect", "run"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`flex-1 px-3 py-2 font-medium ${tab === t ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500"}`}
            >
              {t === "inspect" ? "Node" : "Test run"}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "inspect" ? (
            selected ? (
              <NodeInspector
                key={selected.id}
                node={selected}
                onUpdate={(n) => onChange({ ...workflow, nodes: workflow.nodes.map((x) => (x.id === n.id ? n : x)) })}
                onDelete={() => {
                  onChange(removeNodeFrom(workflow, selected.id));
                  setSelectedId(null);
                }}
              />
            ) : (
              <p className="p-3 text-sm text-gray-500">Select a node to edit it, or drag from a node’s right handle to connect.</p>
            )
          ) : (
            <RunPanel workflow={workflow} sampleTrigger={sampleTrigger} onActiveRunChange={setActiveRun} canRun={issues.length === 0} />
          )}
        </div>
      </aside>
    </div>
  );
}
