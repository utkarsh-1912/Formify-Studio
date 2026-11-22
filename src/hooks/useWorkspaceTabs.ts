import { useState } from "react";

export type LeftTab = "visual" | "json" | "theme" | "templates";
export type RightTab = "preview" | "submissions" | "code";
export type MobileView = LeftTab | RightTab;

/** Desktop left/right tab state plus the single active "mobile view". */
export function useWorkspaceTabs() {
  const [leftTab, setLeftTab] = useState<LeftTab>("visual");
  const [rightTab, setRightTab] = useState<RightTab>("preview");
  const [mobileView, setMobileView] = useState<MobileView>("visual");
  return { leftTab, setLeftTab, rightTab, setRightTab, mobileView, setMobileView };
}

export type WorkspaceTabs = ReturnType<typeof useWorkspaceTabs>;
