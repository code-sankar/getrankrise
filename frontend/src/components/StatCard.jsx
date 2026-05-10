import { useTheme } from "../context/ThemeContext.jsx";

export default function StatCard({ label, value, sub, subColor, chart }) {
  const { dark } = useTheme();

  const cardBg   = dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200";
  const labelCol = dark ? "text-slate-400" : "text-slate-500";
  const valueCol = dark ? "text-white" : "text-slate-900";

  return (
    <div className={`border rounded-xl px-5 py-5 flex flex-col gap-3 ${cardBg}`}>
      <p className={`text-sm font-medium ${labelCol}`}>{label}</p>

      <div className="flex items-end justify-between gap-2">
        <p className={`text-3xl font-bold leading-none ${valueCol}`}>{value}</p>
        {/* Mini bar chart for avg rating */}
        {chart && (
          <div className="flex items-end gap-0.5 h-10">
            {chart.map((bar, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <div
                  className="w-3 rounded-sm"
                  style={{
                    height: `${Math.max(4, bar.pct * 36)}px`,
                    background: bar.color,
                    opacity: 0.85,
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {sub && (
        <p className={`text-sm font-medium ${subColor || (dark ? "text-slate-400" : "text-slate-500")}`}>
          {sub}
        </p>
      )}
    </div>
  );
}