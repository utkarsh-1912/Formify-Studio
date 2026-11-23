"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Menu, Moon, Sun, X } from "lucide-react";

export const REPO_URL = "https://github.com/utkarsh-1912/Formify-Studio";

type ThemePref = "system" | "light" | "dark";
const THEME_KEY = "formify_marketing_theme";

const NAV = [
  { href: "/#features", label: "Features" },
  { href: "/#how", label: "How it works" },
  { href: "/#compare", label: "Compare" },
  { href: "/privacy", label: "Privacy" },
  { href: "/about", label: "About" }
];

/** Creates a fresh workspace and opens it. The edit token is a client-side convenience, not access control. */
export function useCreateWorkspace() {
  const router = useRouter();
  return () => {
    const id = Math.random().toString(36).substring(2, 10);
    const token = "tok_" + Math.random().toString(36).substring(2, 15);
    router.push(`/ws/${id}?token=${token}`);
  };
}

function readPref(): ThemePref {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** Shared chrome for public pages: theme sync, skip link, sticky nav, footer. */
export default function MarketingShell({ children }: { children: React.ReactNode }) {
  const createWorkspace = useCreateWorkspace();
  const [pref, setPref] = useState<ThemePref>("system");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setPref(readPref()), []);

  // Apply light/dark to <html> (Tailwind `dark` class + native UI via color-scheme); restore on leave.
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = pref === "dark" || (pref === "system" && mq.matches);
      root.classList.toggle("dark", dark);
      root.style.colorScheme = dark ? "dark" : "light";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      root.classList.remove("dark");
      root.style.colorScheme = "";
    };
  }, [pref]);

  const toggleTheme = () => {
    const dark = document.documentElement.classList.contains("dark");
    const next: ThemePref = dark ? "light" : "dark";
    setPref(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage unavailable: the choice just will not persist */
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-800 dark:bg-slate-950 dark:text-slate-200 font-sans selection:bg-indigo-600 selection:text-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/85 dark:bg-slate-950/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500">
            <img src="/logo-long.png" alt="Formify Studio" className="h-8 w-auto" />
          </Link>

          <nav aria-label="Primary" className="hidden lg:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-400">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="hover:text-indigo-600 dark:hover:text-white transition-colors">
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle light and dark theme"
              className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer"
            >
              <Sun className="h-4 w-4 hidden dark:block" aria-hidden="true" />
              <Moon className="h-4 w-4 dark:hidden" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={createWorkspace}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 cursor-pointer"
            >
              Launch Studio <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="lg:hidden grid h-9 w-9 place-items-center rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav id="mobile-nav" aria-label="Mobile" className="lg:hidden border-t border-slate-200 dark:border-slate-800 px-4 py-3 flex flex-col gap-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-900"
              >
                {n.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={createWorkspace}
              className="mt-1 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white cursor-pointer"
            >
              Launch Studio
            </button>
          </nav>
        )}
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
          <div className="md:col-span-2 space-y-3">
            <img src="/logo-long.png" alt="Formify Studio" className="h-7 w-auto" />
            <p className="max-w-sm text-sm text-slate-600 dark:text-slate-400">
              A local-first form and workflow studio built on one open JSON schema.
            </p>
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Product</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href="/#features" className="hover:text-indigo-600 dark:hover:text-white">Features</Link></li>
              <li><Link href="/#how" className="hover:text-indigo-600 dark:hover:text-white">How it works</Link></li>
              <li><Link href="/#compare" className="hover:text-indigo-600 dark:hover:text-white">Compare</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Project</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href={REPO_URL} className="hover:text-indigo-600 dark:hover:text-white" target="_blank" rel="noopener noreferrer">Source on GitHub</a></li>
              <li><Link href="/about" className="hover:text-indigo-600 dark:hover:text-white">About</Link></li>
              <li><Link href="/privacy" className="hover:text-indigo-600 dark:hover:text-white">Privacy</Link></li>
              <li><Link href="/contact" className="hover:text-indigo-600 dark:hover:text-white">Contact</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-slate-200 dark:border-slate-800 py-5 text-center text-xs text-slate-500">
          &copy; {new Date().getFullYear()} Formify Studio
        </div>
      </footer>
    </div>
  );
}
