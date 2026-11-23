import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AppThemeTokens } from "../../utils/appTheme";
import { APP_VERSION } from "../../utils/version";
import { P2PStatus } from "../../utils/p2pSync";
import P2PStatusBadge from "../share/P2PStatusBadge";
import { Code, Share2, Check, Settings, ArrowLeft, AlertCircle, MoreVertical, Lock, Unlock, ExternalLink, BarChart3, Workflow } from "lucide-react";

interface WorkspaceHeaderProps {
  workspaceId?: string;
  themeTokens: AppThemeTokens;
  roomName: string;
  hasEditPermission: boolean;
  isWorkspaceInitialized: boolean;
  showSwitchBanner: boolean;
  p2pStatus: P2PStatus;
  connectedPeers: string[];
  initPeerJS: () => void;
  disconnectP2P: () => void;
  pushP2P: () => void;
  onRoomNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSaveWorkspace: () => void;
  onOpenSettings: () => void;
  onOpenShare: () => void;
  onSwitchToEdit: () => void;
}

const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  workspaceId,
  themeTokens,
  roomName,
  hasEditPermission,
  isWorkspaceInitialized,
  showSwitchBanner,
  p2pStatus,
  connectedPeers,
  initPeerJS,
  disconnectP2P,
  pushP2P,
  onRoomNameChange,
  onSaveWorkspace,
  onOpenSettings,
  onOpenShare,
  onSwitchToEdit
}) => {
  const router = useRouter();
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);

  return (
      <header className={`flex-shrink-0 border-b px-3 py-2 sm:px-6 sm:py-3 flex items-center justify-between shadow-sm z-20 ${themeTokens.header}`}>
        <div className="flex items-center space-x-2 sm:space-x-4 min-w-0">
          <button
            onClick={() => router.push("/")}
            className={`p-1 sm:p-1.5 rounded-lg border ${themeTokens.border} hover:bg-black/5 cursor-pointer focus:outline-none text-gray-500 flex-shrink-0`}
            title="Return to Home Screen"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          
          <div className="flex items-center space-x-2 sm:space-x-3.5 min-w-0">
            <img src="/logo.png" alt="Formify Logo" className="h-6 sm:h-8 flex-shrink-0" />
            <span className={`hidden xs:inline-block text-[9px] sm:text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border ${themeTokens.border} ${themeTokens.inputBg} ${themeTokens.textSecondary} flex-shrink-0`}>
              v{APP_VERSION}
            </span>
            {/* Inline Editable Room Name */}
            <input
              type="text"
              value={roomName}
              onChange={onRoomNameChange}
              readOnly={!hasEditPermission}
              className={`px-1.5 py-0.5 sm:px-2.5 sm:py-1 bg-transparent hover:bg-black/5 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-gray-800 rounded-lg text-xs sm:text-sm font-semibold focus:outline-none transition-all max-w-[70px] xs:max-w-[110px] sm:max-w-xs truncate ${themeTokens.inputText} ${!hasEditPermission ? "cursor-not-allowed opacity-75" : ""}`}
              title={hasEditPermission ? "Click to rename workspace" : "Workspace Name (Read-Only)"}
            />
            {hasEditPermission ? (
              isWorkspaceInitialized ? (
                <span 
                  className="p-1.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/25 rounded-lg flex-shrink-0 flex items-center justify-center shadow-sm"
                  title="Workspace Saved in LocalStorage"
                >
                  <Check className="h-4 w-4" />
                </span>
              ) : (
                <button
                  onClick={onSaveWorkspace}
                  className="p-1.5 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/25 rounded-lg flex-shrink-0 cursor-pointer animate-pulse focus:outline-none flex items-center justify-center shadow-sm"
                  title="Workspace not initialized in LocalStorage. Click to save."
                >
                  <AlertCircle className="h-4 w-4" />
                </button>
              )
            ) : (
              <span 
                className="p-1.5 bg-blue-500/10 text-blue-500 border border-blue-500/25 rounded-lg flex-shrink-0 flex items-center justify-center shadow-sm"
                title="View-Only Mode Active"
              >
                <Lock className="h-4 w-4" />
              </span>
            )}
          </div>
        </div>

        {/* Global Toolbar Options */}
        <div className="flex items-center space-x-1.5 sm:space-x-3 flex-shrink-0">
          {/* P2P Multiplayer Sync Status Badge */}
          <P2PStatusBadge
            p2pStatus={p2pStatus}
            connectedPeers={connectedPeers}
            themeTokens={themeTokens}
            onConnect={initPeerJS}
            onDisconnect={disconnectP2P}
            onPush={pushP2P}
          />

          {/* Settings gear icon */}
          {hasEditPermission && (
            <button
              onClick={onOpenSettings}
              className={`p-1.5 rounded-xl border ${themeTokens.border} ${themeTokens.inputBg} ${themeTokens.textSecondary} hover:${themeTokens.text} cursor-pointer focus:outline-none transition-all shadow-sm flex-shrink-0`}
              title="Open Workspace Settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          )}

          {/* 3-Dot Options Dropdown */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
              className={`p-1.5 rounded-xl border ${themeTokens.border} ${themeTokens.inputBg} ${themeTokens.textSecondary} hover:${themeTokens.text} cursor-pointer focus:outline-none transition-all shadow-sm flex items-center justify-center`}
              title="More Actions"
            >
              <MoreVertical className="h-4 w-4" />
            </button>

            {isHeaderMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-30 cursor-default" 
                  onClick={() => setIsHeaderMenuOpen(false)}
                />
                
                <div className={`absolute right-0 mt-2 w-48 rounded-xl shadow-xl border overflow-hidden z-40 animate-scale-up ${themeTokens.modalBg} ${themeTokens.border}`}>
                  <div className="py-1.5">
                    {hasEditPermission && (
                      <>
                        <button
                          onClick={() => {
                            onOpenShare();
                            setIsHeaderMenuOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-xs font-semibold flex items-center space-x-2 hover:bg-black/5 transition-colors cursor-pointer ${themeTokens.text}`}
                        >
                          <Share2 className="h-3.5 w-3.5 text-blue-500" />
                          <span>Share & Embed</span>
                        </button>
                        <hr className={`my-1.5 border-t ${themeTokens.border}`} />
                      </>
                    )}

                    <a
                      href={`/ws/${workspaceId || "default"}/share`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`w-full text-left px-4 py-2 text-xs font-semibold flex items-center space-x-2 hover:bg-black/5 transition-colors cursor-pointer block ${themeTokens.text}`}
                      onClick={() => setIsHeaderMenuOpen(false)}
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-emerald-500" />
                      <span>Open Live Form</span>
                    </a>

                    <a
                      href={`/ws/${workspaceId || "default"}/analytics`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`w-full text-left px-4 py-2 text-xs font-semibold flex items-center space-x-2 hover:bg-black/5 transition-colors cursor-pointer block ${themeTokens.text}`}
                      onClick={() => setIsHeaderMenuOpen(false)}
                    >
                      <BarChart3 className="h-3.5 w-3.5 text-purple-500" />
                      <span>Open Analytics</span>
                    </a>

                    <a
                      href={`/ws/${workspaceId || "default"}/workflows`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`w-full text-left px-4 py-2 text-xs font-semibold flex items-center space-x-2 hover:bg-black/5 transition-colors cursor-pointer block ${themeTokens.text}`}
                      onClick={() => setIsHeaderMenuOpen(false)}
                    >
                      <Workflow className="h-3.5 w-3.5 text-pink-500" />
                      <span>Workflows (beta)</span>
                    </a>

                    <a
                      href={`/ws/${workspaceId || "default"}/view`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`w-full text-left px-4 py-2 text-xs font-semibold flex items-center space-x-2 hover:bg-black/5 transition-colors cursor-pointer block ${themeTokens.text}`}
                      onClick={() => setIsHeaderMenuOpen(false)}
                    >
                      <Code className="h-3.5 w-3.5 text-amber-500" />
                      <span>Preview Embed</span>
                    </a>

                    {showSwitchBanner && (
                      <>
                        <hr className={`my-1.5 border-t ${themeTokens.border}`} />
                        <button
                          onClick={() => {
                            onSwitchToEdit();
                            setIsHeaderMenuOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-xs font-bold flex items-center space-x-2 hover:bg-blue-600 hover:text-white transition-colors cursor-pointer ${themeTokens.text}`}
                        >
                          <Unlock className="h-3.5 w-3.5 text-blue-500" />
                          <span>Unlock Editing</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
  );
};

export default WorkspaceHeader;
