import { useState } from "react";
import Sidebar from "../components/Sidebar.jsx";
import TopBar from "../components/TopBar.jsx";
import { useTheme } from "../context/ThemeContext.jsx";

export default function PrivacyPolicy() {
  const { dark } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
      {/* Sidebar - Desktop */}
      <aside className="w-64 hidden lg:block flex-shrink-0 border-r border-slate-200 dark:border-slate-800">
        <Sidebar />
      </aside>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[60]"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="lg:hidden fixed inset-y-0 left-0 w-64 z-[70] transform transition-transform duration-300">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </aside>
        </>
      )}

      {/* Main Scroll Container */}
      <div className="flex-1 overflow-y-auto flex flex-col min-w-0 custom-scrollbar">
        
        {/* Mobile Header - Scrolls with content */}
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

        {/* TopBar - Becomes sticky at top-0 */}
        <div className="sticky top-0 z-50">
          <TopBar title="Privacy" onMenuClick={() => setSidebarOpen(true)} />
        </div>

        {/* Main Content Area */}
        <main className="flex-1 p-6 lg:p-12">
          <div className="max-w-3xl mx-auto">
            <div className="mb-10">
              <h1 className={`text-3xl font-black mb-2 ${theme.textHeader}`}>
                Privacy Policy
              </h1>
              <p className="text-slate-500 text-xs font-medium">
                Effective Date: April 29, 2026
              </p>
            </div>

            <div
              className={`p-8 lg:p-10 rounded-[2.5rem] border ${theme.card}`}
            >
              <div className="space-y-10">
                {/* Section 1 */}
                <section>
                  <h2
                    className={`text-lg font-bold mb-4 flex items-center gap-2 ${theme.textHeader}`}
                  >
                    <span className="w-1.5 h-6 bg-indigo-500 rounded-full" />
                    Information We Collect
                  </h2>
                  <div
                    className={`text-sm leading-relaxed space-y-4 ${theme.textMain}`}
                  >
                    <p>
                      To provide the GetRankRise services, we collect
                      information that identifies, relates to, or could
                      reasonably be linked to your clinic:
                    </p>
                    <ul className="list-disc pl-5 space-y-2 marker:text-indigo-500">
                      <li>
                        <strong>Account Information:</strong> Name, professional
                        email, and clinic address.
                      </li>
                      <li>
                        <strong>Review Data:</strong> Content of reviews pulled
                        via Google Business Profile API.
                      </li>
                      <li>
                        <strong>Communication Logs:</strong> Phone numbers or
                        emails provided by you for sending review requests.
                      </li>
                    </ul>
                  </div>
                </section>

                {/* Section 2 */}
                <section>
                  <h2
                    className={`text-lg font-bold mb-4 flex items-center gap-2 ${theme.textHeader}`}
                  >
                    <span className="w-1.5 h-6 bg-indigo-500 rounded-full" />
                    How We Use Data
                  </h2>
                  <div className={`text-sm leading-relaxed ${theme.textMain}`}>
                    <p>
                      We use your data strictly to facilitate review management.
                      Our AI models analyze sentiment to provide you with
                      insights, but we <strong>do not</strong> use your private
                      clinic data to train global AI models in a way that
                      exposes your sensitive information.
                    </p>
                  </div>
                </section>

                {/* Section 3 */}
                <section
                  className={`p-6 rounded-2xl ${dark ? "bg-slate-800/40" : "bg-slate-50"} border border-dashed border-slate-300 dark:border-slate-700`}
                >
                  <h2 className={`text-lg font-bold mb-3 ${theme.textHeader}`}>
                    Data Security
                  </h2>
                  <p className={`text-sm leading-relaxed ${theme.textMain}`}>
                    We implement industry-standard AES-256 encryption for all
                    data at rest. Since we handle clinic-related information, we
                    prioritize security protocols that align with modern privacy
                    standards to ensure your patient contact lists remain
                    confidential.
                  </p>
                </section>

                {/* Section 4 */}
                <section>
                  <h2
                    className={`text-lg font-bold mb-4 flex items-center gap-2 ${theme.textHeader}`}
                  >
                    <span className="w-1.5 h-6 bg-indigo-500 rounded-full" />
                    Third-Party Services
                  </h2>
                  <p className={`text-sm leading-relaxed ${theme.textMain}`}>
                    Our software integrates with Google APIs. Your use of these
                    features is subject to Google’s Privacy Policy. We also use
                    Stripe for payment processing; we never store your full
                    credit card details on our own servers.
                  </p>
                </section>

                {/* Footer Note */}
                <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-[11px] text-slate-500 text-center italic">
                    For data deletion requests or privacy concerns, please
                    contact our Data Protection Officer at
                    <span className="text-indigo-500 ml-1 font-semibold underline cursor-pointer">
                      privacy@getrankrise.com
                    </span>
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