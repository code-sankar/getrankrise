import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import ProductShot from "./ProductShot.jsx";

/* ──────────────────────────────────────────────────────────────────────────
   Hero.

   ── WHAT CHANGED AND WHY ───────────────────────────────────────────────────
   This section used to carry four claims that were not true: a 4.9 G2 rating
   (there is no G2 listing), "trusted by 8,400+ local businesses" (there are
   no customers yet), SOC 2 Type II (no audit has been done — that one is a
   compliance assertion with legal weight), and a floating "Maps Rank #2 ▲3"
   card for a feature the product does not have.

   They were removed rather than restyled. Beyond the honesty problem, they
   were actively costing conversions: unverifiable scale claims on a brand a
   visitor has never heard of are the single fastest way to read as fake, and
   a clinic owner who has already been pitched by Podium or Birdeye knows what
   real proof looks like.

   What replaces them is the thing that was missing entirely — a picture of
   the actual product. The screenshot in ProductShot is a real render of the
   running app, not a drawing of it.
   ────────────────────────────────────────────────────────────────────────── */

/** Honest, checkable statements. Every one of these is true today. */
const FACTS = ["Google, Yelp & Facebook", "Free plan, no card", "Your data exportable anytime"];

export default function Hero() {
  return (
    <section className="relative pt-36 pb-24 bg-[#0a0c10] text-white overflow-hidden flex flex-col items-center">
      {/* Grid lattice */}
      <div
        className="
          absolute inset-0
          bg-[linear-gradient(to_right,#141822_1px,transparent_1px),linear-gradient(to_bottom,#141822_1px,transparent_1px)]
          bg-[size:4.5rem_4.5rem]
          [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]
          pointer-events-none
        "
      />
      {/* One ambient wash, top-centre */}
      <div
        className="
          absolute top-0 left-1/2 -translate-x-1/2
          w-[1200px] h-[700px]
          bg-[radial-gradient(ellipse_50%_60%_at_50%_0%,rgba(34,211,238,0.10),transparent_70%)]
          pointer-events-none
        "
      />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center text-center">
        {/* Honest positioning rather than invented scale. Saying "early access"
            out loud is more credible than claiming 8,400 customers, and it
            sets the right expectation for the person who signs up. */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111622]/60 border border-slate-800/80 text-[11px] text-slate-400 mb-8 tracking-wide backdrop-blur-sm">
          <span className="relative flex w-1.5 h-1.5">
            <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-60" />
            <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-cyan-400" />
          </span>
          <span>Built for clinics and local practices — now in early access</span>
        </div>

        {/* ── Headline ──────────────────────────────────────────────────────
            Two lines, and the type is sized so each one actually FITS on its
            line. The previous headline wrapped into four ragged lines with
            "run on." dangling alone, because 76px type was set in a box far
            too narrow to hold it — the break was left to chance.
            "One place to answer them." is ~25 characters; at 58px that is
            roughly 700px inside a 896px box, so it holds at every width down
            to the sm breakpoint, where the type steps down with it. */}
        <h1 className="text-[34px] sm:text-[58px] font-semibold tracking-tight text-white mb-6 max-w-4xl mx-auto leading-[1.08]">
          Every review you get.
          <br />
          <span className="text-[#7d838c]">One place to answer them.</span>
        </h1>

        {/* Subhead: what it literally does, in the order the product does it. */}
        <p className="text-sm sm:text-[15px] text-[#8a8f98] max-w-xl mx-auto mb-9 leading-[1.65]">
          Kirtify pulls your Google, Yelp and Facebook reviews into one inbox,
          drafts a reply in your clinic's voice, and puts the ones that need you
          first at the top.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto mb-8">
          <Link
            to="/signup"
            className="
              w-full sm:w-auto bg-white text-black font-semibold text-[13px]
              px-6 py-3 rounded-xl flex items-center justify-center gap-1.5
              hover:bg-slate-100 transition-all group
              shadow-[0_8px_30px_-8px_rgba(255,255,255,0.3)]
            "
          >
            Start free
            <ArrowRight
              size={14}
              className="text-black group-hover:translate-x-0.5 transition-transform"
            />
          </Link>
          <a
            href="#demo"
            className="
              w-full sm:w-auto bg-[#121620]/40 border border-slate-800/80
              text-slate-300 font-semibold text-[13px] px-6 py-3 rounded-xl
              hover:bg-[#121620]/80 hover:border-slate-700 transition-all text-center
              backdrop-blur-sm
            "
          >
            Try the AI reply
          </a>
        </div>

        {/* Three plain facts, each verifiable on this page or after one click —
            in place of the star rating and the customer count. */}
        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-[#7d838c] mb-16">
          {FACTS.map((f) => (
            <li key={f} className="flex items-center gap-1.5">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path
                  d="M2.5 6.2L4.8 8.5L9.5 3.8"
                  stroke="#22d3ee"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {f}
            </li>
          ))}
        </ul>

        {/* The product itself, above the fold. */}
        <ProductShot />
      </div>
    </section>
  );
}
