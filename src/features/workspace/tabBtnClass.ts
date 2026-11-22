import { AppThemeTokens } from "../../utils/appTheme";

/** Class names for a desktop tab button, driven by the active global theme tokens. */
export const tabBtnClass = (themeTokens: AppThemeTokens, isActive: boolean) =>
  `flex items-center space-x-1.5 pb-2.5 pt-1.5 px-4 text-xs font-bold border-b-2 cursor-pointer transition-all focus:outline-none ${
    isActive ? themeTokens.tabActive : themeTokens.tabInactive
  }`;
