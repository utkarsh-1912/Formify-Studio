"use client";

import React from "react";
import { Handle, Node, NodeProps, Position } from "@xyflow/react";
import { Database, GitBranch, Globe, Mail, Play, Repeat, Shuffle, Sparkles, Timer, UserCheck, Zap } from "lucide-react";
import type { FlowNode, NodeStatus, NodeType } from "../../flow/types";

export interface FlowNodeData extends Record<string, unknown> {
  node: FlowNode;
  status?: NodeStatus;
  hasIssue?: boolean;
}

export type FlowRFNode = Node<FlowNodeData, "flowNode">;

export const NODE_META: Record<NodeType, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  trigger: { label: "Trigger", icon: Zap, color: "text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-300" },
  condition: { label: "Condition", icon: GitBranch, color: "text-violet-600 bg-violet-50 dark:bg-violet-950 dark:text-violet-300" },
  transform: { label: "Transform", icon: Shuffle, color: "text-sky-600 bg-sky-50 dark:bg-sky-950 dark:text-sky-300" },
  ai: { label: "AI step", icon: Sparkles, color: "text-fuchsia-600 bg-fuchsia-50 dark:bg-fuchsia-950 dark:text-fuchsia-300" },
  http: { label: "HTTP", icon: Globe, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300" },
  delay: { label: "Delay", icon: Timer, color: "text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-300" },
  approval: { label: "Approval", icon: UserCheck, color: "text-orange-600 bg-orange-50 dark:bg-orange-950 dark:text-orange-300" },
  loop: { label: "Loop", icon: Repeat, color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950 dark:text-indigo-300" },
  email: { label: "Email", icon: Mail, color: "text-rose-600 bg-rose-50 dark:bg-rose-950 dark:text-rose-300" },
  write: { label: "Write", icon: Database, color: "text-teal-600 bg-teal-50 dark:bg-teal-950 dark:text-teal-300" }
};

/** Output handles per node type. Handle id === edge branch ("default" = no branch). */
export function outputHandles(node: FlowNode): string[] {
  const base =
    node.type === "condition" ? ["true", "false"] : node.type === "approval" ? ["approved", "rejected"] : node.type === "loop" ? ["each", "done"] : ["default"];
  return node.onError === "continue" ? base.concat("error") : base;
}

const STATUS_STYLE: Record<NodeStatus, string> = {
  pending: "border-gray-300 dark:border-gray-600",
  running: "border-blue-500 ring-2 ring-blue-300",
  waiting: "border-orange-500 ring-2 ring-orange-300",
  succeeded: "border-emerald-500 ring-2 ring-emerald-200",
  failed: "border-red-500 ring-2 ring-red-300",
  skipped: "border-gray-300 opacity-50 dark:border-gray-600"
};

function summary(node: FlowNode): string {
  const c = node.config || {};
  switch (node.type) {
    case "trigger":
      return String(c.type || "");
    case "condition":
      return String(c.expression || "");
    case "http":
      return `${c.method || "GET"} ${c.url || ""}`;
    case "ai":
      return String(c.prompt || "");
    case "email":
      return String(c.to || "");
    case "write":
      return String(c.target || "");
    case "loop":
      return String(c.items || "");
    case "delay":
      return `${c.ms ?? ""} ms`;
    default:
      return "";
  }
}

export default function FlowNodeCard({ data, selected }: NodeProps<FlowRFNode>) {
  const { node, status, hasIssue } = data;
  const meta = NODE_META[node.type] || { label: node.type, icon: Play, color: "" };
  const Icon = meta.icon;
  const handles = outputHandles(node);
  const border = status ? STATUS_STYLE[status] : selected ? "border-blue-500" : "border-gray-200 dark:border-gray-700";

  return (
    <div
      className={`w-52 rounded-xl border-2 bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100 ${border} ${selected ? "shadow-md" : ""}`}
      data-testid={`flow-node-${node.id}`}
    >
      {node.type !== "trigger" && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center gap-2 px-3 py-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${meta.color}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{node.label || meta.label}</div>
          <div className="truncate text-[11px] text-gray-500 dark:text-gray-400">{summary(node) || meta.label}</div>
        </div>
        {hasIssue && (
          <span title="This node has validation issues" className="text-xs font-bold text-red-500">
            !
          </span>
        )}
      </div>
      {status && <div className="border-t border-gray-100 px-3 py-1 text-[10px] uppercase tracking-wide text-gray-500 dark:border-gray-800">{status}</div>}
      {handles.map((h, i) => {
        const top = `${((i + 1) / (handles.length + 1)) * 100}%`;
        return (
          <React.Fragment key={h}>
            <Handle type="source" position={Position.Right} id={h} style={{ top }} />
            {handles.length > 1 && (
              <span
                className="pointer-events-none absolute right-3 -translate-y-1/2 text-[9px] font-medium text-gray-400"
                style={{ top }}
              >
                {h}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
