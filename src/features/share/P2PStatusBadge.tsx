import React, { useState } from "react";
import { P2PStatus } from "../../utils/p2pSync";
import { AppThemeTokens } from "../../utils/appTheme";
import { Check, Radio, Users, Send, LogOut, AlertCircle } from "lucide-react";

interface P2PStatusBadgeProps {
  p2pStatus: P2PStatus;
  connectedPeers: string[];
  themeTokens: AppThemeTokens;
  onConnect: () => void;
  onDisconnect: () => void;
  onPush: () => void;
}

const P2PStatusBadge: React.FC<P2PStatusBadgeProps> = ({ p2pStatus, connectedPeers, themeTokens, onConnect, onDisconnect, onPush }) => {
  const [justPushed, setJustPushed] = useState(false);

  const handlePush = () => {
    onPush();
    setJustPushed(true);
    setTimeout(() => setJustPushed(false), 2000);
  };

  return (
          <div className={`flex items-center space-x-1.5 px-2 py-1.5 border ${themeTokens.border} ${themeTokens.inputBg} rounded-xl text-xs font-bold shadow-sm`}>
            {p2pStatus === "disconnected" && (
              <button
                onClick={onConnect}
                className="flex items-center text-gray-500 hover:text-blue-500 cursor-pointer focus:outline-none"
                title="Go Live (Enable multiplayer sync)"
              >
                <Radio className="h-4 w-4 animate-pulse" />
              </button>
            )}
            {p2pStatus === "connecting" && (
              <span className="flex items-center text-yellow-600 dark:text-yellow-400" title="Connecting to signaling server...">
                <div className="h-4 w-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
              </span>
            )}
            {(p2pStatus === "hosting" || p2pStatus === "joined") && (
              <div className="flex items-center space-x-2">
                <span 
                  className="flex items-center text-emerald-600 dark:text-emerald-400" 
                  title={`Multiplayer Active (${p2pStatus === "hosting" ? "Hosting Workspace" : "Joined Workspace"})`}
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                </span>
                
                {connectedPeers.length > 0 && (
                  <span className="inline-flex items-center text-[10px] text-gray-500 font-mono" title={`${connectedPeers.length} active peer(s)`}>
                    <Users className="h-3.5 w-3.5 mr-0.5" />
                    <span>{connectedPeers.length}</span>
                  </span>
                )}

                <button
                  onClick={handlePush}
                  disabled={justPushed}
                  className={`p-1 rounded transition-all cursor-pointer focus:outline-none flex items-center justify-center ${
                    justPushed
                      ? "bg-emerald-500 text-white"
                      : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                  }`}
                  title="Push local changes to all connected peers"
                >
                  {justPushed ? <Check className="h-3 w-3" /> : <Send className="h-3 w-3" />}
                </button>

                <button
                  onClick={onDisconnect}
                  className="p-1 text-red-500 hover:text-red-600 dark:hover:text-red-400 cursor-pointer focus:outline-none flex items-center"
                  title="Disconnect multiplayer sync"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {p2pStatus === "error" && (
              <span className="text-red-600 dark:text-red-400 font-extrabold text-[10px] flex items-center space-x-1" title="P2P Offline">
                <AlertCircle className="h-4 w-4" />
                <button onClick={onConnect} className="underline text-blue-500 focus:outline-none">Retry</button>
              </span>
            )}
          </div>
  );
};

export default P2PStatusBadge;
