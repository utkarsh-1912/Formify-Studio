"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Database, Network, Cookie, ArrowLeft, Lock } from "lucide-react";

export default function PrivacyPage() {
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
          className="flex items-center space-x-2 text-xs font-semibold text-slate-550 dark:text-slate-400 hover:text-blue-600 dark:hover:text-white transition-all focus:outline-none cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Home</span>
        </button>
        <div className="flex items-center space-x-3">
          <img src="/logo-long.png" alt="Formify Logo" className="h-7 sm:h-8" />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl w-full mx-auto px-4 py-10 sm:px-6 sm:py-16 z-10 flex-1 space-y-10 sm:space-y-12">
        <div className="space-y-3 sm:space-y-4 text-center">
          <div className="inline-flex items-center justify-center p-2.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-2xl mb-1 sm:mb-2">
            <Lock className="h-6 w-6 sm:h-7 sm:w-7" />
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">Privacy Policy</h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-xl mx-auto leading-relaxed">
            Formify Studio Pro is a decentralized, local-first utility. Your privacy is protected by design: we literally cannot see your data.
          </p>
        </div>

        {/* Overview Alert */}
        <div className="bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 rounded-2xl p-5 text-xs text-emerald-800 dark:text-emerald-350 leading-relaxed flex items-start space-x-3 shadow-sm">
          <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-emerald-800 dark:text-emerald-350 block mb-1">Our Privacy Commitment</span>
            We collect, store, and process zero user-generated form schemas or form submission values on remote servers. All operations happen entirely within your local browser.
          </div>
        </div>

        {/* Policy Sections */}
        <div className="space-y-8">
          {/* Section 1 */}
          <div className="space-y-2.5">
            <div className="flex items-center space-x-2.5 text-blue-600 dark:text-blue-400">
              <Database className="h-5 w-5 flex-shrink-0" />
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">1. Local-First Browser Storage</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed pl-7">
              All form templates, schemas, customization variables, and test submission entries are stored directly in your browser's local sandbox (utilizing the <code>localStorage</code> API). This data remains on your physical hardware. Clearing your browser cookies/data will permanently delete this information unless you export/download the JSON file beforehand.
            </p>
          </div>

          {/* Section 2 */}
          <div className="space-y-2.5">
            <div className="flex items-center space-x-2.5 text-purple-600 dark:text-purple-400">
              <Network className="h-5 w-5 flex-shrink-0" />
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">2. Peer-to-Peer Collaborative Sync</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed pl-7">
              When utilizing the Live multiplayer synchronization features, Formify Studio coordinates peer discovery via PeerJS servers. However, once connected, all form modifications and edits stream directly between browser peers via decentralized <strong>WebRTC Data Channels</strong>. No collaborative data payloads are parsed, monitored, or persisted on our signaling infrastructure.
            </p>
          </div>

          {/* Section 3 */}
          <div className="space-y-2.5">
            <div className="flex items-center space-x-2.5 text-pink-600 dark:text-pink-400">
              <Cookie className="h-5 w-5 flex-shrink-0" />
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">3. Third-Party Analytics & Tracking</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed pl-7">
              We employ no tracking pixels, advertising tags, Google Analytics, or third-party identifier cookies. Our utility operates independently, ensuring a distraction-free, privacy-respecting workflow environment for developers.
            </p>
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-900 pt-6 text-center text-xs text-slate-500 dark:text-slate-500">
          Last revised: June 20, 2026. Have questions about client-side sandboxing? Feel free to build your own copy of Formify.
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl w-full mx-auto px-4 py-4 sm:px-6 sm:py-6 text-center text-xs text-slate-500 dark:text-slate-500 border-t border-slate-200 dark:border-slate-900/60 z-10">
        &copy; {new Date().getFullYear()} Formify Studio.
      </footer>
    </div>
  );
}
