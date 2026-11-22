import React from "react";
import JsonEditor from "../../components/JsonEditor";
import VisualBuilder from "../../components/VisualBuilder";
import ThemeCustomizer from "../../components/ThemeCustomizer";
import TemplatesGallery from "../../components/TemplatesGallery";
import { ThemeSettings } from "../../utils/codeGenerators";
import { AppThemeTokens, GlobalThemeMode } from "../../utils/appTheme";
import { WorkspaceTabs } from "../../hooks/useWorkspaceTabs";
import { tabBtnClass } from "../workspace/tabBtnClass";
import { Code, Wrench, Paintbrush, Layers } from "lucide-react";

interface BuilderPanelProps {
  tabs: WorkspaceTabs;
  schema: any;
  jsonSchema: string;
  error: string | null;
  themeSettings: ThemeSettings;
  globalTheme: GlobalThemeMode;
  themeTokens: AppThemeTokens;
  hasEditPermission: boolean;
  onVisualChange: (schema: any) => void;
  onJsonChange: (value: string) => void;
  onThemeSettingsChange: (settings: ThemeSettings) => void;
  onGlobalThemeChange: (mode: GlobalThemeMode) => void;
  onLoadTemplate: (schema: any) => void;
}

const BuilderPanel: React.FC<BuilderPanelProps> = ({
  tabs,
  schema,
  jsonSchema,
  error,
  themeSettings,
  globalTheme,
  themeTokens,
  hasEditPermission,
  onVisualChange,
  onJsonChange,
  onThemeSettingsChange,
  onGlobalThemeChange,
  onLoadTemplate
}) => {
  const { leftTab, setLeftTab, mobileView, setMobileView } = tabs;

  return (
        <div className={`w-full md:w-[55%] flex flex-col border-r overflow-hidden ${themeTokens.sidebar} ${
          ["visual", "json", "theme", "templates"].includes(mobileView) ? "flex" : "hidden md:flex"
        }`}>
          {/* Mobile sub-tab toggle for Build */}
          {["visual", "json"].includes(mobileView) && (
            <div className="md:hidden flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b bg-black/5 dark:bg-white/5 border-gray-200/50 dark:border-gray-800/50">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${themeTokens.textSecondary}`}>Build Mode</span>
              <div className="flex space-x-1 bg-black/5 dark:bg-white/5 p-0.5 rounded-lg border border-gray-200/30 dark:border-gray-800/30">
                <button
                  onClick={() => {
                    setLeftTab("visual");
                    setMobileView("visual");
                  }}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                    leftTab === "visual"
                      ? "bg-blue-600 text-white shadow-sm"
                      : `${themeTokens.textSecondary} hover:text-gray-900 dark:hover:text-white`
                  }`}
                >
                  Visual
                </button>
                <button
                  onClick={() => {
                    setLeftTab("json");
                    setMobileView("json");
                  }}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                    leftTab === "json"
                      ? "bg-blue-600 text-white shadow-sm"
                      : `${themeTokens.textSecondary} hover:text-gray-900 dark:hover:text-white`
                  }`}
                >
                  JSON
                </button>
              </div>
            </div>
          )}
          {/* Tabs header */}
          <div className={`hidden md:flex flex-shrink-0 border-b bg-black/5 px-4 pt-2 overflow-x-auto whitespace-nowrap scrollbar-none ${themeTokens.border}`}>
            {[
              { id: "visual", name: "Visual Builder", icon: Wrench },
              { id: "json", name: "JSON Editor", icon: Code },
              { id: "theme", name: "Theme Customizer", icon: Paintbrush },
              { id: "templates", name: "Templates Gallery", icon: Layers }
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setLeftTab(tab.id as any)}
                  className={`flex-shrink-0 whitespace-nowrap ${tabBtnClass(themeTokens, leftTab === tab.id)}`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.name}</span>
                </button>
              );
            })}
          </div>

          {/* Left panel rendering */}
          <div className="flex-1 overflow-hidden relative">
            {leftTab === "visual" && (
              <VisualBuilder schema={schema} themeTokens={themeTokens} onSchemaChange={onVisualChange} readOnly={!hasEditPermission} />
            )}
            {leftTab === "json" && (
              <JsonEditor value={jsonSchema} themeTokens={themeTokens} onChange={onJsonChange} error={error} readOnly={!hasEditPermission} />
            )}
            {leftTab === "theme" && (
              <ThemeCustomizer
                settings={themeSettings}
                themeTokens={themeTokens}
                globalTheme={globalTheme}
                onChange={onThemeSettingsChange}
                onGlobalThemeChange={onGlobalThemeChange}
                readOnly={!hasEditPermission}
              />
            )}
            {leftTab === "templates" && (
              <TemplatesGallery themeTokens={themeTokens} onSelectTemplate={onLoadTemplate} readOnly={!hasEditPermission} />
            )}
          </div>
        </div>
  );
};

export default BuilderPanel;
