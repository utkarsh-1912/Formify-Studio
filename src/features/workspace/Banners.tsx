import React from "react";
import { Eye, Lock } from "lucide-react";

interface BannersProps {
  showSwitchBanner: boolean;
  hasEditPermission: boolean;
  onSwitchToEdit: () => void;
}

const Banners: React.FC<BannersProps> = ({ showSwitchBanner, hasEditPermission, onSwitchToEdit }) => (
  <>
      {showSwitchBanner && (
        <div className="flex-shrink-0 bg-blue-600 text-white text-xs px-4 py-2 sm:px-6 sm:py-2.5 flex items-center justify-between shadow-md z-30 animate-fade-in font-semibold">
          <span className="flex items-center space-x-1.5 font-sans">
            <Lock className="h-3.5 w-3.5 text-blue-200" />
            <span>You own this workspace. You are currently viewing in <strong>View-Only Mode</strong>.</span>
          </span>
          <button
            onClick={onSwitchToEdit}
            className="bg-white text-blue-600 px-3 py-1 rounded-lg hover:bg-blue-50 transition-colors font-bold cursor-pointer text-[10px] sm:text-xs"
          >
            Switch to Edit Mode
          </button>
        </div>
      )}
      {!hasEditPermission && !showSwitchBanner && (
        <div className="flex-shrink-0 bg-slate-800 text-white text-xs px-4 py-2 sm:px-6 sm:py-2.5 flex items-center shadow-md z-30 animate-fade-in font-semibold">
          <span className="flex items-center space-x-1.5 font-sans">
            <Eye className="h-3.5 w-3.5 text-slate-400" />
            <span>Viewing in <strong>View-Only Mode</strong>. You cannot edit this workspace.</span>
          </span>
        </div>
      )}
  </>
);

export default Banners;
