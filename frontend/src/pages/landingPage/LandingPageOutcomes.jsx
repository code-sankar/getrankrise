import analyticsShot from "../../assets/product/analytics.png";

/* ──────────────────────────────────────────────────────────────────────────
   How it works.

   ── WHAT THIS REPLACED ─────────────────────────────────────────────────────
   Four invented performance metrics — "12.4× more Google reviews per month",
   "68% SMS request open rate", "<3m median AI response time", "+41% lift in
   Maps pack visibility" — and a testimonial attributed to a named person at a
   named business: "Dr. Elena Park · Owner, Park Family Dental". No such
   customer exists, and one of the four metrics described a Maps-ranking
   feature the product does not have.

   A fabricated quote from an invented dentist is not a design problem to be
   restyled; it is a claim that cannot be made. And an unlaunched product has
   no outcome numbers to report, because it has produced no outcomes.

   ── WHY THIS SECTION INSTEAD ───────────────────────────────────────────────
   The slot is worth keeping. What a prospect needs at this point in the page
   is not a statistic they cannot verify — it is to understand what happens
   after they sign up, and to see the product a second time doing something
   other than what the hero showed. Both are things this product can honestly
   supply today.

   When there are real customers, a real quote belongs here. Until then this
   earns the space on its own.
   ────────────────────────────────────────────────────────────────────────── */

const STEPS = [
  {
    n: "01",
    title: "Connect your profiles",
    body:
      "Sign in with Google, Yelp or Facebook and pick the location you manage. Kirtify pulls the review history it can see straight away.",
  },
  {
    n: "02",
    title: "Reviews land in one feed",
    body:
      "Every platform in a single list, newest first, with the unanswered low ratings pushed to the top so nothing sits for a week unseen.",
  },
  {
    n: "03",
    title: "Reply in a couple of clicks",
    body:
      "Draft a reply yourself, or have one written in your clinic's voice and edit it before it goes out. Nothing is ever posted without you.",
  },
];

export default function Outcomes() {
  return (
    <section className="relative bg-gradient-to-b from-[#030712] to-[#060913] py-24 border-t border-slate-900 text-white overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.04)_0%,transparent_70%)] pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-[12px] text-slate-400 uppercase tracking-widest font-semibold">
            How it works
          </span>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mt-3 text-balance">
            Running by the end of your coffee.
          </h2>
        </div>

        <ol className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="rounded-xl border border-slate-900/80 bg-[#080c14] p-7 text-left"
            >
              <span className="block text-[11px] font-bold tracking-[0.18em] text-cyan-400 mb-4">
                {s.n}
              </span>
              <h3 className="text-[15px] font-semibold text-white mb-2.5 tracking-tight">
                {s.title}
              </h3>
              <p className="text-[13px] leading-[1.65] text-[#8a8f98]">{s.body}</p>
            </li>
          ))}
        </ol>

        {/* The product a second time, showing the half the hero did not. */}
        <div className="max-w-4xl mx-auto">
          <figure className="rounded-xl overflow-hidden border border-slate-800/80 bg-[#0b0e14] shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
            <img
              src={analyticsShot}
              alt="The Kirtify analytics screen: reviews in the selected range,
                   average rating, response rate and sentiment, with review
                   growth over time and a per-platform breakdown."
              className="block w-full"
              width={2880}
              height={1800}
              loading="lazy"
            />
          </figure>
          <figcaption className="text-center text-[11px] text-slate-500 mt-4">
            Ratings, response rate and sentiment over any period — and which
            platform they came from.
          </figcaption>
        </div>
      </div>
    </section>
  );
}
