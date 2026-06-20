"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HelpCircle, ArrowLeft, Plus } from "lucide-react";

export default function NotFound() {
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
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100 flex flex-col justify-between font-sans selection:bg-blue-600 selection:text-white relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/5 dark:bg-blue-900/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/5 dark:bg-purple-900/10 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="max-w-6xl w-full mx-auto px-4 py-4 sm:px-6 sm:py-6 flex justify-between items-center z-10">
        <div className="flex items-center space-x-3">
          <img src="/logo-long.png" alt="Formify Logo" className="h-7 sm:h-8 dark:invert" />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md w-full mx-auto px-4 py-10 sm:px-6 sm:py-16 text-center z-10 flex-1 flex flex-col justify-center space-y-6 sm:space-y-8">
        <div className="space-y-3 sm:space-y-4">
          <div className="inline-flex items-center justify-center p-4 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-3xl mb-2 animate-bounce">
            <HelpCircle className="h-9 w-9 sm:h-10 sm:w-10" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">404 - Page Not Found</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
            The workspace page or document link you requested could not be found. It may have expired or the workspace ID is typed incorrectly.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => router.push("/")}
            className="flex items-center justify-center space-x-2 py-3 px-5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-all shadow-sm focus:outline-none text-slate-700 dark:text-slate-350"
          >
            <ArrowLeft className="h-4 w-4 text-slate-500" />
            <span>Back to Home</span>
          </button>
          <button
            onClick={() => {
              const randomId = Math.random().toString(36).substring(2, 10);
              router.push(`/ws/${randomId}`);
            }}
            className="flex items-center justify-center space-x-2 py-3 px-5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl cursor-pointer transition-all shadow-md shadow-blue-600/10 dark:shadow-blue-600/20 focus:outline-none"
          >
            <Plus className="h-4 w-4" />
            <span>Create New Canvas</span>
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl w-full mx-auto px-4 py-4 sm:px-6 sm:py-6 text-center text-xs text-slate-500 dark:text-slate-500 border-t border-slate-200 dark:border-slate-900/60 z-10">
        &copy; {new Date().getFullYear()} Formify Studio.
      </footer>
    </div>
  );
}
