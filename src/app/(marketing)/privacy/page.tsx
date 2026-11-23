import React from "react";


const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "What stays on your device",
    body: (
      <>
        Your workspaces, form schemas, theme settings and test submissions are stored in your browser using IndexedDB, with a copy in <code>localStorage</code> for compatibility with the share and analytics pages. We do not operate a database that receives this data. Clearing site data removes it, so export your JSON first if you want to keep it.
      </>
    )
  },
  {
    title: "Live collaboration",
    body: (
      <>
        When you connect to a room, browsers find each other through a signaling server and then exchange edits directly over WebRTC. The default signaling server is the public one at <code>signaling.yjs.dev</code>, which can see connection metadata such as IP addresses and room names, and STUN servers are used for NAT traversal. You can point the app at your own signaling server, or at the optional self-hosted Formify server. Do not put secrets in forms you edit with people you do not trust: anyone with a room link can join it.
      </>
    )
  },
  {
    title: "AI assistant (optional, off by default)",
    body: (
      <>
        The assistant only runs if you turn it on. On-device generation downloads model files from the provider's host the first time, then runs locally in your browser. A local model server such as Ollama keeps requests on your machine. If you configure a remote endpoint with your own API key, the text of your request and the relevant form schema are sent to that provider and are governed by their terms. The key is kept in memory for the session, optionally in session storage, and is never written to logs.
      </>
    )
  },
  {
    title: "Workflows (experimental)",
    body: (
      <>
        Test runs use mock services, so nothing leaves your browser while you build. A workflow that you configure to call a webhook or send email will contact the destinations you specify.
      </>
    )
  },
  {
    title: "Analytics and tracking",
    body: <>We do not use advertising tags, tracking pixels or third-party analytics cookies in the app.</>
  },
  {
    title: "Third-party resources",
    body: (
      <>
        The site loads the Inter typeface from Google Fonts, which means Google receives your IP address and browser details when a page loads. The hosting provider may also keep standard server logs.
      </>
    )
  },
  {
    title: "Access links are not a security boundary",
    body: (
      <>
        Edit and view-only links work entirely in your browser. They help you avoid accidental edits but do not prevent someone who has the link from editing. Enforced roles require the optional self-hosted server.
      </>
    )
  }
];

export const metadata = { title: "Privacy", description: "What Formify Studio stores locally and which optional features use the network." };

export default function PrivacyPage() {
  return (
    <>
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-300">Privacy</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl">Privacy policy</h1>
        <p className="mt-5 text-lg leading-relaxed text-slate-600 dark:text-slate-400">
          Formify Studio is local-first: by default your forms and submissions never leave your browser. This page lists the optional features that do use the network.
        </p>

        <div className="mt-8 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-sm text-emerald-900 dark:text-emerald-200">
          <strong>In short:</strong> we do not collect your form data. Features that talk to other servers are optional and described below.
        </div>

        <div className="mt-12 space-y-10">
          {SECTIONS.map((s, i) => (
            <section key={s.title} aria-labelledby={`p-${i}`}>
              <h2 id={`p-${i}`} className="text-lg font-bold text-slate-900 dark:text-white">
                {i + 1}. {s.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400 [&_code]:rounded [&_code]:bg-slate-100 dark:[&_code]:bg-slate-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs">
                {s.body}
              </p>
            </section>
          ))}
        </div>

        <p className="mt-12 border-t border-slate-200 dark:border-slate-800 pt-6 text-xs text-slate-500">
          Last revised: November 2026. This page describes the behavior of the open-source code; if you self-host or modify it, your own deployment's behavior is yours to document.
        </p>
      </div>
    </>
  );
}
