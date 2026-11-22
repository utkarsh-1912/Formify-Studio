import React from "react";
import FormGenerator from "../../components/FormGenerator";
import SubmissionsDashboard, { SubmissionEntry } from "../../components/SubmissionsDashboard";
import CodeExporter from "../../components/CodeExporter";
import { ThemeSettings } from "../../utils/codeGenerators";
import { AppThemeTokens } from "../../utils/appTheme";
import { WorkspaceTabs } from "../../hooks/useWorkspaceTabs";
import { tabBtnClass } from "../workspace/tabBtnClass";
import { Eye, Inbox, ArrowUpRight } from "lucide-react";

interface DataPanelProps {
  tabs: WorkspaceTabs;
  schema: any;
  submissions: SubmissionEntry[];
  themeSettings: ThemeSettings;
  themeTokens: AppThemeTokens;
  fontFamily: "sans" | "mono" | "serif";
  fontScale: number;
  onSubmitSubmission: (data: Record<string, any>) => void;
  onDeleteSubmission: (id: string) => void;
  onClearAllSubmissions: () => void;
}

const DataPanel: React.FC<DataPanelProps> = ({
  tabs,
  schema,
  submissions,
  themeSettings,
  themeTokens,
  fontFamily,
  fontScale,
  onSubmitSubmission,
  onDeleteSubmission,
  onClearAllSubmissions
}) => {
  const { rightTab, setRightTab, mobileView, setMobileView } = tabs;

  return (
        <div className={`w-full md:w-[45%] flex flex-col overflow-hidden ${
          ["preview", "submissions", "code"].includes(mobileView) ? "flex" : "hidden md:flex"
        }`}>
          {/* Mobile sub-tab toggle for Data */}
          {["submissions", "code"].includes(mobileView) && (
            <div className="md:hidden flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b bg-black/5 dark:bg-white/5 border-gray-200/50 dark:border-gray-800/50">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${themeTokens.textSecondary}`}>Data Option</span>
              <div className="flex space-x-1 bg-black/5 dark:bg-white/5 p-0.5 rounded-lg border border-gray-200/30 dark:border-gray-800/30">
                <button
                  onClick={() => {
                    setRightTab("submissions");
                    setMobileView("submissions");
                  }}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                    rightTab === "submissions"
                      ? "bg-blue-600 text-white shadow-sm"
                      : `${themeTokens.textSecondary} hover:text-gray-900 dark:hover:text-white`
                  }`}
                >
                  Logs
                </button>
                <button
                  onClick={() => {
                    setRightTab("code");
                    setMobileView("code");
                  }}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                    rightTab === "code"
                      ? "bg-blue-600 text-white shadow-sm"
                      : `${themeTokens.textSecondary} hover:text-gray-900 dark:hover:text-white`
                  }`}
                >
                  Export
                </button>
              </div>
            </div>
          )}
          {/* Tabs header */}
          <div className={`hidden md:flex flex-shrink-0 border-b bg-black/5 px-4 pt-2 overflow-x-auto whitespace-nowrap scrollbar-none ${themeTokens.border}`}>
            {[
              { id: "preview", name: "Live Preview", icon: Eye },
              { id: "submissions", name: "Submissions Log", icon: Inbox, badge: submissions.length },
              { id: "code", name: "Export Code", icon: ArrowUpRight }
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setRightTab(tab.id as any)}
                  className={`flex-shrink-0 whitespace-nowrap ${tabBtnClass(themeTokens, rightTab === tab.id)}`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.name}</span>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="text-[10px] bg-blue-500 text-white font-extrabold px-1.5 py-0.5 rounded-full ml-1 animate-scale-up">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right panel rendering */}
          <div className="flex-1 overflow-hidden relative">
            {rightTab === "preview" && (
              <FormGenerator
                schema={schema}
                theme={themeSettings}
                themeTokens={themeTokens}
                fontFamily={fontFamily}
                fontScale={fontScale}
                onSubmitSubmission={onSubmitSubmission}
              />
            )}
            {rightTab === "submissions" && (
              <SubmissionsDashboard
                submissions={submissions}
                themeTokens={themeTokens}
                schema={schema}
                onDeleteSubmission={onDeleteSubmission}
                onClearAllSubmissions={onClearAllSubmissions}
              />
            )}
            {rightTab === "code" && (
              <CodeExporter schema={schema} theme={themeSettings} themeTokens={themeTokens} />
            )}
          </div>
        </div>
  );
};

export default DataPanel;
