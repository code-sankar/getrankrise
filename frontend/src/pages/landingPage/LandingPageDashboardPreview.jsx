import React from 'react';
import { Star } from 'lucide-react';

export default function DashboardPreview() {
  return (
    /* Changed max-w-5xl to max-w-6xl and lg:max-w-7xl for that ultra-wide dashboard aesthetic */
    <div className="w-full max-w-6xl lg:max-w-7xl rounded-xl bg-[#06080c] border border-gray-900/60 p-4 sm:p-6 shadow-2xl text-left select-none">
      
      {/* Simulated Browser Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-900/40 mb-6 px-1">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-800/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-gray-800/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-gray-800/80" />
        </div>
        <div className="bg-[#0b0e14] border border-gray-900/80 text-[10px] text-gray-500 px-7 py-1 rounded-md tracking-normal">
          app.getrankrise.com/dashboard
        </div>
        <div className="w-10" />
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left Sidebar Menu */}
        <div className="w-full lg:w-52 flex-shrink-0 space-y-0.5">
          <div className="flex items-center gap-2 px-2.5 py-2 text-xs font-bold text-white mb-4">
            <div className="w-4.5 h-4.5 bg-white text-black font-black text-[10px] flex items-center justify-center rounded tracking-tighter">
              G
            </div>
            Bright Smile Dental
          </div>
          <button className="w-full text-left px-2.5 py-1.5 text-[11px] rounded bg-[#111622] text-white font-medium">Overview</button>
          {['Reviews', 'Campaigns', 'Competitors', 'Local SEO', 'Workflows'].map((item) => (
            <button key={item} className="w-full text-left px-2.5 py-1.5 text-[11px] rounded text-gray-500 hover:text-gray-300 font-medium transition-colors">
              {item}
            </button>
          ))}
        </div>

        {/* Content View Dashboard View */}
        <div className="flex-1 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">Overview</span>
              <h3 className="text-xl font-bold text-white tracking-tight mt-0.5">This week</h3>
            </div>
            <div className="flex bg-[#0b0e14] border border-gray-900 rounded-md p-0.5 text-[10px]">
              <span className="bg-[#161b26] text-white px-3 py-0.5 rounded font-medium cursor-pointer">7d</span>
              <span className="text-gray-500 px-3 py-0.5 font-medium cursor-pointer hover:text-gray-300">30d</span>
              <span className="text-gray-500 px-3 py-0.5 font-medium cursor-pointer hover:text-gray-300">90d</span>
            </div>
          </div>

          {/* Core Metrics Quad Array Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'New reviews', value: '147', change: '+38%' },
              { label: 'Avg rating', value: '4.92', change: '+0.12' },
              { label: 'Maps rank', value: '#2', change: '▲ 3' },
              { label: 'Response time', value: '3m', change: '-71%' }
            ].map((metric, i) => (
              <div key={i} className="bg-[#0b0e14] border border-gray-900/60 rounded-lg p-4 sm:p-5">
                <span className="text-[10px] text-gray-500 font-medium block">
                  {metric.label}
                </span>
                <div className="text-2xl font-bold mt-1 text-white tracking-tight">{metric.value}</div>
                <span className="text-[10px] text-[#3b82f6] font-medium mt-2 block">{metric.change}</span>
              </div>
            ))}
          </div>

          {/* Bottom Analytical Chart Block Row */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Chart Simulation */}
            <div className="bg-[#0b0e14] border border-gray-900/60 rounded-lg p-5 lg:col-span-3 flex flex-col justify-between min-h-[220px]">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-gray-200 tracking-tight">Review velocity</span>
                <span className="text-[9px] text-gray-600">Last 12 weeks</span>
              </div>
              <div className="h-32 w-full relative flex items-end">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 300 100" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M 0 75 Q 30 70 60 55 T 120 50 T 180 38 T 240 30 T 300 12 L 300 100 L 0 100 Z" fill="url(#chartGrad)" />
                  <path d="M 0 75 Q 30 70 60 55 T 120 50 T 180 38 T 240 30 T 300 12" fill="none" stroke="#3b82f6" strokeWidth="1.25" />
                </svg>
              </div>
            </div>

            {/* Simulated Reviews Component */}
            <div className="bg-[#0b0e14] border border-gray-900/60 rounded-lg p-5 lg:col-span-2 space-y-3.5">
              <div className="flex justify-between items-center border-b border-gray-900/40 pb-2">
                <span className="text-[11px] font-bold text-gray-200 tracking-tight">Latest reviews</span>
                <span className="text-gray-600 text-[10px]">↗</span>
              </div>
              {[
                { name: 'Sarah K.', time: '2m ago', text: "Best dental visit I've ever had. Dr. Chen is incredible." },
                { name: 'Marcus T.', time: '14m ago', text: 'Staff was friendly and the cleaning was thorough.' },
                { name: 'Priya R.', time: '1h ago', text: 'Great experience overall, would recommend!' }
              ].map((rev, idx) => (
                <div key={idx} className="text-[11px] space-y-0.5 border-b border-gray-900/20 pb-2.5 last:border-0 last:pb-0">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-300">{rev.name}</span>
                    <span className="text-gray-600 text-[9px]">{rev.time}</span>
                  </div>
                  <div className="flex text-white scale-75 origin-left gap-0.5">
                    {[...Array(5)].map((_, i) => <Star key={i} size={9} fill="currentColor" stroke="none" />)}
                  </div>
                  <p className="text-gray-400 leading-normal pt-0.5">{rev.text}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}