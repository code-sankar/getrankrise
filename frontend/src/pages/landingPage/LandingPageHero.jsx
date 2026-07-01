import React from 'react';
import { ArrowRight, Star, Sparkles, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardPreview from './LandingPageDashboardPreview.jsx';

/* ──────────────────────────────────────────────────────────────────────────
   Floating signature card — the SINGLE bold element.
   Shows an inbound 5★ review on the left, an AI-drafted reply on the right.
   This is the entire product story compressed into one artifact.
   ────────────────────────────────────────────────────────────────────────── */
function SignatureAICard() {
  return (
    <div
      className="
        hidden lg:flex absolute -right-6 xl:-right-12 top-[18%]
        w-[320px] xl:w-[360px] z-20
        flex-col gap-3
        rounded-2xl border border-gray-800/80 bg-[#0b0e14]/90 backdrop-blur-xl
        p-4 shadow-[0_20px_80px_-20px_rgba(59,130,246,0.35),0_0_0_1px_rgba(59,130,246,0.08)]
      "
      aria-hidden="true"
    >
      {/* Header strip */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-900/70">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#3b82f6]/15 border border-[#3b82f6]/30 flex items-center justify-center">
            <Sparkles size={12} className="text-[#60a5fa]" />
          </div>
          <span className="text-[11px] font-semibold text-gray-300 tracking-tight">
            AI Response Draft
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex w-1.5 h-1.5">
            <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3b82f6] opacity-60" />
            <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
          </span>
          <span className="text-[9px] font-bold tracking-[0.12em] text-[#60a5fa] uppercase">
            Live
          </span>
        </div>
      </div>

      {/* The inbound review (compressed) */}
      <div className="rounded-lg bg-[#06080c] border border-gray-900/80 p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold text-gray-300">Priya M.</span>
          <div className="flex gap-0.5 text-amber-400">
            {[...Array(5)].map((_, i) => (
              <Star key={i} size={9} fill="currentColor" stroke="none" />
            ))}
          </div>
        </div>
        <p className="text-[10px] leading-[1.45] text-gray-500">
          "Dr. Shah is amazing — painless cleaning and the front desk team
          was so warm. Highly recommend."
        </p>
      </div>

      {/* AI-drafted reply */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] font-bold tracking-[0.12em] text-gray-500 uppercase">
            Suggested reply
          </span>
          <span className="text-[9px] text-gray-600">2.3s</span>
        </div>
        <p className="text-[11px] leading-[1.5] text-gray-300">
          Thank you, Priya — we're delighted the team made you comfortable.
          We'll pass the kind words along to Dr. Shah.
        </p>
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-2 pt-2">
        <button className="flex-1 text-[10px] font-semibold text-white bg-[#3b82f6] hover:bg-[#2563eb] transition-colors rounded-md py-1.5 flex items-center justify-center gap-1">
          <Check size={11} />
          Send reply
        </button>
        <button className="text-[10px] font-medium text-gray-400 hover:text-gray-200 bg-[#121620] border border-gray-900 rounded-md px-2.5 py-1.5 transition-colors">
          Regenerate
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Small floating "Maps rank ↑" indicator on the left.
   Quiet, single-purpose. Reinforces the outcome the product delivers.
   ────────────────────────────────────────────────────────────────────────── */
function MapsRankPill() {
  return (
    <div
      className="
        hidden lg:flex absolute -left-4 xl:-left-10 top-[55%]
        z-20 items-center gap-2.5
        rounded-xl border border-gray-800/80 bg-[#0b0e14]/90 backdrop-blur-xl
        px-3.5 py-2.5
        shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.02)]
      "
      aria-hidden="true"
    >
      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 8L6 4L10 8" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="text-left">
        <div className="text-[9px] font-bold tracking-[0.1em] text-gray-500 uppercase leading-none mb-1">
          Maps Rank
        </div>
        <div className="text-xs font-semibold text-white tracking-tight leading-none">
          #2 <span className="text-emerald-400 font-medium">▲ 3</span>
        </div>
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <section className="relative pt-40 pb-24 bg-[#0a0c10] text-white overflow-hidden flex flex-col items-center">

      {/* Existing grid lattice — unchanged */}
      <div
        className="
          absolute inset-0
          bg-[linear-gradient(to_right,#141822_1px,transparent_1px),linear-gradient(to_bottom,#141822_1px,transparent_1px)]
          bg-[size:4.5rem_4.5rem]
          [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]
          pointer-events-none
        "
      />

      {/* SINGLE ambient wash — restrained, one source, top-center */}
      <div
        className="
          absolute top-0 left-1/2 -translate-x-1/2
          w-[1200px] h-[700px]
          bg-[radial-gradient(ellipse_50%_60%_at_50%_0%,rgba(59,130,246,0.10),transparent_70%)]
          pointer-events-none
        "
      />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center">

        {/* Eyebrow badge */}
        {/* <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111622]/60 border border-gray-800/80 text-[11px] text-gray-400 mb-9 hover:border-gray-700/80 transition-colors cursor-pointer tracking-wide backdrop-blur-sm">
          <span className="relative flex w-1.5 h-1.5">
            <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3b82f6] opacity-60" />
            <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
          </span>
          <span>New — AI Review Responder v2</span>
          <span>Just shipped: AI Responder v2 is here!</span>
          <ArrowRight size={11} className="text-gray-500" />
        </div> */}

        {/* Headline */}
        <h1 className="text-[42px] sm:text-[76px] font-semibold tracking-tight text-white mb-7 max-w-4xl mx-auto leading-[1.08]">
          The reputation engine <br />
          <span className="text-[#888e96] font-semibold">local businesses run on.</span>
        </h1>

        {/* Subhead */}
        <p className="text-sm sm:text-[15px] text-[#8a8f98] max-w-xl mx-auto mb-10 leading-[1.6] tracking-normal">
          Collect more Google reviews, respond instantly with AI, and outrank
          competitors on Maps — all from one calm, intelligent dashboard.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto mb-16">
          <Link
            to="/signup"
            className="
              w-full sm:w-auto bg-white text-black font-semibold text-[13px]
              px-5 py-3 rounded-xl flex items-center justify-center gap-1.5
              hover:bg-gray-100 transition-all group
              shadow-[0_8px_30px_-8px_rgba(255,255,255,0.3)]
            "
          >
            Start 14-day free trial
            <ArrowRight size={14} className="text-black group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <a
            href="#demo"
            className="
              w-full sm:w-auto bg-[#121620]/40 border border-gray-800/80
              text-gray-300 font-semibold text-[13px] px-5 py-3 rounded-xl
              hover:bg-[#121620]/80 hover:border-gray-700 transition-all text-center
              backdrop-blur-sm
            "
          >
            See live demo
          </a>
        </div>

        {/* Trust strip */}
        <div className="w-full max-w-4xl flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-0 text-[11px] text-[#626770] tracking-wide font-medium mb-16">
          <div className="flex items-center justify-center gap-2 sm:pr-8">
            <div className="flex text-white gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={11} fill="currentColor" stroke="none" />
              ))}
            </div>
            <span>4.9 on G2 · 1,200+ reviews</span>
          </div>
          <div className="hidden sm:block h-3.5 w-[1px] bg-gray-800/60" />
          <div className="sm:px-8">TRUSTED BY 8,400+ LOCAL BUSINESSES</div>
          <div className="hidden sm:block h-3.5 w-[1px] bg-gray-800/60" />
          <div className="sm:pl-8">SOC 2 TYPE II</div>
        </div>

        {/* Dashboard frame + the ONE bold signature: floating AI draft card */}
        <div className="relative w-full">
          <SignatureAICard />
          <MapsRankPill />
          <DashboardPreview />
        </div>
      </div>
    </section>
  );
}