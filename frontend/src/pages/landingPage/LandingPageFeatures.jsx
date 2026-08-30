import {
  Bot,
  LineChart,
  MessageSquare,
  ShieldAlert,
  Sliders,
  Target,
  Star,
  Check,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   Feature data
   Each card carries its own accent color so the grid reads as a family,
   not a list of identical tiles. Colors are deliberately quiet — used only
   in the icon zone and as a faint hover tint — keeping the palette restrained.
───────────────────────────────────────────────────────────────────────────── */
const items = [
  {
    icon: Bot,
    title: "AI Review Responder",
    desc: "On-brand replies in seconds. Trained on tone, services, and policies — approve or auto-send.",
    accent: "#3b82f6",       // blue  — this is the flagship feature
    featured: true,          // gets the wide hero treatment in row 1
  },
  {
    icon: Target,
    title: "Competitor Intelligence",
    desc: "Track ratings, review velocity, and ranking shifts across every local competitor in your area.",
    accent: "#f59e0b",       // amber — data/tracking
  },
  {
    icon: MessageSquare,
    title: "SMS & WhatsApp Campaigns",
    desc: "Request reviews at the perfect moment with deliverable, high-converting two-way messaging.",
    accent: "#34d399",       // green  — outreach/growth
  },
  {
    icon: LineChart,
    title: "Local SEO Analytics",
    desc: "Grid-based rank tracking across every neighborhood you serve, updated daily.",
    accent: "#a78bfa",       // violet — analytics
  },
  {
    icon: Sliders,
    title: "Reputation Workflows",
    desc: "Trigger requests, routes, and escalations with rules that match how your business actually runs.",
    accent: "#22d3ee",       // cyan   — automation
  },
  {
    icon: ShieldAlert,
    title: "Sentiment Monitoring",
    desc: "Spot emerging issues in customer feedback before they reach the front page of Google.",
    accent: "#f43f5e",       // rose   — alert/protection
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
   Signature element: the AI Responder card gets a collapsed live demo baked
   in — a real review + AI draft reply visible right in the feature card.
   This is the ONE bold visual move; every other card stays quiet.
───────────────────────────────────────────────────────────────────────────── */
function AIPreviewEmbed() {
  return (
    <div className="mt-5 rounded-xl border border-[#3b82f6]/12 bg-[#020510] overflow-hidden">
      {/* Inbound review */}
      <div className="px-3.5 py-3 border-b border-[#3b82f6]/10">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold text-slate-300">Sarah K.</span>
          <div className="flex gap-0.5 text-amber-400">
            {[...Array(5)].map((_, i) => (
              <Star key={i} size={8} fill="currentColor" stroke="none" />
            ))}
          </div>
        </div>
        <p className="text-[10px] leading-[1.5] text-slate-400">
          "Best dentist visit I've had — quick, painless, and the team made me feel completely at ease."
        </p>
      </div>

      {/* AI draft */}
      <div className="px-3.5 py-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className="w-3.5 h-3.5 rounded bg-[#3b82f6]/15 flex items-center justify-center">
            <Bot size={8} className="text-[#60a5fa]" />
          </div>
          <span className="text-[9px] font-bold text-[#60a5fa] tracking-wider uppercase">AI Draft · 1.8s</span>
        </div>
        <p className="text-[10px] leading-[1.5] text-slate-300">
          Thank you, Sarah — this genuinely made our team's day.
          We'll pass your kind words along!
        </p>
        <div className="flex gap-1.5 mt-2.5">
          <button className="flex items-center gap-1 text-[9px] font-semibold text-white bg-[#3b82f6] hover:bg-[#2563eb] rounded px-2 py-1 transition-colors">
            <Check size={9} /> Send
          </button>
          <button className="text-[9px] font-medium text-slate-400 hover:text-slate-300 bg-[#0d1118] border border-slate-800 rounded px-2 py-1 transition-colors">
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Standard feature card (used for the 5 non-featured cards).
   Accent color appears only in the icon background on hover — quiet by design.
───────────────────────────────────────────────────────────────────────────── */
function FeatureCard({ item }) {
  const Icon = item.icon;
  return (
    <div
      className="group relative p-7 flex flex-col gap-3 cursor-default transition-colors duration-300 hover:bg-[#0c111c]"
      style={{ "--accent": item.accent }}
    >
      {/* Accent tint bleeds in from the bottom-left corner on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-none"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 0% 100%, ${item.accent}07, transparent)`,
        }}
      />

      {/* Icon badge */}
      <div
        className="relative w-9 h-9 rounded-lg border border-slate-800 bg-[#030712] flex items-center justify-center transition-all duration-300 group-hover:border-slate-700 group-hover:-translate-y-0.5 group-hover:shadow-lg"
        style={{
          boxShadow: "none",
        }}
      >
        <Icon
          size={17}
          style={{ color: "#6b7280", transition: "color 0.3s" }}
          className="group-hover:!text-white transition-colors duration-300"
        />
        {/* Icon glow on hover */}
        <div
          className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ background: `${item.accent}18`, boxShadow: `0 0 14px ${item.accent}30` }}
        />
      </div>

      <h4 className="text-sm font-bold tracking-tight text-white leading-snug">
        {item.title}
      </h4>
      <p className="text-[13px] text-slate-400 leading-relaxed group-hover:text-slate-400 transition-colors duration-300">
        {item.desc}
      </p>

      {/* Accent-colored bottom edge — appears on hover */}
      <div
        className="absolute bottom-0 left-7 right-7 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: `linear-gradient(to right, transparent, ${item.accent}40, transparent)` }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Featured card — AI Review Responder.
   Spans the full first row on desktop (col-span-1, but visually distinguished
   by the live demo embed, a thicker accent border-left, and a blue rim glow).
───────────────────────────────────────────────────────────────────────────── */
function FeaturedCard({ item }) {
  const Icon = item.icon;
  return (
    <div className="group relative p-7 flex flex-col gap-3 cursor-default transition-colors duration-300 hover:bg-[#0a0f1c]">
      {/* Blue radial ambient — subtly present even at rest */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{
          background: "radial-gradient(ellipse 90% 70% at 0% 0%, rgba(59,130,246,0.05), transparent)",
        }}
      />
      {/* Stronger on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500"
        style={{
          background: "radial-gradient(ellipse 90% 80% at 0% 0%, rgba(59,130,246,0.10), transparent)",
        }}
      />

      {/* Left accent bar */}
      <div className="absolute left-0 top-8 bottom-8 w-[2px] bg-gradient-to-b from-transparent via-[#3b82f6]/60 to-transparent rounded-full" />

      {/* Icon + badge row */}
      <div className="flex items-center gap-3">
        <div className="relative w-9 h-9 rounded-lg border border-[#3b82f6]/25 bg-[#060e1f] flex items-center justify-center group-hover:-translate-y-0.5 transition-all duration-300"
          style={{ boxShadow: "0 0 18px rgba(59,130,246,0.15)" }}>
          <Icon size={17} className="text-[#60a5fa]" />
        </div>
        <span className="text-[9px] font-bold tracking-[0.15em] text-[#3b82f6] uppercase bg-[#3b82f6]/10 border border-[#3b82f6]/20 px-2 py-0.5 rounded-full">
          Flagship
        </span>
      </div>

      <h4 className="text-sm font-bold tracking-tight text-white leading-snug">
        {item.title}
      </h4>
      <p className="text-[13px] text-slate-400 leading-relaxed group-hover:text-slate-400 transition-colors duration-300">
        {item.desc}
      </p>

      {/* Live demo embed — the signature element of this whole section */}
      <AIPreviewEmbed />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Section — assembles the grid.

   Layout:
     Row 1: Featured (AI) | Standard | Standard
     Row 2: Standard | Standard | Standard

   Internal dividers use border classes on the grid wrapper;
   no wrapping row divs needed, which eliminates the seam.
───────────────────────────────────────────────────────────────────────────── */
export default function Features() {
  const [featured, ...rest] = items;

  return (
    <section
      id="features"
      className="relative bg-[#060a12] py-28 text-white overflow-hidden"
    >
      {/* Gradient continuity with the hero above */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-slate-800/60 to-transparent pointer-events-none" />
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[300px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 100% at 50% 0%, rgba(59,130,246,0.05), transparent)",
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Section header */}
        <div className="text-center mb-16">
          <span className="text-[11px] text-slate-400 uppercase tracking-[0.2em] font-semibold">
            Platform
          </span>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mt-3 mb-4 leading-[1.1]">
            One platform.{" "}
            <span className="text-slate-400 font-medium">Every growth lever.</span>
          </h2>
          <p className="text-[14px] text-slate-400 max-w-lg mx-auto leading-relaxed">
            From the first review request to the last competitor benchmark —
            Kirtify replaces a stack of disconnected tools with one calm system.
          </p>
        </div>

        {/* Unified grid — single container, no seam */}
        <div className="rounded-2xl border border-slate-900/80 bg-[#080c14] overflow-hidden shadow-[0_20px_80px_-20px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.01)]">

          {/* Row 1: 3 columns */}
          <div className="grid grid-cols-1 md:grid-cols-3 md:divide-x divide-slate-900/80">
            {/* Featured card */}
            <FeaturedCard item={featured} />

            {/* Standard cards 1 & 2 */}
            {rest.slice(0, 2).map((item) => (
              <div key={item.title} className="border-t md:border-t-0 border-slate-900/80">
                <FeatureCard item={item} />
              </div>
            ))}
          </div>

          {/* Horizontal divider between rows */}
          <div className="h-px bg-slate-900/80" />

          {/* Row 2: 3 columns */}
          <div className="grid grid-cols-1 md:grid-cols-3 md:divide-x divide-slate-900/80">
            {rest.slice(2).map((item) => (
              <div key={item.title} className="border-t md:border-t-0 border-slate-900/80 first:border-t-0">
                <FeatureCard item={item} />
              </div>
            ))}
          </div>
        </div>

        {/* Bottom micro-cta — quiet, optional */}
        <p className="text-center mt-8 text-[12px] text-slate-400">
          All six features active from day one.{" "}
          <a href="#pricing" className="text-slate-400 hover:text-white transition-colors underline underline-offset-2 decoration-slate-700 hover:decoration-slate-500">
            See what's included in each plan →
          </a>
        </p>
      </div>
    </section>
  );
}