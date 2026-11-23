"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import MarketingShell, { useCreateWorkspace } from "../components/marketing/MarketingShell";

export default function NotFound() {
  const createWorkspace = useCreateWorkspace();
  return (
    <MarketingShell>
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center sm:px-6">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300">
          <Compass className="h-7 w-7" aria-hidden="true" />
        </span>
        <p className="mt-6 text-sm font-semibold text-indigo-600 dark:text-indigo-300">Error 404</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl">Page not found</h1>
        <p className="mt-4 text-slate-600 dark:text-slate-400">
          That page doesn't exist, or the workspace link has a typo. Workspace IDs use letters and numbers only.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="rounded-xl border border-slate-300 dark:border-slate-700 px-5 py-3 text-sm font-bold hover:bg-slate-100 dark:hover:bg-slate-900">
            Back to home
          </Link>
          <button
            type="button"
            onClick={createWorkspace}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-500 cursor-pointer"
          >
            Create a workspace <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </MarketingShell>
  );
}
