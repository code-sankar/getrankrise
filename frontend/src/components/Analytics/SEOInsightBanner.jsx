/**
 * SEOInsightBanner.jsx
 * Indigo CTA banner shown ONLY when urgentCount > 0.
 * urgentCount is derived from rawReviews (rating <= 2 AND replied:false)
 * so this banner only appears when real data warrants it.
 *
 * Props:
 *   urgentCount — summary.urgentCount from Redux
 *   dark        — boolean
 */
import { Link } from "react-router-dom";

export default function SEOInsightBanner({ urgentCount, dark }) {
  // Don't render if no urgent reviews — data-driven visibility
  if (!urgentCount || urgentCount === 0) return null;

  return (
    <div
      className={`rounded-2xl border p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
        dark
          ? "bg-cyan-600/10 border-cyan-500/20"
          : "bg-cyan-50 border-cyan-100"
      }`}
    >
      {/* Left — icon + message */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-cyan-700 hover:bg-cyan-600 flex items-center justify-center text-white flex-shrink-0 shadow-lg shadow-cyan-600/30">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <div>
          <h3 className={`font-bold text-sm ${dark ? "text-white" : "text-cyan-900"}`}>
            {urgentCount} urgent review{urgentCount > 1 ? "s" : ""} need{urgentCount === 1 ? "s" : ""} a reply
          </h3>
          <p className={`text-xs mt-0.5 max-w-md ${dark ? "text-cyan-200/60" : "text-cyan-700/60"}`}>
            Responding to negative reviews within 24 hours can lift your local
            search ranking by up to 15%. Don't let these slip.
          </p>
        </div>
      </div>

      {/* Right — CTA button linking to dashboard reviews queue */}
      <Link
        to="/dashboard"
        className="flex-shrink-0 px-6 py-2.5 bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-cyan-600/20 active:scale-95 whitespace-nowrap"
      >
        Respond Now →
      </Link>
    </div>
  );
}