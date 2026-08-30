import { useState } from "react";
import Sidebar from "../components/Sidebar.jsx";
import TopBar from "../components/TopBar.jsx";
import { useTheme } from "../context/ThemeContext.jsx";

// ── All policy sections defined as data — easy to update ─────────────────────
const SECTIONS = [
  {
    id: "collect",
    title: "Information We Collect",
    color: "bg-cyan-500",
    content: (
      <>
        <p>
          To provide Kirtify services, we collect information that
          identifies or relates to your clinic and its operations:
        </p>
        <ul>
          <li>
            <strong>Account Information</strong> — Clinic name, owner name,
            professional email address and phone number provided during
            registration.
          </li>
          <li>
            <strong>Review Data</strong> — Content of patient reviews pulled via
            the Google Business Profile API on your behalf. (Support for
            additional review platforms such as Yelp and Facebook may be added
            over time.)
          </li>
          <li>
            <strong>Patient Contact Data</strong> — Phone numbers and email
            addresses you voluntarily upload to send review requests. We do not
            collect this data independently.
          </li>
          <li>
            <strong>Usage Data</strong> — Pages visited, features used, session
            duration and browser type to improve our product.
          </li>
          <li>
            <strong>Billing Information</strong> — Subscription plan details.
            Payments are processed by Paddle, our Merchant of Record; your card
            details are handled entirely by Paddle and never reach our servers.
          </li>
          <li>
            <strong>Device & Log Data</strong> — IP address, device type and
            operating system for security monitoring and abuse prevention.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "use",
    title: "How We Use Your Data",
    color: "bg-violet-500",
    content: (
      <>
        <p>
          We use the information collected solely to operate and improve
          Kirtify. Specifically:
        </p>
        <ul>
          <li>
            <strong>Service Delivery</strong> — To fetch, display and manage
            your clinic's reviews across platforms.
          </li>
          <li>
            <strong>AI Reply Generation</strong> — Your review text is sent to
            our AI provider (OpenAI) to generate draft replies. This data is
            processed under OpenAI's enterprise data privacy terms and is not
            used to train public models.
          </li>
          <li>
            <strong>Review Request Sending</strong> — Patient contact details
            you provide are used exclusively to send SMS and WhatsApp review
            requests via Twilio and MSG91 on your instruction. See "Patient
            Messaging & Opt-Out" below for how recipients can stop these
            messages.
          </li>
          <li>
            <strong>Analytics & Insights</strong> — Aggregated review data is
            processed locally to generate your performance metrics. We do not
            share individual clinic data with other clients.
          </li>
          <li>
            <strong>Account Communication</strong> — We may send account and
            transactional notices (such as security, billing, or urgent review
            alerts) to the email address on your account. Billing receipts for
            paid plans are issued by Paddle.
          </li>
          <li>
            <strong>Security & Fraud Prevention</strong> — Log data is used to
            detect suspicious activity and protect your account.
          </li>
        </ul>
        <p className="mt-3 font-semibold">
          We do not sell, rent or trade your data to any third party for
          marketing purposes.
        </p>
      </>
    ),
  },
  {
    id: "storage",
    title: "Data Storage & Retention",
    color: "bg-emerald-500",
    content: (
      <>
        <p>
          Your data is stored on servers located in the United States (AWS
          infrastructure). We retain your data as follows:
        </p>
        <ul>
          <li>
            <strong>Account & Clinic Data</strong> — Retained for the lifetime
            of your active subscription plus 30 days after cancellation.
          </li>
          <li>
            <strong>Review Data</strong> — Retained for 24 months to support
            trend analytics and historical reporting.
          </li>
          <li>
            <strong>Patient Contact Data</strong> — Deleted immediately after
            review requests are dispatched. We do not store patient contact
            lists beyond the sending window.
          </li>
          <li>
            <strong>Billing Records</strong> — Retained for 7 years as required
            by financial regulations.
          </li>
          <li>
            <strong>Log Data</strong> — Retained for 90 days then automatically
            purged.
          </li>
        </ul>
        <p className="mt-3">
          You may request early deletion of your data at any time by contacting
          our Data Protection Officer.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "Data Security",
    color: "bg-cyan-500",
    highlight: true,
    content: (
      <>
        <p>
          We take the security of clinic and patient data seriously. Our
          measures include:
        </p>
        <ul>
          <li>
            <strong>Encryption at Rest</strong> — All database records are
            encrypted using AES-256.
          </li>
          <li>
            <strong>Encryption in Transit</strong> — All data transmitted
            between your browser and our servers uses TLS 1.3.
          </li>
          <li>
            <strong>Authentication</strong> — JWT access tokens (15-minute
            expiry) and httpOnly refresh tokens (7-day expiry) with automatic
            silent rotation.
          </li>
          <li>
            <strong>Rate Limiting</strong> — Login and sensitive endpoints are
            protected against brute-force attacks.
          </li>
          <li>
            <strong>Access Controls</strong> — Clinic data is strictly scoped —
            no clinic can access another clinic's data. Role-based access
            controls are enforced at the API level.
          </li>
          <li>
            <strong>Security Audits</strong> — We perform regular dependency
            audits and penetration testing.
          </li>
        </ul>
        <p className="mt-3">
          Despite our best efforts, no system is 100% secure. If you suspect a
          security breach, please contact us immediately at{" "}
          <strong>security@kirtify.com</strong>.
        </p>
      </>
    ),
  },
  {
    id: "third-party",
    title: "Third-Party Services",
    color: "bg-amber-500",
    content: (
      <>
        <p>
          Kirtify integrates with the following third-party services. Each
          has its own privacy policy which governs how they handle data we share
          with them:
        </p>
        <ul>
          <li>
            <strong>Google APIs</strong> — Used to fetch and manage your Google
            Business Profile reviews. Governed by Google's Privacy Policy and
            API Terms of Service.
          </li>
          <li>
            <strong>Twilio</strong> — Used to send SMS and WhatsApp review
            requests on your behalf. Governed by Twilio's Privacy Policy.
          </li>
          <li>
            <strong>MSG91</strong> — Used to route SMS review requests to Indian
            recipients on your behalf. Governed by MSG91's Privacy Policy.
          </li>
          <li>
            <strong>OpenAI</strong> — Used to generate AI-powered reply drafts.
            Review text is sent to OpenAI under enterprise data processing
            terms. OpenAI does not use your data to train public models under
            these terms.
          </li>
          <li>
            <strong>Paddle</strong> — Our Merchant of Record for subscription
            billing. Paddle processes payments and handles applicable taxes;
            card data is handled entirely by Paddle and never touches our
            servers. Governed by Paddle's Privacy Policy.
          </li>
        </ul>
        <p className="mt-3">
          We carefully vet all third-party providers and only share the minimum
          data necessary for each service to function.
        </p>
      </>
    ),
  },
  {
    id: "messaging-optout",
    title: "Patient Messaging & Opt-Out",
    color: "bg-cyan-500",
    highlight: true,
    content: (
      <>
        <p>
          When a clinic uses Kirtify to request a review, we send an SMS or
          WhatsApp message to the phone number the clinic provides, on the
          clinic's instruction. We act as a processor for the clinic, which is
          responsible for having consent to contact you.
        </p>
        <ul>
          <li>
            <strong>Delivery Providers</strong> — Messages are delivered through
            Twilio and, for SMS to Indian recipients, MSG91. Your number is
            shared with these providers only to deliver the message.
          </li>
          <li>
            <strong>How to Opt Out</strong> — You can stop these messages at any
            time by replying <strong>STOP</strong> (or UNSUBSCRIBE, CANCEL, END,
            or QUIT) to the message. To resume, reply <strong>START</strong>.
          </li>
          <li>
            <strong>Platform-Wide Suppression</strong> — When you opt out, we add
            your number to a suppression list that blocks all future review
            messages sent through Kirtify — across every business that uses
            our platform, not only the one that messaged you.
          </li>
          <li>
            <strong>What We Keep</strong> — For an opt-out we retain only the
            phone number and the fact that it opted out, solely to honor your
            choice. Patient contact lists uploaded for a send are not retained
            beyond the sending window (see Data Storage & Retention).
          </li>
          <li>
            <strong>Your Rights</strong> — Laws such as the U.S. TCPA and India's
            TRAI regulations give you the right not to receive unsolicited
            commercial messages. To raise a concern about messages you received,
            contact us at <strong>privacy@kirtify.com</strong>.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "rights",
    title: "Your Rights",
    color: "bg-pink-500",
    content: (
      <>
        <p>
          Depending on your location, you may have the following rights
          regarding your personal data:
        </p>
        <ul>
          <li>
            <strong>Right to Access</strong> — Request a copy of all personal
            data we hold about you and your clinic.
          </li>
          <li>
            <strong>Right to Rectification</strong> — Request correction of any
            inaccurate data. Most data can be corrected directly in your
            Settings page.
          </li>
          <li>
            <strong>Right to Erasure</strong> — Delete your account and all
            associated data yourself, at any time, from Settings &rarr; Account.
            Deletion is immediate and permanent: there is no recovery window.
            If you are the clinic owner it removes the clinic and every team
            account with it, and cancels any active subscription. Invoices held
            by our payment provider (Paddle, our Merchant of Record) are
            retained by them for tax and accounting purposes.
          </li>
          <li>
            <strong>Right to Portability</strong> — Download a complete copy of
            your data from Settings &rarr; Account, as a single JSON file. It
            includes your clinic profile, reviews and replies, review requests,
            campaigns, competitors and team. Passwords and the credentials for
            any connected Google, Yelp or Facebook account are deliberately
            excluded. Analytics can also be exported as CSV from the Analytics
            page.
          </li>
          <li>
            <strong>Right to Object</strong> — Object to specific processing
            activities, including automated decision-making.
          </li>
          <li>
            <strong>Right to Withdraw Consent</strong> — Withdraw consent for
            data processing at any time, which will result in service
            termination.
          </li>
        </ul>
        <p className="mt-3">
          To exercise any of these rights, email{" "}
          <strong>privacy@kirtify.com</strong> with your request. We respond
          within 30 days.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies & Tracking",
    color: "bg-orange-500",
    content: (
      <>
        <p>We use the following types of cookies and local storage:</p>
        <ul>
          <li>
            <strong>Essential Cookies</strong> — httpOnly refresh token cookie
            required for authentication. Cannot be disabled without losing
            access to the platform.
          </li>
          <li>
            <strong>localStorage</strong> — We store your access token and
            clinic name in localStorage for session management. This data never
            leaves your device except as an Authorization header in API
            requests.
          </li>
          <li>
            <strong>Analytics</strong> — We do not currently use third-party
            analytics trackers (e.g. Google Analytics). Usage analytics are
            derived from our own server logs.
          </li>
        </ul>
        <p className="mt-3">
          We do not use advertising cookies or cross-site tracking technologies.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children's Privacy",
    color: "bg-teal-500",
    content: (
      <p>
        Kirtify is a B2B SaaS platform intended exclusively for use by
        healthcare businesses and their administrators. We do not knowingly
        collect personal information from individuals under the age of 18. If
        you believe a minor has provided us with personal information, please
        contact us immediately and we will delete it.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to This Policy",
    color: "bg-slate-500",
    content: (
      <>
        <p>
          We may update this Privacy Policy from time to time to reflect changes
          in our practices, technology or legal requirements. When we make
          material changes we will:
        </p>
        <ul>
          <li>Update the Effective Date at the top of this page.</li>
          <li>
            Send an email notification to the registered address on your account
            at least 14 days before changes take effect.
          </li>
          <li>
            Display an in-app banner prompting you to review the updated policy.
          </li>
        </ul>
        <p className="mt-3">
          Your continued use of Kirtify after changes take effect
          constitutes acceptance of the revised policy.
        </p>
      </>
    ),
  },
];

// ── Section component ─────────────────────────────────────────────────────────
function PolicySection({ section, dark, index }) {
  const [open, setOpen] = useState(true);

  const cardBg = dark
    ? "bg-slate-900 border-slate-800"
    : "bg-white border-slate-200";
  const textMain = dark ? "text-slate-300" : "text-slate-600";
  const textHead = dark ? "text-white" : "text-slate-900";
  const highlight = dark
    ? "bg-slate-800/50 border-slate-700"
    : "bg-slate-50 border-slate-200";

  return (
    <div
      className={`border rounded-2xl overflow-hidden transition-all duration-200 ${section.highlight ? highlight : cardBg}`}
    >
      {/* Header — clickable to collapse */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-6 text-left"
      >
        <div className="flex items-center gap-3">
          <span
            className={`w-1.5 h-6 rounded-full flex-shrink-0 ${section.color}`}
          />
          <span
            className={`text-[10px] font-black uppercase tracking-widest mr-2 text-slate-500 dark:text-slate-400`}
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <h2 className={`text-base font-bold ${textHead}`}>{section.title}</h2>
        </div>
        <svg
          className={`w-4 h-4 transition-transform duration-200 flex-shrink-0 text-slate-500 dark:text-slate-400 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Body */}
      {open && (
        <div
          className={`px-6 pb-6 text-sm leading-relaxed space-y-3 ${textMain} 
          [&_p]:leading-relaxed
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_ul]:mt-2
          [&_li]:leading-relaxed
          [&_strong]:font-semibold [&_strong]:${dark ? "text-slate-200" : "text-slate-800"}
          [&_ul]:marker:text-cyan-500`}
        >
          {section.content}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function PrivacyPolicy() {
  const { dark } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const pageBg = dark
    ? "bg-slate-950 text-slate-100"
    : "bg-slate-50 text-slate-900";
  const headBg = dark
    ? "bg-slate-900 border-slate-800"
    : "bg-white border-slate-100";
  const pillBg = dark
    ? "bg-slate-800 text-slate-500 dark:text-slate-400"
    : "bg-slate-100 text-slate-500";

  return (
    <div
      className={`flex h-screen w-full overflow-hidden transition-colors duration-300 ${pageBg}`}
    >
      {/* Desktop Sidebar */}
      <aside className="w-64 hidden lg:block flex-shrink-0">
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

      {/* Main scroll area */}
      <div className="flex-1 overflow-y-auto flex flex-col min-w-0">
        {/* Mobile Header */}
        <header
          className={`lg:hidden flex items-center justify-between p-4 border-b flex-shrink-0 ${headBg}`}
        >
          <span className="font-black tracking-tight text-cyan-700 dark:text-cyan-400 text-lg">
            Kirtify
          </span>
          <button
            onClick={() => setSidebarOpen(true)}
            className={`p-2 rounded-xl ${dark ? "bg-slate-800 text-slate-100" : "bg-slate-100 text-slate-700"}`}
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

        {/* Sticky TopBar */}
        <div className="sticky top-0 z-50">
          <TopBar title="Privacy Policy" onMenuClick={() => setSidebarOpen(true)} />
        </div>

        <main className="flex-1 p-6 lg:p-10">
          <div className="max-w-3xl mx-auto">
            {/* Page Header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-700 hover:bg-cyan-600 flex items-center justify-center text-white flex-shrink-0">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                </div>
                <div>
                  <h1
                    className={`text-2xl font-black ${dark ? "text-white" : "text-slate-900"}`}
                  >
                    Privacy Policy
                  </h1>
                  <p className="text-slate-500 text-xs">
                    Effective Date: May 15, 2026 · Version 1.0
                  </p>
                </div>
              </div>

              {/* Intro card */}
              <div
                className={`p-5 rounded-2xl border ${dark ? "bg-cyan-950/30 border-cyan-900/40" : "bg-cyan-50 border-cyan-100"}`}
              >
                <p
                  className={`text-sm leading-relaxed ${dark ? "text-cyan-200/80" : "text-cyan-800/80"}`}
                >
                  At <strong>Kirtify</strong>, we build tools for healthcare
                  clinics. That means we take privacy seriously — not just as a
                  legal requirement but as a core responsibility. This policy
                  explains exactly what data we collect, why we collect it, how
                  we protect it, and what rights you have over it. Click any
                  section to expand or collapse it.
                </p>
              </div>
            </div>

            {/* Quick nav pills */}
            <div className="flex flex-wrap gap-2 mb-8">
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={`text-[10px] font-bold px-3 py-1.5 rounded-full transition-colors ${pillBg} hover:text-cyan-500`}
                >
                  {s.title}
                </a>
              ))}
            </div>

            {/* Policy Sections */}
            <div className="space-y-4" id="policy-sections">
              {SECTIONS.map((section, i) => (
                <div key={section.id} id={section.id}>
                  <PolicySection section={section} dark={dark} index={i} />
                </div>
              ))}
            </div>

            {/* Footer */}
            <div
              className={`mt-10 p-6 rounded-2xl border text-center space-y-3 ${dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
            >
              <p
                className={`text-xs font-semibold text-slate-500 dark:text-slate-400`}
              >
                Questions about this policy?
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 text-xs">
                <a
                  href="mailto:privacy@kirtify.com"
                  className="flex items-center gap-1.5 text-cyan-700 dark:text-cyan-400 font-semibold hover:text-cyan-400 transition-colors"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  privacy@kirtify.com
                </a>
                <span className={dark ? "text-slate-700" : "text-slate-300"}>·</span>
                <span className={"text-slate-500 dark:text-slate-400"}>
                  We respond within 30 days
                </span>
              </div>
              <p
                className={`text-[10px] text-slate-500 dark:text-slate-400`}
              >
                © {new Date().getFullYear()} Kirtify. All rights reserved.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}