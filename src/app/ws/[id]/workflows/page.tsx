"use client";

import React, { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import FlowCanvas from "../../../../components/flow/FlowCanvas";
import { migrateWorkflow } from "../../../../flow/schema";
import { WORKFLOW_TEMPLATES } from "../../../../flow/templates";
import type { Workflow } from "../../../../flow/types";

/**
 * Experimental workflow editor. Feature-flagged: set NEXT_PUBLIC_FORMIFY_WORKFLOWS=1
 * or opt in from this page (stored in localStorage).
 */
const FLAG_KEY = "formify_flag_workflows";

const safeGet = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
};

const cloneTemplate = (key: string) => {
  const t = WORKFLOW_TEMPLATES.filter((x) => x.key === key)[0] || WORKFLOW_TEMPLATES[0];
  return { workflow: JSON.parse(JSON.stringify(t.workflow)) as Workflow, sample: t.sampleTrigger };
};

export default function WorkflowsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  if (!/^[a-z0-9]+$/i.test(id)) notFound();

  const storageKey = `formify_workflows_${id}`;
  const [mounted, setMounted] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [templateKey, setTemplateKey] = useState(WORKFLOW_TEMPLATES[0].key);
  const [sample, setSample] = useState<Record<string, any>>(WORKFLOW_TEMPLATES[0].sampleTrigger);

  useEffect(() => {
    setMounted(true);
    setEnabled(process.env.NEXT_PUBLIC_FORMIFY_WORKFLOWS === "1" || safeGet(FLAG_KEY) === "1");
    const stored = safeGet(storageKey);
    if (stored) {
      try {
        const parsed = migrateWorkflow(JSON.parse(stored));
        // Structurally broken data falls back to a template; semantic issues are shown in the editor.
        if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
          setWorkflow(parsed);
          return;
        }
      } catch {
        /* fall through */
      }
    }
    const t = cloneTemplate(WORKFLOW_TEMPLATES[0].key);
    setWorkflow(t.workflow);
    setSample(t.sample);
  }, [storageKey]);

  const update = (wf: Workflow) => {
    setWorkflow(wf);
    safeSet(storageKey, JSON.stringify(wf));
  };

  const loadTemplate = (key: string) => {
    setTemplateKey(key);
    const t = cloneTemplate(key);
    setSample(t.sample);
    update(t.workflow);
  };

  const exportJson = useMemo(
    () => () => {
      if (!workflow) return;
      const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${workflow.name.replace(/\W+/g, "-").toLowerCase() || "workflow"}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [workflow]
  );

  if (!mounted) return <div className="p-8 text-sm text-gray-500">Loading…</div>;

  if (!enabled) {
    return (
      <main className="mx-auto max-w-lg p-8 text-center">
        <h1 className="mb-2 text-xl font-semibold">Workflows (experimental)</h1>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          The workflow editor is behind a feature flag. Test runs use mock AI, HTTP and email, so nothing is sent anywhere.
        </p>
        <button
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          onClick={() => {
            safeSet(FLAG_KEY, "1");
            setEnabled(true);
          }}
        >
          Enable workflows
        </button>
        <div className="mt-4">
          <Link href={`/ws/${id}`} className="text-sm text-blue-600 hover:underline">
            Back to workspace
          </Link>
        </div>
      </main>
    );
  }

  if (!workflow) return null;

  return (
    <main className="mx-auto max-w-[1600px] space-y-3 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <Link href={`/ws/${id}`} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Workspace
        </Link>
        <input
          aria-label="Workflow name"
          className="min-w-[12rem] rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold hover:border-gray-300 focus:border-blue-500 focus:outline-none dark:hover:border-gray-700"
          value={workflow.name}
          onChange={(e) => update({ ...workflow, name: e.target.value || "Untitled workflow" })}
        />
        <div className="ml-auto flex items-center gap-2 text-sm">
          <label className="flex items-center gap-2 text-gray-500">
            Template
            <select
              className="rounded-md border border-gray-300 bg-white p-1.5 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              value={templateKey}
              onChange={(e) => {
                if (window.confirm("Replace the current workflow with this template?")) loadTemplate(e.target.value);
              }}
            >
              {WORKFLOW_TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <button onClick={exportJson} className="flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1.5 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800">
            <Download className="h-4 w-4" /> Export JSON
          </button>
        </div>
      </header>
      <FlowCanvas workflow={workflow} onChange={update} sampleTrigger={sample} className="h-[calc(100vh-9rem)] min-h-[520px]" />
    </main>
  );
}
