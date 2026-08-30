import { useState } from "react";
import Sidebar from "../components/Sidebar.jsx";
import TopBar  from "../components/TopBar.jsx";
import { useTheme } from "../context/ThemeContext.jsx";

// ── All sections as data ──────────────────────────────────────────────────────
const SECTIONS = [
  {
    id:    "acceptance",
    title: "Acceptance of Terms",
    color: "bg-cyan-500",
    content: (
      <>
        <p>By creating an account, accessing, or using the Kirtify platform in any way, you confirm that you have read, understood, and agree to be legally bound by these Terms and Conditions and our Privacy Policy.</p>
        <p>If you are accepting these terms on behalf of a clinic, practice, or organisation, you represent and warrant that you have the legal authority to bind that entity to these terms. In that case, "you" refers to both you individually and that entity.</p>
        <p>If you do not agree to these terms in their entirety, you are not authorised to use Kirtify. Continued use of the platform after any updates to these terms constitutes acceptance of the revised version.</p>
      </>
    ),
  },
  {
    id:    "services",
    title: "Description of Service",
    color: "bg-violet-500",
    content: (
      <>
        <p>Kirtify is a B2B SaaS platform providing AI-assisted reputation management for healthcare clinics and medical practices. Our services include:</p>
        <ul>
          <li><strong>Review Monitoring</strong> — Aggregation and display of patient reviews from Google, Yelp, and Facebook via their respective APIs.</li>
          <li><strong>AI Reply Generation</strong> — Automated drafting of review responses using large language model technology powered by OpenAI.</li>
          <li><strong>Review Request Campaigns</strong> — Sending personalised SMS and WhatsApp messages to patients requesting Google reviews. Messages are delivered via Twilio, with SMS to Indian recipients routed via MSG91.</li>
          <li><strong>Analytics & Reporting</strong> — Performance dashboards showing review trends, sentiment scores, response rates, and competitor comparisons.</li>
          <li><strong>Competitor Tracking</strong> — Public review data monitoring for competing clinics in your area.</li>
        </ul>
        <p>We reserve the right to modify, suspend, or discontinue any feature of the service at any time with reasonable notice. We will not be liable to you or any third party for any modification, suspension, or discontinuation of services.</p>
      </>
    ),
  },
  {
    id:    "accounts",
    title: "Account Obligations",
    color: "bg-cyan-500",
    highlight: true,
    content: (
      <>
        <p>When you create a Kirtify account, you agree to the following obligations:</p>
        <ul>
          <li><strong>Accurate Information</strong> — You must provide accurate, complete, and current registration information. Providing false information may result in immediate account termination.</li>
          <li><strong>Credential Security</strong> — You are solely responsible for maintaining the confidentiality of your password and access credentials. You must notify us immediately at security@kirtify.com if you suspect any unauthorised access to your account.</li>
          <li><strong>Account Responsibility</strong> — You are responsible for all activity that occurs under your account, whether or not authorised by you.</li>
          <li><strong>One Account Per Clinic</strong> — Each clinic may only maintain one active account unless you subscribe to a multi-location plan. Creating duplicate accounts to circumvent billing is prohibited.</li>
          <li><strong>Eligibility</strong> — You must be at least 18 years of age and legally capable of entering into contracts to use this service. Kirtify is not available to individuals or entities barred from receiving such services under applicable law.</li>
          <li><strong>Business Use Only</strong> — Kirtify is designed for business use. You agree not to use it for personal, household, or consumer purposes.</li>
        </ul>
      </>
    ),
  },
  {
    id:    "conduct",
    title: "Acceptable Use Policy",
    color: "bg-amber-500",
    content: (
      <>
        <p>You agree to use Kirtify only for lawful purposes and in a manner that does not infringe the rights of others. The following are expressly prohibited:</p>
        <ul>
          <li><strong>Fake Reviews</strong> — Using Kirtify to solicit, generate, or post fake, incentivised, or misleading patient reviews. This violates platform terms of service for Google, Yelp, and Facebook, and may violate consumer protection laws.</li>
          <li><strong>Spam</strong> — Sending unsolicited review requests to individuals who have not consented to receive communications from your clinic or who are not your actual patients.</li>
          <li><strong>Harassment</strong> — Using the platform to harass, threaten, or intimidate reviewers, employees, or any third party.</li>
          <li><strong>Data Scraping</strong> — Automated scraping, crawling, or extraction of data from the Kirtify platform beyond what is permitted by the API.</li>
          <li><strong>Security Attacks</strong> — Attempting to probe, scan, or test the vulnerability of our systems, or circumventing authentication or security measures.</li>
          <li><strong>Illegal Activity</strong> — Using the platform to facilitate any activity that violates applicable local, national, or international laws or regulations.</li>
          <li><strong>Reverse Engineering</strong> — Decompiling, disassembling, or otherwise attempting to derive the source code of the Kirtify platform.</li>
          <li><strong>Reselling</strong> — Reselling, sublicensing, or otherwise commercialising access to Kirtify without our prior written consent.</li>
        </ul>
        <p>Violation of this Acceptable Use Policy may result in immediate account suspension or termination without refund.</p>
      </>
    ),
  },
  {
    id:    "payment",
    title: "Billing & Payment",
    color: "bg-emerald-500",
    content: (
      <>
        <p>Kirtify operates on a subscription model. By subscribing you agree to the following billing terms:</p>
        <ul>
          <li><strong>Subscription Plans</strong> — We offer a Free plan and two paid plans: Starter ($49/month) and Premium ($99/month). Plan details and features are described on our pricing page.</li>
          <li><strong>Billing Cycle</strong> — Subscriptions are billed monthly in advance on the anniversary of your subscription start date.</li>
          <li><strong>Payment Processing & Merchant of Record</strong> — Payments are processed by Paddle.com Market Limited ("Paddle"), which acts as the Merchant of Record (authorised reseller) for all Kirtify subscriptions. Paddle — not Kirtify — is the seller of record on your transaction, processes the payment, and appears on your card or bank statement. Supported methods include cards and, for customers in India, UPI and NetBanking. By subscribing you agree to Paddle's Buyer Terms. We never receive or store your full card details.</li>
          <li><strong>Failed Payments</strong> — If a payment fails, we will retry up to 3 times over 7 days. If payment cannot be collected, your account will be suspended until payment is resolved.</li>
          <li><strong>Plan Changes</strong> — Upgrades take effect immediately and are prorated. Downgrades take effect at the start of the next billing cycle.</li>
          <li><strong>Refunds</strong> — We offer a 14-day money-back guarantee for new subscribers. After 14 days, all payments are non-refundable except where required by applicable law.</li>
          <li><strong>Price Changes</strong> — We reserve the right to change subscription prices with at least 30 days' written notice. Continued use after a price change constitutes acceptance of the new pricing.</li>
          <li><strong>Taxes</strong> — As Merchant of Record, Paddle calculates, collects, and remits any applicable sales tax, VAT, or GST on your subscription. Any such taxes are shown at checkout and on your Paddle receipt.</li>
        </ul>
      </>
    ),
  },
  {
    id:    "intellectual",
    title: "Intellectual Property",
    color: "bg-pink-500",
    content: (
      <>
        <p>All intellectual property rights in the Kirtify platform — including software, algorithms, AI models, dashboards, designs, trademarks, and documentation — are owned exclusively by Kirtify and its licensors.</p>
        <ul>
          <li><strong>Licence Grant</strong> — We grant you a limited, non-exclusive, non-transferable, revocable licence to access and use the platform solely for your internal business purposes during your active subscription.</li>
          <li><strong>Your Content</strong> — You retain ownership of review data, clinic information, and other content you provide to the platform. By using Kirtify, you grant us a licence to process and display that content to deliver the service.</li>
          <li><strong>Feedback</strong> — If you provide suggestions, ideas, or feedback about Kirtify, you grant us an irrevocable, royalty-free right to use that feedback without any obligation to you.</li>
          <li><strong>Restrictions</strong> — You may not copy, modify, distribute, sell, or create derivative works of Kirtify or its content without our prior written consent.</li>
          <li><strong>Third-Party Marks</strong> — Google, Yelp, Facebook, Twilio, MSG91, Paddle, and OpenAI are trademarks of their respective owners. Our use of these names is for descriptive purposes only and does not imply endorsement.</li>
        </ul>
      </>
    ),
  },
  {
    id:    "liability",
    title: "Limitation of Liability",
    color: "bg-red-500",
    highlight: true,
    content: (
      <>
        <p>To the maximum extent permitted by applicable law, Kirtify and its officers, directors, employees, and affiliates shall not be liable for:</p>
        <ul>
          <li>Any indirect, incidental, special, consequential, or punitive damages.</li>
          <li>Loss of profits, revenue, data, goodwill, or business opportunities.</li>
          <li>Damages arising from your inability to access or use the platform.</li>
          <li>Damages arising from unauthorised access to your account by a third party.</li>
          <li>Any content posted or transmitted through the platform by users or third parties.</li>
          <li>Actions taken by third-party platforms (Google, Yelp, Facebook) including removal of reviews or changes to their APIs.</li>
        </ul>
        <p>In no event shall our total aggregate liability to you exceed the amount you paid to Kirtify in the three months immediately preceding the event giving rise to the claim.</p>
        <p>Some jurisdictions do not allow the exclusion or limitation of liability for consequential damages. In such jurisdictions, our liability is limited to the greatest extent permitted by law.</p>
      </>
    ),
  },
  {
    id:    "third-party",
    title: "Third-Party Integrations",
    color: "bg-teal-500",
    content: (
      <>
        <p>Kirtify integrates with third-party services to deliver its features. Your use of these integrations is subject to the respective third-party terms:</p>
        <ul>
          <li><strong>Google Business Profile API</strong> — You authorise us to access your Google Business Profile data on your behalf. You must comply with Google's Terms of Service and API policies.</li>
          <li><strong>Twilio</strong> — SMS and WhatsApp review requests are sent via Twilio. You are responsible for obtaining appropriate consent before messaging, as required by the U.S. Telephone Consumer Protection Act (TCPA), India's TRAI regulations, and similar laws. See the Messaging Consent & Opt-Out section.</li>
          <li><strong>MSG91</strong> — SMS review requests to Indian recipients are routed via MSG91. Use of MSG91 requires DLT-registered senders and templates; see the Messaging Consent & Opt-Out section for your obligations.</li>
          <li><strong>OpenAI</strong> — AI-generated reply drafts are produced by OpenAI. These are suggestions only — you are responsible for reviewing and approving all replies before posting them publicly.</li>
          <li><strong>Paddle</strong> — Subscription billing is handled by Paddle, our Merchant of Record. Paddle processes your payment and manages applicable taxes. You agree to Paddle's Buyer Terms when subscribing.</li>
        </ul>
        <p>We are not responsible for the actions, content, or policies of third-party services. Any disputes with third-party providers must be resolved directly with those providers.</p>
      </>
    ),
  },
  {
    id:    "messaging-consent",
    title: "Messaging Consent & Opt-Out",
    color: "bg-cyan-500",
    highlight: true,
    content: (
      <>
        <p>Pulse Campaigns and individual review requests send SMS and WhatsApp messages to the recipients you provide, under your business identity. For regulatory purposes you — not Kirtify — are the sender, and you are solely responsible for having a lawful basis to contact each recipient.</p>
        <ul>
          <li><strong>Prior Consent</strong> — You represent that every recipient you upload is an actual patient or customer of your business who has given you the consent required by law to receive SMS or WhatsApp messages from you. You must not upload purchased, rented, scraped, or otherwise third-party contact lists.</li>
          <li><strong>United States (TCPA / CTIA)</strong> — Where the Telephone Consumer Protection Act and CTIA messaging principles apply, you are responsible for obtaining the required prior express (or prior express written) consent and for including clear opt-out instructions — for example, "Reply STOP to unsubscribe" — in your message content.</li>
          <li><strong>India (TRAI / DLT)</strong> — For messages to Indian recipients, you are responsible for compliance with TRAI's Telecom Commercial Communications Customer Preference Regulations, including registration of your sender header and message templates on the DLT platform and respect for recipients' Do-Not-Disturb (DND) preferences.</li>
          <li><strong>Automatic Opt-Out Handling</strong> — Our platform automatically detects and honors standard opt-out replies (STOP, UNSUBSCRIBE, CANCEL, END, QUIT, and similar). When a recipient opts out, that phone number is added to a suppression list and blocked from all future messages <em>across every Kirtify account — not only yours</em>. This platform-wide suppression is intentional and compliance-safe: a person who replied STOP did not consent to being contacted through us by a different business. A recipient may later re-subscribe by replying START.</li>
          <li><strong>No Circumvention</strong> — You must not attempt to bypass, remove, or re-add a suppressed number, and you must promptly honor any opt-out a recipient communicates to you directly by other means. You may also add numbers to your own suppression list from within the app.</li>
          <li><strong>Indemnity</strong> — You agree to indemnify and hold Kirtify harmless from any claim, fine, or penalty arising from your failure to obtain consent or honor opt-outs, including under the TCPA, TRAI regulations, GDPR, or similar laws.</li>
        </ul>
      </>
    ),
  },
  {
    id:    "termination",
    title: "Termination",
    color: "bg-orange-500",
    content: (
      <>
        <p>Either party may terminate the service relationship under the following circumstances:</p>
        <ul>
          <li><strong>Termination by You</strong> — You may cancel your subscription at any time through your account Settings page. Cancellation takes effect at the end of your current billing period. No refunds are issued for the remaining portion of a billing period.</li>
          <li><strong>Termination by Us</strong> — We may suspend or terminate your account immediately, without prior notice, if you violate these Terms, engage in fraudulent activity, or if required by law.</li>
          <li><strong>Effect of Termination</strong> — Upon termination, your right to access the platform ceases immediately. We will retain your data for 30 days after termination during which you may request an export. After 30 days, your data will be permanently deleted except where retention is required by law.</li>
          <li><strong>Survival</strong> — Provisions relating to intellectual property, limitation of liability, indemnification, and dispute resolution survive termination of these Terms.</li>
        </ul>
      </>
    ),
  },
  {
    id:    "governing",
    title: "Governing Law & Disputes",
    color: "bg-slate-500",
    content: (
      <>
        <p>These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, United States, without regard to its conflict of law provisions.</p>
        <ul>
          <li><strong>Informal Resolution</strong> — Before initiating any legal proceedings, you agree to contact us at legal@kirtify.com and attempt to resolve the dispute informally for at least 30 days.</li>
          <li><strong>Arbitration</strong> — If informal resolution fails, disputes shall be resolved through binding arbitration under the rules of the American Arbitration Association (AAA), conducted in English.</li>
          <li><strong>Class Action Waiver</strong> — You waive any right to participate in a class action lawsuit or class-wide arbitration against Kirtify.</li>
          <li><strong>Injunctive Relief</strong> — Notwithstanding the above, either party may seek injunctive or other equitable relief in any court of competent jurisdiction to prevent irreparable harm.</li>
        </ul>
      </>
    ),
  },
];

// ── Single section component ──────────────────────────────────────────────────
function TermsSection({ section, dark, index }) {
  const [open, setOpen] = useState(true);

  const cardBg   = dark ? "bg-slate-900 border-slate-800"    : "bg-white border-slate-200";
  const hlBg     = dark ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200";
  const textMain = dark ? "text-slate-300"                    : "text-slate-600";
  const textHead = dark ? "text-white"                        : "text-slate-900";
  const strongCol = dark ? "text-slate-200"                   : "text-slate-800";

  return (
    <div
      id={section.id}
      className={`border rounded-2xl overflow-hidden scroll-mt-24 transition-all duration-200 ${
        section.highlight ? hlBg : cardBg
      }`}
    >
      {/* Clickable header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-6 text-left gap-4"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`w-1.5 h-6 rounded-full flex-shrink-0 ${section.color}`} />
          <span className={`text-[10px] font-black uppercase tracking-widest flex-shrink-0 text-slate-500 dark:text-slate-400`}>
            {String(index + 1).padStart(2, "0")}
          </span>
          <h2 className={`text-sm font-bold truncate ${textHead}`}>{section.title}</h2>
        </div>
        <svg
          className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 text-slate-500 dark:text-slate-400 ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Body */}
      {open && (
        <div
          className={`
            px-6 pb-6 text-sm leading-relaxed space-y-3 ${textMain}
            [&_p]:leading-relaxed
            [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2.5 [&_ul]:mt-2
            [&_li]:leading-relaxed
            [&_strong]:font-semibold [&_strong]:${strongCol}
            [&_ul]:marker:text-cyan-500
          `}
        >
          {section.content}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function TermsAndConditions() {
  const { dark } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const pageBg  = dark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900";
  const headBg  = dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100";
  const navBg   = dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200";
  const textMut = "text-slate-500 dark:text-slate-400";

  return (
    <div className={`flex h-screen w-full overflow-hidden transition-colors duration-300 ${pageBg}`}>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 flex-shrink-0">
        <Sidebar />
      </aside>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[60]"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="lg:hidden fixed inset-y-0 left-0 w-64 z-[70]">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </aside>
        </>
      )}

      {/* Main scroll container */}
      <div className="flex-1 overflow-y-auto flex flex-col min-w-0">

        {/* Mobile Header */}
        <header className={`lg:hidden flex items-center justify-between p-4 border-b flex-shrink-0 ${headBg}`}>
          <span className="font-black tracking-tight text-cyan-700 dark:text-cyan-400 text-lg">Kirtify</span>
          <button
            onClick={() => setSidebarOpen(true)}
            className={`p-2 rounded-xl ${dark ? "bg-slate-800 text-slate-100" : "bg-slate-100 text-slate-700"}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>

        {/* Sticky TopBar */}
        <div className="sticky top-0 z-50">
          <TopBar title="Terms & Conditions" onMenuClick={() => setSidebarOpen(true)} />
        </div>

        <main className="p-6 lg:p-10 flex-1">
          <div className="max-w-4xl mx-auto">

            {/* Page Header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-700 hover:bg-cyan-600 flex items-center justify-center text-white flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className={`text-2xl font-black ${dark ? "text-white" : "text-slate-900"}`}>
                    Terms & Conditions
                  </h1>
                  <p className={`text-xs ${textMut}`}>Last Updated: May 15, 2026 · Version 1.0</p>
                </div>
              </div>

              {/* Intro banner */}
              <div className={`p-5 rounded-2xl border ${dark ? "bg-amber-950/20 border-amber-900/30" : "bg-amber-50 border-amber-100"}`}>
                <p className={`text-sm leading-relaxed ${dark ? "text-amber-200/80" : "text-amber-900/80"}`}>
                  <strong>Please read these terms carefully.</strong> By using Kirtify you agree to be bound by them. These terms constitute a legally binding agreement between you and Kirtify. If you have questions, contact us at{" "}
                  <a href="mailto:legal@kirtify.com" className="text-cyan-700 dark:text-cyan-400 font-semibold underline">legal@kirtify.com</a>{" "}
                  before using the platform.
                </p>
              </div>
            </div>

            {/* Sections */}
            <div className="space-y-4">
              {SECTIONS.map((section, i) => (
                <TermsSection key={section.id} section={section} dark={dark} index={i} />
              ))}
            </div>

            {/* Contact footer */}
            <div className={`mt-10 p-6 rounded-2xl border text-center space-y-3 ${navBg}`}>
              <p className={`text-xs font-semibold ${textMut}`}>
                Questions about these Terms?
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 text-xs">
                <a
                  href="mailto:legal@kirtify.com"
                  className="flex items-center gap-1.5 text-cyan-700 dark:text-cyan-400 font-semibold hover:text-cyan-400 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  legal@kirtify.com
                </a>
                <span className={dark ? "text-slate-700" : "text-slate-300"}>·</span>
                <span className={textMut}>We respond within 5 business days</span>
              </div>
              <p className={`text-[10px] ${textMut}`}>
                © {new Date().getFullYear()} Kirtify. All rights reserved.
              </p>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}