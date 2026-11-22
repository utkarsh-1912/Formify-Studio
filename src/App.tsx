import React, { useState, useEffect, useMemo } from "react";
import { themeMap } from "./utils/appTheme";
import { useP2PSync } from "./utils/p2pSync";
import { useWorkspaceStore } from "./store/workspaceStore";
import { useWorkspaceAuth } from "./hooks/useWorkspaceAuth";
import { useWorkspaceTabs } from "./hooks/useWorkspaceTabs";
import Banners from "./features/workspace/Banners";
import WorkspaceHeader from "./features/workspace/WorkspaceHeader";
import MobileNav from "./features/workspace/MobileNav";
import StatusFooter from "./features/workspace/StatusFooter";
import BuilderPanel from "./features/builder/BuilderPanel";
import DataPanel from "./features/submissions/DataPanel";
import SettingsModal from "./features/settings/SettingsModal";
import ShareModal from "./features/share/ShareModal";

interface AppProps {
  workspaceId?: string;
}

/**
 * Studio shell. State lives in the workspace store (src/store), persistence in IndexedDB with a
 * localStorage mirror, and each region of the UI in its own feature module (src/features).
 */
const App: React.FC<AppProps> = ({ workspaceId }) => {
  const {
    schema,
    jsonSchema,
    error,
    roomName,
    themeSettings,
    globalTheme,
    fontFamily,
    fontScale,
    submissions,
    isWorkspaceInitialized
  } = useWorkspaceStore();
  const actions = useWorkspaceStore.getState();

  const themeTokens = themeMap[globalTheme];
  const tabs = useWorkspaceTabs();
  const { hasEditPermission, workspaceToken, showSwitchBanner, switchToEditMode } = useWorkspaceAuth(workspaceId);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // Load (and, once, migrate from localStorage) the workspace whenever the id changes
  useEffect(() => {
    useWorkspaceStore.getState().hydrate(workspaceId);
  }, [workspaceId]);

  // Global Text Resizing Scale Effect
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontScale * 100}%`;
    return () => {
      document.documentElement.style.fontSize = "";
    };
  }, [fontScale]);

  // Combine workspace states into a single memoized state object for P2P Sync
  const p2pState = useMemo(
    () => ({ schema, theme: themeSettings, fontFamily, fontScale, globalTheme, submissions }),
    [schema, themeSettings, fontFamily, fontScale, globalTheme, submissions]
  );

  // P2P WebRTC Live sync hook integration
  const {
    status: p2pStatus,
    connectedPeers,
    initPeerJS,
    disconnect: disconnectP2P,
    push: pushP2P
  } = useP2PSync(
    workspaceId || "default",
    p2pState,
    (remoteState) => useWorkspaceStore.getState().applyRemoteState(remoteState),
    (remoteSubmission) => useWorkspaceStore.getState().addRemoteSubmission(remoteSubmission)
  );

  const handleLoadTemplate = (templateSchema: any) => {
    actions.setVisual(templateSchema);
    tabs.setLeftTab("visual");
  };

  const handleClearAllSubmissions = () => {
    if (window.confirm("Are you sure you want to permanently clear all submissions?")) {
      actions.clearSubmissions();
    }
  };

  return (
    <div className={`h-screen flex flex-col font-sans overflow-hidden ${themeTokens.bg}`}>
      <Banners
        showSwitchBanner={showSwitchBanner}
        hasEditPermission={hasEditPermission}
        onSwitchToEdit={switchToEditMode}
      />
      <WorkspaceHeader
        workspaceId={workspaceId}
        themeTokens={themeTokens}
        roomName={roomName}
        hasEditPermission={hasEditPermission}
        isWorkspaceInitialized={isWorkspaceInitialized}
        showSwitchBanner={showSwitchBanner}
        p2pStatus={p2pStatus}
        connectedPeers={connectedPeers}
        initPeerJS={initPeerJS}
        disconnectP2P={disconnectP2P}
        pushP2P={pushP2P}
        onRoomNameChange={(e) => actions.setRoomName(e.target.value)}
        onSaveWorkspace={actions.saveCurrentSchema}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenShare={() => setIsShareModalOpen(true)}
        onSwitchToEdit={switchToEditMode}
      />

      {/* Main Container Dashboard */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <BuilderPanel
          tabs={tabs}
          schema={schema}
          jsonSchema={jsonSchema}
          error={error}
          themeSettings={themeSettings}
          globalTheme={globalTheme}
          themeTokens={themeTokens}
          hasEditPermission={hasEditPermission}
          onVisualChange={actions.setVisual}
          onJsonChange={actions.setJson}
          onThemeSettingsChange={actions.setThemeSettings}
          onGlobalThemeChange={actions.setGlobalTheme}
          onLoadTemplate={handleLoadTemplate}
        />
        <DataPanel
          tabs={tabs}
          schema={schema}
          submissions={submissions}
          themeSettings={themeSettings}
          themeTokens={themeTokens}
          fontFamily={fontFamily}
          fontScale={fontScale}
          onSubmitSubmission={actions.addSubmission}
          onDeleteSubmission={actions.deleteSubmission}
          onClearAllSubmissions={handleClearAllSubmissions}
        />
      </div>

      <MobileNav tabs={tabs} submissionCount={submissions.length} />

      <StatusFooter
        schema={schema}
        submissionCount={submissions.length}
        workspaceId={workspaceId}
        error={error}
        themeTokens={themeTokens}
      />

      {isSettingsOpen && (
        <SettingsModal
          themeTokens={themeTokens}
          globalTheme={globalTheme}
          fontFamily={fontFamily}
          fontScale={fontScale}
          onApply={actions.applyAppearance}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {isShareModalOpen && (
        <ShareModal
          workspaceId={workspaceId}
          workspaceToken={workspaceToken}
          hasEditPermission={hasEditPermission}
          themeTokens={themeTokens}
          onClose={() => setIsShareModalOpen(false)}
        />
      )}
    </div>
  );
};

export default App;
