
function LiveIndicator() {
  return (
    <div className="hidden xl:flex mr-2 items-center gap-2">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
        Live Updates
      </span>
    </div>
  );
}

export default LiveIndicator;
