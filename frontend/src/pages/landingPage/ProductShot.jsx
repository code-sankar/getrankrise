import reviewsInbox from "../../assets/product/reviews-inbox.png";

/* ──────────────────────────────────────────────────────────────────────────
   The product, in a browser frame.

   ── WHY A REAL SCREENSHOT ──────────────────────────────────────────────────
   What sat here before was 356 lines of JSX drawing a picture of a dashboard.
   It had two problems. The smaller one is that hand-built mocks drift — this
   one had, badly. The larger one is that it advertised a product that does
   not exist: its sidebar listed "Local SEO" and "Workflows", and a floating
   card showed a "Maps Rank" that Kirtify does not track. Anyone who signed up
   on the strength of that would have arrived somewhere else.

   This is a render of the running application. It cannot drift, because
   regenerating it means running the app; and it cannot promise a feature that
   is not there, because it is a photograph of what is.

   ── THE FRAME IS NOT DECORATION ────────────────────────────────────────────
   The chrome and the URL do real work: they say "this is software you log
   into", which is the thing a visitor is deciding about. The screenshot alone,
   floating on a dark page, reads as an infographic.
   ────────────────────────────────────────────────────────────────────────── */
export default function ProductShot() {
  return (
    <div className="relative w-full max-w-5xl mx-auto">
      {/* Glow beneath the frame — grounds it rather than leaving it floating. */}
      <div
        className="absolute -inset-x-8 -bottom-8 h-40 bg-[radial-gradient(ellipse_50%_100%_at_50%_100%,rgba(34,211,238,0.12),transparent_70%)] pointer-events-none"
        aria-hidden="true"
      />

      <figure className="relative rounded-xl overflow-hidden border border-slate-800/80 bg-[#0b0e14] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.03)]">
        {/* Browser chrome */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/70 bg-[#0d1017]">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
            <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
            <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="px-3 py-1 rounded-md bg-[#06080c] border border-slate-800/70 text-[10px] text-slate-500 font-medium">
              app.kirtify.com/dashboard
            </div>
          </div>
          {/* Balances the traffic lights so the URL sits optically centred. */}
          <div className="w-[52px]" aria-hidden="true" />
        </div>

        <img
          src={reviewsInbox}
          alt="The Kirtify review inbox: Google, Yelp and Facebook reviews in one
               feed, each showing its rating and platform, with unanswered
               negative reviews flagged for attention and replied ones marked."
          className="block w-full"
          width={2880}
          height={1800}
          loading="eager"
          // The hero image is the largest paint on the page; telling the
          // browser it matters measurably improves LCP.
          fetchPriority="high"
        />
      </figure>
    </div>
  );
}
