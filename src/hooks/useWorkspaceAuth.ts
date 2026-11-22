import { useEffect, useState } from "react";

/**
 * Client-side edit/view role detection (UI convenience, NOT a security boundary).
 * - `?token=` in the URL: store it and unlock editing.
 * - Stored token but no URL token: view-only, with a "switch to edit" banner.
 * - Neither: guest, strictly view-only.
 */
export function useWorkspaceAuth(workspaceId?: string) {
  const [hasEditPermission, setHasEditPermission] = useState(true);
  const [workspaceToken, setWorkspaceToken] = useState<string>("");
  const [showSwitchBanner, setShowSwitchBanner] = useState(false);

  useEffect(() => {
    const tokenKey = `formify_edit_token_${workspaceId || "default"}`;
    const storedToken = localStorage.getItem(tokenKey);
    const urlToken = new URLSearchParams(window.location.search).get("token");

    let finalToken = storedToken || "";
    let hasEdit = false;

    if (urlToken) {
      localStorage.setItem(tokenKey, urlToken);
      finalToken = urlToken;
      hasEdit = true;
      setShowSwitchBanner(false);
    } else if (storedToken) {
      hasEdit = false;
      setShowSwitchBanner(true);
    } else {
      hasEdit = false;
      setShowSwitchBanner(false);
      finalToken = "";
    }

    setWorkspaceToken(finalToken);
    setHasEditPermission(hasEdit);
  }, [workspaceId]);

  const switchToEditMode = () => {
    const storedToken = localStorage.getItem(`formify_edit_token_${workspaceId || "default"}`);
    if (storedToken) {
      window.location.href = `${window.location.pathname}?token=${storedToken}`;
    }
  };

  return { hasEditPermission, workspaceToken, showSwitchBanner, switchToEditMode };
}
