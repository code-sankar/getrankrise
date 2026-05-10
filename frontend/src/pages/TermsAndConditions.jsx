import { useState } from "react";
import Sidebar from "../components/Sidebar.jsx";
import TopBar from "../components/TopBar.jsx";
import { useTheme } from "../context/ThemeContext.jsx";

export default function TermsAndConditions() {
  const { dark } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sections = [
    { id: "acceptance", title: "1. Acceptance of Terms" },
    { id: "services", title: "2. Description of Service" },
    { id: "accounts", title: "3. Account Obligations" },
    { id: "privacy", title: "4. Privacy Policy" },
    { id: "conduct", title: "5. User Conduct" },
    { id: "termination", title: "6. Termination" },
  ];

  const theme = {
    card: dark
      ? "bg-slate-900 border-slate-800"
      : "bg-white border-slate-200 shadow-sm",
    textMain: dark ? "text-slate-300" : "text-slate-600",
    textHeader: dark ? "text-white" : "text-slate-900",
    accent: "text-indigo-500",
  };

  return (
    <div
      className={`flex h-screen w-full overflow-hidden transition-colors duration-300 ${
        dark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"
      }`}
    >
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 flex-shrink-0 border-r border-slate-200 dark:border-slate-800">
        <Sidebar />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60]"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="lg:hidden fixed inset-y-0 left-0 w-64 z-[70]">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </aside>
        </>
      )}

      {/* Main Scroll Container */}
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
        
        {/* 1. Mobile Header: Now inside the scroll container, so it scrolls away */}
        <header
          className={`lg:hidden flex items-center justify-between p-4 border-b flex-shrink-0 ${
            dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
          }`}
        >
          <span className="font-black tracking-tight text-indigo-600 text-lg">
            GetRankRise
          </span>
          <button
            onClick={() => setSidebarOpen(true)}
            className={`p-2 rounded-xl transition-colors duration-200 active:scale-95 ${
              dark
                ? "bg-slate-800 text-slate-100 hover:bg-slate-700"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>

        {/* 2. TopBar: Remains sticky. It will stick to the top of the screen AFTER the header scrolls out of view */}
        <div className="sticky top-0 z-50">
          <TopBar title="Legal" onMenuClick={() => setSidebarOpen(true)} />
        </div>

        {/* Content Body */}
        <main className="p-6 lg:p-12 flex-1">
          <div className="max-w-4xl mx-auto">
            {/* Page Header */}
            <div className="mb-10">
              <h1 className={`text-4xl font-black mb-4 ${theme.textHeader}`}>
                Terms & Conditions
              </h1>
              <p className="text-slate-500 text-sm font-medium">
                Last Updated: April 29, 2026
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
              {/* Quick Navigation (Sticky within the main container) */}
              <div className="hidden lg:block">
                <div className="sticky top-24 space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">
                    On this page
                  </p>
                  {sections.map((s) => (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      className={`block text-xs font-bold transition-colors hover:${theme.accent} ${theme.textMain}`}
                    >
                      {s.title}
                    </a>
                  ))}
                </div>
              </div>

              {/* Legal Text Content */}
              <div className="lg:col-span-3 space-y-12 pb-20">
                <section id="acceptance" className="scroll-mt-20">
                  <h2 className={`text-xl font-bold mb-4 ${theme.textHeader}`}>
                    1. Acceptance of Terms
                  </h2>
                  <div className={`space-y-4 text-sm leading-relaxed ${theme.textMain}`}>
                    <p>
                      By accessing or using the GetRankRise platform, you agree
                      to be bound by these Terms and Conditions. If you do not
                      agree to all of these terms, do not use this software.
                    </p>
                    <p>
                      We reserve the right to update these terms at any time.
                    </p>
                  </div>
                </section>

                <section id="services" className="scroll-mt-20">
                  <h2 className={`text-xl font-bold mb-4 ${theme.textHeader}`}>
                    2. Description of Service
                  </h2>
                  <div className={`space-y-4 text-sm leading-relaxed ${theme.textMain}`}>
                    <p>
                      GetRankRise provides an AI-driven reputation management
                      suite designed to help clinics and businesses manage
                      reviews.
                    </p>
                  </div>
                </section>

                <section id="accounts" className="scroll-mt-20">
                  <div className={`p-8 rounded-[2rem] border ${theme.card}`}>
                    <h2 className={`text-xl font-bold mb-4 ${theme.textHeader}`}>
                      3. Account Obligations
                    </h2>
                    <p className={`text-sm leading-relaxed ${theme.textMain}`}>
                      You are responsible for maintaining the confidentiality of
                      your account credentials.
                    </p>
                  </div>
                </section>

                {/* Additional sections as needed... */}

                <div className={`mt-20 pt-10 border-t ${dark ? "border-slate-800" : "border-slate-200"}`}>
                  <p className="text-xs text-slate-500 text-center">
                    Questions about our Terms? Contact us at{" "}
                    <span className={theme.accent}>legal@getrankrise.com</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}