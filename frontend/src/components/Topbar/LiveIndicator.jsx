import React from "react";

function LiveIndicator() {
  return (
    <div className="hidden xl:flex mr-2 items-center gap-2">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-500">
        Live Updates
      </span>
    </div>
  );
}

export default LiveIndicator;
