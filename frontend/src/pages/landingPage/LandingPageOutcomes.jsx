import React from 'react';

export default function Outcomes() {
  const metrics = [
    { value: '12.4×', label: 'More Google reviews per month' },
    { value: '68%', label: 'SMS request open rate' },
    { value: '<3m', label: 'Median AI response time' },
    { value: '+41%', label: 'Lift in Maps pack visibility' }
  ];

  return (
    <section className="relative bg-gradient-to-b from-[#030712] to-[#060913] py-24 border-t border-gray-900 text-white overflow-hidden">
      {/* Subtle ambient radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.04)_0%,transparent_70%)] pointer-events-none" />
      
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <span className="text-[13px] text-gray-500 uppercase tracking-widest font-semibold">Outcomes</span>
        <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mt-2 mb-16">
          Numbers that move local revenue.
        </h2>

        {/* Horizontal Card Panel Grid */}
        <div className="bg-[#080c14] border border-gray-900/80 rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-gray-900/80 mb-16 shadow-2xl overflow-hidden">
          {metrics.map((m, i) => (
            <div key={i} className="group p-6 sm:p-8 text-center flex flex-col justify-center min-h-[140px] hover:bg-[#0c111c] transition-colors duration-300 cursor-default">
              <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-2 group-hover:text-blue-400 group-hover:scale-105 transition-all duration-300">{m.value}</div>
              <div className="text-[10px] sm:text-xs text-gray-500 leading-normal font-medium max-w-[120px] mx-auto group-hover:text-gray-400 transition-colors duration-300">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Deep rich Blockquote customer proof */}
        <div className="max-w-2xl mx-auto space-y-3 mt-12 group cursor-default">
          <p className="text-base sm:text-lg font-medium text-gray-300 leading-relaxed tracking-tight group-hover:text-gray-200 transition-colors duration-300">
            “We went from 4.3 to 4.9 stars and jumped to the top of the Maps pack in 90 days. GetRankRise quietly runs in the background — it just works.”
          </p>
          <div className="text-[11px] font-semibold text-gray-500 tracking-wide uppercase pt-2 group-hover:text-gray-400 transition-colors duration-300">
            Dr. Elena Park · Owner, Park Family Dental
          </div>
        </div>
      </div>
    </section>
  );
}