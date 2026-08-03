// frontend/src/theme.js
//
// The design system, in one file.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// Before Step 6 the app ran three accent systems at once:
//
//   cyan     the newer components — YelpConnect, FacebookConnect,
//            UpgradeModal, ReviewsQueueState, the SendGrid email template
//            (#0891b2). This is the one the product spec actually calls for.
//   indigo   Sidebar, Dashboard filter pills, Analytics, AdminProfile,
//            ProfileTabs, FAQ, the legal pages, NotificationBell — the older
//            pages, plus the chart ramp in analyticsSlice.
//   blue     Settings toggles and inputs, TopBar, AppBootstrap's spinner,
//            and the landing page's own #3b82f6.
//
// A user could cross three palettes going Dashboard → Settings → Competitors.
// This file is the single place the answer lives now.
//
// ── SHAPE: WHY CLASS STRINGS AND NOT CSS VARIABLES ──────────────────────────
// Every component in this codebase already takes a `dark` boolean from
// ThemeContext and picks Tailwind classes from it. Tokens that fit that
// existing pattern get adopted; tokens that require rewriting every component
// to use CSS custom properties do not. So: named exports of class strings,
// plus a theme(dark) factory for the surface/text/border families that vary
// by mode.
//
// Tailwind's JIT compiler needs to SEE the full class name in source, which is
// why every value below is a complete literal — never `bg-${color}-500`. A
// template-built class silently produces no CSS.
//
// ── THE ONE RULE ────────────────────────────────────────────────────────────
// Accent = cyan. Everything else is neutral (slate) plus semantic status
// colours. If you find yourself reaching for a fourth hue, it either belongs
// in STATUS below or it is a third-party brand colour, which is data, not
// theme — see PLATFORM.

// ── Accent ───────────────────────────────────────────────────────────────────
// cyan-500 for tints and borders, cyan-400 for text on dark surfaces (cyan-500
// text on obsidian sits just under comfortable contrast; cyan-400 clears it).
//
// ── SOLID FILLS: NEAR-BLACK ON BRIGHT, NOT WHITE ON MID ─────────────────────
// The connect cards currently ship `bg-cyan-500 text-white`. White on #06b6d4
// measures ~2.3:1 — a clear WCAG AA failure, and propagating it across every
// button in the app during a sweep would turn one accessibility bug into
// forty. `text-slate-950` on `bg-cyan-400` measures ~11:1.
//
// It is also the better answer for this product specifically. A bright cyan
// chip with a near-black label reads as instrument panel — dashboards, sync
// clocks, usage meters, which is what GetRankRise actually is — where
// white-on-mid-cyan is the button every SaaS ships. If you want the old look
// back it is one line: `bg-cyan-600 hover:bg-cyan-500 text-white` also passes
// (4.9:1), at the cost of a duller accent.
export const accent = {
  // Solid primary button
  solid:
    "bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold transition-colors active:scale-95",
  // Solid, but for a full-width or emphasis CTA
  solidLg:
    "bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold transition-colors active:scale-[0.98]",
  // Tinted pill / badge — the "3 Reviews Found" and usage-chip pattern
  soft: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  softLight: "bg-cyan-50 text-cyan-700 border border-cyan-100",
  // Inline text link / tertiary action
  link: "text-cyan-400 hover:text-cyan-300 transition-colors",
  linkLight: "text-cyan-600 hover:text-cyan-700 transition-colors",
  // Icon and glyph colour
  icon: "text-cyan-500",
  // Selected state for list rows and pickers
  selected: "bg-cyan-500/10 border-cyan-500/40",
  selectedLight: "bg-cyan-50 border-cyan-300",
  // Focus ring — one value, everywhere, so keyboard navigation is legible
  ring: "outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 focus-visible:ring-offset-0",
  // Active nav indicator (the Sidebar's left bar)
  bar: "bg-cyan-500",
  // Gradient, used ONLY on the upgrade CTA. One gradient in the product.
  gradient:
    "bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg hover:shadow-cyan-500/30",
};

// ── Surfaces, text, borders ──────────────────────────────────────────────────
// Call once per component: `const t = theme(dark)`.
export const theme = (dark) => ({
  // Page background. #0b0f1a is the obsidian the Dashboard already uses;
  // everything else was drifting between slate-950 and #030712.
  page: dark ? "bg-[#0b0f1a]" : "bg-slate-50",
  // Standard card
  card: dark
    ? "bg-slate-900 border-slate-800"
    : "bg-white border-slate-200 shadow-sm",
  // Elevated / glass card — the Dashboard reviews queue
  cardGlass: dark
    ? "bg-slate-900/50 border-slate-800/50 backdrop-blur-xl"
    : "bg-white border-slate-200 shadow-sm",
  // Inset surface: inputs, code blocks, table headers
  inset: dark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200",

  // Text scale — three levels, no more
  textPrimary: dark ? "text-white" : "text-slate-900",
  textBody: dark ? "text-slate-300" : "text-slate-700",
  textMuted: dark ? "text-slate-400" : "text-slate-500",
  textFaint: dark ? "text-slate-500" : "text-slate-400",

  border: dark ? "border-slate-800" : "border-slate-200",
  divider: dark ? "divide-slate-800" : "divide-slate-100",
  rowHover: dark ? "hover:bg-slate-800/60" : "hover:bg-slate-50",

  input: dark
    ? "bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-600 focus:border-cyan-500"
    : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500",

  // Unselected control (filter pill, secondary button)
  chip: dark
    ? "border-slate-700 text-slate-400 hover:border-slate-500 bg-slate-800/40"
    : "border-slate-200 text-slate-600 hover:border-slate-300 bg-white",

  skeleton: dark ? "bg-slate-800" : "bg-slate-200",
});

// ── Status ───────────────────────────────────────────────────────────────────
// Semantic, never decorative. `warn` is the free-tier cap banner; `danger` is
// destructive actions and 1–2★ alerts.
export const status = {
  success: {
    text: "text-emerald-400",
    soft: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
    hex: "#10b981",
  },
  warn: {
    text: "text-amber-400",
    soft: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    softLight: "bg-amber-50 border-amber-200 text-amber-800",
    hex: "#f59e0b",
  },
  danger: {
    text: "text-red-400",
    soft: "bg-red-500/10 border-red-500/30 text-red-400",
    hex: "#ef4444",
  },
  info: {
    text: "text-cyan-400",
    soft: "bg-cyan-500/10 border-cyan-500/30 text-cyan-300",
    hex: "#06b6d4",
  },
};

// ── Chart colours ────────────────────────────────────────────────────────────
// Recharts and inline SVG need hex, not class names. Keeping them here rather
// than in analyticsSlice means the chart ramp can't drift from the UI accent
// the way the indigo ramp (#6366f1 → #e0e7ff) did.
export const CHART = {
  // Single-series accent
  accent: "#06b6d4", // cyan-500
  accentSoft: "#22d3ee", // cyan-400
  axis: "#475569", // slate-600
  axisLight: "#94a3b8", // slate-400
  grid: "#1e293b", // slate-800

  // 5★ → 1★. A cyan ramp, so the distribution reads as one measure rather
  // than five unrelated categories.
  ratingRamp: ["#06b6d4", "#22d3ee", "#67e8f9", "#a5f3fc", "#cffafe"],

  // Sentiment / quality bars, where the meaning IS good-to-bad and a single
  // hue would hide it. This is the one place a multi-hue ramp is correct.
  qualityRamp: ["#10b981", "#84cc16", "#eab308", "#f97316", "#ef4444"],
};

// ── Third-party brand colours ────────────────────────────────────────────────
// NOT part of the theme and never swept into it. A Google chip is blue because
// Google is blue; recolouring it to cyan makes the platform unrecognisable at
// a glance, which is the entire job of a platform chip in a unified feed.
// Excluded from the codemod by explicit hex allowlist.
export const PLATFORM = {
  Google: "#4285F4",
  Yelp: "#D32323",
  Facebook: "#1877F2",
};

export default theme;