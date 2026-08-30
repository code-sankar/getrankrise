import { useState } from "react";
import Sidebar from "../components/Sidebar.jsx";
import TopBar from "../components/TopBar.jsx";
import { useTheme } from "../context/ThemeContext.jsx";

export default function HelpCenter() {
  const { dark } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const categories = [
    {
      title: "Getting Started",
      description:
        "Learn how to connect your Google Business Profile and set up your clinic.",
      icon: "🚀",
      links: [
        "Connecting Google Reviews",
        "Dashboard Overview",
        "Adding Team Members",
      ],
    },
    {
      title: "AI Tools",
      description:
        "Master our AI-powered response generator and sentiment analysis.",
      icon: "🤖",
      links: [
        "Generating AI Replies",
        "Customizing AI Tone",
        "Review Request Templates",
      ],
    },
    {
      title: "Analytics",
      description:
        "Understand your reputation growth and competitor benchmarking.",
      icon: "📈",
      links: ["Exporting Reports", "Competitor Tracking", "Sentiment Trends"],
    },
    {
      title: "Billing & Security",
      description:
        "Manage your subscription, invoices, and account privacy settings.",
      icon: "💳",
      links: ["Changing Subscription", "Download Invoices", "Two-Factor Auth"],
    },
  ];

  const theme = {
    card: dark
      ? "bg-slate-900 border-slate-800 hover:border-cyan-500/50"
      : "bg-white border-slate-200 shadow-sm hover:border-cyan-500/50",
    textMain: dark ? "text-slate-500 dark:text-slate-400" : "text-slate-600",
    textHeader: dark ? "text-white" : "text-slate-900",
    searchBg: dark
      ? "bg-slate-900 border-slate-800"
      : "bg-white border-slate-200 shadow-sm",
  };

  return (
    <div
      className={`flex min-h-screen w-full transition-colors duration-300 ${
        dark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"
      }`}
    >
      <aside className="w-64 hidden lg:block">
        <Sidebar />
      </aside>
      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative w-64 h-full shadow-2xl">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className={`lg:hidden flex items-center justify-between p-4 border-b flex-shrink-0 ${
            dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
          }`}
        >
          <span className="font-black tracking-tight text-cyan-700 dark:text-cyan-400 text-lg">
            Kirtify
          </span>
          <button
            onClick={() => setSidebarOpen(true)}
            className={`p-2 rounded-xl transition-colors duration-200 active:scale-95 ${
              dark
                ? "bg-slate-800 text-slate-100 hover:bg-slate-700"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </header>
        <TopBar title="Help Center" onMenuClick={() => setSidebarOpen(true)} />

        <main className="flex-1 overflow-y-auto p-6 lg:p-12">
          <div className="max-w-5xl mx-auto">
            {/* Hero Section */}
            <div className="text-center mb-16">
              <h1 className={`text-4xl font-black mb-4 ${theme.textHeader}`}>
                How can we help?
              </h1>
              <div className={`max-w-xl mx-auto relative group`}>
                <div
                  className={`absolute inset-y-0 left-4 flex items-center pointer-events-none`}
                >
                  <svg
                    className="w-5 h-5 text-slate-500 dark:text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search for articles, guides, or features..."
                  className={`w-full pl-12 pr-4 py-4 rounded-2xl border transition-all outline-none focus:ring-2 focus:ring-cyan-500/20 ${theme.searchBg}`}
                />
              </div>
            </div>

            {/* Category Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {categories.map((cat, idx) => (
                <div
                  key={idx}
                  className={`p-8 rounded-[2.5rem] border transition-all duration-300 group cursor-pointer ${theme.card}`}
                >
                  <div className="text-4xl mb-4 grayscale group-hover:grayscale-0 transition-all transform group-hover:scale-110 duration-300 inline-block">
                    {cat.icon}
                  </div>
                  <h2 className={`text-xl font-bold mb-2 ${theme.textHeader}`}>
                    {cat.title}
                  </h2>
                  <p
                    className={`text-sm mb-6 leading-relaxed ${theme.textMain}`}
                  >
                    {cat.description}
                  </p>

                  <ul className="space-y-3">
                    {cat.links.map((link, lIdx) => (
                      <li
                        key={lIdx}
                        className="flex items-center gap-2 text-sm font-semibold text-cyan-700 dark:text-cyan-400 hover:underline"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                        {link}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Support CTA */}
            <div
              className={`mt-20 p-8 rounded-[2.5rem] text-center border border-dashed ${dark ? "border-slate-800 bg-slate-900/40" : "border-slate-200 bg-white"}`}
            >
              <h3 className={`text-lg font-bold mb-2 ${theme.textHeader}`}>
                Can't find what you're looking for?
              </h3>
              <p className={`text-sm mb-6 ${theme.textMain}`}>
                Our support team is available Monday—Friday, 9am—5pm EST.
              </p>
              <button className="bg-cyan-700 hover:bg-cyan-600 text-white px-8 py-3 rounded-xl font-bold transition-all transform hover:scale-105 active:scale-95">
                Contact Support
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
