import React from "react";
import { Link } from "react-router-dom";
import logo from "../../assets/logo.png";

export default function Footer() {
  // Footer links mapped to internal routes when they exist, # anchors otherwise
  const footerLinks = {
    Product: [
      { label: "Features",  to: "#features" },
      { label: "Pricing",   to: "#pricing"  },
      { label: "Demo",      to: "#demo"     },
      { label: "Changelog", to: "#changelog" },
    ],
    Industries: [
      { label: "Dental",        to: "#" },
      { label: "Salons",        to: "#" },
      { label: "Restaurants",   to: "#" },
      { label: "Gyms",          to: "#" },
      { label: "Home services", to: "#" },
    ],
    Company: [
      { label: "About",     to: "#" },
      { label: "Customers", to: "#customers" },
      { label: "Careers",   to: "#" },
      { label: "Contact",   to: "/contact" },
    ],
    Resources: [
      { label: "Help Center",      to: "/help" },
      { label: "FAQ",              to: "/faq"  },
      { label: "Privacy Policy",   to: "/privacy" },
      { label: "Terms of Service", to: "/terms"   },
    ],
  };

  const renderLink = (link) => {
    const cls = "text-xs text-gray-500 hover:text-white hover:translate-x-1 inline-block transition-all duration-300 font-medium";
    if (link.to.startsWith("/")) {
      return <Link to={link.to} className={cls}>{link.label}</Link>;
    }
    return <a href={link.to} className={cls}>{link.label}</a>;
  };

  return (
    <footer className="bg-[#02040a] pt-24 pb-12 text-white border-t border-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* CTA Panel */}
        <div className="group relative overflow-hidden bg-gradient-to-b from-[#0d121f] to-[#06080d] border border-gray-900/60 hover:border-gray-700/80 rounded-2xl py-20 px-6 sm:px-16 text-center mb-24 max-w-6xl mx-auto shadow-2xl hover:shadow-[0_0_40px_rgba(59,130,246,0.1)] transition-all duration-500">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.03)_0%,transparent_70%)] group-hover:bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.08)_0%,transparent_70%)] transition-colors duration-500 pointer-events-none" />

          <div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center">
            <h2 className="text-3xl sm:text-[42px] font-bold tracking-tight text-white mb-4 leading-none">
              Start ranking. Start growing.
            </h2>
            <p className="text-xs sm:text-[14px] text-[#8a8f98] font-medium max-w-md mx-auto mb-9 tracking-normal">
              Join 8,400+ local teams already running on GetRankRise.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
              <Link
                to="/signup"
                className="w-full sm:w-auto bg-white text-black font-bold text-[12px] px-5 py-2.5 rounded-lg hover:bg-gray-200 hover:scale-105 active:scale-95 transition-all duration-300 tracking-wide shadow-sm text-center"
              >
                Start 14-day free trial
              </Link>
              <a
                href="#demo"
                className="w-full sm:w-auto bg-[#0a0c10]/40 border border-gray-800/80 text-gray-300 font-bold text-[12px] px-5 py-2.5 rounded-lg hover:bg-[#121620]/80 hover:text-white hover:border-gray-700 hover:scale-105 active:scale-95 transition-all duration-300 tracking-wide text-center"
              >
                Book a demo
              </a>
            </div>
          </div>
        </div>

        {/* Footer link grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 pb-12 border-b border-gray-900/40 text-left">
          <div className="space-y-3 col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-1.5">
              <img src={logo} alt="logo" className="w-3 h-3 sm:w-9 sm:h-8" />
              <span className="font-bold text-sm tracking-tight">GetRankRise</span>
            </Link>
            <p className="text-xs text-gray-500 leading-normal max-w-[140px]">
              The reputation engine local businesses run on.
            </p>
          </div>

          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category} className="space-y-3.5">
              <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">{category}</h4>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.label}>{renderLink(link)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Legal row */}
        <div className="pt-8 text-left text-[11px] text-gray-600 font-medium flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>&copy; {new Date().getFullYear()} GetRankRise Inc. All rights reserved.</span>
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:text-white transition-colors duration-300">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-white transition-colors duration-300">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}