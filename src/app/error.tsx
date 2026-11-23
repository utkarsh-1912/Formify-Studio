"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import MarketingShell from "../components/marketing/MarketingShell";

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Runtime error caught by Next.js error boundary:", error);
  }, [error]);

  return (
    <MarketingShell>
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center sm:px-6" role="alert">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-300">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl">Something went wrong</h1>
        <p className="mt-4 text-slate-600 dark:text-slate-400">
          An unexpected error stopped this page from loading. Your saved forms are stored in your browser and are not affected.
        </p>
        {error.digest && <p className="mt-3 font-mono text-xs text-slate-500">Reference: {error.digest}</p>}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-500 cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
          </button>
          <Link href="/" className="rounded-xl border border-slate-300 dark:border-slate-700 px-5 py-3 text-sm font-bold hover:bg-slate-100 dark:hover:bg-slate-900">
            Back to home
          </Link>
        </div>
      </div>
    </MarketingShell>
  );
}
