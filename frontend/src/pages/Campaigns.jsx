// frontend/src/pages/Campaigns.jsx
//
// Pulse Campaigns — bulk review-request sends over SMS / WhatsApp.
// Orchestrates three pieces (all in components/campaigns/):
//   CampaignList   — cards with segmented progress bars
//   CampaignWizard — create flow (details → message → recipients)
//   CampaignDetail — slide-over with breakdown, lifecycle actions, recipients
//
// Data comes from api/campaignsAPI.js (the real /api/v1/campaigns endpoints).
// State is local to this page — no Redux slice needed; the API is the source
// of truth and the detail drawer polls while a campaign runs.

import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import { Plus, Zap } from "lucide-react";

import Sidebar from "../components/Sidebar.jsx";
import TopBar from "../components/TopBar.jsx";
import CreditsPill from "../components/billing/CreditsPill.jsx";
import CampaignList from "../components/campaigns/CampaignList.jsx";
import CampaignWizard from "../components/campaigns/CampaignWizard.jsx";
import CampaignDetail from "../components/campaigns/CampaignDetail.jsx";

import { useTheme } from "../context/ThemeContext.jsx";
import { campaignsAPI } from "../api/campaignsAPI.js";
import { getUserCredits } from "../hooks/credits.hook.js";

export default function Campaigns() {
  const { dark } = useTheme();
  const clinicName = useSelector((s) => s.auth.clinicName) || "our clinic";

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false); // Free plan / feature-gated
  const [credits, setCredits] = useState(null);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const hasWhatsAppQuota = (credits?.whatsapp?.limit ?? 0) > 0;

  // ── Load list ──────────────────────────────────────────────────────────────
  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const list = await campaignsAPI.list();
      setCampaigns(list);
      setBlocked(false);
    } catch (err) {
      // requireFeature blocks Free (and past-due) with 403 UPGRADE_REQUIRED;
      // the axios interceptor already opened the upgrade modal, so here we just
      // render the inline upsell rather than an error.
      if (err.response?.status === 403) setBlocked(true);
      else toast.error("Couldn't load your campaigns.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Both loads are awaited inside an async IIFE — a bare `loadCampaigns()` in
  // the effect body is the cascading-render pattern the linter flags. The
  // `alive` guard is the substantive part: this page is reachable from the
  // sidebar and navigating away before the list returns would otherwise set
  // state on an unmounted component.
  useEffect(() => {
    let alive = true;
    (async () => {
      await loadCampaigns();
      try {
        const c = await getUserCredits();
        if (alive) setCredits(c);
      } catch {
        // Credits are a decorative pill here — the page works without them.
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadCampaigns]);

  // ── Wizard → created ───────────────────────────────────────────────────────
  const handleCreated = (campaign) => {
    setWizardOpen(false);
    loadCampaigns();
    getUserCredits().then(setCredits).catch(() => {});
    if (campaign?.id) setSelectedId(campaign.id); // open the new campaign's detail
  };

  // ── Theme tokens ───────────────────────────────────────────────────────────
  const pageBg = dark ? "bg-slate-950" : "bg-slate-50";
  const title = dark ? "text-white" : "text-slate-900";
  const muted = "text-slate-500 dark:text-slate-400";

  return (
    <div className={`h-screen overflow-hidden flex transition-colors duration-300 ${pageBg}`}>
      {/* Sidebar — desktop */}
      <aside className="hidden lg:block w-64 flex-shrink-0 border-r border-slate-200 dark:border-slate-800">
        <Sidebar />
      </aside>

      {/* Sidebar — mobile overlay */}
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

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto custom-scrollbar">
        {/* Mobile header */}
        <header
          className={`lg:hidden flex items-center justify-between p-4 border-b flex-shrink-0 ${
            dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
          }`}
        >
          <span className="font-black tracking-tight text-cyan-700 dark:text-cyan-400 text-lg">Kirtify</span>
          <button
            onClick={() => setSidebarOpen(true)}
            className={`p-2 rounded-xl transition-colors active:scale-95 ${
              dark ? "bg-slate-800 text-slate-100 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>

        {/* Sticky TopBar */}
        <div className="sticky top-0 z-50">
          <TopBar title="Pulse Campaigns" onMenuClick={() => setSidebarOpen(true)} />
        </div>

        <main className="flex-1 p-4 sm:p-6 lg:p-10 w-full max-w-5xl mx-auto">
          {/* Page header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
            <div>
              <h1 className={`text-2xl font-bold ${title}`}>Pulse Campaigns</h1>
              <p className={`text-sm mt-1 ${muted}`}>
                Request reviews from a batch of customers over SMS or WhatsApp.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {credits && (
                <>
                  <CreditsPill channel="sms" />
                  {hasWhatsAppQuota && <CreditsPill channel="whatsapp" />}
                </>
              )}
              {!blocked && (
                <button
                  onClick={() => setWizardOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-cyan-700 hover:bg-cyan-600 text-white transition-colors active:scale-95"
                >
                  <Plus size={16} />
                  New Campaign
                </button>
              )}
            </div>
          </div>

          {/* Body */}
          {blocked ? (
            <div
              className={`rounded-2xl border p-10 text-center ${
                dark ? "border-slate-800 bg-slate-900/40" : "border-slate-200 bg-white"
              }`}
            >
              <div
                className={`mx-auto w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${
                  dark ? "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400" : "bg-cyan-50 text-cyan-700 dark:text-cyan-400"
                }`}
              >
                <Zap size={22} />
              </div>
              <h3 className={`text-lg font-bold ${title}`}>Pulse Campaigns is a paid feature</h3>
              <p className={`text-sm mt-1 max-w-md mx-auto ${muted}`}>
                Upgrade to a Starter or Premium plan to run automated SMS and WhatsApp review-request
                campaigns to batches of customers.
              </p>
            </div>
          ) : (
            <CampaignList
              campaigns={campaigns}
              loading={loading}
              dark={dark}
              onSelect={setSelectedId}
              onCreate={() => setWizardOpen(true)}
            />
          )}
        </main>
      </div>

      {/* Wizard */}
      {wizardOpen && (
        <CampaignWizard
          dark={dark}
          credits={credits ? { ...credits, clinicName } : { clinicName }}
          onClose={() => setWizardOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Detail drawer */}
      {selectedId && (
        <CampaignDetail
          campaignId={selectedId}
          dark={dark}
          onClose={() => setSelectedId(null)}
          onChanged={loadCampaigns}
        />
      )}
    </div>
  );
}