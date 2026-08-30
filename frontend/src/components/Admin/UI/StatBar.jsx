
/**
 * A themed progress bar for displaying admin metrics and targets.
 */
export default function StatBar({ 
  label, 
  value, 
  percentage, 
  colorClass = "bg-cyan-600", 
  dark 
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <span className={`text-xs font-medium text-slate-600 dark:text-slate-400`}>
          {label}
        </span>
        <span className={`text-sm font-bold ${dark ? "text-white" : "text-slate-900"}`}>
          {value}
        </span>
      </div>
      <div className={`h-2 w-full rounded-full overflow-hidden ${
        dark ? "bg-slate-800" : "bg-slate-100"
      }`}>
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-out ${colorClass}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}