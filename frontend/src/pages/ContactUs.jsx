import React, { useState } from "react";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import { useTheme } from "../context/ThemeContext";
import { Mail, Phone, MapPin, Send } from "lucide-react";

export default function ContactUs() {
  const { dark } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const theme = {
    card: dark
      ? "bg-slate-900 border-slate-800"
      : "bg-white border-slate-200 shadow-sm",
    input: dark
      ? "bg-slate-950 border-slate-800 text-white focus:border-cyan-500"
      : "bg-slate-50 border-slate-200 text-slate-900 focus:border-cyan-500",
    textHeader: dark ? "text-white" : "text-slate-900",
    textMuted: "text-slate-500 dark:text-slate-400",
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => setIsSubmitting(false), 1500);
  };

  return (
    <div
      className={`h-screen overflow-hidden flex transition-colors duration-300 ${
        dark ? "bg-slate-950" : "bg-slate-50"
      }`}
    >
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:block w-64 flex-shrink-0 border-r border-slate-200 dark:border-slate-800">
        <Sidebar />
      </aside>

      {/* Sidebar - Mobile Overlay & Component */}
      {sidebarOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60]"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="lg:hidden fixed inset-y-0 left-0 w-64 z-[70] transform transition-transform duration-300">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </aside>
        </>
      )}

      {/* Main Content Area - Scrollable Container */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto custom-scrollbar">
        
        {/* Mobile Header - Scrolls with content */}
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
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>

        {/* TopBar - Sticky over the content */}
        <div className="sticky top-0 z-50">
          <TopBar title="Contact Us" onMenuClick={() => setSidebarOpen(true)} />
        </div>

        <main className="p-4 sm:p-6 md:p-8 lg:p-12">
          <div className="max-w-6xl mx-auto">
            {/* Header Section */}
            <div className="mb-8 md:mb-12 text-center lg:text-left">
              <h1 className={`text-3xl md:text-4xl font-black mb-4 ${theme.textHeader}`}>
                Get in Touch
              </h1>
              <p className={`text-base md:text-lg max-w-2xl mx-auto lg:mx-0 ${theme.textMuted}`}>
                Have questions about your clinic's reputation? Our team is here
                to help you rise in the rankings.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
              {/* Contact Info Cards */}
              <div className="flex flex-col sm:grid sm:grid-cols-3 lg:flex lg:flex-col gap-4">
                <ContactInfoCard
                  icon={<Mail className="text-cyan-700 dark:text-cyan-400" />}
                  title="Email Us"
                  detail="support@kirtify.com"
                  theme={theme}
                />
                <ContactInfoCard
                  icon={<Phone className="text-emerald-700 dark:text-emerald-400" />}
                  title="Call Us"
                  detail="+91 6002830014"
                  theme={theme}
                />
                <ContactInfoCard
                  icon={<MapPin className="text-rose-500" />}
                  title="Visit Us"
                  detail="Chabua, Dist.Dibrugarh, ASSAM"
                  theme={theme}
                />
              </div>

              {/* Contact Form */}
              <div className={`lg:col-span-2 p-6 md:p-10 rounded-[2rem] md:rounded-[2.5rem] border ${theme.card}`}>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Full Name</label>
                    <input type="text" placeholder="John Doe" className={`w-full px-4 py-3 rounded-xl outline-none border transition-all ${theme.input}`} required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Email Address</label>
                    <input type="email" placeholder="john@clinic.com" className={`w-full px-4 py-3 rounded-xl outline-none border transition-all ${theme.input}`} required />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Subject</label>
                    <select className={`w-full px-4 py-3 rounded-xl outline-none border transition-all ${theme.input}`}>
                      <option>General Inquiry</option>
                      <option>Technical Support</option>
                      <option>Billing Question</option>
                      <option>Feature Request</option>
                    </select>
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Message</label>
                    <textarea rows="4" placeholder="How can we help?" className={`w-full px-4 py-3 rounded-xl outline-none border resize-none transition-all ${theme.input}`} required />
                  </div>
                  <div className="md:col-span-2 pt-2">
                    <button type="submit" disabled={isSubmitting} className="w-full md:w-auto px-10 py-4 bg-cyan-700 hover:bg-cyan-600 text-white font-bold rounded-2xl shadow-lg shadow-cyan-600/20 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-70 cursor-pointer">
                      {isSubmitting ? "Sending..." : <><Send size={18} /> Send Message</>}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function ContactInfoCard({ icon, title, detail, theme }) {
  return (
    <div className={`p-5 md:p-6 rounded-2xl md:rounded-3xl border flex items-center gap-4 md:gap-5 transition-transform hover:scale-[1.01] ${theme.card}`}>
      <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
        {React.cloneElement(icon, { size: 20 })}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{title}</p>
        <p className={`text-sm font-semibold truncate ${theme.textHeader}`}>{detail}</p>
      </div>
    </div>
  );
}