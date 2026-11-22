import React, { useState } from "react";
import { AppThemeTokens } from "../../utils/appTheme";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { Share2, Lock, Copy } from "lucide-react";

interface ShareModalProps {
  workspaceId?: string;
  workspaceToken: string;
  hasEditPermission: boolean;
  themeTokens: AppThemeTokens;
  onClose: () => void;
}

const ShareModal: React.FC<ShareModalProps> = ({ workspaceId, workspaceToken, hasEditPermission, themeTokens, onClose }) => {
  const [shareFillMode, setShareFillMode] = useState<"multi" | "single">("multi");
  const { copiedField, copy } = useCopyToClipboard();

  return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className={`rounded-2xl max-w-2xl w-full flex flex-col shadow-2xl overflow-hidden border ${themeTokens.border} ${themeTokens.modalBg} animate-scale-up`}>
            {/* Header */}
            <div className={`px-6 py-4 border-b ${themeTokens.border} flex justify-between items-center bg-black/5`}>
              <div>
                <h4 className={`text-sm font-bold flex items-center space-x-1.5 ${themeTokens.text}`}>
                  <Share2 className="h-4.5 w-4.5 text-blue-500" />
                  <span>Share & Embed Workspace</span>
                </h4>
                <p className={`text-[11px] ${themeTokens.textSecondary}`}>
                  Access workspace links, live client forms, embed codes, and analytics.
                </p>
              </div>
              <button 
                onClick={() => onClose()}
                className={`text-xs hover:opacity-85 transition-all font-semibold ${themeTokens.textSecondary}`}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
              {/* Section 1: Client Submission Link */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${themeTokens.textSecondary}`}>
                    Public Submission Form (For Clients)
                  </span>
                  {copiedField === "shareForm" && (
                    <span className="text-[10px] text-emerald-500 font-bold animate-scale-up">Copied!</span>
                  )}
                </div>

                {/* Fill Mode Segmented Toggle */}
                <div className="flex items-center space-x-2 bg-slate-500/5 p-1 rounded-lg border border-slate-500/10 w-fit mb-2">
                  <button
                    onClick={() => setShareFillMode("multi")}
                    className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                      shareFillMode === "multi"
                        ? "bg-blue-600 text-white shadow-sm"
                        : `${themeTokens.textSecondary} hover:opacity-80`
                    }`}
                  >
                    Multifill Link
                  </button>
                  <button
                    onClick={() => setShareFillMode("single")}
                    className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                      shareFillMode === "single"
                        ? "bg-blue-600 text-white shadow-sm"
                        : `${themeTokens.textSecondary} hover:opacity-80`
                    }`}
                  >
                    Single Fill Link
                  </button>
                </div>

                <div className="flex space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/ws/${workspaceId || "default"}/share?mode=${shareFillMode}`}
                    className={`flex-1 p-2 border ${themeTokens.border} ${themeTokens.inputBg} ${themeTokens.inputText} rounded-xl text-xs focus:outline-none select-all`}
                  />
                  <button
                    onClick={() => copy(`${window.location.origin}/ws/${workspaceId || "default"}/share?mode=${shareFillMode}`, "shareForm")}
                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center justify-center cursor-pointer shadow-sm"
                    title="Copy Form Link"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <p className={`text-[10px] ${themeTokens.textSecondary}`}>
                  {shareFillMode === "multi"
                    ? "Allows clients to submit multiple responses. Renders a 'Fill Form Again' button upon completion."
                    : "Restricts clients to a single response per browser using localStorage. Prevents form refills."
                  }
                </p>
              </div>

              {/* Section 2: IFrame Embed Code */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${themeTokens.textSecondary}`}>
                    IFrame Widget HTML Embed Code
                  </span>
                  {copiedField === "shareIframe" && (
                    <span className="text-[10px] text-emerald-500 font-bold animate-scale-up">Copied!</span>
                  )}
                </div>
                <div className="flex space-x-2">
                  <textarea
                    readOnly
                    rows={2}
                    value={`<iframe src="${window.location.origin}/ws/${workspaceId || "default"}/view?mode=${shareFillMode}" width="100%" height="600px" style="border:none;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.05);"></iframe>`}
                    className={`flex-1 p-2 border ${themeTokens.border} ${themeTokens.inputBg} ${themeTokens.inputText} rounded-xl text-xs font-mono resize-none focus:outline-none select-all`}
                  />
                  <button
                    onClick={() => copy(`<iframe src="${window.location.origin}/ws/${workspaceId || "default"}/view?mode=${shareFillMode}" width="100%" height="600px" style="border:none;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.05);"></iframe>`, "shareIframe")}
                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center justify-center cursor-pointer shadow-sm"
                    title="Copy Embed Code"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <p className={`text-[10px] ${themeTokens.textSecondary}`}>
                  Embed this responsive form widget directly in your website or blog pages.
                </p>
              </div>

              {/* Section 3: Analytics Link */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${themeTokens.textSecondary}`}>
                    Public Analytics Dashboard Link
                  </span>
                  {copiedField === "shareAnalytics" && (
                    <span className="text-[10px] text-emerald-500 font-bold animate-scale-up">Copied!</span>
                  )}
                </div>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/ws/${workspaceId || "default"}/analytics`}
                    className={`flex-1 p-2 border ${themeTokens.border} ${themeTokens.inputBg} ${themeTokens.inputText} rounded-xl text-xs focus:outline-none select-all`}
                  />
                  <button
                    onClick={() => copy(`${window.location.origin}/ws/${workspaceId || "default"}/analytics`, "shareAnalytics")}
                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center justify-center cursor-pointer shadow-sm"
                    title="Copy Analytics Link"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <p className={`text-[10px] ${themeTokens.textSecondary}`}>
                  Share this read-only link to let others view submission metrics and charts.
                </p>
              </div>

              {/* Section 4: Collaborative Edit Link (Owner only check) */}
              {hasEditPermission && (
                <div className={`p-4 rounded-xl border border-amber-500/25 bg-amber-500/5 space-y-2`}>
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center space-x-1">
                      <Lock className="h-3.5 w-3.5" />
                      <span>Collaborative Edit Link (With Security Token)</span>
                    </span>
                    {copiedField === "shareEdit" && (
                      <span className="text-[10px] text-emerald-500 font-bold animate-scale-up">Copied!</span>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/ws/${workspaceId || "default"}?token=${workspaceToken}`}
                      className={`flex-1 p-2 border border-amber-300 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-xl text-xs focus:outline-none select-all`}
                    />
                    <button
                      onClick={() => copy(`${window.location.origin}/ws/${workspaceId || "default"}?token=${workspaceToken}`, "shareEdit")}
                      className="p-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl flex items-center justify-center cursor-pointer shadow-sm"
                      title="Copy Edit Link"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-relaxed font-semibold">
                    ⚠️ WARNING: Share this only with trusted co-designers. Anyone with this link can modify form schema parameters and delete submissions.
                  </p>
                </div>
              )}

              {/* Section 5: View-Only Editor Link */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${themeTokens.textSecondary}`}>
                    View-Only Studio Link (Without Token)
                  </span>
                  {copiedField === "shareViewOnly" && (
                    <span className="text-[10px] text-emerald-500 font-bold animate-scale-up">Copied!</span>
                  )}
                </div>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/ws/${workspaceId || "default"}`}
                    className={`flex-1 p-2 border ${themeTokens.border} ${themeTokens.inputBg} ${themeTokens.inputText} rounded-xl text-xs focus:outline-none select-all`}
                  />
                  <button
                    onClick={() => copy(`${window.location.origin}/ws/${workspaceId || "default"}`, "shareViewOnly")}
                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center justify-center cursor-pointer shadow-sm"
                    title="Copy View-Only Link"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <p className={`text-[10px] ${themeTokens.textSecondary}`}>
                  Let clients view the builder design space in view-only layout mode without editing permissions.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className={`px-6 py-4 border-t ${themeTokens.border} flex justify-end bg-black/5`}>
              <button
                onClick={() => onClose()}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white rounded-xl cursor-pointer focus:outline-none shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
  );
};

export default ShareModal;
