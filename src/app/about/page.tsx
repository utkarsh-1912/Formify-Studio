"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Info, Users, ShieldAlert, Cpu, Heart, Check, ArrowLeft } from "lucide-react";

export default function AboutPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const updateTheme = (isDarkTheme: boolean) => {
        if (isDarkTheme) {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      };

      updateTheme(mediaQuery.matches);

      const handler = (e: MediaQueryListEvent) => {
        updateTheme(e.matches);
      };

      mediaQuery.addEventListener("change", handler);
      return () => {
        mediaQuery.removeEventListener("change", handler);
        document.documentElement.classList.remove("dark");
      };
    }
  }, []);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100 flex flex-col justify-between font-sans selection:bg-blue-600 selection:text-white overflow-y-auto relative">
      {/* Background gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/5 dark:bg-blue-900/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/5 dark:bg-purple-900/10 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="max-w-6xl w-full mx-auto px-4 py-4 sm:px-6 sm:py-6 flex justify-between items-center z-10 border-b border-slate-200 dark:border-slate-900">
        <button
          onClick={() => router.push("/")}
          className="flex items-center space-x-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-white transition-all focus:outline-none cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Home</span>
        </button>
        <div className="flex items-center space-x-3">
          <img src="/logo-long.png" alt="Formify Logo" className="h-7 sm:h-8 dark:invert" />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl w-full mx-auto px-4 py-10 sm:px-6 sm:py-16 z-10 flex-1 space-y-10 sm:space-y-12">
        <div className="space-y-3 sm:space-y-4 text-center">
          <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">About Formify Studio</h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-xl mx-auto leading-relaxed">
            Formify Studio is a local-first, serverless dynamic form generator and developer export environment designed to accelerate development workflows.
          </p>
        </div>

        {/* Brand Mission */}
        <div className="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-6 sm:p-8 space-y-3 sm:space-y-4 shadow-sm">
          <div className="flex items-center space-x-3 text-blue-600 dark:text-blue-400">
            <Heart className="h-5 w-5 sm:h-6 sm:w-6 animate-pulse" />
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Our Mission</h3>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Our goal is to build tools that prioritize developer convenience and user privacy. Traditional form creation requires setting up tables, schemas, validation APIs, and custom layouts which consumes valuable time. Formify Studio automates this by providing a real-time visual-to-JSON mapper that exports clean, standalone, tailwind-styled code in seconds.
          </p>
        </div>

        {/* Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3 shadow-sm">
            <div className="p-2.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl w-fit">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Zero Server Data Footprint</h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Formify Studio retains zero user form schemas or submit responses on remote databases. Everything resides in your local browser sandbox, putting privacy back in the hands of users and teams.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3 shadow-sm">
            <div className="p-2.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-xl w-fit">
              <Cpu className="h-5 w-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Instant WebRTC P2P Sync</h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Collaborate live using decentralized WebRTC connections. Sync and pair program your forms with teammates in real-time without database synchronization delay.
            </p>
          </div>
        </div>

        {/* Developer Perks List */}
        <div className="space-y-4 pt-2 sm:pt-4">
          <h4 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Why Developers Choose Formify</h4>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-350">
            {[
              "Bidirectional JSON & Visual Syncing",
              "Production-Ready React & Tailwind Exports",
              "Submissions Logging & CSV Downloads",
              "Lightweight Local-First Configurations",
              "Corporate, Dark, and Matrix Styling presets",
              "Client-side Validation Schema Integrity"
            ].map((perk, i) => (
              <li key={i} className="flex items-center space-x-2">
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <span>{perk}</span>
              </li>
            ))}
          </ul>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl w-full mx-auto px-4 py-4 sm:px-6 sm:py-6 text-center text-xs text-slate-500 dark:text-slate-500 border-t border-slate-200 dark:border-slate-900/60 z-10">
        &copy; {new Date().getFullYear()} Formify Studio.
      </footer>
    </div>
  );
}
