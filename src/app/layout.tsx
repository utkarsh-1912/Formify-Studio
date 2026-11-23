import React from "react";
import type { Metadata, Viewport } from "next";
import "../index.css";
import "../styles/index.css";
import "../App.css";

const DESCRIPTION =
  "Build forms and workflows from one open JSON schema. Local-first visual and code editing, conditional logic, exports to HTML, React and web components, with optional on-device AI.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Formify Studio: local-first forms and workflows from one JSON schema",
    template: "%s | Formify Studio"
  },
  description: DESCRIPTION,
  manifest: "/manifest.json",
  icons: { icon: "/logo.png" },
  openGraph: {
    type: "website",
    siteName: "Formify Studio",
    title: "Formify Studio: local-first forms and workflows",
    description: DESCRIPTION,
    images: ["/logo.png"]
  },
  twitter: {
    card: "summary",
    title: "Formify Studio",
    description: DESCRIPTION
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" }
  ]
};

/**
 * Runs before first paint on public pages so dark-mode visitors never see a light flash.
 * Skipped under /ws/ because the workspace has its own theme system.
 */
const THEME_BOOT = `(function(){try{if(location.pathname.indexOf('/ws/')===0)return;var s=localStorage.getItem('formify_marketing_theme');var d=s==='dark'||(s!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;if(d)r.classList.add('dark');r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        {/* Google Fonts Inter */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
