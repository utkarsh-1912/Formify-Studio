import React from "react";
import { AppThemeTokens } from "../../utils/appTheme";

interface StatusFooterProps {
  schema: any;
  submissionCount: number;
  workspaceId?: string;
  error: string | null;
  themeTokens: AppThemeTokens;
}

const StatusFooter: React.FC<StatusFooterProps> = ({ schema, submissionCount, workspaceId, error, themeTokens }) => (
      <footer className={`hidden md:flex flex-shrink-0 border-t px-4 py-2 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-1.5 sm:gap-0 text-[10px] sm:text-[11px] text-center sm:text-left z-20 ${themeTokens.footer}`}>
        <div className="flex flex-wrap justify-center sm:justify-start items-center gap-2 sm:gap-4 font-semibold">
          <span>
            Fields: <span className="font-bold opacity-85">{schema.fields?.length || 0}</span>
          </span>
          <span className="opacity-30">|</span>
          <span>
            Submissions: <span className="font-bold opacity-85">{submissionCount}</span>
          </span>
          {workspaceId && (
            <>
              <span className="opacity-30">|</span>
              <span className="text-blue-500 font-mono select-all">
                ID: {workspaceId}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center space-x-2 flex-shrink-0">
          <span className="font-semibold hidden xs:inline">Validation:</span>
          {error ? (
            <span className="text-red-600 dark:text-red-400 font-bold bg-red-50 dark:bg-red-950/20 px-2 py-0.5 rounded flex items-center space-x-1 animate-pulse border border-red-200/30">
              <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
              <span>Invalid Configuration</span>
            </span>
          ) : (
            <span className="text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded flex items-center space-x-1 border border-emerald-200/30">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>Schema Valid</span>
            </span>
          )}
        </div>
      </footer>
);

export default StatusFooter;
