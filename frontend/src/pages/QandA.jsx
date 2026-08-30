import { useState } from "react";
import Sidebar from "../components/Sidebar";
import TopBar from "../components/TopBar";
import { useTheme } from "../context/ThemeContext";
import { ChevronDown, Search, MessageCircle, Sparkles, ShieldCheck, Zap } from "lucide-react";

export default function FAQ() {
  const { dark } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const theme = {
    card: dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 shadow-sm",
    textHeader: dark ? "text-white" : "text-slate-900",
    textMuted: "text-slate-600 dark:text-slate-400",
    input: dark ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900",
    accent: "text-cyan-700 dark:text-cyan-400",
  };

  const faqData = [
    {
      category: "Getting Started",
      icon: <Zap size={18} className="text-amber-700 dark:text-amber-500" />,
      questions: [
        {
          q: "What exactly is Kirtify?",
          a: "Kirtify is an AI-powered reputation management platform for clinics and local businesses. We help you automate requesting, managing, and responding to reviews across Google, Yelp, and Facebook to boost your local SEO and patient trust."
        },
        {
          q: "How do I connect my clinic's Google Business Profile?",
          a: "Go to Settings → Integrations, click 'Connect Google,' and sign in with the account that manages your Business Profile. You can connect Yelp and Facebook from the same screen. Once authorized, your reviews sync to your dashboard automatically."
        }
      ]
    },
    {
      category: "AI & Automation",
      icon: <Sparkles size={18} className="text-cyan-700 dark:text-cyan-400" />,
      questions: [
        {
          q: "How does the AI response generator work?",
          a: "Our AI analyzes the sentiment and specific points in a review. When you click 'Generate Reply,' it drafts a professional, brand-safe, SEO-friendly response tailored to that feedback — and you can always edit it before posting."
        },
        {
          q: "Can I change the 'tone' of the AI?",
          a: "Every draft is written in a professional, on-brand voice by default, and you can edit any reply before it's posted. Finer tone controls — warm, concise, or empathetic — are on our roadmap."
        }
      ]
    },
    {
      category: "Security & Billing",
      icon: <ShieldCheck size={18} className="text-emerald-700 dark:text-emerald-400" />,
      questions: [
        {
          q: "Is my customer data secure?",
          a: "We encrypt data in transit (TLS) and sensitive credentials at rest (AES-256). Patient contact details are used only to send the review requests you initiate, then deleted right after — we don't keep patient contact lists."
        },
        {
          q: "Where can I find my invoices?",
          a: "Invoices are available under Admin Profile > Billing. You can view your current plan, download past invoices, or update your payment method via our secure Stripe integration."
        }
      ]
    }
  ];

  return (
    <div className={`h-screen flex overflow-hidden transition-colors duration-300 ${dark ? "bg-slate-950" : "bg-slate-50"}`}>
      
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:block w-64 flex-shrink-0 border-r border-slate-200 dark:border-slate-800">
        <Sidebar />
      </aside>

      {/* Sidebar - Mobile Overlay */}
      {sidebarOpen && (
        <>
          <div className="lg:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60]" onClick={() => setSidebarOpen(false)} />
          <aside className="lg:hidden fixed inset-y-0 left-0 w-64 z-[70]">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </aside>
        </>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto custom-scrollbar">
        
        {/* Mobile Header */}
        <header className={`lg:hidden flex items-center justify-between p-4 border-b flex-shrink-0 ${dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"}`}>
          <span className="font-black tracking-tight text-cyan-700 dark:text-cyan-400 text-lg">Kirtify</span>
          <button onClick={() => setSidebarOpen(true)} className={`p-2 rounded-xl ${dark ? "bg-slate-800 text-slate-100" : "bg-slate-100 text-slate-700 dark:text-slate-300"}`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        </header>

        <div className="sticky top-0 z-50">
          <TopBar title="Q&A Support" onMenuClick={() => setSidebarOpen(true)} />
        </div>

        <main className="p-4 sm:p-8 lg:p-12">
          <div className="max-w-4xl mx-auto">
            
            {/* Hero Section */}
            <div className="text-center mb-12">
              <h1 className={`text-3xl md:text-4xl font-black mb-4 ${theme.textHeader}`}>Frequently Asked Questions</h1>
              <div className="relative max-w-xl mx-auto">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Search your query..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full pl-12 pr-4 py-3.5 rounded-2xl outline-none border transition-all ${theme.input} focus:ring-2 focus:ring-cyan-500/20`}
                />
              </div>
            </div>

            {/* FAQ List */}
            <div className="space-y-10">
              {faqData.map((group, idx) => (
                <div key={idx}>
                  <div className="flex items-center gap-2 mb-4 px-2">
                    {group.icon}
                    <h2 className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">{group.category}</h2>
                  </div>
                  <div className="space-y-3">
                    {group.questions.filter(item => item.q.toLowerCase().includes(searchQuery.toLowerCase())).map((item, qIdx) => (
                      <FAQItem key={qIdx} question={item.q} answer={item.a} theme={theme} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Contact Support CTA */}
            <div className={`mt-16 p-8 rounded-[2.5rem] text-center border-2 border-dashed ${dark ? "border-slate-800 bg-slate-900/40" : "border-slate-200 bg-white"}`}>
              <div className="w-12 h-12 bg-cyan-700 hover:bg-cyan-600 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 shadow-lg shadow-cyan-500/30">
                <MessageCircle size={24} />
              </div>
              <h3 className={`text-lg font-bold mb-2 ${theme.textHeader}`}>Still have questions?</h3>
              <p className={`text-sm mb-6 ${theme.textMuted}`}>Our support team is available Monday—Friday, 9am—5pm EST.</p>
              <button className="px-8 py-3 bg-cyan-700 hover:bg-cyan-600 text-white rounded-xl font-bold text-sm transition-all active:scale-95">
                Contact Support
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function FAQItem({ question, answer, theme }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`rounded-2xl border transition-all duration-300 ${theme.card} ${isOpen ? 'ring-1 ring-cyan-500/50' : ''}`}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 text-left outline-none"
      >
        <span className={`text-sm md:text-base font-bold ${theme.textHeader}`}>{question}</span>
        <ChevronDown size={20} className={`text-slate-600 dark:text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-96' : 'max-h-0'}`}>
        <div className={`p-5 pt-0 text-sm leading-relaxed ${theme.textMuted} border-t border-slate-100 dark:border-slate-800/50 mt-2`}>
          {answer}
        </div>
      </div>
    </div>
  );
}