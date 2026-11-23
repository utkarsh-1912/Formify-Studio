import React from "react";
import { Braces, Cpu, GitBranch, HardDrive } from "lucide-react";
import { REPO_URL } from "../../../components/marketing/MarketingShell";

const PRINCIPLES = [
  {
    icon: Braces,
    title: "The schema is the product",
    body: "Every form is an open, versioned JSON document. The visual builder, the renderer, the exports and the workflows all read the same file, so nothing is locked inside a proprietary editor."
  },
  {
    icon: HardDrive,
    title: "Local first, server optional",
    body: "Forms and submissions are stored in your browser. A self-hostable server is available when you need shared storage, enforced roles and webhooks, and it is never required."
  },
  {
    icon: Cpu,
    title: "AI you can inspect",
    body: "The assistant proposes changes as a reviewable diff and never edits your form on its own. It can run on-device, against a local model server, or against an endpoint you provide."
  },
  {
    icon: GitBranch,
    title: "Honest about maturity",
    body: "The builder, logic engine and exports are the core. AI authoring and workflows are marked beta because they have not had the same real-world mileage yet."
  }
];

export const metadata = { title: "About", description: "Why Formify Studio exists and the principles behind it." };

export default function AboutPage() {
  return (
    <>
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-300">About</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl [text-wrap:balance]">
          Forms should be data you own, not a settings page you rent.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-400">
          Formify Studio is an open-source, local-first studio for building forms and the workflows behind them. It started as a way to turn JSON into a form and grew into a small platform around that idea.
        </p>

        <ul className="mt-14 grid gap-5 sm:grid-cols-2">
          {PRINCIPLES.map((p) => {
            const Icon = p.icon;
            return (
              <li key={p.title} className="reveal rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className="mt-4 text-base font-bold text-slate-900 dark:text-white">{p.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{p.body}</p>
              </li>
            );
          })}
        </ul>

        <div className="mt-14 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-6 sm:p-8">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Built in the open</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            The code, the roadmap and the open issues are public. Bug reports, ideas and pull requests are welcome.
          </p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-semibold text-white dark:text-slate-900 hover:opacity-90"
          >
            Browse the repository
          </a>
        </div>
      </div>
    </>
  );
}
