import React from "react";
import {
  Bot,
  LineChart,
  MessageSquare,
  ShieldAlert,
  Sliders,
  Target,
} from "lucide-react";

export default function Features() {
  const items = [
    {
      icon: <Bot size={18} className="text-gray-400 group-hover:text-white transition-colors duration-300" />,
      title: "AI Review Responder",
      desc: "On-brand replies in seconds. Trained on tone, services, and policies — approve or auto-send.",
    },
    {
      icon: <Target size={18} className="text-gray-400 group-hover:text-white transition-colors duration-300" />,
      title: "Competitor Intelligence",
      desc: "Track ratings, review velocity, and ranking shifts across every local competitor in your area.",
    },
    {
      icon: <MessageSquare size={18} className="text-gray-400 group-hover:text-white transition-colors duration-300" />,
      title: "SMS & WhatsApp Campaigns",
      desc: "Request reviews at the perfect moment with deliverable, high-converting two-way messaging.",
    },
    {
      icon: <LineChart size={18} className="text-gray-400 group-hover:text-white transition-colors duration-300" />,
      title: "Local SEO Analytics",
      desc: "Grid-based rank tracking across every neighborhood you serve, updated daily.",
    },
    {
      icon: <Sliders size={18} className="text-gray-400 group-hover:text-white transition-colors duration-300" />,
      title: "Reputation Workflows",
      desc: "Trigger requests, routes, and escalations with rules that match how your business actually runs.",
    },
    {
      icon: <ShieldAlert size={18} className="text-gray-400 group-hover:text-white transition-colors duration-300" />,
      title: "Sentiment Monitoring",
      desc: "Spot emerging issues in customer feedback before they reach the front page of Google.",
    },
  ];

  return (
    <section id="features" className="bg-[#060a12] py-24 text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <span className="text-[14px] text-gray-500 uppercase tracking-widest font-semibold">
          Platform
        </span>
        <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mt-2 mb-4">
          One platform. <br />
          <span className="text-gray-400 font-medium">Every growth lever.</span>
        </h2>
        <p className="text-gray-400 text-sm max-w-xl mx-auto mb-16 leading-relaxed">
          From the first review request to the last competitor benchmark —
          GetRankRise replaces a stack of disconnected tools with one calm
          system.
        </p>

        {/* Feature Grid with ultra subtle borders matching screenshot layout */}
        <div className="bg-[#080c14] border-2 border-gray-900 rounded-2xl grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-900 text-left overflow-hidden">
          {/* Row 1 */}
          {items.slice(0, 3).map((feat, i) => (
            <div key={i} className="group p-8 space-y-3 hover:bg-[#0c121e] transition-colors duration-300 cursor-default">
              <div className="p-2 bg-[#030712] border border-gray-900 rounded-lg w-fit group-hover:-translate-y-1 group-hover:border-gray-700 group-hover:bg-[#111827] group-hover:shadow-lg transition-all duration-300">
                {feat.icon}
              </div>
              <h4 className="text-sm font-bold tracking-tight text-white pt-2 group-hover:text-gray-200 transition-colors duration-300">
                {feat.title}
              </h4>
              <p className="text-xs text-gray-400 leading-relaxed group-hover:text-gray-300 transition-colors duration-300">
                {feat.desc}
              </p>
            </div>
          ))}
        </div>

        <div className="bg-[#080c14] border border-gray-900 border-t-0 rounded-2xl rounded-t-none grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-900 text-left overflow-hidden">
          {/* Row 2 */}
          {items.slice(3, 6).map((feat, i) => (
            <div key={i} className="group p-8 space-y-3 hover:bg-[#0c121e] transition-colors duration-300 cursor-default">
              <div className="p-2 bg-[#030712] border border-gray-900 rounded-lg w-fit group-hover:-translate-y-1 group-hover:border-gray-700 group-hover:bg-[#111827] group-hover:shadow-lg transition-all duration-300">
                {feat.icon}
              </div>
              <h4 className="text-sm font-bold tracking-tight text-white pt-2 group-hover:text-gray-200 transition-colors duration-300">
                {feat.title}
              </h4>
              <p className="text-xs text-gray-400 leading-relaxed group-hover:text-gray-300 transition-colors duration-300">
                {feat.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
