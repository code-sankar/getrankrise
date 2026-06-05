import React from 'react';
import { ArrowRight, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardPreview from './LandingPageDashboardPreview.jsx';

export default function Hero() {
  return (
    <section className="relative pt-40 pb-24 bg-[#0a0c10] text-white overflow-hidden flex flex-col items-center">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#141822_1px,transparent_1px),linear-gradient(to_bottom,#141822_1px,transparent_1px)] bg-[size:4.5rem_4.5rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center">
        
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111622]/60 border border-gray-800/80 text-[11px] text-gray-400 mb-9 hover:border-gray-700/80 transition-colors cursor-pointer tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]"></span>
          <span>New — AI Review Responder v2</span>
          <ArrowRight size={11} className="text-gray-500" />
        </div>

        <h1 className="text-[42px] sm:text-[76px] font-semibold tracking-tight text-white mb-7 max-w-4xl mx-auto leading-[1.08]">
          The reputation engine <br />
          <span className="text-[#888e96] font-semibold">local businesses run on.</span>
        </h1>

        <p className="text-sm sm:text-[15px] text-[#8a8f98] max-w-xl mx-auto mb-10 leading-[1.6] tracking-normal">
          Collect more Google reviews, respond instantly with AI, and outrank competitors on Maps — all from one calm, intelligent dashboard.
        </p>

        {/* Buttons Row */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto mb-16">
          <Link
            to="/signup"
            className="w-full sm:w-auto bg-white text-black font-semibold text-[13px] px-5 py-3 rounded-xl flex items-center justify-center gap-1.5 hover:bg-gray-100 transition-all group"
          >
            Start 14-day free trial
            <ArrowRight size={14} className="text-black group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <a
            href="#demo"
            className="w-full sm:w-auto bg-[#121620]/40 border border-gray-800/80 text-gray-300 font-semibold text-[13px] px-5 py-3 rounded-xl hover:bg-[#121620]/80 transition-all text-center"
          >
            See live demo
          </a>
        </div>

        {/* Trust Indicators */}
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

        <DashboardPreview />
      </div>
    </section>
  );
}