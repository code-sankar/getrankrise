import { Link } from "react-router-dom";
import logo from "../../assets/logo.png";

/**
 * Oversized brand wordmark that bleeds off the bottom edge of the page.
 * Rendered as SVG with an explicit textLength so it fills the viewport width
 * exactly at every breakpoint — no clamp() guesswork, no reflow surprises.
 * The baseline sits below the viewBox, which is what crops the letterforms.
 */
function BleedWordmark() {
  return (
    <div className="pointer-events-none select-none mt-20 -mb-12 sm:-mb-16" aria-hidden="true">
      <svg
        viewBox="0 0 1200 158"
        preserveAspectRatio="none"
        className="block w-full h-[64px] sm:h-[120px] lg:h-[200px]"
      >
        <defs>
          <linearGradient id="kirtify-wordmark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.14" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.07" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <text
          x="0"
          y="175"
          textLength="1200"
          lengthAdjust="spacingAndGlyphs"
          fill="url(#kirtify-wordmark)"
          style={{
            fontFamily: "inherit",
            fontWeight: 700,
            fontSize: "220px",
            letterSpacing: "-0.04em",
          }}
        >
          Kirtify
        </text>
      </svg>
    </div>
  );
}

export default function Footer() {
  const footerLinks = {
    Product: [
      { label: "Features", to: "#features" },
      { label: "Pricing", to: "#pricing" },
      { label: "Demo", to: "#demo" },
      { label: "Changelog", to: "#changelog" },
    ],
    Industries: [
      { label: "Dental", to: "#" },
      { label: "Salons", to: "#" },
      { label: "Restaurants", to: "#" },
      { label: "Gyms", to: "#" },
      { label: "Home services", to: "#" },
    ],
    Company: [
      { label: "About", to: "#" },
      { label: "Customers", to: "#customers" },
      { label: "Careers", to: "#" },
      { label: "Contact", to: "/contact" },
    ],
    Resources: [
      { label: "Help Center", to: "/help" },
      { label: "FAQ", to: "/faq" },
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Terms of Service", to: "/terms" },
    ],
  };

  const linkClass =
    "text-[13px] text-[#8a8f98] hover:text-white transition-colors duration-200 " +
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 " +
    "focus-visible:ring-offset-2 focus-visible:ring-offset-[#02040a] rounded-sm";

  const renderLink = (link) =>
    link.to.startsWith("/") ? (
      <Link to={link.to} className={linkClass}>
        {link.label}
      </Link>
    ) : (
      <a href={link.to} className={linkClass}>
        {link.label}
      </a>
    );

  return (
    <footer className="relative overflow-hidden bg-[#02040a] pt-24 text-white border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* ── CTA panel ─────────────────────────────────────────── */}
        <div className="relative bg-[#080b12] border border-white/[0.07] rounded-2xl py-20 px-6 sm:px-16 text-center mb-28 max-w-6xl mx-auto">
          <div className="max-w-2xl mx-auto flex flex-col items-center">
            <h2 className="text-3xl sm:text-[42px] font-bold tracking-tight text-white mb-4 leading-none">
              Start ranking. Start growing.
            </h2>
            <p className="text-[14px] text-[#8a8f98] max-w-md mx-auto mb-9">
              Join 8,400+ local teams already running on Kirtify.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
              <Link
                to="/signup"
                className="w-full sm:w-auto bg-white text-black font-semibold text-[13px] px-5 py-2.5 rounded-lg hover:bg-gray-200 active:scale-[0.98] transition-all duration-200 text-center"
              >
                Start 14-day free trial
              </Link>
              <a
                href="#demo"
                className="w-full sm:w-auto border border-white/[0.09] text-gray-300 font-semibold text-[13px] px-5 py-2.5 rounded-lg hover:bg-white/[0.04] hover:text-white active:scale-[0.98] transition-all duration-200 text-center"
              >
                Book a demo
              </a>
            </div>
          </div>
        </div>

        {/* ── Link grid + colophon ──────────────────────────────── */}
        <div className="grid grid-cols-2 gap-y-12 gap-x-8 lg:grid-cols-[1.3fr_repeat(4,minmax(0,1fr))_1.6fr] lg:gap-x-10 pb-14">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-1">
            <Link to="/" className="flex items-center gap-2">
              <img src={logo} alt="" className="w-8 h-8" />
              <span className="font-bold text-[15px] tracking-tight">Kirtify</span>
            </Link>
            <p className="mt-3 text-[13px] text-[#8a8f98] leading-relaxed max-w-[190px]">
              The reputation engine local businesses run on.
            </p>
          </div>

          {/* Columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-[10px] font-semibold text-white uppercase tracking-[0.14em] mb-4">
                {category}
              </h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>{renderLink(link)}</li>
                ))}
              </ul>
            </div>
          ))}

          {/* Colophon — hairline rule, italic serif, like the reference */}
          <div className="col-span-2 lg:col-span-1 border-l border-white/[0.09] pl-5">
            <p className="font-serif italic text-[13px] leading-[1.65] text-[#8a8f98]">
              Reviews are aggregated from{" "}
              <span className="not-italic font-medium text-gray-300">Google Business Profile</span>,{" "}
              <span className="not-italic font-medium text-gray-300">Yelp</span>, and{" "}
              <span className="not-italic font-medium text-gray-300">Facebook</span>. Sync frequency
              depends on your plan.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
              <span className="text-[11px] text-gray-500">All systems operational</span>
            </div>
          </div>
        </div>

        {/* ── Legal row ─────────────────────────────────────────── */}
        <div className="pt-7 border-t border-white/[0.06] text-[12px] text-gray-600 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <span>&copy; {new Date().getFullYear()} Kirtify Inc. All rights reserved.</span>
          <div className="flex gap-5">
            <Link to="/privacy" className="hover:text-white transition-colors duration-200">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-white transition-colors duration-200">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>

      {/* ── Signature: oversized wordmark, cropped by the page edge ── */}
      <BleedWordmark />
    </footer>
  );
}