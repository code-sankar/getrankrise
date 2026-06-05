import React from 'react';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Pricing() {
  const plans = [
    {
      name: 'Free',
      price: '$0',
      desc: 'Try the dashboard before you commit. View-only — no AI, no outreach.',
      cta: 'Get started free',
      ctaLink: '/signup',
      features: [
        '20 stored historical reviews',
        'Centralized review feed (Google, Yelp, Facebook)',
        'Basic analytics view',
        'No AI tools',
        'No competitor tracking',
      ],
    },
    {
      name: 'Starter',
      price: '$49',
      desc: 'For single-location businesses ready to automate reputation.',
      cta: 'Start free trial',
      ctaLink: '/signup',
      popular: true,
      features: [
        'Full context-aware AI engine',
        '24-hour data sync',
        'Track up to 3 competitors',
        '50 SMS review invites / mo',
        'Email support',
      ],
    },
    {
      name: 'Premium',
      price: '$99',
      desc: 'For high-volume operators who need real-time signals.',
      cta: 'Start free trial',
      ctaLink: '/signup',
      features: [
        'Everything in Starter',
        'Real-time review sync',
        'Track up to 10 competitors',
        '500 SMS & WhatsApp credits / mo',
        'Pulse Campaigns automation',
        'Priority support',
      ],
    },
  ];

  return (
    <section id="pricing" className="bg-[#030712] py-24 border-t border-gray-900 text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <span className="text-[13px] text-gray-500 uppercase tracking-widest font-semibold">Pricing</span>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mt-2 mb-3">
          Simple pricing. Outsized returns.
        </h2>
        <p className="text-xs sm:text-sm text-gray-500 font-medium mb-16">
          14-day free trial. No card required. Cancel anytime.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-left items-start max-w-5xl mx-auto">
          {plans.map((p, idx) => (
            <div
              key={idx}
              className={`group bg-[#080c14] border rounded-2xl p-6 sm:p-8 flex flex-col justify-between relative min-h-[520px] hover:-translate-y-2 transition-all duration-500 ${
                p.popular
                  ? 'border-gray-700 ring-1 ring-gray-700 hover:border-blue-500/50 hover:ring-blue-500/50 hover:shadow-[0_0_40px_rgba(59,130,246,0.15)]'
                  : 'border-gray-900 hover:border-gray-700 hover:bg-[#0b101a] hover:shadow-2xl'
              }`}
            >
              {p.popular && (
                <span className="absolute -top-2.5 left-6 bg-[#111827] border border-gray-800 text-[9px] font-bold text-gray-300 uppercase tracking-widest px-2 py-0.5 rounded-full">
                  Most Popular
                </span>
              )}

              <div>
                <span className="text-xs font-semibold text-gray-400 block mb-2 group-hover:text-gray-300 transition-colors duration-300">
                  {p.name}
                </span>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-3xl sm:text-4xl font-bold tracking-tight group-hover:text-white transition-colors duration-300">
                    {p.price}
                  </span>
                  {p.price !== 'Custom' && <span className="text-xs text-gray-600">/mo</span>}
                </div>
                <p className="text-xs text-gray-400 leading-relaxed mb-6 h-10 group-hover:text-gray-300 transition-colors duration-300">
                  {p.desc}
                </p>
                <Link
                  to={p.ctaLink}
                  className={`block w-full text-center text-xs font-bold py-2.5 rounded-lg mb-8 hover:scale-105 active:scale-95 transition-all duration-300 ${
                    p.popular
                      ? 'bg-white text-black hover:bg-gray-200 hover:shadow-md'
                      : 'bg-[#030712] border border-gray-800 text-white hover:bg-gray-800'
                  }`}
                >
                  {p.cta}
                </Link>

                <ul className="space-y-3">
                  {p.features.map((f, fIdx) => (
                    <li
                      key={fIdx}
                      className="flex items-start gap-2.5 text-xs text-gray-300 font-medium group-hover:text-gray-200 transition-colors duration-300"
                    >
                      <Check size={12} className="text-blue-500 mt-0.5 flex-shrink-0 group-hover:scale-125 transition-transform duration-300" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* Footnote nudge */}
        <p className="text-[11px] text-gray-600 mt-10">
          Need 10+ locations or custom integrations? <a href="#contact" className="text-blue-400 hover:text-blue-300 font-semibold">Talk to sales →</a>
        </p>
      </div>
    </section>
  );
}