import React, { useState } from "react";
import { AppThemeTokens, GlobalThemeMode } from "../../utils/appTheme";
import { Plus, Minus } from "lucide-react";

type FontFamily = "sans" | "mono" | "serif";

interface SettingsModalProps {
  themeTokens: AppThemeTokens;
  globalTheme: GlobalThemeMode;
  fontFamily: FontFamily;
  fontScale: number;
  onApply: (a: { globalTheme: GlobalThemeMode; fontFamily: FontFamily; fontScale: number }) => void;
  onClose: () => void;
}

/** Mounted only while open, so staged values always start from the current settings. */
const SettingsModal: React.FC<SettingsModalProps> = ({ themeTokens, globalTheme, fontFamily, fontScale, onApply, onClose }) => {
  const [stagedTheme, setStagedTheme] = useState<GlobalThemeMode>(globalTheme);
  const [stagedFont, setStagedFont] = useState<FontFamily>(fontFamily);
  const [stagedScale, setStagedScale] = useState<number>(fontScale);

  const applySettings = () => {
    onApply({ globalTheme: stagedTheme, fontFamily: stagedFont, fontScale: stagedScale });
    onClose();
  };

  const adjustStagedScale = (direction: "inc" | "dec") => {
    if (direction === "inc" && stagedScale < 1.5) {
      setStagedScale(parseFloat((stagedScale + 0.1).toFixed(1)));
    } else if (direction === "dec" && stagedScale > 0.8) {
      setStagedScale(parseFloat((stagedScale - 0.1).toFixed(1)));
    }
  };

  return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className={`rounded-2xl max-w-md w-full flex flex-col shadow-2xl overflow-hidden border ${themeTokens.border} ${themeTokens.modalBg} animate-scale-up`}>
            {/* Header */}
            <div className={`px-6 py-4 border-b ${themeTokens.border} flex justify-between items-center bg-black/5`}>
              <div>
                <h4 className={`text-sm font-bold ${themeTokens.text}`}>Settings</h4>
                <p className={`text-[11px] ${themeTokens.textSecondary}`}>
                  Personalize appearance & typography
                </p>
              </div>
              <button 
                onClick={() => onClose()}
                className={`text-xs hover:opacity-80 transition-all font-semibold ${themeTokens.textSecondary}`}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-5 overflow-y-auto max-h-[70vh]">
              {/* Section 1: Themes */}
              <div className="space-y-2">
                <span className={`block text-[11px] font-bold uppercase tracking-wider ${themeTokens.textSecondary}`}>Theme</span>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { id: "dark", name: "Dark", color: "bg-gray-900 border-gray-800" },
                    { id: "light", name: "Light", color: "bg-white border-gray-200" },
                    { id: "matrix", name: "Matrix", color: "bg-black border-emerald-500/30" },
                    { id: "midnight", name: "Midnight", color: "bg-[#0b132b] border-[#3a506b]/40" },
                    { id: "corporate", name: "Corporate", color: "bg-slate-50 border-slate-300" }
                  ].map((t) => {
                    const isStaged = stagedTheme === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setStagedTheme(t.id as GlobalThemeMode)}
                        className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer focus:outline-none ${
                          isStaged
                            ? "border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/35"
                            : `${themeTokens.border} ${themeTokens.inputBg} hover:border-gray-400`
                        }`}
                        title={t.name}
                      >
                        <div className={`h-6 w-8 rounded border shadow-inner flex items-center justify-center ${t.color}`}>
                          <span className={`text-[8px] font-bold ${t.id === "light" ? "text-gray-900" : t.id === "matrix" ? "text-emerald-400" : t.id === "midnight" ? "text-cyan-400" : t.id === "corporate" ? "text-slate-800" : "text-gray-100"}`}>Aa</span>
                        </div>
                        <span className={`text-[9px] font-semibold mt-1 truncate w-full ${isStaged ? "text-blue-600 font-bold" : themeTokens.textSecondary}`}>
                          {t.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: Typography Style */}
              <div className="space-y-3">
                <span className={`block text-[11px] font-bold uppercase tracking-wider ${themeTokens.textSecondary}`}>Typography</span>
                
                {/* Font Family Sub-section */}
                <div className="space-y-1.5">
                  <span className={`block text-[10px] font-semibold ${themeTokens.textSecondary}`}>Font Family</span>
                  <div className="space-y-2">
                    {[
                      { id: "sans", name: "Sans Serif", desc: "Geist Sans — clean & modern", font: "font-sans" },
                      { id: "mono", name: "Monospace", desc: "Geist Mono — developer terminal", font: "font-mono" },
                      { id: "serif", name: "Serif", desc: "Georgia — technical literature", font: "font-serif" }
                    ].map((f) => {
                      const isStaged = stagedFont === f.id;
                      return (
                        <button
                          key={f.id}
                          onClick={() => setStagedFont(f.id as any)}
                          className={`w-full flex items-center justify-between py-2 px-3 rounded-xl border text-left text-xs transition-all cursor-pointer focus:outline-none ${
                            isStaged
                              ? "border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/25 text-blue-600 font-medium"
                              : `${themeTokens.border} ${themeTokens.inputBg} ${themeTokens.textSecondary} hover:border-gray-400`
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className={`font-semibold ${f.font} ${isStaged ? 'text-blue-600' : themeTokens.text}`}>{f.name}</span>
                            <span className="text-[10px] opacity-75">{f.desc}</span>
                          </div>
                          {isStaged && <div className="h-1.5 w-1.5 rounded-full bg-blue-500 mr-1" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Font Scale Sub-section */}
                <div className="space-y-1.5">
                  <span className={`block text-[10px] font-semibold ${themeTokens.textSecondary}`}>Font Scale</span>
                  <div className={`flex items-center justify-between p-2 rounded-xl border ${themeTokens.border} ${themeTokens.inputBg}`}>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => adjustStagedScale("dec")}
                        disabled={stagedScale <= 0.8}
                        className={`p-1.5 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 rounded-lg text-gray-500 cursor-pointer focus:outline-none border ${themeTokens.border}`}
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className={`text-xs font-bold w-12 text-center ${themeTokens.text}`}>
                        {stagedScale.toFixed(1)}x
                      </span>
                      <button
                        onClick={() => adjustStagedScale("inc")}
                        disabled={stagedScale >= 1.5}
                        className={`p-1.5 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30 rounded-lg text-gray-500 cursor-pointer focus:outline-none border ${themeTokens.border}`}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    <button
                      onClick={() => setStagedScale(1.0)}
                      disabled={stagedScale === 1.0}
                      className={`px-3 py-1 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 rounded-lg text-xs font-bold cursor-pointer focus:outline-none border ${themeTokens.border} ${themeTokens.textSecondary}`}
                    >
                      Default
                    </button>
                  </div>

                  {/* Micro Preview Box */}
                  <div className={`border ${themeTokens.border} rounded-xl p-2.5 bg-black/5 text-center`}>
                    <p 
                      style={{ fontSize: `calc(0.875rem * ${stagedScale})` }} 
                      className={`transition-all leading-relaxed ${stagedFont === 'mono' ? 'font-mono' : stagedFont === 'serif' ? 'font-serif' : 'font-sans'} ${themeTokens.text}`}
                    >
                      Preview text scaling
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className={`px-6 py-4 border-t ${themeTokens.border} flex justify-end space-x-2 bg-black/5`}>
              <button
                onClick={() => onClose()}
                className={`px-4 py-2 border ${themeTokens.border} text-xs font-bold ${themeTokens.text} ${themeTokens.inputBg} rounded-xl cursor-pointer focus:outline-none`}
              >
                Cancel
              </button>
              <button
                onClick={applySettings}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white rounded-xl cursor-pointer focus:outline-none shadow-sm"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
  );
};

export default SettingsModal;
