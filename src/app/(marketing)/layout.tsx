import React from "react";
import MarketingShell from "../../components/marketing/MarketingShell";

/** One persistent shell for all public pages, so navigating between them never re-mounts the theme or nav. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>;
}
