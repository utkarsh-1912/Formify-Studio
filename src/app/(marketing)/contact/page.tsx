"use client";

import React from "react";
import { Bug, GitPullRequest, Lightbulb } from "lucide-react";
import MarketingShell, { REPO_URL } from "../../components/marketing/MarketingShell";

const CHANNELS = [
  {
    icon: Bug,
    title: "Report a bug",
    body: "Include the steps to reproduce, your browser, and the schema JSON if it is involved.",
    href: `${REPO_URL}/issues/new`,
    cta: "Open an issue"
  },
  {
    icon: Lightbulb,
    title: "Suggest a feature",
    body: "Describe the problem you are trying to solve before the solution you have in mind.",
    href: `${REPO_URL}/issues/new`,
    cta: "Start a request"
  },
  {
    icon: GitPullRequest,
    title: "Contribute",
    body: "Pull requests are welcome. Run the typecheck and tests before you open one.",
    href: REPO_URL,
    cta: "View the repository"
  }
];

export default function ContactPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-300">Contact</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl">Get in touch</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-400">
          Formify Studio is an open-source project. The best way to reach us is on GitHub, where questions and fixes stay visible to everyone who hits the same problem.
        </p>

        <ul className="mt-12 grid gap-5 sm:grid-cols-3">
          {CHANNELS.map((c) => {
            const Icon = c.icon;
            return (
              <li key={c.title} className="flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className="mt-4 text-base font-bold text-slate-900 dark:text-white">{c.title}</h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{c.body}</p>
                <a
                  href={c.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex w-fit text-sm font-semibold text-indigo-600 dark:text-indigo-300 hover:underline"
                >
                  {c.cta} <span aria-hidden="true">&nbsp;&rarr;</span>
                </a>
              </li>
            );
          })}
        </ul>

        <p className="mt-10 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-200">
          Please do not post private data, API keys or real submissions in public issues.
        </p>
      </div>
    </MarketingShell>
  );
}
