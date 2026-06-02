import React from "react";
import logo from "../../assets/logo.png";

export default function Footer() {
  const footerLinks = {
    Product: ["Features", "Pricing", "Demo", "Changelog"],
    Industries: ["Dental", "Salons", "Restaurants", "Gyms", "Home services"],
    Company: ["About", "Customers", "Careers", "Contact"],
    Resources: ["Docs", "Local SEO guide", "API", "Status"],
  };

  return (
    <footer className="bg-[#02040a] pt-24 pb-12 text-white border-t border-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Large Conversion Call-to-Action Panel Box */}
        {/* Premium Contextual CTA Panel Banner */}
        <div className="group relative overflow-hidden bg-gradient-to-b from-[#0d121f] to-[#06080d] border border-gray-900/60 hover:border-gray-700/80 rounded-2xl py-20 px-6 sm:px-16 text-center mb-24 max-w-6xl mx-auto shadow-2xl hover:shadow-[0_0_40px_rgba(59,130,246,0.1)] transition-all duration-500 cursor-default">
          {/* Ultra-soft internal radial glow highlight overlay */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.03)_0%,transparent_70%)] group-hover:bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.08)_0%,transparent_70%)] transition-colors duration-500 pointer-events-none" />

          <div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center">
            {/* Large Bold Header Layout */}
            <h2 className="text-3xl sm:text-[42px] font-bold tracking-tight text-white mb-4 leading-none">
              Start ranking. Start growing.
            </h2>

            {/* Subtitle Body Copy with optimal contrast color mapping */}
            <p className="text-xs sm:text-[14px] text-[#8a8f98] font-medium max-w-md mx-auto mb-9 tracking-normal">
              Join 8,400+ local teams already running on GetRankRise.
            </p>

            {/* Layout Buttons Row with exact sizing constraints */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
              <button className="w-full sm:w-auto bg-white text-black font-bold text-[12px] px-5 py-2.5 rounded-lg hover:bg-gray-200 hover:scale-105 active:scale-95 transition-all duration-300 tracking-wide shadow-sm">
                Start 14-day free trial
              </button>
              <button className="w-full sm:w-auto bg-[#0a0c10]/40 border border-gray-800/80 text-gray-300 font-bold text-[12px] px-5 py-2.5 rounded-lg hover:bg-[#121620]/80 hover:text-white hover:border-gray-700 hover:scale-105 active:scale-95 transition-all duration-300 tracking-wide">
                Book a demo
              </button>
            </div>
          </div>
        </div>

        {/* Grid Foot Links Mapping */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 pb-12 border-b border-gray-900/40 text-left">
          <div className="space-y-3 col-span-2 md:col-span-1">
            <div className="flex items-center gap-1.5">
              <img src={logo} alt="logo" className="w-3 h-3 sm:w-9 sm:h-8" />
              <span className="font-bold text-sm tracking-tight">
                GetRankRise
              </span>
            </div>
            <p className="text-xs text-gray-500 leading-normal max-w-[140px]">
              The reputation engine local businesses run on.
            </p>
          </div>

          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category} className="space-y-3.5">
              <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">
                {category}
              </h4>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href={`#${link.toLowerCase()}`}
                  className="text-xs text-gray-500 hover:text-white hover:translate-x-1 inline-block transition-all duration-300 font-medium"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Legal Copyright Note */}
        <div className="pt-8 text-left text-[11px] text-gray-600 font-medium flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>
            &copy; {new Date().getFullYear()} GetRankRise Inc. All rights
            reserved.
          </span>
          <div className="flex gap-4">
            <a href="#privacy" className="hover:text-white transition-colors duration-300">
              Privacy Policy
            </a>
            <a href="#terms" className="hover:text-white transition-colors duration-300">
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
