/**
 * AnalyticsCard.jsx
 * Reusable wrapper card used by every chart section on the Analytics page.
 * Props:
 *   title    — card heading
 *   subtitle — small description line
 *   badge    — optional JSX element shown top-right (e.g. trend pill)
 *   dark     — boolean from ThemeContext
 *   children — chart or content inside the card
 */
export default function AnalyticsCard({ title, subtitle, badge, children, dark }) {
  return (
    <div
      className={`rounded-2xl border transition-all duration-300 ${
        dark
          ? "bg-slate-900/40 border-slate-800 hover:border-slate-700"
          : "bg-white border-slate-200 shadow-sm hover:shadow-md"
      }`}
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className={`font-bold text-sm ${dark ? "text-white" : "text-slate-900"}`}>
              {title}
            </h3>
            {subtitle && (
              <p className={`text-xs mt-0.5 text-slate-600 dark:text-slate-400`}>
                {subtitle}
              </p>
            )}
          </div>
          {badge && <div className="flex-shrink-0 ml-3">{badge}</div>}
        </div>

        {/* Content */}
        {children}
      </div>
    </div>
  );
}