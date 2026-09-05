import { PLATFORM } from "../../theme.js";

/* ──────────────────────────────────────────────────────────────────────────
   Integration strip.

   ── WHAT THIS REPLACED ─────────────────────────────────────────────────────
   Six invented customer names — BrightSmile, Luxe Salon, Trattoria 9, PeakFit,
   Northside Clinic, HomeCo — under the heading "Trusted by ambitious local
   teams in 24 countries". There are no customers and no 24 countries.

   A logo strip does a real job on a landing page: it tells a stranger this is
   a legitimate piece of software connected to things they recognise. That job
   can be done honestly, because the integrations ARE real and the brands are
   far better known than any customer list would be. Google, Yelp and Facebook
   carry more recognition for a clinic owner than "Trattoria 9" ever did.

   Brand colours come from theme.js PLATFORM — the same values the review feed
   uses for its platform chips, so the marketing page and the product agree.
   ────────────────────────────────────────────────────────────────────────── */

const PLATFORMS = [
  { name: "Google", note: "Business Profile", color: PLATFORM.Google },
  { name: "Yelp", note: "Fusion", color: PLATFORM.Yelp },
  { name: "Facebook", note: "Pages", color: PLATFORM.Facebook },
];

export default function Logos() {
  return (
    <section id="customers" className="bg-[#04060d] py-16 border-y border-slate-900">
      <div className="max-w-5xl mx-auto px-4 text-center">
        <p className="text-[11px] text-slate-400 uppercase tracking-[0.2em] font-semibold mb-10">
          Reads the places your patients already leave reviews
        </p>

        <ul className="flex flex-wrap items-center justify-center gap-x-14 gap-y-8">
          {PLATFORMS.map((p) => (
            <li key={p.name} className="flex items-center gap-3">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: p.color }}
                aria-hidden="true"
              />
              <span className="text-left">
                <span className="block text-white font-semibold text-[15px] tracking-tight leading-none">
                  {p.name}
                </span>
                <span className="block text-[10px] text-slate-500 mt-1 leading-none">
                  {p.note}
                </span>
              </span>
            </li>
          ))}
        </ul>

        {/* Said plainly rather than implied. A visitor who needs Instagram or
            TripAdvisor should find that out here, not after signing up. */}
        <p className="text-[11px] text-slate-500 mt-10">
          More sources on the way. Reviews sync automatically once a platform is
          connected — hourly on Premium, daily on Starter.
        </p>
      </div>
    </section>
  );
}
