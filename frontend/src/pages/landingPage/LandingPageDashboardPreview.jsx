import React from 'react';
import { Star, MessageSquare, TrendingUp, Activity } from 'lucide-react';

/* ──────────────────────────────────────────────────────────────────────────
   Tiny inline SVG sparkline — used inside metric cards.
   Pure SVG so it costs nothing at runtime and renders perfectly at any size.
   ────────────────────────────────────────────────────────────────────────── */
function Sparkline({ points, color = "#3b82f6", trend = "up" }) {
  const w = 80;
  const h = 24;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p - min) / range) * h;
    return `${x},${y}`;
  });

  const linePath = `M ${coords.join(" L ")}`;
  const areaPath = `${linePath} L ${w},${h} L 0,${h} Z`;
  const gradientId = `spark-${trend}-${color.replace('#', '')}`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Main growth chart — hand-built SVG area chart so the preview renders
   instantly with zero chart-library cost on the marketing site.
   ────────────────────────────────────────────────────────────────────────── */
function GrowthAreaChart() {
  const data = [12, 18, 24, 22, 34, 41, 38, 52, 58, 71, 84, 92];
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const w = 600;
  const h = 140;
  const padX = 8;
  const padY = 16;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const max = Math.max(...data);

  const coords = data.map((d, i) => {
    const x = padX + (i / (data.length - 1)) * innerW;
    const y = padY + innerH - (d / max) * innerH;
    return { x, y };
  });

  const linePath = coords.reduce((acc, c, i) => acc + (i === 0 ? `M ${c.x},${c.y}` : ` L ${c.x},${c.y}`), '');
  const areaPath = `${linePath} L ${coords[coords.length - 1].x},${h - padY} L ${coords[0].x},${h - padY} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto overflow-visible">
      <defs>
        <linearGradient id="grg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Horizontal guide lines — barely visible */}
      {[0.25, 0.5, 0.75].map((p, i) => (
        <line
          key={i}
          x1={padX}
          y1={padY + innerH * p}
          x2={w - padX}
          y2={padY + innerH * p}
          stroke="#141822"
          strokeWidth="1"
          strokeDasharray="2 4"
        />
      ))}

      {/* Filled area */}
      <path d={areaPath} fill="url(#grg)" />
      {/* Line */}
      <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />

      {/* Trailing dot on last point */}
      <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="3" fill="#3b82f6" />
      <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="6" fill="#3b82f6" fillOpacity="0.18" />

      {/* X labels — minimal, every other month */}
      {labels.map((l, i) =>
        i % 2 === 0 ? (
          <text
            key={l}
            x={padX + (i / (labels.length - 1)) * innerW}
            y={h - 2}
            textAnchor="middle"
            fontSize="8"
            fill="#4b5563"
            fontFamily="inherit"
          >
            {l}
          </text>
        ) : null
      )}
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Mini review feed item — used in the right rail of the dashboard preview.
   ────────────────────────────────────────────────────────────────────────── */
function ReviewItem({ name, platform, text, rating, time, platformColor }) {
  return (
    <div className="px-3 py-2.5 rounded-md hover:bg-[#0d1118] transition-colors cursor-default border border-transparent hover:border-gray-900/60">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-gray-200">{name}</span>
          <span
            className="text-[8px] font-bold tracking-wider uppercase px-1 py-px rounded"
            style={{ color: platformColor, background: `${platformColor}15` }}
          >
            {platform}
          </span>
        </div>
        <span className="text-[8px] text-gray-600">{time}</span>
      </div>
      <div className="flex gap-0.5 text-amber-400 mb-1">
        {[...Array(rating)].map((_, i) => (
          <Star key={i} size={7} fill="currentColor" stroke="none" />
        ))}
      </div>
      <p className="text-[9px] leading-[1.45] text-gray-500 line-clamp-2">
        {text}
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   The cinematic dashboard preview.
   Restraint: one accent color (#3b82f6), one signature glow on the frame,
   one "Live" pulse — everything else stays quiet.
   ────────────────────────────────────────────────────────────────────────── */
export default function DashboardPreview() {
  return (
    <div
      className="
        relative w-full max-w-6xl lg:max-w-7xl mx-auto
        rounded-xl bg-[#06080c] border border-gray-900/60
        p-4 sm:p-6 text-left select-none
        shadow-[0_30px_120px_-30px_rgba(59,130,246,0.25),0_20px_60px_-20px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.02)]
      "
    >
      {/* Faint top-edge highlight — gives the frame a sense of light direction */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent pointer-events-none" />

      {/* Browser chrome */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-900/40 mb-6 px-1">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-800/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-gray-800/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-gray-800/80" />
        </div>
        <div className="bg-[#0b0e14] border border-gray-900/80 text-[10px] text-gray-500 px-7 py-1 rounded-md tracking-normal flex items-center gap-2">
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <path d="M3 4V2.5a1.5 1.5 0 113 0V4M2 4h5v3.5a.5.5 0 01-.5.5h-4a.5.5 0 01-.5-.5V4z" stroke="#4b5563" strokeWidth="0.7" />
          </svg>
          app.getrankrise.com/dashboard
        </div>
        <div className="flex items-center gap-1.5 text-[9px] font-bold tracking-[0.1em] text-[#60a5fa] uppercase">
          <span className="relative flex w-1.5 h-1.5">
            <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3b82f6] opacity-60" />
            <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
          </span>
          Live
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">

        {/* ──────────── Sidebar ──────────── */}
        <div className="w-full lg:w-52 flex-shrink-0 space-y-0.5">
          <div className="flex items-center gap-2 px-2.5 py-2 mb-4">
            <div className="w-5 h-5 bg-gradient-to-br from-white to-gray-300 text-black font-black text-[10px] flex items-center justify-center rounded-md tracking-tighter shadow-md">
              B
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-white tracking-tight truncate">Bright Smile Dental</div>
              <div className="text-[8px] text-gray-500 font-medium">Mumbai · 3 locations</div>
            </div>
          </div>

          {/* Active item */}
          <button className="w-full text-left px-2.5 py-1.5 text-[11px] rounded bg-[#111622] text-white font-medium flex items-center justify-between">
            <span>Overview</span>
            <span className="w-1 h-1 rounded-full bg-[#3b82f6]" />
          </button>

          {['Reviews', 'Campaigns', 'Competitors', 'Local SEO', 'Workflows'].map((item) => (
            <button
              key={item}
              className="w-full text-left px-2.5 py-1.5 text-[11px] rounded text-gray-500 hover:text-gray-300 font-medium transition-colors flex items-center justify-between group"
            >
              <span>{item}</span>
              {item === 'Reviews' && (
                <span className="text-[8px] font-bold text-[#60a5fa] bg-[#3b82f6]/10 px-1.5 py-px rounded">7</span>
              )}
            </button>
          ))}
        </div>

        {/* ──────────── Main content ──────────── */}
        <div className="flex-1 space-y-6 min-w-0">

          {/* Header row */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">Overview</span>
              <h3 className="text-xl font-bold text-white tracking-tight mt-0.5">This week</h3>
            </div>
            <div className="flex bg-[#0b0e14] border border-gray-900 rounded-md p-0.5 text-[10px]">
              <span className="bg-[#161b26] text-white px-3 py-0.5 rounded font-medium">7d</span>
              <span className="text-gray-500 px-3 py-0.5 font-medium hover:text-gray-300 cursor-pointer">30d</span>
              <span className="text-gray-500 px-3 py-0.5 font-medium hover:text-gray-300 cursor-pointer">90d</span>
            </div>
          </div>

          {/* Metric cards with sparklines */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: 'New reviews',
                value: '147',
                change: '+38%',
                points: [4, 8, 6, 12, 15, 18, 22],
                color: '#3b82f6',
                icon: <MessageSquare size={11} className="text-[#60a5fa]" />,
              },
              {
                label: 'Avg rating',
                value: '4.92',
                change: '+0.12',
                points: [4.5, 4.6, 4.7, 4.75, 4.8, 4.88, 4.92],
                color: '#f59e0b',
                icon: <Star size={11} className="text-amber-400" fill="currentColor" />,
              },
              {
                label: 'Maps rank',
                value: '#2',
                change: '▲ 3',
                points: [8, 7, 6, 5, 4, 3, 2],
                color: '#34d399',
                icon: <TrendingUp size={11} className="text-emerald-400" />,
              },
              {
                label: 'Response time',
                value: '3m',
                change: '-71%',
                points: [22, 18, 14, 12, 9, 5, 3],
                color: '#a78bfa',
                icon: <Activity size={11} className="text-violet-400" />,
              },
            ].map((m, i) => (
              <div
                key={i}
                className="bg-[#0b0e14] border border-gray-900/60 rounded-lg p-4 hover:border-gray-800/80 transition-colors group"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-gray-500 font-medium">{m.label}</span>
                  {m.icon}
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <div className="text-2xl font-bold text-white tracking-tight leading-none">{m.value}</div>
                    <span className="text-[10px] font-medium mt-2 block" style={{ color: m.color }}>
                      {m.change}
                    </span>
                  </div>
                  <Sparkline points={m.points} color={m.color} />
                </div>
              </div>
            ))}
          </div>

          {/* Bottom row — chart + review feed */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

            {/* Growth chart card */}
            <div className="lg:col-span-3 bg-[#0b0e14] border border-gray-900/60 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">Review Growth</div>
                  <div className="text-xs font-bold text-white mt-0.5">Last 12 months</div>
                </div>
                <div className="flex items-center gap-3 text-[9px]">
                  <span className="flex items-center gap-1.5 text-gray-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
                    Reviews
                  </span>
                </div>
              </div>
              <GrowthAreaChart />
            </div>

            {/* Review feed */}
            <div className="lg:col-span-2 bg-[#0b0e14] border border-gray-900/60 rounded-lg p-3">
              <div className="flex items-center justify-between px-2 pt-1 pb-3">
                <div>
                  <div className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">Latest reviews</div>
                  <div className="text-xs font-bold text-white mt-0.5">Across all platforms</div>
                </div>
                <span className="text-[9px] font-bold text-[#60a5fa] bg-[#3b82f6]/10 border border-[#3b82f6]/20 px-1.5 py-px rounded">
                  +7 new
                </span>
              </div>
              <div className="space-y-0.5">
                <ReviewItem
                  name="Priya M."
                  platform="Google"
                  platformColor="#4285f4"
                  rating={5}
                  time="2m ago"
                  text="Dr. Shah is amazing — painless cleaning and the team was so warm."
                />
                <ReviewItem
                  name="Arjun K."
                  platform="Yelp"
                  platformColor="#d32323"
                  rating={5}
                  time="18m ago"
                  text="Best dental experience I've had in years. Genuinely recommend."
                />
                <ReviewItem
                  name="Neha R."
                  platform="Facebook"
                  platformColor="#1877f2"
                  rating={4}
                  time="1h ago"
                  text="Great care and modern setup. Wait time was a bit longer than expected."
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}