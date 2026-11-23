"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Blocks,
  Braces,
  Check,
  FileJson,
  GitBranch,
  Eye,
  Minus,
  Share2,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap
} from "lucide-react";
import MarketingShell, { REPO_URL, useCreateWorkspace } from "../components/marketing/MarketingShell";
import { APP_VERSION } from "../utils/version";

const ACCENTS = {
  indigo: { label: "Indigo", value: "#4f46e5" },
  emerald: { label: "Emerald", value: "#059669" },
  rose: { label: "Rose", value: "#e11d48" },
  amber: { label: "Amber", value: "#d97706" }
} as const;
type AccentKey = keyof typeof ACCENTS;
type Radius = "sm" | "lg" | "2xl";
const RADIUS_PX: Record<Radius, string> = { sm: "4px", lg: "10px", "2xl": "18px" };

const FEATURES = [
  {
    icon: Braces,
    title: "One schema, two editors",
    body: "Edit visually or as JSON and watch both stay in sync. The schema is versioned and validated, so what you write is what renders.",
    tag: null
  },
  {
    icon: GitBranch,
    title: "Logic without code",
    body: "Show, hide or require fields with expressions. Add calculated fields, multi-step pages and typed values (numbers stay numbers).",
    tag: null
  },
  {
    icon: Blocks,
    title: "Export anywhere",
    body: "Get standalone HTML, a React component or a <formify-form> web component. The exports run the same logic as the studio.",
    tag: null
  },
  {
    icon: Sparkles,
    title: "AI that proposes, you decide",
    body: "Describe a form in plain English and review the changes as a diff before anything is applied. Can run on-device with WebGPU, or use your own model endpoint.",
    tag: "Beta · off by default"
  },
  {
    icon: Workflow,
    title: "Workflows after submit",
    body: "Branch, call webhooks, wait for approval and notify teammates on a node canvas. Test runs use mocks, so nothing is sent while you build.",
    tag: "Beta · experimental"
  },
  {
    icon: Share2,
    title: "Live collaboration",
    body: "Edit together over peer-to-peer connections with conflict-free merging, or point to your own self-hosted server for shared storage.",
    tag: null
  }
];

const STEPS = [
  { n: "1", title: "Describe", body: "Start from a template, drag fields in, paste JSON, or ask the AI assistant for a first draft." },
  { n: "2", title: "Refine", body: "Add conditions, calculations and steps. Style it live with themes, spacing and accent colors." },
  { n: "3", title: "Ship", body: "Export code, share a live link, or wire a workflow that routes each submission where it should go." }
];

const COMPARE = [
  { row: "Form definition", hosted: "Stored in the vendor's app", library: "JSON or code you maintain", formify: "Open, versioned JSON schema" },
  { row: "Visual builder", hosted: "Yes", library: "Usually separate or paid", formify: "Built in, synced with JSON" },
  { row: "Where data lives", hosted: "Vendor's cloud", library: "Your app", formify: "Your browser by default; self-host optional" },
  { row: "AI assistance", hosted: "Vendor-hosted", library: "Not included", formify: "On-device or your endpoint (beta)" },
  { row: "Workflows", hosted: "Integrations marketplace", library: "You build it", formify: "Node canvas, same schema (beta)" },
  { row: "Code export", hosted: "Embed only", library: "Native", formify: "HTML, React, web component" }
];

function Sandbox() {
  const [accent, setAccent] = useState<AccentKey>("indigo");
  const [radius, setRadius] = useState<Radius>("lg");
  const [isTeam, setIsTeam] = useState(false);
  const [tab, setTab] = useState<"preview" | "schema">("preview");
  const color = ACCENTS[accent].value;
  const r = RADIUS_PX[radius];

  const schema = {
    schemaVersion: 1,
    formTitle: "Request a demo",
    fields: [
      { id: "email", type: "email", label: "Work email", required: true },
      { id: "isTeam", type: "checkbox", label: "I'm requesting for a team" },
      { id: "seats", type: "number", label: "Team size", visibleIf: "isTeam == true", requiredIf: "isTeam == true" }
    ]
  };

  const inputStyle: React.CSSProperties = { borderRadius: r };
  const inputCls =
    "w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1";

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 py-3">
        <span className="text-xs font-semibold text-slate-500">Try it: tick the box</span>
        <div role="tablist" aria-label="Demo view" className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-semibold">
          {(
            [
              ["preview", "Preview", Eye],
              ["schema", "Schema", FileJson]
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 cursor-pointer ${
                tab === id ? "bg-white dark:bg-slate-950 shadow-sm text-slate-900 dark:text-white" : "text-slate-500"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 min-h-[330px]">
        {tab === "preview" ? (
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()} aria-label="Demo form">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Request a demo</h3>
            <div>
              <label htmlFor="demo-email" className="mb-1 block text-sm font-medium">Work email</label>
              <input id="demo-email" type="email" placeholder="you@company.com" className={inputCls} style={{ ...inputStyle, outlineColor: color }} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isTeam} onChange={(e) => setIsTeam(e.target.checked)} style={{ accentColor: color }} className="h-4 w-4" />
              I'm requesting for a team
            </label>
            {isTeam && (
              <div>
                <label htmlFor="demo-seats" className="mb-1 block text-sm font-medium">Team size</label>
                <input id="demo-seats" type="number" min={1} placeholder="12" className={inputCls} style={{ ...inputStyle, outlineColor: color }} />
              </div>
            )}
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white cursor-pointer" style={{ background: color, borderRadius: r }}>
              Submit
            </button>
          </form>
        ) : (
          <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs leading-relaxed text-slate-200" aria-label="Schema JSON">
            <code>{JSON.stringify(schema, null, 2)}</code>
          </pre>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 px-5 py-3">
        <fieldset className="flex items-center gap-2">
          <legend className="sr-only">Accent color</legend>
          <span className="text-xs font-semibold text-slate-500" aria-hidden="true">Accent</span>
          {(Object.keys(ACCENTS) as AccentKey[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-label={ACCENTS[k].label}
              aria-pressed={accent === k}
              onClick={() => setAccent(k)}
              className={`h-6 w-6 rounded-full cursor-pointer ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-900 ${accent === k ? "ring-2 ring-slate-900 dark:ring-white" : ""}`}
              style={{ background: ACCENTS[k].value }}
            />
          ))}
        </fieldset>
        <fieldset className="flex items-center gap-2">
          <legend className="sr-only">Corner radius</legend>
          <span className="text-xs font-semibold text-slate-500" aria-hidden="true">Corners</span>
          {(["sm", "lg", "2xl"] as Radius[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={radius === k}
              onClick={() => setRadius(k)}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                radius === k ? "border-slate-900 dark:border-white text-slate-900 dark:text-white" : "border-slate-300 dark:border-slate-700 text-slate-500"
              }`}
            >
              {k === "sm" ? "Sharp" : k === "lg" ? "Soft" : "Round"}
            </button>
          ))}
        </fieldset>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const createWorkspace = useCreateWorkspace();
  const [room, setRoom] = useState("");

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const id = room.trim().toLowerCase();
    if (/^[a-z0-9]+$/.test(id)) router.push(`/ws/${id}`);
  };
  const roomValid = room.trim() === "" || /^[a-z0-9]+$/i.test(room.trim());

  return (
    <MarketingShell>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-200 dark:border-slate-800">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-60 dark:opacity-40 [background:radial-gradient(60%_50%_at_20%_0%,rgba(99,102,241,.18),transparent),radial-gradient(40%_40%_at_90%_10%,rgba(14,165,233,.14),transparent)]"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div className="space-y-7">
            <p className="inline-flex items-center gap-2 rounded-full border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              <Zap className="h-3.5 w-3.5" aria-hidden="true" />
              Local-first · Open schema · v{APP_VERSION}
            </p>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl lg:text-6xl [text-wrap:balance]">
              Build forms and workflows from one JSON schema.
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-slate-600 dark:text-slate-400">
              Design visually or in code, add logic, draft with optional on-device AI, and automate what happens after submit. Your data stays in your browser unless you choose otherwise.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={createWorkspace}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 cursor-pointer"
              >
                Create a workspace <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-xl border border-slate-300 dark:border-slate-700 px-6 py-3.5 text-sm font-bold hover:bg-slate-100 dark:hover:bg-slate-900"
              >
                View source
              </a>
            </div>
            <form onSubmit={join} className="flex max-w-md items-start gap-2" aria-label="Join an existing workspace">
              <div className="flex-1">
                <label htmlFor="room" className="sr-only">Workspace ID</label>
                <input
                  id="room"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  placeholder="Have a workspace ID? Join it"
                  autoComplete="off"
                  aria-invalid={!roomValid}
                  aria-describedby={roomValid ? undefined : "room-err"}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm"
                />
                {!roomValid && (
                  <p id="room-err" role="alert" className="mt-1 text-xs text-rose-600">Use letters and numbers only.</p>
                )}
              </div>
              <button type="submit" className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer">
                Join
              </button>
            </form>
          </div>
          <Sandbox />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">Everything a form needs, nothing it doesn't</h2>
          <p className="mt-3 text-slate-600 dark:text-slate-400">A solid builder at the core, with newer capabilities clearly marked while they mature.</p>
        </div>
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <li key={f.title} className="reveal rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-6">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  {f.tag && (
                    <span className="rounded-full bg-amber-100 dark:bg-amber-950/60 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                      {f.tag}
                    </span>
                  )}
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-900 dark:text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{f.body}</p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 border-y border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">From idea to live form in three steps</h2>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="reveal">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-indigo-600 text-sm font-bold text-white" aria-hidden="true">{s.n}</span>
                <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Compare */}
      <section id="compare" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">Where Formify fits</h2>
        <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-400">
          General differences between product categories, not a claim about any single product.
        </p>
        <div className="mt-10 overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Comparison of hosted form builders, form libraries and Formify Studio</caption>
            <thead className="bg-slate-50 dark:bg-slate-900 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">&nbsp;</th>
                <th scope="col" className="px-4 py-3 font-semibold">Hosted form builders</th>
                <th scope="col" className="px-4 py-3 font-semibold">Form libraries</th>
                <th scope="col" className="px-4 py-3 font-semibold text-indigo-600 dark:text-indigo-300">Formify Studio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {COMPARE.map((c) => (
                <tr key={c.row}>
                  <th scope="row" className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{c.row}</th>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{c.hosted}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{c.library}</td>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{c.formify}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Trust */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="grid gap-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-8 md:grid-cols-2 md:p-12">
          <div>
            <ShieldCheck className="h-8 w-8 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <h2 className="mt-4 text-2xl font-extrabold text-slate-900 dark:text-white">Private by default, honest about the edges</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Forms and submissions are stored in your browser. Some optional features reach the network, and we say exactly which in the privacy page.
            </p>
            <a href="/privacy" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 dark:text-indigo-300 hover:underline">
              Read what leaves your device <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
          <ul className="space-y-3 text-sm">
            {[
              ["Stored locally", "Schemas and submissions live in IndexedDB on your device."],
              ["Edit links are not security", "They are a convenience in the browser. Enforced roles need the optional server."],
              ["AI is opt-in", "Off until you enable it. On-device generation downloads a model first."]
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span><strong className="text-slate-900 dark:text-white">{t}.</strong> <span className="text-slate-600 dark:text-slate-400">{d}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-slate-200 dark:border-slate-800 bg-indigo-600">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 py-16 text-center sm:px-6">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl [text-wrap:balance]">Start with a blank schema or a template</h2>
          <p className="max-w-xl text-indigo-100">No account, no install. Create a workspace and have a working form in a minute.</p>
          <button
            type="button"
            onClick={createWorkspace}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-indigo-700 hover:bg-indigo-50 cursor-pointer"
          >
            Create a workspace <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </section>
    </MarketingShell>
  );
}
