import React from "react";
import { WorkspaceTabs } from "../../hooks/useWorkspaceTabs";
import { Wrench, Paintbrush, Layers, Eye, Inbox } from "lucide-react";

interface MobileNavProps {
  tabs: WorkspaceTabs;
  submissionCount: number;
}

const MobileNav: React.FC<MobileNavProps> = ({ tabs, submissionCount }) => {
  const { leftTab, setLeftTab, rightTab, setRightTab, mobileView, setMobileView } = tabs;

  return (
      <div className="md:hidden flex-shrink-0 border-t bg-white/95 dark:bg-gray-950/95 backdrop-blur-md flex items-center justify-around py-2 px-3 z-30 shadow-lg border-gray-200/50 dark:border-gray-800/50">
        {[
          { id: "build", name: "Build", icon: Wrench, active: ["visual", "json"].includes(mobileView) },
          { id: "theme", name: "Style", icon: Paintbrush, active: mobileView === "theme" },
          { id: "templates", name: "Templates", icon: Layers, active: mobileView === "templates" },
          { id: "preview", name: "Preview", icon: Eye, active: mobileView === "preview" },
          { id: "submissions", name: "Data", icon: Inbox, active: ["submissions", "code"].includes(mobileView), badge: submissionCount }
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.id === "build") {
                  const target = leftTab === "json" ? "json" : "visual";
                  setLeftTab(target as any);
                  setMobileView(target);
                } else if (tab.id === "submissions") {
                  const target = rightTab === "code" ? "code" : "submissions";
                  setRightTab(target as any);
                  setMobileView(target);
                } else {
                  if (["theme", "templates"].includes(tab.id)) {
                    setLeftTab(tab.id as any);
                  } else {
                    setRightTab(tab.id as any);
                  }
                  setMobileView(tab.id as any);
                }
              }}
              className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all relative cursor-pointer ${
                tab.active
                  ? "text-blue-600 dark:text-blue-400 font-bold scale-105"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
              }`}
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 text-[8px] bg-red-500 text-white font-extrabold px-1.5 py-0.5 rounded-full animate-scale-up">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight">{tab.name}</span>
            </button>
          );
        })}
      </div>
  );
};

export default MobileNav;
